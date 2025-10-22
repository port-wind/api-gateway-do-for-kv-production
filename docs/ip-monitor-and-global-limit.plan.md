# IP 监控与全局限流系统实施计划

## 目标

构建一个完整的 IP 访问监控和全局限流管理系统，包括：

1. IP 访问数据收集和聚合（扩展现有 PathStats 管线）
2. IP 监控管理页面（展示访问明细、分析可疑行为）
3. 全局 IP 限流/封禁中间件（跨所有路径生效）
4. 管理 API 和前端界面集成

## 技术方案

### 方案选择

- **数据收集**：A - 扩展现有 PathStats 管线（复用 Queue → D1 链路）
- **限流策略**：C - 支持封禁（block）和限流（throttle）两种模式
- **数据保留**：C - 可配置 1-30 天（默认 7 天）

### 架构设计

```
请求 → Global IP Guard 中间件 → Rate Limit 中间件 → 业务逻辑
         ↓                            ↓
    检查全局封禁/限流               路径/代理限流
         ↓
    PathCollector → Queue → Consumer → D1 (新增 IP 聚合表)
```

---

## 实施阶段

### Phase 1: 数据层扩展（后端 - D1 Schema）

#### 1.1 创建 IP 聚合表

**文件**: `apps/api/migrations/0002_create_ip_monitoring_tables.sql`

创建以下表：

- `ip_traffic_daily`: 按 IP + 日期聚合的访问统计
- `ip_path_details`: IP 访问路径明细（最近 N 天）
- `ip_access_rules`: 全局 IP 限流/封禁规则
```sql
-- IP 每日聚合统计
-- ⚠️ 优化：调整主键顺序为 (date, ip_hash)，按日期分区更高效
CREATE TABLE ip_traffic_daily (
  date TEXT NOT NULL,              -- 日期放在主键第一位，便于按日期查询和清理
  ip_hash TEXT NOT NULL,
  total_requests INTEGER DEFAULT 0,
  total_errors INTEGER DEFAULT 0,
  unique_paths INTEGER DEFAULT 0,
  top_paths TEXT,                  -- JSON array，仅保存 Top 20 热点路径 [{path, count}]
  countries TEXT,                  -- JSON array，Top 5 国家
  user_agents TEXT,                -- JSON array，Top 5 UA
  first_seen INTEGER,
  last_seen INTEGER,
  PRIMARY KEY (date, ip_hash)
);

-- 索引：按日期 + 请求量降序（用于"今日 Top IP"查询）
CREATE INDEX idx_ip_daily_requests ON ip_traffic_daily(date, total_requests DESC);

-- 索引：按 ip_hash 查询（用于单 IP 历史查询）
CREATE INDEX idx_ip_hash_lookup ON ip_traffic_daily(ip_hash, date DESC);

-- ⚠️ 移除 ip_path_details 表
-- 理由：IP × 路径 × 日期组合会导致数据量爆炸（百万级 IP × 千级路径 × 7 天）
-- 替代方案：路径明细从 traffic_events 表实时查询（保留 3 天，已有索引）

-- IP 访问控制规则
-- ⚠️ 增加 ip_pattern 字段支持 CIDR，同时保留 ip_hash 用于精确匹配
CREATE TABLE ip_access_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_pattern TEXT NOT NULL UNIQUE, -- 原始 IP 或 CIDR (如 "192.168.1.0/24")
  ip_hash TEXT,                    -- 精确 IP 的哈希值（CIDR 为 NULL）
  mode TEXT NOT NULL,              -- 'block' | 'throttle'
  limit INTEGER,                   -- throttle 模式的限流值
  window INTEGER,                  -- throttle 模式的时间窗口（秒）
  reason TEXT,
  created_by TEXT,
  created_at INTEGER,
  expires_at INTEGER,              -- 可选的过期时间（Unix timestamp）
  is_active INTEGER DEFAULT 1      -- 是否生效（用于临时禁用规则）
);

-- 索引：按 ip_hash 快速查找精确匹配
CREATE INDEX idx_rules_ip_hash ON ip_access_rules(ip_hash) WHERE ip_hash IS NOT NULL;

-- 索引：按活跃状态和创建时间
CREATE INDEX idx_rules_active ON ip_access_rules(is_active, created_at DESC);
```


**文件**: `apps/api/docs/ip-monitoring-schema.md`

- 文档化表结构和字段说明
- 查询示例和索引策略

#### 1.2 更新队列消费者

**文件**: `apps/api/src/queue-consumer.ts`

在现有消费者中新增 IP 聚合逻辑：

- 在处理完 `path_stats_hourly` 聚合后
- 在内存中按 `(date, ip_hash)` 分组聚合
- **批量写入优化**：
  - 每批最多 100 条记录
  - 使用 D1 事务（transaction）
  - 使用 `INSERT ... ON CONFLICT DO UPDATE` 语句
  - 计算 Top 20 热点路径（JSON 格式）
- 如果单批 IP 超过 500 个，分多个事务提交

关键函数：

```typescript
/**
 * 聚合 IP 统计数据并批量写入 D1
 * @param env 环境变量
 * @param events 流量事件列表
 */
async function aggregateIpStats(
  env: Env,
  events: TrafficEvent[]
): Promise<void> {
  // 1. 内存中按 (date, ip_hash) 分组
  // 2. 计算每组的统计指标（请求数、错误数、Top 路径等）
  // 3. 分批写入 D1（每批 100 条，使用事务）
}

/**
 * 批量 upsert IP 统计（使用事务）
 * @param env 环境变量
 * @param stats IP 统计数据数组
 */
async function batchUpsertIpStats(
  env: Env,
  stats: IpDailyStats[]
): Promise<void> {
  const BATCH_SIZE = 100;
  // 分批提交，避免单个事务过大
}
```

---

### Phase 2: 全局 IP 限流中间件（后端核心）

#### 2.1 创建 IP 访问规则管理器

**文件**: `apps/api/src/lib/ip-access-control.ts`

核心功能：

- **规则加载**：从 KV 读取规则列表（带 5 分钟 TTL），降级到 D1
- **CIDR 匹配**：在 Worker 内存中进行 IP 匹配（使用 ipaddr.js 或自实现）
- **精确匹配优先**：先查 ip_hash 精确匹配，再遍历 CIDR 规则
- **规则数量限制**：最多 1000 条活跃规则（防止遍历过慢）

```typescript
export interface IPAccessRule {
  id: number;
  ipPattern: string;      // 原始 IP 或 CIDR
  ipHash?: string;        // 精确 IP 的哈希值
  mode: 'block' | 'throttle';
  limit?: number;
  window?: number;
  reason?: string;
  expiresAt?: number;
}

/**
 * 从 KV 获取活跃规则列表（带缓存）
 * 降级到 D1 查询
 */
export async function getActiveRules(env: Env): Promise<IPAccessRule[]>

/**
 * 检查 IP 是否匹配某条规则
 * 支持精确 IP 和 CIDR 匹配
 */
export async function checkIpAccess(
  env: Env,
  clientIP: string,
  clientIpHash: string
): Promise<{ allowed: boolean; rule?: IPAccessRule }>

/**
 * 判断 IP 是否在 CIDR 范围内
 * 使用 ipaddr.js 或简单的位运算
 */
function isIpInCidr(ip: string, cidr: string): boolean
```

**性能优化**：
- KV 缓存键：`ip-rules:active`（TTL 300s）
- 规则结构：`{ exact: Map<ipHash, rule>, cidrs: Array<rule> }`
- 精确匹配 O(1)，CIDR 匹配 O(N)（N ≤ 1000）


#### 2.2 创建全局 IP Guard 中间件

**文件**: `apps/api/src/middleware/global-ip-guard.ts`

必须在 rate-limit 中间件之前执行：

- 解析客户端 IP（复用 rate-limit.ts 的逻辑）
- 检查全局封禁：返回 403
- 检查全局限流：调用 RateLimiter DO（key: `global:${ipHash}`）
- 添加响应头：`X-IP-Rule: block | throttle`
```typescript
export async function globalIpGuardMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next
): Promise<Response | void>
```


#### 2.3 集成到主应用

**文件**: `apps/api/src/index.ts`

在路由前注册中间件（顺序很重要）：

```typescript
app.use('*', globalIpGuardMiddleware);
app.use('*', rateLimitMiddleware);
```

---

### Phase 3: 管理 API（后端接口）

#### 3.1 创建 IP 监控 API

**文件**: `apps/api/src/routes/admin/ip-monitor.ts`

提供以下端点：

**GET /api/admin/ip-monitor/ips**

- **查询参数**：
  - `date`: 必填，指定日期（YYYY-MM-DD），默认今天
  - `page`, `limit`: 分页参数（limit 最大 1000）
  - `sortBy`: requests|errors（默认 requests）
  - `search`: IP 前缀搜索（需要至少 3 个字符，避免全表扫描）
  - `days`: 可选，查询最近 N 天聚合（1-7，默认 1）
- **返回**：IP 列表
  - 默认查询单日数据，避免跨日期大表扫描
  - 多日聚合时在应用层合并计算（最多 7 天）
  - 包含标记：可疑 IP（高频、高错误率等）
- **性能优化**：
  - 使用 `idx_ip_daily_requests` 索引按日期 + 请求量排序
  - 强制 `WHERE date = ?` 条件，避免全表扫描
  - 提供 KV 缓存的"今日 Top 100 IP"快照（每 10 分钟刷新）

**GET /api/admin/ip-monitor/ips/:ipHash**

- 返回：单个 IP 的详细信息
- 包括：总请求、错误数、访问路径列表、时间分布、国家/UA 分布

**GET /api/admin/ip-monitor/ips/:ipHash/paths**

- **返回**：该 IP 访问的所有路径明细
  - 从 `ip_traffic_daily.top_paths` 获取热点路径摘要（Top 20）
  - 点击"查看完整明细"时，实时查询 `traffic_events` 表（最近 3 天）
  - 查询条件：`WHERE client_ip_hash = ? AND event_date >= ? ORDER BY timestamp DESC LIMIT 500`
- **分页支持**：仅实时查询时分页
- **注意**：3 天以前的明细数据已归档到 R2，无法查询（提示用户）

**POST /api/admin/ip-monitor/rules**

- **创建全局限流/封禁规则**
- **Body**: 
  ```json
  {
    "ipPattern": "192.168.1.100" | "10.0.0.0/16",  // IP 或 CIDR
    "mode": "block" | "throttle",
    "limit": 10,          // throttle 模式必填
    "window": 60,         // throttle 模式必填（秒）
    "reason": "恶意攻击",
    "expiresAt": 1234567890  // 可选，Unix timestamp
  }
  ```
- **验证**：
  - 检查 IP/CIDR 格式合法性
  - 限制规则总数（最多 1000 条活跃规则）
  - CIDR 不能过大（最小 /16，避免误封整个网段）
- **副作用**：
  - 写入 D1 `ip_access_rules` 表
  - 立即刷新 KV 缓存 `ip-rules:active`

**DELETE /api/admin/ip-monitor/rules/:ipHash**

- 移除限流/封禁规则

**GET /api/admin/ip-monitor/rules**

- 列出所有当前生效的规则

**GET /api/admin/ip-monitor/config**

- 返回：数据保留配置
- `{ retentionDays: number }`

**PUT /api/admin/ip-monitor/config**

- 更新配置（存储到 KV）

#### 3.2 集成到主路由

**文件**: `apps/api/src/index.ts`

```typescript
import ipMonitorRoutes from './routes/admin/ip-monitor';
app.route('/api/admin/ip-monitor', ipMonitorRoutes);
```

---

### Phase 4: 前端页面（Web 管理界面）

#### 4.1 创建 IP 监控页面组件

**文件**: `apps/web/src/features/ip-monitor/index.tsx`

页面布局：

- 顶部统计卡片：总 IP 数、封禁数、限流数、可疑 IP 数
- 搜索和筛选栏
- IP 列表表格（分页）

**文件**: `apps/web/src/features/ip-monitor/components/ip-list-table.tsx`

表格列：

- IP（脱敏显示前后缀，点击展开完整）
- 访问次数
- 错误次数
- 访问路径数
- 最后访问时间
- 状态标记（正常/可疑/封禁/限流）
- 操作按钮（详情/限流/封禁/解除）

**文件**: `apps/web/src/features/ip-monitor/components/ip-detail-dialog.tsx`

弹窗展示：

- IP 基本信息和统计
- 访问路径明细列表
- 时间分布图表（可选）
- 快速操作：限流/封禁

**文件**: `apps/web/src/features/ip-monitor/components/ip-rule-dialog.tsx`

限流/封禁规则配置表单：

- 模式选择：封禁 / 限流
- 限流参数：limit, window（仅限流模式）
- 原因说明
- 过期时间（可选）

#### 4.2 创建自定义 Hook

**文件**: `apps/web/src/hooks/use-ip-monitor-api.ts`

封装 API 调用：

- `useIpList()`: 获取 IP 列表
- `useIpDetail()`: 获取 IP 详情
- `useIpRules()`: 获取规则列表
- `useCreateRule()`: 创建规则
- `useDeleteRule()`: 删除规则

#### 4.3 添加路由

**文件**: `apps/web/src/routes/_authenticated/ip-monitor/index.tsx`

注册路由：`/ip-monitor`

**文件**: `apps/web/src/components/layout/data/sidebar-data.ts`

添加侧边栏菜单项：

- 图标：Shield 或 Activity
- 标题：IP 监控
- 路径：`/ip-monitor`

---

### Phase 5: 配置与部署

#### 5.1 运行数据库迁移

```bash
cd apps/api
wrangler d1 execute path-stats-db --file=migrations/0002_create_ip_monitoring_tables.sql
```

#### 5.2 配置数据保留策略

在 `wrangler.toml` 或 KV 中设置：

```toml
[vars]
IP_MONITOR_RETENTION_DAYS = 7
```

#### 5.3 添加清理任务

**文件**: `apps/api/src/scheduled-handler.ts`

新增定时任务（每日凌晨执行）：

- 删除超过保留期的 IP 数据
- 清理过期的访问规则

---

### Phase 6: 测试与验证

#### 6.1 单元测试

- IP 规则匹配逻辑
- 中间件封禁/限流行为

#### 6.2 集成测试

- 创建规则后验证请求被拦截
- 验证 IP 数据正确聚合到 D1

#### 6.3 手动测试清单

1. 访问不同路径，验证 IP 数据收集
2. 在管理页面查看 IP 列表
3. 对某个 IP 设置封禁，验证 403 返回
4. 对某个 IP 设置限流，验证 429 触发
5. 解除规则，验证恢复正常

---

## 关键文件清单

### 后端

- `apps/api/migrations/0002_create_ip_monitoring_tables.sql`
- `apps/api/docs/ip-monitoring-schema.md`
- `apps/api/src/lib/ip-access-control.ts`
- `apps/api/src/middleware/global-ip-guard.ts`
- `apps/api/src/routes/admin/ip-monitor.ts`
- `apps/api/src/queue-consumer.ts` (修改)
- `apps/api/src/index.ts` (修改)

### 前端

- `apps/web/src/features/ip-monitor/index.tsx`
- `apps/web/src/features/ip-monitor/components/ip-list-table.tsx`
- `apps/web/src/features/ip-monitor/components/ip-detail-dialog.tsx`
- `apps/web/src/features/ip-monitor/components/ip-rule-dialog.tsx`
- `apps/web/src/hooks/use-ip-monitor-api.ts`
- `apps/web/src/routes/_authenticated/ip-monitor/index.tsx`

### 配置

- `apps/api/wrangler.toml` (修改)

---

## 时间估算

- Phase 1: 3-4 小时
- Phase 2: 4-5 小时
- Phase 3: 4-5 小时
- Phase 4: 6-8 小时
- Phase 5: 1-2 小时
- Phase 6: 2-3 小时

**总计**: 约 20-27 小时

## 风险与注意事项

1. **隐私合规**：IP 数据需要哈希存储（已实现）
2. **性能影响**：全局中间件会增加每个请求的延迟（~5ms，已通过 KV 缓存优化）
3. **规则同步**：多个 Worker 实例间的规则缓存一致性（使用 KV，TTL 5 分钟）
4. **大规模 IP**：
   - ✅ 通过 `(date, ip_hash)` 主键和索引优化查询
   - ✅ API 强制按日期查询，避免全表扫描
   - ✅ 移除 `ip_path_details` 表，防止数据爆炸
5. **CIDR 匹配性能**：
   - 规则数量限制在 1000 条
   - 精确 IP 匹配 O(1)，CIDR 遍历 O(N)
   - 如果 CIDR 规则过多（>100），考虑使用前缀树优化
6. **数据保留**：
   - `ip_traffic_daily` 保留 7 天（可配置 1-30 天）
   - `traffic_events` 保留 3 天（现有策略）
   - 定时清理任务确保 D1 容量可控

## 性能指标预估

### 存储容量（7 天保留期）

- **ip_traffic_daily**：
  - 假设 10 万独立 IP/天
  - 每条记录 ~500 字节（含 JSON）
  - 7 天：100K × 500B × 7 ≈ **350 MB**
  
- **ip_access_rules**：
  - 最多 1000 条规则
  - 每条 ~200 字节
  - 总计：**200 KB**

### 查询性能

- **今日 Top 100 IP**（有索引）：< 50ms
- **单 IP 历史查询**（7 天）：< 30ms
- **规则匹配**（KV 缓存命中）：< 5ms
- **规则匹配**（KV miss + D1 查询）：< 50ms

### 写入性能

- **队列消费者 IP 聚合**：每批 1000 事件，聚合耗时 < 500ms
- **D1 批量 upsert**（100 条/事务）：< 200ms