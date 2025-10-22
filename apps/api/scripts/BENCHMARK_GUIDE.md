# Dashboard 性能压测指南

## 概述

本指南介绍如何对 Dashboard API 进行性能压测，确保查询优化后的响应时间符合预期。

## 优化内容

### 1. SQL 查询优化
- ✅ 合并多个查询为单个查询（减少 DB round-trip）
- ✅ 使用 `event_date` 索引过滤（避免全表扫描）
- ✅ 24h 跨天查询使用 `event_date IN (today, yesterday)`
- ✅ Timeseries 聚合先用 `event_date` 粗过滤

### 2. 新增索引
```sql
-- 0008_add_dashboard_indexes.sql
CREATE INDEX idx_traffic_events_date_timestamp 
  ON traffic_events(event_date, timestamp DESC);

CREATE INDEX idx_traffic_events_date_path 
  ON traffic_events(event_date, path);
```

## 压测步骤

### Step 1: 应用数据库迁移

```bash
# 本地环境（使用本地 SQLite）
cd apps/api
wrangler d1 execute api-gateway-d1 --local --file=migrations/0008_add_dashboard_indexes.sql

# Dev 环境
wrangler d1 execute api-gateway-d1 --env dev --file=migrations/0008_add_dashboard_indexes.sql

# Test 环境
wrangler d1 execute api-gateway-d1 --file=migrations/0008_add_dashboard_indexes.sql
```

### Step 2: 生成测试数据（本地环境）

```bash
# 生成 10,000 条测试记录
wrangler d1 execute api-gateway-d1 --local --file=scripts/generate-test-traffic.sql

# 如果需要更多数据，可以多次执行（会自动生成不同的 idempotent_id）
```

### Step 3: 启动本地开发服务器

```bash
npm run dev
# 或
wrangler dev --local
```

### Step 4: 运行性能基准测试

```bash
# 测试本地环境（默认 10 次迭代）
node scripts/benchmark-dashboard.js local

# 测试本地环境（20 次迭代，更准确）
node scripts/benchmark-dashboard.js local 20

# 测试 Dev 环境
node scripts/benchmark-dashboard.js dev 10

# 测试 Test 环境
node scripts/benchmark-dashboard.js test 10
```

## 性能目标

### 预期响应时间（P95）

| 接口 | 数据量 | 目标 P95 | 可接受 P95 |
|------|--------|----------|------------|
| `/dashboard/overview` | 1w 条 | < 300ms | < 500ms |
| `/dashboard/overview` | 10w 条 | < 500ms | < 1s |
| `/dashboard/timeseries?range=24h` | 1w 条 | < 200ms | < 400ms |
| `/dashboard/timeseries?range=7d` | 10w 条 | < 400ms | < 800ms |
| `/dashboard/realtime/recent` | 任意 | < 100ms | < 200ms |

### 性能评级

- ✅ **优秀**：P95 < 500ms
- ⚠️ **一般**：500ms ≤ P95 < 1s（建议优化）
- ⚠️ **较差**：1s ≤ P95 < 2s（需要优化）
- ❌ **严重**：P95 ≥ 2s（必须优化）

## 示例输出

```
🚀 Dashboard API Benchmark
Environment: local
Base URL: http://localhost:8787
============================================================

📊 Benchmarking: Dashboard Overview
URL: http://localhost:8787/api/admin/dashboard/overview
Iterations: 10

  ✓ Iteration 10/10: 142ms

📈 Results:
  • Successful requests: 10/10
  • Min:  128ms
  • P50:  135ms
  • P95:  145ms
  • P99:  145ms
  • Max:  145ms
  • Avg:  136.40ms
  ✅ P95 < 500ms - 性能优秀
```

## 性能调优建议

### 如果 P95 > 1s

1. **检查索引使用情况**
   ```sql
   -- 查看查询计划
   EXPLAIN QUERY PLAN
   SELECT COUNT(*) FROM traffic_events
   WHERE event_date IN (?, ?) AND timestamp >= ?;
   ```

2. **确认数据量**
   ```sql
   -- 统计数据量
   SELECT 
     event_date,
     COUNT(*) as count
   FROM traffic_events
   GROUP BY event_date
   ORDER BY event_date DESC
   LIMIT 7;
   ```

3. **考虑预聚合**
   - 如果 `COUNT(DISTINCT client_ip_hash)` 很慢，可以创建 `ip_activity_hourly` 聚合表
   - 定时任务每小时预聚合一次，查询时只需读聚合表

### 如果远程环境比本地慢很多

- **网络延迟**：Workers → D1 的网络往返时间
- **冷启动**：Workers 冷启动会增加首次请求延迟
- **区域差异**：选择离用户最近的区域部署

## 清理测试数据

```bash
# 删除所有测试数据
wrangler d1 execute api-gateway-d1 --local --command "DELETE FROM traffic_events WHERE idempotent_id LIKE 'test_%';"
```

## 故障排查

### 问题：索引未生效

```sql
-- 检查索引是否存在
SELECT name, sql 
FROM sqlite_master 
WHERE type = 'index' AND tbl_name = 'traffic_events';
```

### 问题：查询仍然很慢

1. 检查 `event_date` 字段是否正确填充
2. 确认 `timestamp` 值在合理范围内（Unix 毫秒）
3. 检查是否有其他慢查询干扰

### 问题：benchmark 脚本连接失败

1. 确认服务器已启动（`npm run dev`）
2. 检查 URL 配置是否正确
3. 确认防火墙/代理设置

## 下一步

完成压测后，请提供以下数据：

```
环境：[local/dev/test]
数据量：[X 条记录]
结果：
  - Overview P95: XXXms
  - Timeseries 24h P95: XXXms
  - Timeseries 7d P95: XXXms
  - Realtime Map P95: XXXms

是否满足性能目标：[是/否]
```

根据压测结果，决定是否需要进一步优化（如预聚合、缓存等）。

