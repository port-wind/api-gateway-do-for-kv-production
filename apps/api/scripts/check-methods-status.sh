#!/bin/bash

# ====================================
# Method 字段状态检查脚本（只读）
# ====================================
# 
# 功能：检查当前环境的 method 字段状态
# 不执行任何修改操作
# 
# 使用：./check-methods-status.sh [环境]
# 环境选项：test/dev/prod
# ====================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 获取环境参数
ENV=${1:-test}

# 验证环境
case "$ENV" in
  test)
    URL="https://api-proxy.pwtk.cc"
    echo -e "${GREEN}📍 环境：测试环境${NC}"
    ;;
  dev)
    URL="https://api-gateway-do-for-kv-dev.andy-zhan.workers.dev"
    echo -e "${YELLOW}📍 环境：开发环境${NC}"
    ;;
  prod)
    URL="https://api-proxy.bugacard.com"
    echo -e "${RED}📍 环境：生产环境${NC}"
    ;;
  *)
    echo -e "${RED}❌ 无效的环境: $ENV${NC}"
    echo "使用方法: $0 [test|dev|prod]"
    exit 1
    ;;
esac

echo ""
echo "======================================"
echo "🔍 Method 字段状态检查（只读）"
echo "======================================"
echo "环境: $ENV"
echo "URL: $URL"
echo ""
echo "⚠️  本脚本只读取数据，不会执行任何修改"
echo "======================================"

# 获取管理员 Token
echo ""
echo "请输入管理员账号信息："
read -p "用户名 [admin]: " USERNAME
USERNAME=${USERNAME:-admin}
read -sp "密码: " PASSWORD
echo ""

# 登录获取 Token
echo ""
echo "🔐 正在登录..."
LOGIN_RESPONSE=$(curl -s -X POST "$URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")

ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ACCESS_TOKEN" ]; then
  echo -e "${RED}❌ 登录失败${NC}"
  echo "$LOGIN_RESPONSE" | jq '.' 2>/dev/null || echo "$LOGIN_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ 登录成功${NC}"
echo ""

# ====================================
# 开始检查
# ====================================

echo "======================================"
echo "📊 数据分析"
echo "======================================"
echo ""

# 1. 获取路径总数
echo "1️⃣  查询路径总数..."
FIRST_PAGE=$(curl -s "$URL/api/admin/paths?page=1&limit=1" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

TOTAL_PATHS=$(echo "$FIRST_PAGE" | jq -r '.pagination.total // 0')
echo -e "   ${BLUE}总路径数: $TOTAL_PATHS${NC}"
echo ""

# 2. 采样分析（前 200 个路径）
echo "2️⃣  采样分析（前 200 个路径）..."
SAMPLE_DATA=$(curl -s "$URL/api/admin/paths?page=1&limit=200" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

# 统计 method 分布
echo ""
echo "   Method 分布："
echo "$SAMPLE_DATA" | jq -r '.data[].method // "null"' | sort | uniq -c | sort -rn | while read count method; do
  if [ "$method" = "GET" ]; then
    echo -e "     ${YELLOW}$count x $method${NC}"
  elif [ "$method" = "null" ]; then
    echo -e "     ${RED}$count x (未设置)${NC}"
  else
    echo -e "     ${GREEN}$count x $method${NC}"
  fi
done

# 3. 统计问题路径
echo ""
echo "3️⃣  问题诊断..."

GET_COUNT=$(echo "$SAMPLE_DATA" | jq -r '.data[].method' | grep -c "^GET$" || true)
NULL_COUNT=$(echo "$SAMPLE_DATA" | jq -r '.data[].method // "null"' | grep -c "^null$" || true)
TOTAL_SAMPLE=$(echo "$SAMPLE_DATA" | jq '.data | length')
OTHER_COUNT=$((TOTAL_SAMPLE - GET_COUNT - NULL_COUNT))

GET_PERCENT=$((GET_COUNT * 100 / TOTAL_SAMPLE))
NULL_PERCENT=$((NULL_COUNT * 100 / TOTAL_SAMPLE))
OTHER_PERCENT=$((OTHER_COUNT * 100 / TOTAL_SAMPLE))

echo ""
echo "   采样统计（前 200 个）："
echo "   - GET:      $GET_COUNT ($GET_PERCENT%)"
echo "   - 其他方法:  $OTHER_COUNT ($OTHER_PERCENT%)"
echo "   - 未设置:    $NULL_COUNT ($NULL_PERCENT%)"
echo ""

# 4. 判断是否需要修复
echo "======================================"
echo "🎯 修复建议"
echo "======================================"
echo ""

NEEDS_FIX=0

if [ $GET_PERCENT -gt 80 ]; then
  echo -e "${RED}⚠️  警告：GET 占比过高 ($GET_PERCENT%)${NC}"
  echo "   可能的问题："
  echo "   - 大量路径的 method 被错误设置为 GET"
  echo "   - 建议执行修复"
  echo ""
  NEEDS_FIX=1
fi

if [ $NULL_PERCENT -gt 10 ]; then
  echo -e "${YELLOW}⚠️  注意：有 $NULL_PERCENT% 的路径未设置 method${NC}"
  echo "   - 这些路径可能是新路径"
  echo "   - 或者没有真实流量数据"
  echo ""
  NEEDS_FIX=1
fi

if [ $OTHER_PERCENT -gt 30 ]; then
  echo -e "${GREEN}✅ 良好：有 $OTHER_PERCENT% 的路径使用了非 GET 方法${NC}"
  echo "   - Method 分布较为合理"
  echo ""
fi

# 5. 显示具体示例
echo "======================================"
echo "📋 路径示例（前 10 个）"
echo "======================================"
echo ""

echo "$SAMPLE_DATA" | jq -r '.data[0:10] | .[] | "\(.path) → \(.method // "(未设置)") [\(.requestCount // 0) 请求]"' | nl

echo ""

# 6. 最终建议
echo "======================================"
echo "💡 执行建议"
echo "======================================"
echo ""

if [ $NEEDS_FIX -eq 1 ]; then
  echo -e "${YELLOW}建议执行修复：${NC}"
  echo ""
  echo "  cd apps/api"
  echo "  ./scripts/fix-methods-bug.sh $ENV"
  echo ""
  echo "修复操作会："
  echo "  1. 从 traffic_events 查询真实使用的 method"
  echo "  2. 更新 unified-paths:list（只更新 undefined 和 GET）"
  echo "  3. 刷新 KV 快照"
  echo ""
else
  echo -e "${GREEN}✅ 当前状态良好，暂不需要修复${NC}"
  echo ""
  echo "如果仍想执行修复（幂等操作，不会破坏现有正确数据）："
  echo ""
  echo "  cd apps/api"
  echo "  ./scripts/fix-methods-bug.sh $ENV"
  echo ""
fi

# 7. 风险提示
if [ "$ENV" = "prod" ]; then
  echo ""
  echo -e "${RED}⚠️  生产环境提示：${NC}"
  echo "  - 建议先在测试环境验证"
  echo "  - 修复操作是幂等的，不会破坏正确数据"
  echo "  - 只更新 undefined 和 GET 的路径"
  echo "  - 支持任意规模（自动分块查询）"
  echo ""
fi

echo "======================================"
echo -e "${GREEN}✅ 检查完成！${NC}"
echo "======================================"

