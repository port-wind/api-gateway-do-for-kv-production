-- 生成测试流量数据（用于本地压测）
-- 
-- 用法：
--   wrangler d1 execute <DATABASE_NAME> --local --file=scripts/generate-test-traffic.sql
-- 
-- 注意：此脚本会生成 10,000 条测试记录（可调整）

-- 1. 清理旧测试数据（可选）
-- DELETE FROM traffic_events WHERE path LIKE '/test/%';

-- 2. 生成测试数据
-- 使用 SQLite 的递归 CTE 生成批量数据

WITH RECURSIVE
  -- 生成 10,000 条记录的序列
  cnt(x) AS (
    SELECT 1
    UNION ALL
    SELECT x+1 FROM cnt
    WHERE x < 10000
  ),
  -- 模拟路径列表
  paths AS (
    SELECT '/api/users' as path UNION ALL
    SELECT '/api/products' UNION ALL
    SELECT '/api/orders' UNION ALL
    SELECT '/api/search' UNION ALL
    SELECT '/api/auth/login' UNION ALL
    SELECT '/api/auth/logout' UNION ALL
    SELECT '/api/payments' UNION ALL
    SELECT '/api/analytics' UNION ALL
    SELECT '/api/health' UNION ALL
    SELECT '/api/metrics'
  ),
  -- 模拟国家列表
  countries AS (
    SELECT 'US' as code UNION ALL
    SELECT 'CN' UNION ALL
    SELECT 'JP' UNION ALL
    SELECT 'GB' UNION ALL
    SELECT 'DE' UNION ALL
    SELECT 'FR' UNION ALL
    SELECT 'KR' UNION ALL
    SELECT 'CA' UNION ALL
    SELECT 'AU' UNION ALL
    SELECT 'SG'
  )
-- 插入测试数据
INSERT INTO traffic_events (
  path,
  method,
  status,
  response_time,
  timestamp,
  event_date,
  client_ip_hash,
  country,
  edge_colo,
  is_error,
  cache_hit,
  idempotent_id,
  ip_address
)
SELECT
  -- 路径：循环使用 10 个路径
  (SELECT path FROM paths LIMIT 1 OFFSET (cnt.x % 10)),
  -- 方法：80% GET, 15% POST, 5% PUT
  CASE 
    WHEN (cnt.x % 20) < 16 THEN 'GET'
    WHEN (cnt.x % 20) < 19 THEN 'POST'
    ELSE 'PUT'
  END,
  -- 状态码：90% 200, 5% 404, 3% 500, 2% 429
  CASE 
    WHEN (cnt.x % 100) < 90 THEN 200
    WHEN (cnt.x % 100) < 95 THEN 404
    WHEN (cnt.x % 100) < 98 THEN 500
    ELSE 429
  END,
  -- 响应时间：50-500ms 正态分布
  50 + (cnt.x % 450),
  -- 时间戳：最近 24-48 小时随机分布
  (unixepoch('now') * 1000) - (cnt.x * 10000) % (48 * 3600 * 1000),
  -- 日期：今天或昨天
  CASE 
    WHEN (cnt.x % 2) = 0 THEN date('now')
    ELSE date('now', '-1 day')
  END,
  -- IP Hash：模拟 100 个不同 IP
  'ip_hash_' || printf('%04d', (cnt.x % 100)),
  -- 国家：循环使用 10 个国家
  (SELECT code FROM countries LIMIT 1 OFFSET (cnt.x % 10)),
  -- 边缘节点：模拟 5 个 Colo
  CASE (cnt.x % 5)
    WHEN 0 THEN 'SJC'
    WHEN 1 THEN 'LAX'
    WHEN 2 THEN 'ORD'
    WHEN 3 THEN 'IAD'
    ELSE 'EWR'
  END,
  -- 错误标记：10% 错误
  CASE WHEN (cnt.x % 10) = 0 THEN 1 ELSE 0 END,
  -- 缓存命中：60% 命中
  CASE WHEN (cnt.x % 5) < 3 THEN 1 ELSE 0 END,
  -- 幂等 ID
  'test_' || printf('%010d', cnt.x),
  -- IP 地址（可选）
  printf('192.168.%d.%d', (cnt.x / 256) % 256, cnt.x % 256)
FROM cnt;

-- 3. 验证插入结果
SELECT 
  '测试数据统计' as summary,
  COUNT(*) as total_records,
  COUNT(DISTINCT path) as unique_paths,
  COUNT(DISTINCT country) as unique_countries,
  COUNT(DISTINCT client_ip_hash) as unique_ips,
  MIN(timestamp) as earliest_timestamp,
  MAX(timestamp) as latest_timestamp,
  MIN(event_date) as earliest_date,
  MAX(event_date) as latest_date
FROM traffic_events
WHERE idempotent_id LIKE 'test_%';

-- 4. 按日期统计
SELECT 
  event_date,
  COUNT(*) as requests,
  SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END) as errors,
  COUNT(DISTINCT path) as unique_paths,
  COUNT(DISTINCT client_ip_hash) as unique_ips
FROM traffic_events
WHERE idempotent_id LIKE 'test_%'
GROUP BY event_date
ORDER BY event_date DESC;

-- 5. 热门路径 Top 10
SELECT 
  path,
  COUNT(*) as requests,
  SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END) as errors,
  ROUND(AVG(response_time), 2) as avg_response_time
FROM traffic_events
WHERE idempotent_id LIKE 'test_%'
GROUP BY path
ORDER BY requests DESC
LIMIT 10;

