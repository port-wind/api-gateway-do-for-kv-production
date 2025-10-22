-- Migration: 0008_add_dashboard_indexes.sql
-- 目的：优化 Dashboard 查询性能，添加 (event_date, timestamp) 复合索引

-- 1. 复合索引：按日期 + 时间戳查询（Dashboard 24h 统计）
-- 用于：GET /api/admin/dashboard/overview（总请求、趋势、Top Paths）
-- 查询模式：WHERE event_date IN (?, ?) AND timestamp >= ?
CREATE INDEX IF NOT EXISTS idx_traffic_events_date_timestamp 
  ON traffic_events(event_date, timestamp DESC);

-- 2. 复合索引：按日期 + 路径查询（Dashboard Top Paths）
-- 用于：GET /api/admin/dashboard/overview 的 Top Paths 聚合
-- 查询模式：WHERE event_date = ? GROUP BY path ORDER BY COUNT(*) DESC
CREATE INDEX IF NOT EXISTS idx_traffic_events_date_path 
  ON traffic_events(event_date, path);

-- 3. 验证索引创建
SELECT name, sql 
FROM sqlite_master 
WHERE type = 'index' 
  AND tbl_name = 'traffic_events' 
  AND name LIKE 'idx_traffic_events%'
ORDER BY name;

