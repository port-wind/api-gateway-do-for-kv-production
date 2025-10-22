#!/bin/bash

# ====================================
# 测试环境手动验证脚本
# ====================================

echo "======================================"
echo "🧪 Method Bug 修复 - 手动测试"
echo "======================================"
echo ""
echo "测试环境: https://api-proxy.pwtk.cc"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 步骤 1: 登录获取 Token
echo -e "${YELLOW}步骤 1: 登录获取 Token${NC}"
echo "请输入管理员密码:"
read -sp "密码: " PASSWORD
echo ""

LOGIN_RESPONSE=$(curl -s -X POST 'https://api-proxy.pwtk.cc/api/auth/login' \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"admin\",\"password\":\"$PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ 登录失败"
  echo "$LOGIN_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ 登录成功${NC}"
echo "Token: ${TOKEN:0:20}..."
echo ""

# 步骤 2: 执行 Backfill
echo -e "${YELLOW}步骤 2: 执行 Method 修复${NC}"
BACKFILL_RESPONSE=$(curl -s -X POST 'https://api-proxy.pwtk.cc/api/admin/paths/backfill-methods' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json')

echo "$BACKFILL_RESPONSE" | jq '.'
echo ""

# 步骤 3: 刷新快照
echo -e "${YELLOW}步骤 3: 刷新 KV 快照${NC}"
REFRESH_RESPONSE=$(curl -s -X POST 'https://api-proxy.pwtk.cc/api/admin/paths/snapshot/refresh' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json')

echo "$REFRESH_RESPONSE" | jq '.'
echo ""

# 步骤 4: 验证结果
echo -e "${YELLOW}步骤 4: 验证修复结果${NC}"
echo ""

echo "4.1 检查路径列表（前 10 个）:"
curl -s 'https://api-proxy.pwtk.cc/api/admin/paths?page=1&limit=10' \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data[] | {path: .path, method: .method, requestCount: .requestCount}'
echo ""

echo "4.2 Method 分布统计:"
curl -s 'https://api-proxy.pwtk.cc/api/admin/paths?page=1&limit=100' \
  -H "Authorization: Bearer $TOKEN" \
  | jq -r '.data[].method' | sort | uniq -c | sort -rn
echo ""

echo "======================================"
echo -e "${GREEN}✅ 测试完成！${NC}"
echo "======================================"
echo ""
echo "验证要点:"
echo "  ✓ Method 不应该全是 GET"
echo "  ✓ 应该看到 POST、PUT、DELETE 等多种 method"
echo "  ✓ 低流量路径也应该有正确的 method"

