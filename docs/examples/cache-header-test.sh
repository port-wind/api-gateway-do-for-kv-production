#!/bin/bash

# 缓存 Header 配置测试脚本
# 演示如何使用不同的 headers 生成不同的缓存条目

echo "=================================================="
echo "  缓存 Header 配置测试"
echo "=================================================="
echo ""

# API 基础地址
BASE_URL="${API_BASE_URL:-http://localhost:8787}"
API_PATH="/api/user/profile"

echo "📝 测试场景: 使用不同的 authorization header 获取用户资料"
echo "路径: $API_PATH"
echo "配置策略: path-headers"
echo "配置 headers: [\"authorization\"]"
echo ""

# 配置路径的缓存策略
echo "1️⃣ 配置路径缓存策略..."
curl -X PUT "$BASE_URL/api/admin/paths/config" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "'"$API_PATH"'",
    "config": {
      "cache": {
        "enabled": true,
        "version": 1,
        "keyStrategy": "path-headers",
        "keyHeaders": ["authorization"]
      }
    }
  }' | jq '.'
echo ""

sleep 1

# 测试不同的用户请求
echo "2️⃣ 测试不同用户的请求（应该生成不同的缓存条目）..."
echo ""

# 用户 1 的请求
echo "👤 用户 1 (token: Bearer user1-token-abc123)"
curl -X GET "$BASE_URL$API_PATH" \
  -H "Authorization: Bearer user1-token-abc123" \
  -H "Accept: application/json" \
  -w "\n状态码: %{http_code}\n" \
  -s | head -n 10
echo ""

sleep 0.5

# 用户 2 的请求
echo "👤 用户 2 (token: Bearer user2-token-xyz789)"
curl -X GET "$BASE_URL$API_PATH" \
  -H "Authorization: Bearer user2-token-xyz789" \
  -H "Accept: application/json" \
  -w "\n状态码: %{http_code}\n" \
  -s | head -n 10
echo ""

sleep 0.5

# 用户 1 再次请求（应该命中缓存）
echo "👤 用户 1 再次请求 (应该命中缓存)"
curl -X GET "$BASE_URL$API_PATH" \
  -H "Authorization: Bearer user1-token-abc123" \
  -H "Accept: application/json" \
  -w "\n状态码: %{http_code}\n" \
  -s | head -n 10
echo ""

sleep 1

# 查看缓存条目
echo "3️⃣ 查看生成的缓存条目..."
curl -X GET "$BASE_URL/api/admin/paths/$API_PATH/cache-entries" \
  -H "Accept: application/json" \
  -s | jq '.data.entries[] | {cacheKey, hash, requestCount, createdAt}'
echo ""

echo "=================================================="
echo "✅ 测试完成"
echo ""
echo "💡 说明:"
echo "  - 不同的 authorization 值会生成不同的缓存键"
echo "  - 相同的 authorization 会命中已有的缓存"
echo "  - 查看缓存条目可以看到不同的 hash 值"
echo "=================================================="

