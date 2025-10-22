-- ═══════════════════════════════════════════════════════════════════════════
-- traffic_events 表性能优化索引
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. 时间戳索引 (用于最近24小时查询)
CREATE INDEX IF NOT EXISTS idx_traffic_events_timestamp 
ON traffic_events(timestamp);

-- 2. 日期+时间戳复合索引 (用于按日期分区查询)
CREATE INDEX IF NOT EXISTS idx_traffic_events_date_timestamp 
ON traffic_events(event_date DESC, timestamp DESC);

-- 3. 路径+时间戳索引 (用于路径统计)
CREATE INDEX IF NOT EXISTS idx_traffic_events_path_timestamp 
ON traffic_events(path, timestamp DESC);

-- 4. 状态码索引 (用于错误率统计)
CREATE INDEX IF NOT EXISTS idx_traffic_events_status 
ON traffic_events(status, timestamp DESC)
WHERE status >= 400;

-- 5. IP地址+时间戳索引 (用于IP监控和去重)
CREATE INDEX IF NOT EXISTS idx_traffic_events_ip_timestamp 
ON traffic_events(ip_address, timestamp DESC)
WHERE ip_address IS NOT NULL;

SELECT '✅ traffic_events 索引创建完成！' as message;

