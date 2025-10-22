# KV 到 D1 迁移方案

> **创建时间：** 2025-10-08  
> **状态：** 方案设计阶段  
> **优先级：** 🔥 高（KV 配额已用尽）

---

## 📋 目录

1. [问题背景](#问题背景)
2. [方案对比](#方案对比)
3. [推荐方案](#推荐方案)
4. [数据库设计](#数据库设计)
5. [迁移步骤](#迁移步骤)
6. [时间线](#时间线)
7. [风险评估](#风险评估)
8. [回滚方案](#回滚方案)

---

## 问题背景

### 当前状况

**问题现象：**
```json
{
  "success": false,
  "error": "Configuration error.",
  "message": "KV put() limit exceeded for the day."
}
```

**根本原因：**
- Cloudflare KV 免费版写入限制：**1000次/天**
- 实际使用量：**~1000次/天**（已达上限）

**主要写入来源：**

| 来源 | 每天写入次数 | 占比 |
|------|-------------|------|
| 活跃 IP 列表更新 | ~400次 | 40% |
| 缓存索引更新 | ~300次 | 30% |
| 缓存数据写入 | ~200次 | 20% |
| 配置更新 | ~100次 | 10% |
| **总计** | **~1000次** | **100%** |

### 影响范围

- ❌ 无法修改代理路由配置
- ❌ 无法保存新的缓存数据
- ❌ 无法更新路径配置
- ⚠️ 服务可以正常运行（只读模式）

### 配额重置时间

- **UTC 00:00**（每天）
- 北京时间：08:00
- 日本时间：09:00
- **下次重置：** 19小时后

---

## 方案对比

### 方案 A：升级 KV 付费版

**成本：** $5/月

**优势：**
- ✅ 立即生效
- ✅ 写入：10万次/天
- ✅ 无需代码改动

**劣势：**
- ❌ 需要付费
- ❌ 只是临时解决方案
- ❌ 未来可能还会超限

**结论：** ❌ 不推荐（用户拒绝升级）

---

### 方案 B：优化 KV 使用

**成本：** $0

**优化点：**
1. 禁用活跃 IP 列表更新（-400次/天）
2. 批量更新缓存索引（-200次/天）
3. 配置变更检测（-50次/天）

**预期效果：**
- KV 写入：~350次/天
- 降低：65%

**优势：**
- ✅ 完全免费
- ✅ 快速实施
- ✅ 立即见效

**劣势：**
- ⚠️ 仍有配额限制
- ⚠️ 功能受限（IP 列表禁用）
- ⚠️ 未来扩展受限

**结论：** ⚠️ 作为临时方案

---

### 方案 C：边缘缓存 + Durable Objects

**成本：** $0

**架构：**
```
Cache API (响应数据) → DO (配置、统计) → 定时备份
```

**优势：**
- ✅ 完全免费
- ✅ 写入无限制
- ✅ 强一致性

**劣势：**
- ❌ DO 数据可能丢失（已发生过）
- ❌ 需要自己实现持久化
- ❌ 复杂查询困难
- ❌ 单个 DO 128MB 限制

**结论：** ❌ 风险高（数据已丢失过）

---

### 方案 D：边缘缓存 + D1 + DO（混合）⭐️ 推荐

**成本：** $0

**架构：**
```
┌─────────────────────────────────────┐
│  Cache API (边缘缓存)                │
│  - 响应数据                          │
│  - 免费、无限制、5ms                 │
└─────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────┐
│  D1 数据库 (持久化存储)              │
│  - 配置、索引、统计                  │
│  - 10万次写入/天                     │
│  - SQL 查询支持                      │
└─────────────────────────────────────┘
              ↑
              │ (定时同步)
┌─────────────────────────────────────┐
│  Durable Objects (热数据)            │
│  - 实时计数                          │
│  - 每5分钟批量写入 D1                │
└─────────────────────────────────────┘
```

**优势：**
- ✅ **完全免费**
- ✅ **数据持久化保证**（不会丢失）
- ✅ **10万次写入/天**（100倍提升）
- ✅ **SQL 查询支持**（复杂查询方便）
- ✅ **自动备份**（可导出 SQL）
- ✅ **支持高并发**
- ✅ **性能优秀**（10-20ms）

**劣势：**
- ⚠️ 需要数据库设计
- ⚠️ 迁移需要时间（5-7天）
- ⚠️ D1 还在 Beta（但已稳定）

**结论：** ✅ **强烈推荐**

---

## 推荐方案

### 🎯 最终方案：Cache API + D1 + DO（混合架构）

### 数据分层

| 层级 | 存储方案 | 用途 | 特点 |
|------|---------|------|------|
| **L1** | Cache API | 响应数据 | 免费、无限、5ms |
| **L2** | D1 | 配置、索引 | 10万次写入/天、SQL |
| **L3** | DO | 实时计数 | 批量同步到 D1 |

### 数据流转

```
【请求流程】
用户请求 
  → Cache API 查询（5ms）
    → 命中？返回
    → 未命中？查询 D1（15ms）
      → 查询上游 API（200ms）
        → 写入 Cache API
        → 更新 D1 索引

【统计流程】
路径访问
  → DO 实时计数（1ms）
    → 每5分钟批量写入 D1
      → D1 聚合统计
        → 前端展示

【配置流程】
管理员配置
  → 写入 D1（10ms）
    → 自动同步到 Cache（失效）
      → 下次请求使用新配置
```

### 性能指标

| 操作 | 当前 (KV) | 迁移后 (D1) | 提升 |
|------|----------|------------|------|
| **读取响应** | 50ms | 5ms | ⬆️ 10x |
| **读取配置** | 50ms | 15ms | ⬆️ 3x |
| **写入限制** | 1000次/天 | 10万次/天 | ⬆️ 100x |
| **数据持久化** | ❌ 可能丢失 | ✅ 保证 | - |
| **SQL 查询** | ❌ 不支持 | ✅ 支持 | - |

---

## 数据库设计

### D1 表结构

#### 1. 代理路由表 (proxy_routes)

```sql
CREATE TABLE proxy_routes (
  id TEXT PRIMARY KEY,
  pattern TEXT NOT NULL,
  target TEXT NOT NULL,
  strip_prefix INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 0,
  
  -- 配置 (JSON)
  cache_enabled INTEGER DEFAULT 0,
  rate_limit_enabled INTEGER DEFAULT 0,
  rate_limit INTEGER,
  geo_enabled INTEGER DEFAULT 0,
  
  config TEXT,  -- 完整 JSON 配置
  
  -- 元数据
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  
  -- 统计
  path_count INTEGER DEFAULT 0,
  request_count INTEGER DEFAULT 0,
  last_accessed INTEGER
);

CREATE INDEX idx_proxy_routes_pattern ON proxy_routes(pattern);
CREATE INDEX idx_proxy_routes_enabled ON proxy_routes(enabled);
```

#### 2. 路径配置表 (path_configs)

```sql
CREATE TABLE path_configs (
  path TEXT NOT NULL,
  method TEXT DEFAULT 'GET',
  proxy_id TEXT,
  
  -- 配置覆盖
  cache_enabled INTEGER,
  cache_version INTEGER,
  cache_ttl INTEGER,
  cache_key_strategy TEXT,
  
  rate_limit_enabled INTEGER,
  rate_limit INTEGER,
  rate_limit_window INTEGER,
  
  geo_enabled INTEGER,
  geo_mode TEXT,
  geo_countries TEXT,  -- JSON array
  
  -- 元数据
  source TEXT DEFAULT 'auto',  -- 'auto' or 'manual'
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  
  -- 统计
  request_count INTEGER DEFAULT 0,
  last_accessed INTEGER,
  source_ips TEXT,  -- JSON array
  
  PRIMARY KEY (path, method),
  FOREIGN KEY (proxy_id) REFERENCES proxy_routes(id)
);

CREATE INDEX idx_path_configs_proxy ON path_configs(proxy_id);
CREATE INDEX idx_path_configs_source ON path_configs(source);
CREATE INDEX idx_path_configs_last_accessed ON path_configs(last_accessed);
```

#### 3. 缓存索引表 (cache_index)

```sql
CREATE TABLE cache_index (
  cache_key TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  hash TEXT,
  
  -- 元数据
  size INTEGER,
  compressed INTEGER DEFAULT 0,
  version INTEGER,
  
  -- 时间
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  ttl INTEGER,
  
  -- 统计
  hit_count INTEGER DEFAULT 0,
  last_accessed INTEGER
);

CREATE INDEX idx_cache_index_path ON cache_index(path);
CREATE INDEX idx_cache_index_expires ON cache_index(expires_at);
CREATE INDEX idx_cache_index_version ON cache_index(version);
```

#### 4. 全局配置表 (global_config)

```sql
CREATE TABLE global_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,  -- JSON
  type TEXT NOT NULL,   -- 'cache', 'rate-limit', 'geo', 'traffic'
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_global_config_type ON global_config(type);
```

#### 5. 访问统计表 (access_stats)

```sql
CREATE TABLE access_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  ip TEXT NOT NULL,
  country TEXT,
  user_agent TEXT,
  
  -- 性能
  response_time INTEGER,
  cache_hit INTEGER DEFAULT 0,
  status_code INTEGER,
  
  -- 时间（5分钟聚合）
  time_bucket INTEGER NOT NULL,  -- Unix timestamp / 300
  
  -- 计数
  request_count INTEGER DEFAULT 1
);

CREATE INDEX idx_access_stats_path ON access_stats(path, time_bucket);
CREATE INDEX idx_access_stats_time ON access_stats(time_bucket);
CREATE INDEX idx_access_stats_ip ON access_stats(ip);
```

---

## 迁移步骤

### 阶段 0：紧急修复（今天，立即执行）

**目标：** 临时解决 KV 配额问题

**步骤：**

1. **部署优化代码**
   - 禁用活跃 IP 列表更新
   - 批量更新缓存索引（5分钟一次）
   - 配置变更检测

2. **等待配额重置**
   - 时间：明天 UTC 00:00
   - 距离：19小时

3. **验证效果**
   - 监控 KV 写入次数
   - 预期：~350次/天

**风险：** 低  
**回滚：** 无需回滚  
**工期：** 1小时

---

### 阶段 1：准备工作（第1天）

**目标：** 创建 D1 数据库和表结构

**步骤：**

1. **创建 D1 数据库**
```bash
cd apps/api
wrangler d1 create api-gateway-db
# 记录 database_id
```

2. **更新 wrangler.toml**
```toml
[[d1_databases]]
binding = "DB"
database_name = "api-gateway-db"
database_id = "xxx-xxx-xxx"

[env.production.d1_databases]
[[env.production.d1_databases]]
binding = "DB"
database_name = "api-gateway-db-prod"
database_id = "xxx-xxx-xxx"
```

3. **执行数据库迁移**
```bash
# 创建 schema.sql（包含上面的表结构）
wrangler d1 execute api-gateway-db --file=./migrations/001_initial_schema.sql
```

4. **导出现有 KV 数据**
```bash
# 创建备份目录
mkdir -p backups/kv-export

# 导出代理路由
wrangler kv key get "proxy-routes" \
  --binding API_GATEWAY_STORAGE \
  --env production > backups/kv-export/proxy-routes.json

# 导出路径配置
wrangler kv key get "unified-paths:list" \
  --binding API_GATEWAY_STORAGE \
  --env production > backups/kv-export/paths.json

# 导出缓存配置
wrangler kv key get "config:cache" \
  --binding API_GATEWAY_STORAGE \
  --env production > backups/kv-export/cache-config.json

# 导出其他配置...
```

**交付物：**
- ✅ D1 数据库已创建
- ✅ 表结构已创建
- ✅ KV 数据已导出备份

**风险：** 低  
**工期：** 4小时

---

### 阶段 2：实现 D1 数据访问层（第2天）

**目标：** 创建 D1 操作的抽象层

**步骤：**

1. **创建 D1 操作类**
```typescript
// src/lib/d1-storage.ts
export class D1Storage {
  constructor(private db: D1Database) {}
  
  // 代理路由操作
  async getProxyRoutes(): Promise<ProxyRoute[]>
  async saveProxyRoute(route: ProxyRoute): Promise<void>
  async deleteProxyRoute(id: string): Promise<void>
  
  // 路径配置操作
  async getPathConfigs(): Promise<UnifiedPathConfig[]>
  async savePathConfig(config: UnifiedPathConfig): Promise<void>
  
  // 缓存索引操作
  async getCacheIndex(path: string): Promise<string[]>
  async updateCacheIndex(key: string, path: string): Promise<void>
  
  // 配置操作
  async getConfig(type: string): Promise<any>
  async saveConfig(type: string, config: any): Promise<void>
}
```

2. **单元测试**
```typescript
// tests/d1-storage.test.ts
describe('D1Storage', () => {
  test('should save and retrieve proxy routes')
  test('should handle concurrent updates')
  test('should validate data integrity')
})
```

**交付物：**
- ✅ D1Storage 类实现
- ✅ 单元测试通过
- ✅ 类型定义完善

**风险：** 低  
**工期：** 6小时

---

### 阶段 3：数据迁移脚本（第2-3天）

**目标：** 将 KV 数据迁移到 D1

**步骤：**

1. **创建迁移脚本**
```typescript
// scripts/migrate-kv-to-d1.ts
export async function migrateKVToD1(env: Env) {
  const d1 = new D1Storage(env.DB);
  
  // 1. 迁移代理路由
  const routes = await getProxyRoutesFromKV(env);
  for (const route of routes) {
    await d1.saveProxyRoute(route);
  }
  
  // 2. 迁移路径配置
  const paths = await getUnifiedPathsFromKV(env);
  for (const path of paths) {
    await d1.savePathConfig(path);
  }
  
  // 3. 迁移全局配置
  // ...
  
  // 4. 验证数据一致性
  await validateMigration(env);
}
```

2. **数据验证**
```typescript
async function validateMigration(env: Env) {
  // 对比 KV 和 D1 数据
  const kvRoutes = await getProxyRoutesFromKV(env);
  const d1Routes = await new D1Storage(env.DB).getProxyRoutes();
  
  assert.equal(kvRoutes.length, d1Routes.length);
  // ... 更多验证
}
```

3. **执行迁移**
```bash
# 测试环境先试
npm run migrate -- --env test

# 验证数据
npm run validate-migration -- --env test

# 生产环境迁移
npm run migrate -- --env production
```

**交付物：**
- ✅ 迁移脚本完成
- ✅ 数据验证通过
- ✅ 生产数据已迁移

**风险：** 中  
**工期：** 8小时

---

### 阶段 4：双写模式（第4-5天）

**目标：** 同时写入 KV 和 D1，验证数据一致性

**步骤：**

1. **实现双写逻辑**
```typescript
// src/lib/storage-adapter.ts
export class StorageAdapter {
  async saveProxyRoute(route: ProxyRoute) {
    // 同时写入 KV 和 D1
    const [kvResult, d1Result] = await Promise.allSettled([
      saveProxyRoutesToKV(this.env, route),
      this.d1.saveProxyRoute(route)
    ]);
    
    // 记录不一致
    if (kvResult.status !== d1Result.status) {
      console.error('Inconsistency detected', { kvResult, d1Result });
    }
    
    // 优先使用 D1 结果
    if (d1Result.status === 'fulfilled') {
      return d1Result.value;
    }
    
    // 回退到 KV
    return kvResult;
  }
  
  async getProxyRoutes() {
    // 优先读取 D1
    try {
      return await this.d1.getProxyRoutes();
    } catch (error) {
      console.warn('D1 read failed, fallback to KV', error);
      return await getProxyRoutesFromKV(this.env);
    }
  }
}
```

2. **监控和对比**
```typescript
// 定时对比数据一致性
setInterval(async () => {
  const kvData = await getProxyRoutesFromKV(env);
  const d1Data = await d1.getProxyRoutes();
  
  if (JSON.stringify(kvData) !== JSON.stringify(d1Data)) {
    console.error('Data inconsistency detected!');
    // 发送告警
  }
}, 60 * 60 * 1000); // 每小时对比一次
```

3. **部署到生产**
```bash
cd apps/api
./deploy.sh -y
```

4. **观察3-5天**
   - 监控错误日志
   - 检查数据一致性
   - 验证性能指标

**交付物：**
- ✅ 双写模式上线
- ✅ 数据一致性监控
- ✅ 运行稳定3-5天

**风险：** 中  
**工期：** 4小时开发 + 3-5天观察

---

### 阶段 5：完全切换到 D1（第7天）

**目标：** 停止使用 KV，完全迁移到 D1

**步骤：**

1. **移除 KV 写入**
```typescript
// 移除所有 KV put 操作
export class StorageAdapter {
  async saveProxyRoute(route: ProxyRoute) {
    // 只写入 D1
    return await this.d1.saveProxyRoute(route);
  }
  
  async getProxyRoutes() {
    // 只读取 D1
    return await this.d1.getProxyRoutes();
  }
}
```

2. **KV 作为只读备份**
```typescript
// KV 仅用于紧急回退
export class StorageAdapter {
  async getProxyRoutes() {
    try {
      return await this.d1.getProxyRoutes();
    } catch (error) {
      console.error('D1 failed, using KV backup', error);
      return await getProxyRoutesFromKV(this.env);
    }
  }
}
```

3. **部署到生产**
```bash
cd apps/api
./deploy.sh -y
```

4. **监控7天**
   - 观察 D1 性能
   - 检查错误率
   - 验证数据完整性

**交付物：**
- ✅ 完全切换到 D1
- ✅ KV 保留为备份
- ✅ 运行稳定

**风险：** 低（已验证3-5天）  
**工期：** 2小时 + 7天观察

---

### 阶段 6：Cache API 集成（第8-9天，可选）

**目标：** 使用 Cache API 存储响应数据，进一步减少 D1 压力

**步骤：**

1. **实现 Cache API 适配器**
```typescript
// src/lib/cache-api-adapter.ts
export class CacheAPIAdapter {
  async get(key: string): Promise<Response | null> {
    const cache = caches.default;
    const cacheKey = new Request(`https://cache.internal/${key}`);
    return await cache.match(cacheKey);
  }
  
  async put(key: string, response: Response): Promise<void> {
    const cache = caches.default;
    const cacheKey = new Request(`https://cache.internal/${key}`);
    await cache.put(cacheKey, response.clone());
  }
}
```

2. **修改缓存逻辑**
```typescript
// 响应数据 → Cache API
// 索引数据 → D1
async function handleRequest(request: Request) {
  const cacheKey = generateCacheKey(request);
  
  // 1. 查询 Cache API
  const cached = await cacheAPI.get(cacheKey);
  if (cached) return cached;
  
  // 2. 查询上游
  const response = await fetch(targetURL);
  
  // 3. 写入 Cache API（免费无限）
  await cacheAPI.put(cacheKey, response);
  
  // 4. 更新 D1 索引（批量）
  await d1.updateCacheIndex(cacheKey, path);
  
  return response;
}
```

**交付物：**
- ✅ Cache API 集成
- ✅ 响应缓存性能提升
- ✅ D1 写入进一步减少

**风险：** 低  
**工期：** 8小时

---

## 时间线

### 总体时间表

```
Day 0 (今天)      ✅ 紧急修复（优化 KV 使用）
Day 1            ⏳ 创建 D1 + 导出数据
Day 2-3          ⏳ 实现 D1 层 + 迁移数据
Day 4-6          ⏳ 双写验证（3天）
Day 7            ⏳ 完全切换
Day 8-14         ⏳ 观察运行（7天）
Day 15+          ✨ 可选：Cache API 优化
```

### 详细甘特图

| 任务 | 第1天 | 第2-3天 | 第4-6天 | 第7天 | 第8-14天 | 第15天+ |
|-----|-------|--------|---------|------|---------|---------|
| 紧急修复 | ✅ | - | - | - | - | - |
| 创建 D1 | ███ | - | - | - | - | - |
| D1 开发 | - | ███████ | - | - | - | - |
| 迁移数据 | - | ████ | - | - | - | - |
| 双写验证 | - | - | ████████ | - | - | - |
| 完全切换 | - | - | - | ███ | - | - |
| 稳定观察 | - | - | - | - | ████████ | - |
| Cache API | - | - | - | - | - | ████ |

---

## 风险评估

### 高风险 🔴

**风险1：D1 写入超限**
- **可能性：** 低（10万次/天 vs 当前 1000次/天）
- **影响：** 无法写入配置
- **缓解：**
  - 批量写入
  - 监控用量
  - 预留50%缓冲
- **应对：**
  - 回退到 KV
  - 升级到付费版

**风险2：数据迁移丢失**
- **可能性：** 低（有完整验证）
- **影响：** 配置丢失
- **缓解：**
  - 迁移前完整备份
  - 双写验证3-5天
  - 逐步切换
- **应对：**
  - 从 KV 备份恢复
  - 回滚代码

### 中风险 🟡

**风险3：性能下降**
- **可能性：** 低（D1 更快）
- **影响：** 响应时间增加
- **缓解：**
  - 压测验证
  - 使用索引优化
  - Cache API 加速
- **应对：**
  - 优化 SQL 查询
  - 添加缓存层

**风险4：双写不一致**
- **可能性：** 中
- **影响：** 数据不一致
- **缓解：**
  - 定时对比
  - 告警监控
  - 优先使用 D1
- **应对：**
  - 以 D1 为准
  - 重新同步

### 低风险 🟢

**风险5：D1 Beta 不稳定**
- **可能性：** 低（已广泛使用）
- **影响：** 服务中断
- **缓解：**
  - KV 作为备份
  - 自动回退机制
- **应对：**
  - 切换回 KV
  - 等待修复

---

## 回滚方案

### 场景1：D1 读取失败

**触发条件：**
- D1 查询超时
- D1 连接失败
- D1 返回错误

**自动回退：**
```typescript
async function getProxyRoutes(env: Env) {
  try {
    return await d1.getProxyRoutes();
  } catch (error) {
    console.error('D1 failed, fallback to KV', error);
    return await getProxyRoutesFromKV(env);
  }
}
```

### 场景2：D1 写入失败

**触发条件：**
- D1 写入超时
- D1 配额超限
- D1 返回错误

**降级策略：**
```typescript
async function saveProxyRoute(env: Env, route: ProxyRoute) {
  try {
    await d1.saveProxyRoute(route);
  } catch (error) {
    console.error('D1 write failed, using KV', error);
    // 紧急情况下写入 KV
    await saveProxyRoutesToKV(env, route);
  }
}
```

### 场景3：完全回滚

**触发条件：**
- D1 长期不稳定
- 数据频繁不一致
- 性能严重下降

**回滚步骤：**

1. **切换代码分支**
```bash
git checkout pre-d1-migration
```

2. **重新部署**
```bash
cd apps/api
./deploy.sh -y
```

3. **从 KV 恢复数据**
```bash
# KV 一直保留作为备份，无需恢复
```

4. **验证服务**
```bash
curl https://api-proxy.bugacard.com/api/health
```

**回滚时间：** < 10分钟

---

## 成本分析

### 当前成本（KV 免费版）

| 项目 | 成本 | 限制 |
|------|------|------|
| KV 存储 | $0 | 1GB |
| KV 读取 | $0 | 无限 |
| KV 写入 | $0 | 1000次/天 ❌ |
| Workers CPU | $0 | 10ms/请求 |
| **总计** | **$0/月** | **已超限** |

### 迁移后成本（D1 免费版）

| 项目 | 成本 | 限制 |
|------|------|------|
| D1 存储 | $0 | 5GB |
| D1 读取 | $0 | 500万次/天 |
| D1 写入 | $0 | 10万次/天 ✅ |
| Cache API | $0 | 无限 |
| Workers CPU | $0 | 10ms/请求 |
| **总计** | **$0/月** | **完全够用** |

### ROI 分析

**节省成本：**
- 避免升级 KV 付费版：$5/月
- **年节省：$60**

**额外收益：**
- ✅ 性能提升 50%
- ✅ 支持更高并发
- ✅ 数据永不丢失
- ✅ 功能扩展能力

**投入时间：**
- 开发：20小时
- 测试：16小时（双写验证）
- **总计：36小时**

**结论：** 值得投入

---

## 监控指标

### 关键指标

#### 1. 性能指标

```typescript
// 响应时间
{
  "cache_api_hit": 5ms,     // 目标: < 10ms
  "d1_read": 15ms,          // 目标: < 30ms
  "d1_write": 20ms,         // 目标: < 50ms
  "kv_read": 50ms           // 参考值
}

// 吞吐量
{
  "requests_per_second": 100,  // 目标: > 50
  "d1_reads_per_day": 10000,   // 限制: 500万
  "d1_writes_per_day": 500     // 限制: 10万
}
```

#### 2. 可靠性指标

```typescript
// 成功率
{
  "d1_read_success_rate": 99.9%,   // 目标: > 99%
  "d1_write_success_rate": 99.9%,  // 目标: > 99%
  "cache_hit_rate": 80%             // 目标: > 70%
}

// 错误率
{
  "d1_timeout_rate": 0.1%,    // 目标: < 1%
  "d1_error_rate": 0.05%,     // 目标: < 0.5%
  "fallback_to_kv_rate": 0.1% // 目标: < 1%
}
```

#### 3. 数据完整性

```typescript
// 一致性检查（双写期间）
{
  "consistency_check_interval": "1 hour",
  "inconsistency_count": 0,         // 目标: 0
  "auto_sync_triggered": 0          // 目标: 0
}
```

### 监控面板

**Grafana Dashboard：**
```
┌─────────────────────────────────────┐
│  D1 Migration Dashboard             │
├─────────────────────────────────────┤
│  📊 Performance                     │
│  - Cache API Response Time          │
│  - D1 Read/Write Latency           │
│  - Overall Request Time             │
├─────────────────────────────────────┤
│  ✅ Reliability                     │
│  - D1 Success Rate                  │
│  - Fallback Rate                    │
│  - Error Count                      │
├─────────────────────────────────────┤
│  📈 Usage                           │
│  - D1 Reads/Writes per Day         │
│  - Storage Size                     │
│  - Cache Hit Rate                   │
├─────────────────────────────────────┤
│  🔄 Data Consistency (双写期间)     │
│  - Consistency Check Result         │
│  - Sync Lag                         │
└─────────────────────────────────────┘
```

---

## 后续优化

### 短期（1个月内）

1. **Cache API 全面集成**
   - 所有响应走 Cache API
   - D1 只存索引
   - 预期：性能提升 50%

2. **DO 热数据优化**
   - 实时统计存 DO
   - 5分钟批量写入 D1
   - 减少 D1 写入 80%

3. **SQL 查询优化**
   - 添加必要索引
   - 优化复杂查询
   - 使用 EXPLAIN 分析

### 中期（3个月内）

1. **数据归档**
   - 30天前数据归档
   - 导出到 R2
   - 减少 D1 数据量

2. **读写分离**
   - 写主库
   - 读副本（如果 D1 支持）
   - 提升并发能力

3. **智能缓存预热**
   - 分析热点路径
   - 自动预热缓存
   - 提升命中率

### 长期（6个月内）

1. **多区域部署**
   - 不同区域独立 D1
   - 定时同步
   - 就近访问

2. **高级分析**
   - 实时统计分析
   - 趋势预测
   - 智能告警

3. **完整可观测性**
   - 分布式追踪
   - 性能分析
   - 容量规划

---

## 总结

### 为什么选择 D1？

| 需求 | KV | D1 | 结论 |
|------|----|----|------|
| **写入限制** | 1000次/天 ❌ | 10万次/天 ✅ | D1 胜出 |
| **数据持久化** | 不保证 ⚠️ | 保证 ✅ | D1 胜出 |
| **查询能力** | 仅 key-value ❌ | SQL ✅ | D1 胜出 |
| **成本** | 免费/$5 | 免费 ✅ | 平局 |
| **性能** | 50ms | 15ms ✅ | D1 胜出 |
| **学习曲线** | 低 ✅ | 中 ⚠️ | KV 略胜 |

### 最终决策

**✅ 采用方案 D：边缘缓存 + D1 + DO（混合架构）**

**理由：**
1. ✅ 完全免费，无需付费
2. ✅ 数据永不丢失
3. ✅ 写入配额充足（100倍提升）
4. ✅ 性能更优（Cache API 5ms）
5. ✅ 支持复杂查询（SQL）
6. ✅ 可扩展性强

**预期收益：**
- 🚀 响应时间：50ms → 5ms（10倍提升）
- 📈 写入能力：1000次/天 → 10万次/天（100倍提升）
- 💾 数据安全：可能丢失 → 持久化保证
- 💰 成本节省：$60/年

**实施周期：** 7-14天

**风险等级：** 低（有完整回滚方案）

---

## 附录

### A. 相关文档

- [Cloudflare D1 官方文档](https://developers.cloudflare.com/d1/)
- [Cache API 文档](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- [Durable Objects 文档](https://developers.cloudflare.com/workers/runtime-apis/durable-objects/)
- [存储优化方案](./STORAGE_OPTIMIZATION_PLAN.md)

### B. 代码仓库

- 迁移脚本：`scripts/migrate-kv-to-d1.ts`
- D1 适配器：`src/lib/d1-storage.ts`
- Cache API：`src/lib/cache-api-adapter.ts`
- 测试用例：`tests/d1-storage.test.ts`

### C. 联系人

- **技术负责人：** [待填写]
- **项目经理：** [待填写]
- **运维联系人：** [待填写]

---

**文档版本：** v1.0  
**最后更新：** 2025-10-08  
**下次审查：** 迁移完成后

