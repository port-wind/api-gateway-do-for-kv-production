-- Migration: 0005_add_edge_colo
-- 为实时地图可视化添加 Cloudflare 边缘节点信息
-- 创建时间: 2025-10-18

-- 添加边缘节点列（存储 Cloudflare COLO 代码，如 SJC, HKG）
ALTER TABLE traffic_events ADD COLUMN edge_colo TEXT;

-- 添加索引（用于按边缘节点 + 时间查询）
CREATE INDEX IF NOT EXISTS idx_traffic_events_edge_colo 
  ON traffic_events(edge_colo, timestamp DESC);

-- 可选（Phase 5.2+ 精细化下钻时启用）：
-- ALTER TABLE traffic_events ADD COLUMN region TEXT;
-- ALTER TABLE traffic_events ADD COLUMN city TEXT;
-- CREATE INDEX IF NOT EXISTS idx_traffic_events_region ON traffic_events(region, timestamp DESC);

-- 验证表结构
-- PRAGMA table_info(traffic_events);

