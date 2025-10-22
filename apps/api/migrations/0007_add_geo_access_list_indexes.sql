-- Migration: 0007_add_geo_access_list_indexes
-- 为地区访问列表功能添加性能优化索引
-- 创建时间: 2025-10-18

-- 说明：
-- 本 migration 为地区访问监控列表功能添加必需的索引，以支持高效的实时聚合查询。
-- 这些索引基于 event_date 字段（已有基础索引），进一步优化多维度查询性能。

-- 1. 联合索引：按日期和国家查询（访问列表主查询）
-- 用于：GET /api/admin/geo/access-list（国家列表）
-- 查询模式：WHERE event_date = ? AND country IS NOT NULL GROUP BY country
CREATE INDEX IF NOT EXISTS idx_traffic_events_date_country 
  ON traffic_events(event_date, country);

-- 2. 联合索引：按日期、国家和路径查询（路径详情查询）
-- 用于：GET /api/admin/geo/access-list/:country/paths（国家路径列表）
-- 查询模式：WHERE event_date = ? AND country = ? GROUP BY path
CREATE INDEX IF NOT EXISTS idx_traffic_events_date_country_path 
  ON traffic_events(event_date, country, path);

-- 3. 联合索引：按国家和日期查询（国家详情时间线）
-- 用于：GET /api/admin/geo/access-list/:country（国家详情 + 时间线）
-- 查询模式：WHERE country = ? AND event_date = ? ORDER BY timestamp
CREATE INDEX IF NOT EXISTS idx_traffic_events_country_date 
  ON traffic_events(country, event_date, timestamp);

-- 验证索引创建
-- PRAGMA index_list('traffic_events');

-- 性能预期：
-- - 国家列表查询（50 国家）：< 100ms
-- - 国家详情查询：< 50ms
-- - 国家路径列表查询：< 100ms
--
-- 存储开销：
-- - 每个索引约占表空间的 5-10%
-- - 对于 100 万条记录，总索引大小约 30-50 MB
--
-- 维护建议：
-- - 定期 VACUUM（通过 Scheduled Handler 或手动）
-- - 监控索引使用率（通过 EXPLAIN QUERY PLAN）

