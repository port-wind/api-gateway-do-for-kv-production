#!/bin/bash

# ====================================
# 触发 KV 快照刷新脚本
# ====================================
# 
# 功能：手动触发快照生成，修复 method 字段问题
# 使用：./trigger-snapshot-refresh.sh [环境]
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

echo "======================================"
echo "🔄 触发 KV 快照刷新"
echo "环境: $ENV"
echo "URL: $URL"
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
  echo "$LOGIN_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ 登录成功${NC}"

# 触发快照刷新
echo ""
echo "📸 触发快照刷新..."
REFRESH_RESPONSE=$(curl -s -X POST "$URL/api/admin/cache/snapshot/refresh" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

echo ""
echo "======================================"
echo "响应结果："
echo "$REFRESH_RESPONSE" | jq '.' 2>/dev/null || echo "$REFRESH_RESPONSE"
echo "======================================"

# 检查是否成功
if echo "$REFRESH_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ 快照刷新成功${NC}"
  echo ""
  echo "⏳ 等待 5 秒让快照完成..."
  sleep 5
  
  # 验证快照
  echo ""
  echo "🔍 验证快照状态..."
  SNAPSHOT_STATUS=$(curl -s "$URL/api/admin/cache/snapshot/status" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
  
  echo "$SNAPSHOT_STATUS" | jq '.' 2>/dev/null || echo "$SNAPSHOT_STATUS"
  
else
  echo -e "${RED}❌ 快照刷新失败${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}✅ 完成！${NC}"

