-- 迁移 0011: 为 IP 流量表添加 last_seen_city 字段
-- 用途: Quick Win - IP 监控页面显示原始城市信息
-- 日期: 2025-10-20
-- 说明: 记录 IP 最后一次或最频繁出现的城市（Cloudflare cf.city 原始值）

-- 添加 last_seen_city 列到 ip_traffic_daily 表
ALTER TABLE ip_traffic_daily 
ADD COLUMN last_seen_city TEXT;

-- 注释：此字段存储未标准化的原始城市名称
-- 示例值: "Beijing", "New York", "São Paulo"
-- 可能存在大小写/语言不统一问题（将在完整城市级方案中解决）

