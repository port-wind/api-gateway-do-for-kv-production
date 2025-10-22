-- Migration: 为 ip_traffic_daily 添加限流和封禁统计字段
--
-- 目的：支持前端显示成功率、错误率、限流率
--
-- 创建日期: 2025-10-20

-- 添加封禁和限流字段
ALTER TABLE ip_traffic_daily ADD COLUMN blocked_requests INTEGER DEFAULT 0;
ALTER TABLE ip_traffic_daily ADD COLUMN throttled_requests INTEGER DEFAULT 0;

-- 注意：
-- 1. 这些字段将在队列消费者聚合时更新
-- 2. 现有数据默认为 0（历史数据无法补齐，只影响新数据）
-- 3. 成功率 = (total_requests - total_errors - blocked_requests - throttled_requests) / total_requests * 100
-- 4. 错误率 = total_errors / total_requests * 100
-- 5. 限流率 = (blocked_requests + throttled_requests) / total_requests * 100

