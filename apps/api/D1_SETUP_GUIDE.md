# D1 数据库设置指南

## 📋 快速开始

### 方法 1: 使用自动化脚本（推荐）

```bash
cd apps/api
./scripts/setup-d1.sh
```

脚本会自动:
- ✅ 创建 D1 数据库
- ✅ 更新 `wrangler.toml` 中的 `database_id`
- ✅ 执行数据库迁移
- ✅ 验证表结构

### 方法 2: 手动设置

#### Step 1: 创建 D1 数据库

```bash
# 测试环境（默认）
npx wrangler d1 create path-stats-db

# 生产环境
npx wrangler d1 create path-stats-db-prod
```

命令执行后会输出:
```toml
[[d1_databases]]
binding = "D1"
database_name = "path-stats-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

#### Step 2: 更新 wrangler.toml

将输出的 `database_id` 复制到 `wrangler.toml` 中:

```toml
# 测试环境
[[d1_databases]]
binding = "D1"
database_name = "path-stats-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # 替换 PLACEHOLDER

# 生产环境
[[env.production.d1_databases]]
binding = "D1"
database_name = "path-stats-db-prod"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # 替换 PLACEHOLDER
```

#### Step 3: 执行数据库迁移

```bash
# 测试环境
npx wrangler d1 execute path-stats-db \
  --file=./migrations/0001_create_path_stats_tables.sql

# 生产环境
npx wrangler d1 execute path-stats-db-prod \
  --file=./migrations/0001_create_path_stats_tables.sql \
  --env production
```

#### Step 4: 验证表结构

```bash
# 查询所有表
npx wrangler d1 execute path-stats-db \
  --command="SELECT name FROM sqlite_master WHERE type='table'"

# 查询所有索引
npx wrangler d1 execute path-stats-db \
  --command="SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
```

预期输出:
```
Tables:
- traffic_events
- path_stats_hourly
- archive_metadata
- consumer_heartbeat

Indexes:
- idx_events_date
- idx_events_path_date
- idx_events_timestamp
- idx_events_id
- idx_stats_hour
- idx_stats_updated
- idx_stats_requests
- idx_archive_status
- idx_archive_date
```

---

## 🔍 常用查询命令

### 查看数据库列表

```bash
npx wrangler d1 list
```

### 查询表行数

```bash
npx wrangler d1 execute path-stats-db --command="
  SELECT 
    (SELECT COUNT(*) FROM traffic_events) as events,
    (SELECT COUNT(*) FROM path_stats_hourly) as stats,
    (SELECT COUNT(*) FROM archive_metadata) as archives
"
```

### 查询数据库大小

```bash
npx wrangler d1 execute path-stats-db --command="
  SELECT 
    (SELECT page_count FROM pragma_page_count()) * 
    (SELECT page_size FROM pragma_page_size()) / 1024 / 1024 as size_mb
"
```

### 查看最近的聚合数据

```bash
npx wrangler d1 execute path-stats-db --command="
  SELECT * FROM path_stats_hourly 
  ORDER BY updated_at DESC 
  LIMIT 10
"
```

### 查看最近的明细事件

```bash
npx wrangler d1 execute path-stats-db --command="
  SELECT * FROM traffic_events 
  ORDER BY timestamp DESC 
  LIMIT 10
"
```

---

## 🧪 测试数据插入

### 插入测试明细事件

```bash
npx wrangler d1 execute path-stats-db --command="
  INSERT INTO traffic_events 
  (id, path, method, status, response_time, client_ip_hash, timestamp, event_date, is_error)
  VALUES 
  ('1730956800000-test0001', '/api/health', 'GET', 200, 120.5, 'a1b2c3d4e5f67890', 1730956800000, '2025-10-15', 0)
"
```

### 插入测试聚合数据

```bash
npx wrangler d1 execute path-stats-db --command="
  INSERT INTO path_stats_hourly 
  (path, hour_bucket, requests, errors, sum_response_time, count_response_time, response_samples, ip_hashes, unique_ips_seen)
  VALUES 
  ('/api/health', '2025-10-15T14', 100, 5, 12000.0, 100, '[120, 135, 98]', '[\"a1b2c3d4\", \"e5f67890\"]', 2)
"
```

### 清理测试数据

```bash
npx wrangler d1 execute path-stats-db --command="
  DELETE FROM traffic_events WHERE id LIKE '%-test%';
  DELETE FROM path_stats_hourly WHERE path = '/api/test';
"
```

---

## 🚨 故障排查

### 问题 1: `database_id = "PLACEHOLDER"` 未更新

**症状**: 部署时报错 `Database PLACEHOLDER not found`

**解决方法**:
1. 确认已创建数据库: `npx wrangler d1 list`
2. 手动更新 `wrangler.toml` 中的 `database_id`
3. 或重新运行 `./scripts/setup-d1.sh`

### 问题 2: 迁移脚本执行失败

**症状**: `SQL error: table already exists`

**解决方法**:
```bash
# 查看已有表
npx wrangler d1 execute path-stats-db \
  --command="SELECT name FROM sqlite_master WHERE type='table'"

# 如果表结构不完整，手动删除后重新迁移
npx wrangler d1 execute path-stats-db --command="
  DROP TABLE IF EXISTS traffic_events;
  DROP TABLE IF EXISTS path_stats_hourly;
  DROP TABLE IF EXISTS archive_metadata;
  DROP TABLE IF EXISTS consumer_heartbeat;
"

# 重新执行迁移
npx wrangler d1 execute path-stats-db \
  --file=./migrations/0001_create_path_stats_tables.sql
```

### 问题 3: 本地开发无法访问 D1

**症状**: `TypeError: env.D1 is undefined`

**解决方法**:
```bash
# 确保 wrangler.toml 中的 database_id 已配置
grep "database_id" wrangler.toml

# 使用 wrangler dev 启动本地开发
npm run dev

# 或者使用 Miniflare 测试环境
npm test
```

### 问题 4: 数据库配额已满

**症状**: `Error: database size limit exceeded`

**解决方法**:
1. 检查数据库大小（见上文"查询数据库大小"）
2. 手动触发归档: `POST /admin/archive/trigger`
3. 清理旧数据（参考技术方案）

---

## 📚 相关文档

- [D1 Schema 文档](./docs/d1-schema.md) - 详细的表结构说明
- [Phase 2 实施计划](../../docs/path-stats-phase2-implementation-plan.md) - 完整实施计划
- [技术方案](../../docs/path-stats-refactor.md) - 总体架构设计
- [Cloudflare D1 文档](https://developers.cloudflare.com/d1/) - 官方文档

---

## ✅ 检查清单

部署前确认:

- [ ] D1 数据库已创建
- [ ] `wrangler.toml` 中 `database_id` 已更新（不是 `PLACEHOLDER`）
- [ ] 数据库迁移已执行
- [ ] 表结构已验证（4 个表，8+ 个索引）
- [ ] `src/types/env.ts` 中 `D1: D1Database` 已声明
- [ ] 本地测试通过

---

**最后更新**: 2025-10-15  
**文档版本**: v1.0

