#!/usr/bin/env bash

# ============================================
# 错误日志查询脚本
# ============================================
# 用于快速查询和定位 API 错误原因
# 使用方法: ./scripts/query-error-logs.sh [选项]

set -e

# 确保 wrangler 可用
if [ -f "$HOME/.volta/bin/wrangler" ]; then
    WRANGLER_CMD="$HOME/.volta/bin/wrangler"
elif command -v wrangler &> /dev/null; then
    WRANGLER_CMD="wrangler"
elif command -v npx &> /dev/null; then
    WRANGLER_CMD="npx wrangler"
else
    echo "错误: 找不到 wrangler 命令"
    echo "请安装 wrangler: npm install -g wrangler"
    exit 1
fi

echo "使用 wrangler: $WRANGLER_CMD" >&2

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 默认参数
DB_NAME="path-stats-db"
DATE=$(date +%Y-%m-%d)
COUNTRY=""
PATH=""
STATUS_MIN=400
LIMIT=50

# 帮助信息
show_help() {
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -d, --date DATE        日期 (默认: 今天，格式: YYYY-MM-DD)"
    echo "  -c, --country COUNTRY  国家代码 (如: HK, US, CN)"
    echo "  -p, --path PATH        API 路径 (如: /api/test)"
    echo "  -s, --status STATUS    最小状态码 (默认: 400)"
    echo "  -l, --limit LIMIT      返回条数 (默认: 50)"
    echo "  -h, --help             显示帮助信息"
    echo ""
    echo "示例:"
    echo "  # 查询今天所有 4xx/5xx 错误"
    echo "  $0"
    echo ""
    echo "  # 查询香港地区的错误"
    echo "  $0 -c HK"
    echo ""
    echo "  # 查询特定路径的错误"
    echo "  $0 -p /biz-client/biz/gameTypeNewspaperIssue/getDetailById -c HK"
    echo ""
    echo "  # 只查询 5xx 错误"
    echo "  $0 -s 500"
}

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--date)
            DATE="$2"
            shift 2
            ;;
        -c|--country)
            COUNTRY="$2"
            shift 2
            ;;
        -p|--path)
            PATH="$2"
            shift 2
            ;;
        -s|--status)
            STATUS_MIN="$2"
            shift 2
            ;;
        -l|--limit)
            LIMIT="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
done

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  错误日志查询${NC}"
echo -e "${BLUE}======================================${NC}"
echo -e "日期: ${GREEN}$DATE${NC}"
[ -n "$COUNTRY" ] && echo -e "国家: ${GREEN}$COUNTRY${NC}"
[ -n "$PATH" ] && echo -e "路径: ${GREEN}$PATH${NC}"
echo -e "状态码: ${YELLOW}>= $STATUS_MIN${NC}"
echo -e "限制: ${LIMIT} 条"
echo ""

# 构建 SQL 查询
SQL="SELECT
  datetime(timestamp/1000, 'unixepoch', 'localtime') AS local_time,
  path,
  method,
  status,
  response_time,
  country,
  client_ip_hash,
  user_agent
FROM traffic_events
WHERE event_date = '$DATE'
  AND status >= $STATUS_MIN"

# 添加可选条件
[ -n "$COUNTRY" ] && SQL="$SQL AND country = '$COUNTRY'"
[ -n "$PATH" ] && SQL="$SQL AND path = '$PATH'"

SQL="$SQL
ORDER BY timestamp DESC
LIMIT $LIMIT;"

echo -e "${BLUE}执行查询...${NC}"
echo ""

# 执行查询
cd apps/api
$WRANGLER_CMD d1 execute "$DB_NAME" --remote --command="$SQL"
cd ../..

# 统计汇总
echo ""
echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  错误统计${NC}"
echo -e "${BLUE}======================================${NC}"

# 按状态码统计
STATS_SQL="SELECT
  CASE
    WHEN status BETWEEN 400 AND 499 THEN '4xx'
    WHEN status >= 500 THEN '5xx'
  END AS error_type,
  status,
  COUNT(*) AS count
FROM traffic_events
WHERE event_date = '$DATE'
  AND status >= $STATUS_MIN"

[ -n "$COUNTRY" ] && STATS_SQL="$STATS_SQL AND country = '$COUNTRY'"
[ -n "$PATH" ] && STATS_SQL="$STATS_SQL AND path = '$PATH'"

STATS_SQL="$STATS_SQL
GROUP BY error_type, status
ORDER BY error_type, count DESC;"

cd apps/api
$WRANGLER_CMD d1 execute "$DB_NAME" --remote --command="$STATS_SQL"
cd ../..

# 按小时统计
echo ""
echo -e "${BLUE}按小时分布:${NC}"
HOURLY_SQL="SELECT
  strftime('%H:00', datetime(timestamp/1000, 'unixepoch')) AS hour,
  COUNT(*) AS requests,
  SUM(CASE WHEN status BETWEEN 400 AND 499 THEN 1 ELSE 0 END) AS total_4xx,
  SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) AS total_5xx,
  ROUND(AVG(response_time), 2) AS avg_rt
FROM traffic_events
WHERE event_date = '$DATE'"

[ -n "$COUNTRY" ] && HOURLY_SQL="$HOURLY_SQL AND country = '$COUNTRY'"
[ -n "$PATH" ] && HOURLY_SQL="$HOURLY_SQL AND path = '$PATH'"

HOURLY_SQL="$HOURLY_SQL
GROUP BY hour
HAVING total_4xx > 0 OR total_5xx > 0
ORDER BY hour;"

cd apps/api
$WRANGLER_CMD d1 execute "$DB_NAME" --remote --command="$HOURLY_SQL"
cd ../..

echo ""
echo -e "${GREEN}✓ 查询完成！${NC}"

