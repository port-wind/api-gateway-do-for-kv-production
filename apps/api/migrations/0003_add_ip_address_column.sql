-- Migration: 添加 ip_address 列到 ip_traffic_daily 表
-- 用于显示真实 IP 地址（而不仅仅是哈希值）
-- Created: 2025-10-17

-- 添加 ip_address 列
ALTER TABLE ip_traffic_daily 
ADD COLUMN ip_address TEXT;

-- 为 ip_address 创建索引，方便按 IP 搜索
CREATE INDEX IF NOT EXISTS idx_ip_address 
ON ip_traffic_daily(ip_address);

-- 同时给 traffic_events 表也添加 ip_address 列，用于详细查询
ALTER TABLE traffic_events 
ADD COLUMN ip_address TEXT;

-- 为 traffic_events.ip_address 创建索引
CREATE INDEX IF NOT EXISTS idx_traffic_events_ip_address 
ON traffic_events(ip_address);

-- 注意：现有数据的 ip_address 将为 NULL，只有新数据会包含真实 IP

