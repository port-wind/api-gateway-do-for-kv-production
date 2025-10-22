-- Migration: 创建 ip_path_daily 表用于准确统计每个 IP 的每日路径访问

-- 主表：记录每个 IP 在每天访问的每条路径及次数
CREATE TABLE IF NOT EXISTS ip_path_daily (
  date TEXT NOT NULL,           -- 日期 (YYYY-MM-DD)
  ip_hash TEXT NOT NULL,        -- IP 哈希
  path TEXT NOT NULL,           -- 访问路径
  request_count INTEGER NOT NULL DEFAULT 0,  -- 该路径的请求次数
  
  PRIMARY KEY (date, ip_hash, path)
);

CREATE INDEX IF NOT EXISTS idx_ip_path_daily_ip 
ON ip_path_daily(ip_hash, date);

-- 索引：按路径查询（用于分析热门路径）
CREATE INDEX IF NOT EXISTS idx_ip_path_daily_path 
ON ip_path_daily(date, path);

-- 注意：
-- 1. 这张表提供准确的 unique_paths 统计（不受 Top 20 截断限制）
-- 2. 队列消费者写入时使用 INSERT ... ON CONFLICT DO UPDATE
-- 3. 查询 unique_paths = SELECT COUNT(DISTINCT path) FROM ip_path_daily WHERE ...
-- 4. 数据保留策略与 ip_traffic_daily 一致（通过 scheduled handler 清理）
