# D1 数据库表结构文档

## 数据库信息

- **数据库名称**: `path-stats-db`
- **平台**: Cloudflare D1 (SQLite-compatible)
- **创建日期**: 2025-10-15
- **Schema 版本**: v1.0

---

## 📊 表结构概览

| 表名 | 用途 | 预计行数/日 | 数据保留期 |
|------|------|------------|-----------|
| `traffic_events` | 明细事件 | 100 万 | **3 天** |
| `path_stats_hourly` | 小时聚合 | ~1000 | **90 天** |
| `archive_metadata` | 归档元数据 | 1 | 无限期 |
| `consumer_heartbeat` | 消费者心跳 | 1 | 实时更新 |

---

## 1. traffic_events（明细事件表）

### 用途

存储所有请求的明细事件，用于：
- 数据审计和回溯
- 聚合统计的数据源
- 归档到 R2 的来源

### 表结构

```sql
CREATE TABLE traffic_events (
  id TEXT PRIMARY KEY,              -- 幂等 ID
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 200,
  response_time REAL NOT NULL DEFAULT 0,
  client_ip_hash TEXT NOT NULL,
  user_agent TEXT,
  country TEXT,
  timestamp INTEGER NOT NULL,
  event_date TEXT NOT NULL,         -- YYYY-MM-DD
  is_error INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

### 字段说明

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `id` | TEXT | 幂等 ID（PK） | `1730956800000-a1b2c3d4` |
| `path` | TEXT | 请求路径 | `/api/health` |
| `method` | TEXT | HTTP 方法 | `GET`, `POST` |
| `status` | INTEGER | HTTP 状态码 | `200`, `404`, `500` |
| `response_time` | REAL | 响应时间（毫秒） | `120.5` |
| `client_ip_hash` | TEXT | IP 哈希值（SHA-256 前 16 位） | `a1b2c3d4e5f67890` |
| `user_agent` | TEXT | User-Agent（可选） | `Mozilla/5.0 ...` |
| `country` | TEXT | 国家代码（可选） | `CN`, `US` |
| `timestamp` | INTEGER | Unix 时间戳（毫秒） | `1730956800000` |
| `event_date` | TEXT | 事件日期（用于分区） | `2025-10-15` |
| `is_error` | INTEGER | 是否错误（status >= 400） | `0` 或 `1` |
| `created_at` | INTEGER | 创建时间（秒） | `1730956800` |

### 索引

```sql
CREATE INDEX idx_events_date ON traffic_events(event_date);
CREATE INDEX idx_events_path_date ON traffic_events(path, event_date);
CREATE INDEX idx_events_timestamp ON traffic_events(timestamp);
CREATE INDEX idx_events_id ON traffic_events(id);
```

### 查询示例

```sql
-- 查询某天的所有事件
SELECT * FROM traffic_events 
WHERE event_date = '2025-10-15' 
LIMIT 100;

-- 查询某路径的错误请求
SELECT * FROM traffic_events 
WHERE path = '/api/foo' 
  AND is_error = 1 
ORDER BY timestamp DESC 
LIMIT 50;

-- 统计每天的请求数
SELECT event_date, COUNT(*) as count 
FROM traffic_events 
GROUP BY event_date 
ORDER BY event_date DESC;
```

### 容量管理

- **保留期**: 3 天（自动归档并清理）
- **预计容量**: 100 万条/日 × 150 字节 × 3 天 ≈ **450 MB**
- **清理策略**: 每日凌晨 2 点归档 3 天前的数据到 R2，然后删除

---

## 2. path_stats_hourly（小时聚合表）

### 用途

存储按路径和小时聚合的统计数据，使用**简化统计方案**：
- 百分位计算：水库采样（最多 1000 个样本）
- Unique IP 统计：水库采样（最多 1000 个哈希）

### 表结构

```sql
CREATE TABLE path_stats_hourly (
  path TEXT NOT NULL,
  hour_bucket TEXT NOT NULL,        -- '2025-10-15T14'
  requests INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  sum_response_time REAL NOT NULL DEFAULT 0,
  count_response_time INTEGER NOT NULL DEFAULT 0,
  response_samples TEXT,            -- JSON 数组
  ip_hashes TEXT,                   -- JSON 数组
  unique_ips_seen INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (path, hour_bucket)
);
```

### 字段说明

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `path` | TEXT | 请求路径（PK 一部分） | `/api/health` |
| `hour_bucket` | TEXT | 小时桶（PK 一部分） | `2025-10-15T14` |
| `requests` | INTEGER | 总请求数 | `5000` |
| `errors` | INTEGER | 错误请求数 | `50` |
| `sum_response_time` | REAL | 响应时间总和（毫秒） | `125000.0` |
| `count_response_time` | INTEGER | 响应时间计数 | `5000` |
| `response_samples` | TEXT | 响应时间样本（JSON） | `[120, 135, 98, ...]` |
| `ip_hashes` | TEXT | IP 哈希样本（JSON） | `["a1b2...", "c3d4..."]` |
| `unique_ips_seen` | INTEGER | 唯一 IP 数（水库下界） | `856` |
| `created_at` | INTEGER | 创建时间（秒） | `1730956800` |
| `updated_at` | INTEGER | 最后更新时间（秒） | `1730960400` |

### 字段详解

#### response_samples（响应时间样本）

- **格式**: JSON 数组
- **最大长度**: 1000 个
- **采样方法**: 水库采样（Reservoir Sampling）
- **用途**: 计算 p50, p95, p99 等百分位
- **准确度**: 
  - ≤1000 请求：100% 准确
  - >1000 请求：误差 ±3%

**示例**:
```json
[120.5, 135.2, 98.7, 156.3, ...]
```

#### ip_hashes（IP 哈希样本）

- **格式**: JSON 数组
- **最大长度**: 1000 个（唯一）
- **采样方法**: 水库采样（Reservoir Sampling）
- **用途**: 估算唯一 IP 数
- **准确度**:
  - ≤1000 请求：100% 准确
  - >1000 请求：仅提供下界估计（真实值 ≥ 返回值）

**示例**:
```json
["a1b2c3d4e5f67890", "c3d4e5f678901234", ...]
```

#### unique_ips_seen（唯一 IP 计数）

- **类型**: INTEGER
- **含义**: 当前水库中的唯一 IP 数（≤ 1000）
- **⚠️ 限制**: 对于 >1000 唯一 IP 的场景，此值仅为**下界估计**
- **示例**: 
  - 实际有 5000 个唯一 IP → `unique_ips_seen = 1000`（下界）
  - 实际有 500 个唯一 IP → `unique_ips_seen = 500`（精确）

### 索引

```sql
CREATE INDEX idx_stats_hour ON path_stats_hourly(hour_bucket);
CREATE INDEX idx_stats_updated ON path_stats_hourly(updated_at);
CREATE INDEX idx_stats_requests ON path_stats_hourly(requests DESC);
```

### 查询示例

```sql
-- 查询某路径最近 24 小时的聚合数据
SELECT * FROM path_stats_hourly 
WHERE path = '/api/health' 
  AND hour_bucket >= '2025-10-14T14' 
ORDER BY hour_bucket DESC;

-- 查询 Top 10 热门路径（最近 1 小时）
SELECT 
  path,
  requests,
  errors,
  sum_response_time / count_response_time as avg_response_time,
  unique_ips_seen
FROM path_stats_hourly 
WHERE hour_bucket = '2025-10-15T14' 
ORDER BY requests DESC 
LIMIT 10;

-- 计算某路径的错误率
SELECT 
  path,
  SUM(requests) as total_requests,
  SUM(errors) as total_errors,
  CAST(SUM(errors) AS REAL) / SUM(requests) * 100 as error_rate
FROM path_stats_hourly 
WHERE path = '/api/foo' 
  AND hour_bucket >= '2025-10-14T00' 
GROUP BY path;
```

### 容量管理

- **保留期**: 90 天
- **预计容量**: 
  - 假设 100 个独立路径
  - 90 天 × 24 小时 × 100 路径 = 216,000 行
  - 每行约 500 字节（包含 JSON 数组）
  - 总计：**≈ 108 MB**（远小于明细表）
- **清理策略**: 可选，超过 90 天的数据可归档或删除

---

## 3. archive_metadata（归档元数据表）

### 用途

记录每日归档任务的元数据，用于：
- 追踪归档状态
- R2 文件位置索引
- 归档失败告警

### 表结构

```sql
CREATE TABLE archive_metadata (
  date TEXT PRIMARY KEY,
  r2_path TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  file_size_bytes INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  archived_at INTEGER NOT NULL,
  completed_at INTEGER,
  d1_cleaned INTEGER NOT NULL DEFAULT 0
);
```

### 字段说明

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `date` | TEXT | 归档日期（PK） | `2025-10-15` |
| `r2_path` | TEXT | R2 存储路径 | `events-archive/2025/10/2025-10-15.jsonl.gz` |
| `record_count` | INTEGER | 归档记录数 | `1000000` |
| `file_size_bytes` | INTEGER | 文件大小（字节） | `35000000` |
| `status` | TEXT | 归档状态 | `pending`, `completed`, `failed` |
| `error_message` | TEXT | 错误信息（如果失败） | `R2 upload failed: ...` |
| `archived_at` | INTEGER | 归档开始时间 | `1730956800` |
| `completed_at` | INTEGER | 归档完成时间 | `1730960400` |
| `d1_cleaned` | INTEGER | D1 是否已清理 | `0` 或 `1` |

### 索引

```sql
CREATE INDEX idx_archive_status ON archive_metadata(status);
CREATE INDEX idx_archive_date ON archive_metadata(archived_at);
```

### 查询示例

```sql
-- 查询最近的归档记录
SELECT * FROM archive_metadata 
ORDER BY archived_at DESC 
LIMIT 10;

-- 查询失败的归档任务
SELECT * FROM archive_metadata 
WHERE status = 'failed' 
ORDER BY archived_at DESC;

-- 统计归档总量
SELECT 
  COUNT(*) as total_archives,
  SUM(record_count) as total_records,
  SUM(file_size_bytes) / 1024 / 1024 / 1024 as total_size_gb
FROM archive_metadata 
WHERE status = 'completed';
```

---

## 4. consumer_heartbeat（消费者心跳表）

### 用途

记录队列消费者的心跳信息，用于：
- 监控消费者健康状态
- 性能指标收集
- 单消费者故障告警

### 表结构

```sql
CREATE TABLE consumer_heartbeat (
  consumer_id TEXT PRIMARY KEY,
  last_heartbeat INTEGER NOT NULL,
  last_batch_size INTEGER,
  last_batch_duration_ms INTEGER,
  total_processed INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

### 字段说明

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `consumer_id` | TEXT | 消费者 ID（PK） | `aggregator-primary` |
| `last_heartbeat` | INTEGER | 最后心跳时间（秒） | `1730956800` |
| `last_batch_size` | INTEGER | 最后批次大小 | `100` |
| `last_batch_duration_ms` | INTEGER | 最后批次耗时（毫秒） | `250` |
| `total_processed` | INTEGER | 累计处理消息数 | `1000000` |
| `total_errors` | INTEGER | 累计错误数 | `10` |
| `status` | TEXT | 消费者状态 | `active`, `inactive`, `error` |
| `updated_at` | INTEGER | 最后更新时间（秒） | `1730956800` |

### 查询示例

```sql
-- 查询消费者状态
SELECT * FROM consumer_heartbeat;

-- 检查心跳超时（>3 分钟）
SELECT 
  consumer_id,
  (strftime('%s', 'now') - last_heartbeat) / 60 as minutes_since_last_heartbeat
FROM consumer_heartbeat 
WHERE (strftime('%s', 'now') - last_heartbeat) > 180;
```

---

## 📏 容量规划

### 日均 100 万请求场景

| 表 | 行数 | 每行大小 | 每日增量 | 保留期 | 总容量 |
|----|------|---------|---------|--------|--------|
| `traffic_events` | 100 万/日 | 150 B | 150 MB | 3 天 | **450 MB** |
| `path_stats_hourly` | 2400/日 | 500 B | 1.2 MB | 90 天 | **108 MB** |
| `archive_metadata` | 1/日 | 200 B | 200 B | 无限期 | < 1 MB |
| `consumer_heartbeat` | 1 | 150 B | - | 实时 | < 1 KB |
| **总计** | - | - | **151 MB/日** | - | **≈ 560 MB** |

### D1 容量限制

- **免费额度**: 5 GB 存储，每日 10 万次写入
- **付费计划**: 无容量限制（$0.75/GB/月）
- **当前设计**: 单库 < 1 GB，安全余量充足

### 扩展策略

**如果流量增长至 500 万/日**：
- 明细表：450 MB × 5 = 2.25 GB（仍在单库范围）
- 聚合表：108 MB × 5 = 540 MB
- 总计：≈ 2.8 GB

**如果流量增长至 1000 万/日**：
- 需要考虑分库策略（按月或按路径前缀）
- 或缩短明细保留期至 1-2 天

---

## 🔧 维护操作

### 创建数据库

```bash
# 创建 D1 数据库
wrangler d1 create path-stats-db

# 记录数据库 ID，添加到 wrangler.toml
# [[d1_databases]]
# binding = "D1"
# database_name = "path-stats-db"
# database_id = "xxx-xxx-xxx"
```

### 执行迁移

```bash
# 执行初始迁移
wrangler d1 execute path-stats-db \
  --file=./migrations/0001_create_path_stats_tables.sql

# 验证表结构
wrangler d1 execute path-stats-db \
  --command="SELECT name FROM sqlite_master WHERE type='table'"
```

### 查询数据

```bash
# 查询表行数
wrangler d1 execute path-stats-db \
  --command="SELECT 
    (SELECT COUNT(*) FROM traffic_events) as events,
    (SELECT COUNT(*) FROM path_stats_hourly) as stats"

# 查询数据库大小
wrangler d1 execute path-stats-db \
  --command="PRAGMA page_count; PRAGMA page_size;"
```

### 清理测试数据

```bash
# 清空所有表（⚠️ 危险操作）
wrangler d1 execute path-stats-db \
  --command="DELETE FROM traffic_events; 
             DELETE FROM path_stats_hourly; 
             DELETE FROM archive_metadata;"
```

---

## 📝 修订历史

| 日期 | 版本 | 修改内容 | 作者 |
|------|------|----------|------|
| 2025-10-15 | v1.0 | 初始版本，基于简化统计方案 | System |

---

## 🔗 相关文档

- [Phase 0 验证报告](../../docs/phase0-validation-report.md)
- [Phase 2 实施计划](../../docs/path-stats-phase2-implementation-plan.md)
- [简化统计实现](../src/lib/simplified-stats.ts)
- [技术方案](../../docs/path-stats-refactor.md)

