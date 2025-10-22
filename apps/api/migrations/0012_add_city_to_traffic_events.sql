-- 0012_add_city_to_traffic_events.sql
-- 为 traffic_events 表添加 city 列，存储 Cloudflare 返回的原始城市名称

-- 添加 city 列
ALTER TABLE traffic_events ADD COLUMN city TEXT;

-- 添加索引以优化按城市查询
CREATE INDEX IF NOT EXISTS idx_traffic_events_city ON traffic_events(city);

-- 添加复合索引以优化城市+日期查询
CREATE INDEX IF NOT EXISTS idx_traffic_events_city_date ON traffic_events(city, event_date);

