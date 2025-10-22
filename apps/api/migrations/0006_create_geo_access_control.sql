-- Migration: 0006_create_geo_access_control
-- 为地区访问控制功能添加数据表和字段
-- 创建时间: 2025-10-18

-- 1. 为 traffic_events 表添加地区访问控制动作字段
ALTER TABLE traffic_events ADD COLUMN geo_action TEXT;

-- 添加索引（用于按地区动作查询）
CREATE INDEX IF NOT EXISTS idx_traffic_events_geo_action 
  ON traffic_events(geo_action, timestamp DESC);

-- 添加联合索引（用于按国家 + 地区动作查询）
CREATE INDEX IF NOT EXISTS idx_traffic_events_country_geo 
  ON traffic_events(country, geo_action, timestamp DESC);

-- 2. 创建地区流量统计表
CREATE TABLE IF NOT EXISTS geo_traffic_stats (
  -- 主键：日期-国家-路径组合
  id TEXT PRIMARY KEY,
  
  -- 维度字段
  date TEXT NOT NULL,               -- 日期（YYYY-MM-DD）
  country TEXT NOT NULL,            -- 国家代码（如 'CN', 'US'）
  path TEXT,                        -- 路径（NULL 表示全局统计）
  
  -- 流量统计
  total_requests INTEGER DEFAULT 0,
  blocked_requests INTEGER DEFAULT 0,
  throttled_requests INTEGER DEFAULT 0,
  allowed_requests INTEGER DEFAULT 0,
  
  -- 错误统计
  error_4xx INTEGER DEFAULT 0,
  error_5xx INTEGER DEFAULT 0,
  
  -- 性能指标
  avg_response_time REAL,
  p95_response_time REAL,
  
  -- 时间戳
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 索引：按日期和国家查询（最常用）
CREATE INDEX IF NOT EXISTS idx_geo_stats_date_country 
  ON geo_traffic_stats(date DESC, country);

-- 索引：按国家和路径查询
CREATE INDEX IF NOT EXISTS idx_geo_stats_country_path 
  ON geo_traffic_stats(country, path);

-- 索引：按日期查询（用于聚合统计）
CREATE INDEX IF NOT EXISTS idx_geo_stats_date 
  ON geo_traffic_stats(date DESC);

-- 验证表结构
-- PRAGMA table_info(traffic_events);
-- PRAGMA table_info(geo_traffic_stats);

-- 说明：
-- geo_action 字段可能的值：
--   - NULL: 未应用地区规则（默认）
--   - 'allowed': 地区规则允许通过
--   - 'blocked': 地区规则封禁
--   - 'throttled': 地区规则限流
--
-- geo_traffic_stats 表用于存储每日地区级流量统计
-- 通过定时任务（Scheduled Handler）从 traffic_events 聚合生成

