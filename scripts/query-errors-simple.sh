#!/usr/bin/env bash

# ============================================
# 简化版错误日志查询脚本
# ============================================
# 必须在 apps/api 目录中运行
# 使用方法: cd apps/api && ../../scripts/query-errors-simple.sh

set -e

# 参数
DATE="${1:-$(date +%Y-%m-%d)}"
LIMIT="${2:-10}"

echo "======================================="
echo "  错误日志查询（简化版）"
echo "======================================="
echo "日期: $DATE"
echo "限制: $LIMIT 条"
echo ""

# 检查是否在正确的目录
if [ ! -f "wrangler.toml" ]; then
    echo "错误: 请在 apps/api 目录中运行此脚本"
    echo "用法: cd apps/api && ../../scripts/query-errors-simple.sh [日期] [限制]"
    exit 1
fi

echo "1. 查询所有错误请求..."
echo "-----------------------------------"
wrangler d1 execute path-stats-db --remote --command="
SELECT
  datetime(timestamp/1000, 'unixepoch', 'localtime') AS local_time,
  path,
  method,
  status,
  response_time,
  country,
  SUBSTR(client_ip_hash, 1, 12) AS ip_short
FROM traffic_events
WHERE event_date = '$DATE'
  AND status >= 400
ORDER BY timestamp DESC
LIMIT $LIMIT;
"

echo ""
echo "2. 按状态码统计..."
echo "-----------------------------------"
wrangler d1 execute path-stats-db --remote --command="
SELECT
  CASE
    WHEN status BETWEEN 400 AND 499 THEN '4xx'
    WHEN status >= 500 THEN '5xx'
  END AS error_type,
  status,
  COUNT(*) AS count,
  ROUND(AVG(response_time), 2) AS avg_rt
FROM traffic_events
WHERE event_date = '$DATE'
  AND status >= 400
GROUP BY error_type, status
ORDER BY count DESC;
"

echo ""
echo "3. 按小时分布..."
echo "-----------------------------------"
wrangler d1 execute path-stats-db --remote --command="
SELECT
  strftime('%H:00', datetime(timestamp/1000, 'unixepoch')) AS hour,
  COUNT(*) AS requests,
  SUM(CASE WHEN status BETWEEN 400 AND 499 THEN 1 ELSE 0 END) AS total_4xx,
  SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) AS total_5xx,
  ROUND(AVG(response_time), 2) AS avg_rt
FROM traffic_events
WHERE event_date = '$DATE'
GROUP BY hour
HAVING total_4xx > 0 OR total_5xx > 0
ORDER BY hour;
"

echo ""
echo "✓ 查询完成！"
echo ""
echo "使用方法:"
echo "  cd apps/api"
echo "  ../../scripts/query-errors-simple.sh [日期] [限制]"
echo ""
echo "示例:"
echo "  ../../scripts/query-errors-simple.sh 2025-10-20 5"

