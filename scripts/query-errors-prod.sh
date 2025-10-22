#!/usr/bin/env bash

# ============================================
# 生产环境错误查询脚本
# ============================================
# 自动检查账号并提示切换

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 生产环境账号 ID
PROD_ACCOUNT_ID="80e68ad465093681d7d893b6c122f9b8"
PROD_ACCOUNT_NAME="Port-wind Limited"

echo -e "${BLUE}🔍 检查 Cloudflare 账号...${NC}"
echo ""

# 获取当前登录的账号
cd apps/api
CURRENT_ACCOUNT=$(wrangler whoami 2>&1 | grep -oE '[a-f0-9]{32}' | head -1 || echo "")

if [ -z "$CURRENT_ACCOUNT" ]; then
    echo -e "${RED}❌ 未登录 Cloudflare 账号${NC}"
    echo ""
    echo -e "${YELLOW}请先登录：${NC}"
    echo "  wrangler login"
    exit 1
fi

# 检查是否是生产环境账号
if [ "$CURRENT_ACCOUNT" != "$PROD_ACCOUNT_ID" ]; then
    echo -e "${YELLOW}⚠️  当前账号不是生产环境账号${NC}"
    echo ""
    echo -e "当前账号: ${RED}$CURRENT_ACCOUNT${NC}"
    echo -e "需要账号: ${GREEN}$PROD_ACCOUNT_ID${NC} ($PROD_ACCOUNT_NAME)"
    echo ""
    echo -e "${YELLOW}请切换到生产环境账号：${NC}"
    echo "  1. wrangler logout"
    echo "  2. wrangler login"
    echo "  3. 选择 $PROD_ACCOUNT_NAME 账号"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ 已登录生产环境账号${NC}"
echo -e "  账号ID: $CURRENT_ACCOUNT"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 执行查询
QUERY_TYPE="${1:-list}"
LIMIT="${2:-10}"

case "$QUERY_TYPE" in
    "list")
        echo -e "${BLUE}📋 查询最新 $LIMIT 个错误...${NC}"
        echo ""
        wrangler d1 execute path-stats-db --remote --env production --command="
SELECT
  datetime(timestamp/1000, 'unixepoch', 'localtime') AS time,
  path,
  method,
  status,
  response_time,
  country
FROM traffic_events
WHERE event_date = date('now')
  AND status >= 400
ORDER BY timestamp DESC
LIMIT $LIMIT;
"
        ;;
    "stats")
        echo -e "${BLUE}📊 查询错误统计...${NC}"
        echo ""
        wrangler d1 execute path-stats-db --remote --env production --command="
SELECT
  CASE
    WHEN status BETWEEN 400 AND 499 THEN '4xx-客户端错误'
    WHEN status >= 500 THEN '5xx-服务器错误'
  END AS type,
  status,
  COUNT(*) AS count,
  ROUND(AVG(response_time), 2) AS avg_rt
FROM traffic_events
WHERE event_date = date('now')
  AND status >= 400
GROUP BY type, status
ORDER BY count DESC;
"
        ;;
    "hourly")
        echo -e "${BLUE}⏰ 查询按小时分布...${NC}"
        echo ""
        wrangler d1 execute path-stats-db --remote --env production --command="
SELECT
  strftime('%H:00', datetime(timestamp/1000, 'unixepoch')) AS hour,
  COUNT(*) AS total,
  SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS errors,
  ROUND(100.0 * SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) / COUNT(*), 2) AS error_rate
FROM traffic_events
WHERE event_date = date('now')
GROUP BY hour
ORDER BY hour DESC
LIMIT 24;
"
        ;;
    *)
        echo -e "${RED}❌ 未知的查询类型: $QUERY_TYPE${NC}"
        echo ""
        echo "用法: pnpm query-errors:prod [类型] [限制]"
        echo ""
        echo "类型:"
        echo "  list    - 查询错误列表（默认）"
        echo "  stats   - 查询错误统计"
        echo "  hourly  - 查询按小时分布"
        echo ""
        echo "示例:"
        echo "  pnpm query-errors:prod"
        echo "  pnpm query-errors:prod list 20"
        echo "  pnpm query-errors:prod stats"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}✓ 查询完成${NC}"

