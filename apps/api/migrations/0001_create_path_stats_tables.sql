-- ============================================
-- Phase 2: 路径统计数据库表结构
-- ============================================
-- 
-- 创建日期: 2025-10-15
-- 数据库: path-stats-db (D1)
-- 
-- 表结构设计基于 Phase 0 验证的简化统计方案
-- - 百分位计算：水库采样排序数组（最多 1000 个）
-- - Unique IP 统计：水库采样（最多 1000 个）
-- ============================================

-- ============================================
-- 1. 明细事件表
-- ============================================

CREATE TABLE IF NOT EXISTS traffic_events (
  -- 主键：幂等 ID（格式：{timestamp}-{hash}）
  id TEXT PRIMARY KEY,
  
  -- 请求信息
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 200,
  response_time REAL NOT NULL DEFAULT 0,
  
  -- 客户端信息（已哈希）
  client_ip_hash TEXT NOT NULL,
  user_agent TEXT,
  country TEXT,
  
  -- 时间信息
  timestamp INTEGER NOT NULL,
  event_date TEXT NOT NULL,  -- YYYY-MM-DD，用于分区和归档
  
  -- 分类标记
  is_error INTEGER NOT NULL DEFAULT 0,  -- 1 = status >= 400
  
  -- 元数据
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- 索引：用于按日期查询和归档
CREATE INDEX IF NOT EXISTS idx_events_date 
  ON traffic_events(event_date);

-- 索引：用于按路径和日期分析
CREATE INDEX IF NOT EXISTS idx_events_path_date 
  ON traffic_events(path, event_date);

-- 索引：用于按时间戳排序
CREATE INDEX IF NOT EXISTS idx_events_timestamp 
  ON traffic_events(timestamp);

-- 索引：用于快速查找幂等 ID（去重）
CREATE INDEX IF NOT EXISTS idx_events_id 
  ON traffic_events(id);

-- ============================================
-- 2. 小时聚合表（简化统计方案）
-- ============================================

CREATE TABLE IF NOT EXISTS path_stats_hourly (
  -- 联合主键
  path TEXT NOT NULL,
  hour_bucket TEXT NOT NULL,  -- 格式：'2025-10-15T14'
  
  -- 基础计数
  requests INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  
  -- 响应时间统计
  sum_response_time REAL NOT NULL DEFAULT 0,
  count_response_time INTEGER NOT NULL DEFAULT 0,
  
  -- 简化统计字段（JSON 格式）
  response_samples TEXT,  -- JSON 数组，最多 1000 个（水库采样）
  ip_hashes TEXT,         -- JSON 数组，最多 1000 个（水库采样，唯一）
  unique_ips_seen INTEGER NOT NULL DEFAULT 0,  -- 水库中的唯一 IP 数（下界估计）
  
  -- 元数据
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  PRIMARY KEY (path, hour_bucket)
);

-- 索引：用于按时间桶查询
CREATE INDEX IF NOT EXISTS idx_stats_hour 
  ON path_stats_hourly(hour_bucket);

-- 索引：用于查找最近更新的记录
CREATE INDEX IF NOT EXISTS idx_stats_updated 
  ON path_stats_hourly(updated_at);

-- 索引：用于按请求数排序（Top N 查询）
CREATE INDEX IF NOT EXISTS idx_stats_requests 
  ON path_stats_hourly(requests DESC);

-- ============================================
-- 3. 归档元数据表
-- ============================================

CREATE TABLE IF NOT EXISTS archive_metadata (
  -- 归档日期（主键）
  date TEXT PRIMARY KEY,  -- YYYY-MM-DD
  
  -- R2 存储信息
  r2_path TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  file_size_bytes INTEGER,
  
  -- 状态信息
  status TEXT NOT NULL DEFAULT 'pending',  -- pending/completed/failed
  error_message TEXT,
  
  -- 时间戳
  archived_at INTEGER NOT NULL,
  completed_at INTEGER,
  
  -- 清理状态
  d1_cleaned INTEGER NOT NULL DEFAULT 0  -- 0 = 未清理，1 = 已清理
);

-- 索引：用于查询归档状态
CREATE INDEX IF NOT EXISTS idx_archive_status 
  ON archive_metadata(status);

-- 索引：用于查询归档时间
CREATE INDEX IF NOT EXISTS idx_archive_date 
  ON archive_metadata(archived_at);

-- ============================================
-- 4. 消费者心跳记录表（可选，Phase 2.5）
-- ============================================

CREATE TABLE IF NOT EXISTS consumer_heartbeat (
  consumer_id TEXT PRIMARY KEY,  -- 消费者标识
  last_heartbeat INTEGER NOT NULL,
  last_batch_size INTEGER,
  last_batch_duration_ms INTEGER,
  total_processed INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',  -- active/inactive/error
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- ============================================
-- 5. 初始化数据验证
-- ============================================

-- 插入一条测试记录，验证表结构
INSERT OR IGNORE INTO archive_metadata (date, r2_path, record_count, status, archived_at)
VALUES ('1970-01-01', 'test/init.jsonl.gz', 0, 'completed', strftime('%s', 'now'));

-- 清理测试记录
DELETE FROM archive_metadata WHERE date = '1970-01-01';

-- ============================================
-- 创建完成提示
-- ============================================

-- 查询所有表
SELECT 
  'Tables created:' as message,
  COUNT(*) as table_count
FROM sqlite_master 
WHERE type = 'table' 
  AND name IN ('traffic_events', 'path_stats_hourly', 'archive_metadata', 'consumer_heartbeat');

-- 查询所有索引
SELECT 
  'Indexes created:' as message,
  COUNT(*) as index_count
FROM sqlite_master 
WHERE type = 'index' 
  AND name LIKE 'idx_%';

