-- ============================================
-- IP 监控与全局限流系统 - 数据库表结构
-- ============================================
-- 
-- 创建日期: 2025-10-17
-- 数据库: path-stats-db (D1)
-- 
-- 设计要点：
-- 1. ip_traffic_daily 主键为 (date, ip_hash)，按日期分区优化查询
-- 2. 移除 ip_path_details 表，防止 IP×路径×日期组合导致数据爆炸
-- 3. 路径明细从 traffic_events 表实时查询（保留 3 天）
-- 4. ip_access_rules 支持 IP 和 CIDR，通过 KV 缓存优化性能
-- ============================================

-- ============================================
-- 1. IP 每日聚合统计表
-- ============================================

CREATE TABLE IF NOT EXISTS ip_traffic_daily (
  -- 主键：日期 + IP 哈希
  -- ⚠️ 日期放在第一位，便于按日期查询、清理和分区
  date TEXT NOT NULL,              -- YYYY-MM-DD
  ip_hash TEXT NOT NULL,           -- IP SHA-256 哈希值（前 16 位）
  
  -- 聚合统计
  total_requests INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0,
  unique_paths INTEGER NOT NULL DEFAULT 0,
  
  -- Top N 数据（JSON 格式）
  top_paths TEXT,                  -- JSON: [{path: string, count: number}]，最多 20 条
  countries TEXT,                  -- JSON: [string]，Top 5 国家代码
  user_agents TEXT,                -- JSON: [string]，Top 5 User-Agent（截断）
  
  -- 时间戳
  first_seen INTEGER NOT NULL,     -- 当天首次访问时间（Unix timestamp, ms）
  last_seen INTEGER NOT NULL,      -- 当天最后访问时间（Unix timestamp, ms）
  
  -- 元数据
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  PRIMARY KEY (date, ip_hash)
);

-- 索引：按日期 + 请求量降序（用于"今日 Top IP"查询）
-- ⚠️ 关键索引：查询"今日访问量最高的 100 个 IP"
CREATE INDEX IF NOT EXISTS idx_ip_daily_requests 
  ON ip_traffic_daily(date, total_requests DESC);

-- 索引：按 ip_hash + 日期降序（用于单 IP 历史查询）
-- ⚠️ 用于查询某个 IP 最近 7 天的访问趋势
CREATE INDEX IF NOT EXISTS idx_ip_hash_lookup 
  ON ip_traffic_daily(ip_hash, date DESC);

-- 索引：按日期 + 错误数降序（用于查询"高错误率 IP"）
CREATE INDEX IF NOT EXISTS idx_ip_daily_errors 
  ON ip_traffic_daily(date, total_errors DESC);

-- ============================================
-- 2. IP 访问控制规则表
-- ============================================

CREATE TABLE IF NOT EXISTS ip_access_rules (
  -- 主键
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- IP 或 CIDR 模式
  ip_pattern TEXT NOT NULL UNIQUE, -- 原始 IP（如 "1.2.3.4"）或 CIDR（如 "10.0.0.0/16"）
  ip_hash TEXT,                    -- 精确 IP 的哈希值（CIDR 时为 NULL）
  
  -- 限流模式
  mode TEXT NOT NULL,              -- 'block' = 封禁，'throttle' = 限流
  
  -- 限流参数（仅 throttle 模式）
  "limit" INTEGER,                 -- 每个时间窗口的请求限制
  "window" INTEGER,                -- 时间窗口（秒）
  
  -- 元数据
  reason TEXT,                     -- 封禁/限流原因
  created_by TEXT,                 -- 创建人（管理员账号）
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  expires_at INTEGER,              -- 可选的过期时间（Unix timestamp, s）
  is_active INTEGER NOT NULL DEFAULT 1,  -- 是否生效（0=禁用，1=启用）
  
  -- 约束检查
  CHECK (mode IN ('block', 'throttle')),
  CHECK (is_active IN (0, 1)),
  CHECK (
    -- throttle 模式必须提供 limit 和 window
    (mode = 'block') OR 
    (mode = 'throttle' AND "limit" > 0 AND "window" > 0)
  )
);

-- 索引：按 ip_hash 快速查找精确匹配（用于中间件实时查询）
-- ⚠️ 过滤条件：仅对非 CIDR 规则（ip_hash IS NOT NULL）建立索引
CREATE INDEX IF NOT EXISTS idx_rules_ip_hash 
  ON ip_access_rules(ip_hash) 
  WHERE ip_hash IS NOT NULL;

-- 索引：按活跃状态和创建时间（用于管理界面列表查询）
CREATE INDEX IF NOT EXISTS idx_rules_active 
  ON ip_access_rules(is_active, created_at DESC);

-- 索引：按过期时间（用于定时清理过期规则）
CREATE INDEX IF NOT EXISTS idx_rules_expires 
  ON ip_access_rules(expires_at) 
  WHERE expires_at IS NOT NULL;

-- ============================================
-- 3. 数据字典说明
-- ============================================

-- ip_traffic_daily 字段说明：
-- - date: 日期字符串（YYYY-MM-DD），用于分区和清理
-- - ip_hash: IP 哈希值，SHA-256(IP) 的前 16 位，保护隐私
-- - total_requests: 当天该 IP 的总请求数
-- - total_errors: 当天该 IP 的错误请求数（status >= 400）
-- - unique_paths: 当天该 IP 访问的唯一路径数量
-- - top_paths: JSON 数组，格式：[{path: "/api/foo", count: 123}, ...]
-- - countries: JSON 数组，格式：["CN", "US", "JP"]
-- - user_agents: JSON 数组，格式：["Mozilla/5.0...", "curl/7.68.0", ...]
-- - first_seen: 当天首次访问的时间戳（毫秒）
-- - last_seen: 当天最后访问的时间戳（毫秒）

-- ip_access_rules 字段说明：
-- - ip_pattern: 原始 IP 或 CIDR，例如 "192.168.1.100" 或 "10.0.0.0/24"
-- - ip_hash: 精确 IP 时为哈希值，CIDR 时为 NULL
-- - mode: 'block' 完全封禁（返回 403），'throttle' 限流（返回 429）
-- - limit: throttle 模式的限流值（例如 10）
-- - window: throttle 模式的时间窗口（例如 60 秒）
-- - reason: 人工填写的原因，便于审计
-- - expires_at: 可选，规则自动过期时间（秒级时间戳）
-- - is_active: 软删除标记，0=禁用（保留历史），1=启用

-- ============================================
-- 4. 容量估算（7 天保留期）
-- ============================================

-- ip_traffic_daily:
--   假设 10 万独立 IP/天
--   每条记录 ~500 字节（含 JSON）
--   7 天: 100K × 500B × 7 ≈ 350 MB

-- ip_access_rules:
--   最多 1000 条规则
--   每条 ~200 字节
--   总计: 200 KB

-- 总容量: ~350 MB（可控）

-- ============================================
-- 5. 查询性能预估（待压测验证）
-- ============================================

-- 今日 Top 100 IP（使用 idx_ip_daily_requests）: < 50ms
-- 单 IP 历史查询 7 天（使用 idx_ip_hash_lookup）: < 30ms
-- 精确 IP 规则匹配（使用 idx_rules_ip_hash）: < 10ms

