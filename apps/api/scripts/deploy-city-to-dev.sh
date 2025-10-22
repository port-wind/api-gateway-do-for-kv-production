#!/bin/bash
#
# 城市功能部署到 Dev 环境
# 用途：测试城市信息功能
# 

set -e

echo "=========================================="
echo "城市功能部署 - Dev 环境"
echo "=========================================="

cd "$(dirname "$0")/.."

# 1. 运行数据库迁移（Dev 环境）
echo ""
echo "📝 步骤 1: 运行数据库迁移到 Dev 环境..."
echo "执行: wrangler d1 migrations apply D1 --env dev --remote"
echo ""
echo "⚠️  将要应用以下迁移："
npx wrangler d1 migrations list D1 --env dev --remote 2>/dev/null || true
echo ""
read -p "继续执行迁移？(y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 已取消"
    exit 1
fi
echo "yes" | npx wrangler d1 migrations apply D1 --env dev --remote

# 2. 部署 Worker 到 Dev 环境
echo ""
echo "🚀 步骤 2: 部署 Worker 到 Dev 环境..."
echo "执行: wrangler deploy --env dev"
npx wrangler deploy --env dev

# 3. 等待部署完成
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
echo "   wrangler d1 execute D1 --env dev --remote --command \"PRAGMA table_info(ip_traffic_daily)\" | grep last_seen_city"
echo ""
echo "2. 查询城市数据（等待有流量后）："
echo "   wrangler d1 execute D1 --env dev --remote --command \"SELECT ip_hash, last_seen_city FROM ip_traffic_daily WHERE last_seen_city IS NOT NULL LIMIT 10\""
echo ""
echo "3. 测试城市 API："
echo "   curl https://your-dev-worker.workers.dev/api/admin/cities?limit=10"
echo ""
echo "4. 测试 IP 监控 API："
echo "   curl https://your-dev-worker.workers.dev/api/admin/ip-monitor/ips?date=\$(date +%Y-%m-%d)"
echo ""
echo "5. 查看实时日志："
echo "   wrangler tail --env dev"
echo ""
echo "=========================================="

