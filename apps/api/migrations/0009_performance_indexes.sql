-- ═══════════════════════════════════════════════════════════════════════════
-- 性能优化索引
-- 创建日期: 2025-10-18
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. traffic_events 表索引

-- 1.1 时间戳索引 (用于最近24小时查询)
CREATE INDEX IF NOT EXISTS idx_traffic_events_timestamp_recent 
ON traffic_events(timestamp);

-- 1.2 日期+时间戳复合索引 (用于按日期分区查询)
CREATE INDEX IF NOT EXISTS idx_traffic_events_date_timestamp 
ON traffic_events(event_date DESC, timestamp DESC);

-- 1.3 路径+时间戳索引 (用于路径统计)
CREATE INDEX IF NOT EXISTS idx_traffic_events_path_timestamp 
ON traffic_events(path, timestamp DESC);

-- 1.4 状态码索引 (用于错误率统计)
CREATE INDEX IF NOT EXISTS idx_traffic_events_status 
ON traffic_events(status, timestamp DESC)
WHERE status >= 400;

-- 1.5 IP地址+时间戳索引 (用于IP监控和去重)
CREATE INDEX IF NOT EXISTS idx_traffic_events_ip_timestamp 
ON traffic_events(client_ip_hash, timestamp DESC)
WHERE client_ip_hash IS NOT NULL;
