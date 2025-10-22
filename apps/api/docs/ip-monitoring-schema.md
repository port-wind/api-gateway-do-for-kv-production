# IP 监控系统数据库表结构文档

## 概述

本文档详细说明 IP 监控与全局限流系统的数据库设计。

- **数据库名称**: `path-stats-db` (Cloudflare D1)
- **创建日期**: 2025-10-17
- **Schema 版本**: v1.1（在 v1.0 基础上新增 IP 监控表）

---

## 📊 表结构概览

| 表名 | 用途 | 预计行数 | 数据保留期 |
|------|------|---------|-----------|
| `ip_traffic_daily` | IP 每日聚合统计 | 70 万/7 天 | **7 天**（可配置 1-30 天） |
| `ip_access_rules` | 全局 IP 限流/封禁规则 | < 1000 | 无限期（手动管理） |

---

## 1. ip_traffic_daily（IP 每日聚合统计）

### 用途

按 IP + 日期聚合的访问统计，用于：
- 监控和分析每个 IP 的访问行为
- 识别可疑或恶意 IP（高频、高错误率等）
- 提供管理界面的数据源

### 表结构

```sql
CREATE TABLE ip_traffic_daily (
  date TEXT NOT NULL,              -- YYYY-MM-DD
  ip_hash TEXT NOT NULL,
  total_requests INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0,
  unique_paths INTEGER NOT NULL DEFAULT 0,
  top_paths TEXT,                  -- JSON array
  countries TEXT,                  -- JSON array
  user_agents TEXT,                -- JSON array
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (date, ip_hash)
);
```

### 字段说明

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `date` | TEXT | 日期（主键第一位）| `2025-10-17` |
| `ip_hash` | TEXT | IP 哈希值（SHA-256 前 16 位）| `a1b2c3d4e5f67890` |
| `total_requests` | INTEGER | 当天总请求数 | `1250` |
| `total_errors` | INTEGER | 当天错误请求数（status ≥ 400）| `50` |
| `unique_paths` | INTEGER | 当天访问的唯一路径数 | `25` |
| `top_paths` | TEXT | Top 20 热点路径（JSON）| `[{"path":"/api/foo","count":100}]` |
| `countries` | TEXT | Top 5 国家代码（JSON）| `["CN","US","JP"]` |
| `user_agents` | TEXT | Top 5 User-Agent（JSON，截断）| `["Mozilla/5.0...","curl/7.68.0"]` |
| `first_seen` | INTEGER | 当天首次访问时间戳（毫秒）| `1729152000000` |
| `last_seen` | INTEGER | 当天最后访问时间戳（毫秒）| `1729238399000` |
| `created_at` | INTEGER | 记录创建时间（秒）| `1729152000` |
| `updated_at` | INTEGER | 记录更新时间（秒）| `1729152600` |

### 索引

```sql
-- 用于"今日 Top IP"查询
CREATE INDEX idx_ip_daily_requests 
  ON ip_traffic_daily(date, total_requests DESC);

-- 用于单 IP 历史查询
CREATE INDEX idx_ip_hash_lookup 
  ON ip_traffic_daily(ip_hash, date DESC);

-- 用于"高错误率 IP"查询
CREATE INDEX idx_ip_daily_errors 
  ON ip_traffic_daily(date, total_errors DESC);
```

### 查询示例

```sql
-- 查询今日访问量 Top 100 IP
SELECT ip_hash, total_requests, total_errors, unique_paths
FROM ip_traffic_daily
WHERE date = '2025-10-17'
ORDER BY total_requests DESC
LIMIT 100;

-- 查询某个 IP 最近 7 天的访问趋势
SELECT date, total_requests, total_errors, unique_paths, top_paths
FROM ip_traffic_daily
WHERE ip_hash = 'a1b2c3d4e5f67890'
  AND date >= date('now', '-7 days')
ORDER BY date DESC;

-- 查询今日高错误率 IP（错误率 > 50%）
SELECT ip_hash, total_requests, total_errors,
       ROUND(total_errors * 100.0 / total_requests, 2) as error_rate
FROM ip_traffic_daily
WHERE date = '2025-10-17'
  AND total_requests > 100
  AND total_errors * 100.0 / total_requests > 50
ORDER BY error_rate DESC
LIMIT 50;
```

### 数据更新策略

- **增量更新**：队列消费者每批处理后，使用 `INSERT ... ON CONFLICT DO UPDATE` 更新统计
- **Top Paths 计算**：在内存中按路径聚合，取 Top 20 后序列化为 JSON
- **Countries/UAs 计算**：统计频次，取 Top 5

### 容量管理

- **保留期**: 7 天（默认），可配置 1-30 天
- **预计容量**: 
  - 假设 10 万独立 IP/天
  - 每条记录 ~500 字节
  - 7 天：100K × 500B × 7 ≈ **350 MB**
- **清理策略**: 每日凌晨 2 点删除超过保留期的数据

---

## 2. ip_access_rules（IP 访问控制规则）

### 用途

存储全局 IP 限流/封禁规则，用于：
- 封禁恶意 IP（返回 403 Forbidden）
- 对可疑 IP 进行限流（返回 429 Too Many Requests）
- 支持精确 IP 和 CIDR 网段匹配

### 表结构

```sql
CREATE TABLE ip_access_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_pattern TEXT NOT NULL UNIQUE,
  ip_hash TEXT,
  mode TEXT NOT NULL,
  limit INTEGER,
  window INTEGER,
  reason TEXT,
  created_by TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  expires_at INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  CHECK (mode IN ('block', 'throttle')),
  CHECK (is_active IN (0, 1)),
  CHECK (
    (mode = 'block') OR 
    (mode = 'throttle' AND limit > 0 AND window > 0)
  )
);
```

### 字段说明

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `id` | INTEGER | 自增主键 | `1` |
| `ip_pattern` | TEXT | 原始 IP 或 CIDR（唯一）| `192.168.1.100` 或 `10.0.0.0/24` |
| `ip_hash` | TEXT | 精确 IP 的哈希值，CIDR 为 NULL | `a1b2c3d4e5f67890` 或 `NULL` |
| `mode` | TEXT | 模式：`block`（封禁）或 `throttle`（限流）| `block` |
| `limit` | INTEGER | throttle 模式的限流值（req/window）| `10` |
| `window` | INTEGER | throttle 模式的时间窗口（秒）| `60` |
| `reason` | TEXT | 封禁/限流原因 | `恶意爬虫` |
| `created_by` | TEXT | 创建人（管理员账号）| `admin@example.com` |
| `created_at` | INTEGER | 创建时间（秒）| `1729152000` |
| `expires_at` | INTEGER | 可选的过期时间（秒）| `1729238400` 或 `NULL` |
| `is_active` | INTEGER | 是否生效：0=禁用，1=启用 | `1` |

### 索引

```sql
-- 用于精确 IP 快速匹配
CREATE INDEX idx_rules_ip_hash 
  ON ip_access_rules(ip_hash) 
  WHERE ip_hash IS NOT NULL;

-- 用于管理界面列表查询
CREATE INDEX idx_rules_active 
  ON ip_access_rules(is_active, created_at DESC);

-- 用于定时清理过期规则
CREATE INDEX idx_rules_expires 
  ON ip_access_rules(expires_at) 
  WHERE expires_at IS NOT NULL;
```

### 查询示例

```sql
-- 查询某个 IP 的精确匹配规则
SELECT * FROM ip_access_rules
WHERE ip_hash = 'a1b2c3d4e5f67890'
  AND is_active = 1
  AND (expires_at IS NULL OR expires_at > strftime('%s', 'now'))
LIMIT 1;

-- 查询所有活跃规则（用于加载到 KV 缓存）
SELECT id, ip_pattern, ip_hash, mode, limit, window, reason, expires_at
FROM ip_access_rules
WHERE is_active = 1
  AND (expires_at IS NULL OR expires_at > strftime('%s', 'now'))
ORDER BY created_at DESC
LIMIT 1000;

-- 查询即将过期的规则（用于提醒）
SELECT * FROM ip_access_rules
WHERE expires_at IS NOT NULL
  AND expires_at > strftime('%s', 'now')
  AND expires_at < strftime('%s', 'now', '+1 day')
ORDER BY expires_at ASC;
```

### 规则匹配策略

1. **精确 IP 匹配**（O(1)）：
   - 先查询 `ip_hash` 精确匹配
   - 使用 `idx_rules_ip_hash` 索引

2. **CIDR 匹配**（O(N)）：
   - 遍历所有 `ip_hash IS NULL` 的规则
   - 在 Worker 内存中使用位运算判断 IP 是否在 CIDR 范围内

3. **性能优化**：
   - 规则总数限制在 1000 条
   - 通过 KV 缓存规则列表（TTL 5 分钟）
   - CIDR 规则数量建议 < 100 条

### 容量管理

- **规则上限**: 1000 条活跃规则
- **预计容量**: 1000 × 200B ≈ **200 KB**
- **清理策略**: 每日凌晨删除已过期的规则（`expires_at < now`）

---

## 3. 设计原则

### 为什么移除 ip_path_details 表？

**原方案**：`ip_path_details(ip_hash, path, date)` 存储每个 IP 访问每个路径的明细。

**问题**：
- 数据量 = 独立 IP 数 × 路径数 × 天数
- 假设 10 万 IP × 1000 路径 × 7 天 = **7 亿条记录**
- D1 容量和查询性能无法承受

**解决方案**：
1. 在 `ip_traffic_daily.top_paths` 中存储每个 IP 的 Top 20 热点路径（JSON）
2. 完整路径明细从 `traffic_events` 表实时查询（保留 3 天，已有 `client_ip_hash` 索引）
3. 3 天以前的明细已归档到 R2，管理界面提示无法查询

### 为什么主键是 (date, ip_hash) 而不是 (ip_hash, date)？

**原因**：
1. **查询模式**：大部分查询都是"今日 Top IP"或"最近 N 天所有 IP"，都需要先按日期过滤
2. **分区优化**：D1/SQLite 按主键顺序存储数据，`(date, ip_hash)` 使同一天的数据连续存储
3. **清理效率**：删除 7 天前数据时，`WHERE date < ?` 可以快速定位并批量删除

### CIDR 支持的权衡

**优点**：
- 支持一次性封禁整个网段（如 `10.0.0.0/24`）
- 适用于云服务商 IP 段、已知攻击源等场景

**缺点**：
- 无法使用哈希值，需要在 Worker 内存中遍历匹配（O(N)）
- 规则数量增多会影响性能

**优化策略**：
- 限制规则总数 1000 条
- 通过 KV 缓存规则列表，减少 D1 查询
- CIDR 规则数量建议 < 100 条
- 如果 CIDR 规则过多，考虑使用前缀树（Trie）优化匹配

---

## 4. 性能指标（预估，需压测验证）

### 存储容量（7 天保留期）

- **ip_traffic_daily**: ~350 MB
- **ip_access_rules**: ~200 KB
- **总计**: ~350 MB

### 查询性能

| 操作 | 索引 | 预估耗时 |
|------|------|---------|
| 今日 Top 100 IP | `idx_ip_daily_requests` | < 50ms |
| 单 IP 历史查询（7 天）| `idx_ip_hash_lookup` | < 30ms |
| 精确 IP 规则匹配 | `idx_rules_ip_hash` | < 10ms |
| 全规则加载（1000 条）| 全表扫描 | < 50ms |

### 写入性能

| 操作 | 批量大小 | 预估耗时 |
|------|---------|---------|
| IP 统计 upsert | 100 条/事务 | < 200ms |
| 规则创建 | 单条 | < 20ms |

---

## 5. 运维指南

### 数据保留配置

在 `wrangler.toml` 中设置：

```toml
[vars]
IP_MONITOR_RETENTION_DAYS = 7
```

或存储到 KV：

```typescript
await env.CONFIG.put('ip-monitor:retention-days', '7');
```

### 定时清理任务

每日凌晨 2 点执行：

```sql
-- 清理过期 IP 统计
DELETE FROM ip_traffic_daily
WHERE date < date('now', '-7 days');

-- 清理过期规则
DELETE FROM ip_access_rules
WHERE expires_at IS NOT NULL
  AND expires_at < strftime('%s', 'now');
```

### 规则缓存刷新

KV 缓存键：`ip-rules:active`，TTL 300 秒

每次创建/更新/删除规则后立即刷新：

```typescript
// 从 D1 加载所有活跃规则
const rules = await loadActiveRules(env);

// 写入 KV（5 分钟 TTL）
await env.CONFIG.put('ip-rules:active', JSON.stringify(rules), {
  expirationTtl: 300
});
```

---

## 6. 迁移指南

### 运行迁移

```bash
cd apps/api
wrangler d1 execute path-stats-db --file=migrations/0002_create_ip_monitoring_tables.sql
```

### 验证表结构

```bash
wrangler d1 execute path-stats-db --command="SELECT name FROM sqlite_master WHERE type='table';"
```

预期输出应包含：
- `ip_traffic_daily`
- `ip_access_rules`

### 回滚

如需回滚，运行：

```sql
DROP TABLE IF EXISTS ip_traffic_daily;
DROP TABLE IF EXISTS ip_access_rules;
```

---

## 7. 相关文档

- [Phase 2 实施计划](../docs/path-stats-phase2-implementation-plan.md)
- [D1 Schema v1.0](./d1-schema.md)
- [IP 监控系统实施计划](../docs/ip-monitor-and-global-limit.plan.md)

