#!/bin/bash
#
# 城市功能部署到 Test 环境
# Test 是默认环境，不需要 --env 参数
#

set -e

echo "=========================================="
echo "城市功能部署 - Test 环境"
echo "=========================================="

cd "$(dirname "$0")/.."

# 1. 应用数据库迁移（Test 环境 - 默认）
echo ""
echo "📝 步骤 1: 运行数据库迁移到 Test 环境..."
echo "执行: wrangler d1 migrations apply D1 --remote"
echo ""
echo "待应用的迁移："
npx wrangler d1 migrations list D1 --remote 2>/dev/null || true
echo ""
read -p "继续执行迁移？(y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 已取消"
    exit 1
fi
echo "y" | npx wrangler d1 migrations apply D1 --remote

# 2. 部署 Worker 到 Test 环境
echo ""
echo "🚀 步骤 2: 部署 Worker 到 Test 环境..."
echo "执行: wrangler deploy"
npx wrangler deploy --minify

# 3. 等待部署生效
echo ""
echo "⏳ 等待 5 秒让部署生效..."
sleep 5

# 4. 验证部署
echo ""
echo "=========================================="
echo "✅ 部署完成！"
echo "=========================================="
echo ""
echo "🔍 验证步骤："
echo ""
echo "1. 检查数据库迁移："
echo "   wrangler d1 execute D1 --remote --command \"PRAGMA table_info(ip_traffic_daily)\" | grep last_seen_city"
echo "   wrangler d1 execute D1 --remote --command \"PRAGMA table_info(traffic_events)\" | grep city"
echo ""
echo "2. 测试城市 API："
echo "   curl https://api-gateway-do-for-kv.andy-zhan.workers.dev/api/admin/cities?limit=10"
echo ""
echo "3. 查看实时日志："
echo "   wrangler tail"
echo ""
echo "4. 运行完整测试："
echo "   ./scripts/test-city-features-test.sh"
echo ""
echo "=========================================="

