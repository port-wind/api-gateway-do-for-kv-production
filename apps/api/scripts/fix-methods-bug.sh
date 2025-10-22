#!/bin/bash

# ====================================
# 一键修复 Method 字段 Bug
# ====================================
# 
# 功能：
# 1. 批量修复 unified-paths:list 中的错误 method
# 2. 刷新 KV 快照，应用新的 method 逻辑
# 
# 使用：./fix-methods-bug.sh [环境]
# 
# 环境选项：
#   test  - 测试环境（默认）
#   dev   - 开发环境  
#   prod  - 生产环境
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
    echo -e "${RED}⚠️  环境：生产环境（请谨慎操作）${NC}"
    read -p "确认要在生产环境执行？(yes/no): " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
      echo "已取消"
      exit 0
    fi
    ;;
  *)
    echo -e "${RED}❌ 无效的环境: $ENV${NC}"
    echo "使用方法: $0 [test|dev|prod]"
    exit 1
    ;;
esac

echo ""
echo "======================================"
echo "🔧 Method 字段 Bug 一键修复"
echo "======================================"
echo "环境: $ENV"
echo "URL: $URL"
echo ""
echo "修复内容："
echo "  1. 批量修复 unified-paths:list 中的错误 method"
echo "  2. 刷新 KV 快照，应用新的 method 查询逻辑"
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

# ====================================
# 步骤 1: 批量修复 unified-paths:list
# ====================================
echo ""
echo "======================================"
echo "📝 步骤 1/2: 批量修复持久化配置"
echo "======================================"
echo ""
echo "🔍 正在扫描并修复 unified-paths:list 中的 method..."

BACKFILL_RESPONSE=$(curl -s -X POST "$URL/api/admin/paths/backfill-methods" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

echo "$BACKFILL_RESPONSE" | jq '.' 2>/dev/null || echo "$BACKFILL_RESPONSE"

# 检查是否成功
if echo "$BACKFILL_RESPONSE" | grep -q '"success":true'; then
  UPDATED_COUNT=$(echo "$BACKFILL_RESPONSE" | jq -r '.data.updatedPaths // 0')
  echo ""
  echo -e "${GREEN}✅ 步骤 1 完成：修复了 $UPDATED_COUNT 个路径的 method${NC}"
else
  echo ""
  echo -e "${RED}❌ 步骤 1 失败${NC}"
  exit 1
fi

# ====================================
# 步骤 2: 刷新 KV 快照
# ====================================
echo ""
echo "======================================"
echo "📸 步骤 2/2: 刷新 KV 快照"
echo "======================================"
echo ""
echo "🔄 正在刷新快照（应用新的 method 查询逻辑）..."

REFRESH_RESPONSE=$(curl -s -X POST "$URL/api/admin/paths/snapshot/refresh" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

echo "$REFRESH_RESPONSE" | jq '.' 2>/dev/null || echo "$REFRESH_RESPONSE"

# 检查是否成功
if echo "$REFRESH_RESPONSE" | grep -q '"success":true'; then
  VERSION=$(echo "$REFRESH_RESPONSE" | jq -r '.data.version // "unknown"')
  COUNT=$(echo "$REFRESH_RESPONSE" | jq -r '.data.count // 0')
  echo ""
  echo -e "${GREEN}✅ 步骤 2 完成：快照版本 $VERSION，包含 $COUNT 个路径${NC}"
else
  echo ""
  echo -e "${RED}❌ 步骤 2 失败${NC}"
  exit 1
fi

# ====================================
# 完成
# ====================================
echo ""
echo "======================================"
echo -e "${GREEN}✅ 修复完成！${NC}"
echo "======================================"
echo ""
echo "修复摘要："
echo "  • 修复了 $UPDATED_COUNT 个路径的 method 字段"
echo "  • 快照版本: $VERSION"
echo "  • 快照路径数: $COUNT"
echo ""
echo "建议操作："
echo "  1. 验证路径列表 API，确认 method 正确显示"
echo "  2. 检查低流量路径，确认使用了正确的 method"
echo "  3. 监控错误日志，确保没有意外问题"
echo ""
echo -e "${BLUE}📚 相关文档：${NC}"
echo "  • apps/api/src/lib/kv-snapshot.ts (快照生成逻辑)"
echo "  • apps/api/src/lib/paths-api-v2.ts (路径列表 API)"
echo "======================================"

