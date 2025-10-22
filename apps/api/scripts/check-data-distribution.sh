#!/bin/bash
# 检查 PathCollector DO 和 D1 的数据分布情况

set -e

ENV=${1:-default}

echo "🔍 检查数据分布情况 (环境: $ENV)"
echo "========================================="
echo ""

# 1. 检查 D1 数据量
echo "📊 D1 数据库统计"
echo "-------------------"

# 统计 traffic_events 表
echo "1️⃣ traffic_events (明细事件):"
npx wrangler d1 execute path-stats-db --env="$ENV" --command="SELECT COUNT(*) as count, MIN(event_date) as earliest, MAX(event_date) as latest FROM traffic_events" --remote 2>/dev/null || echo "  ❌ 无法查询（数据库未部署或表不存在）"

# 统计 path_stats_hourly 表
echo ""
echo "2️⃣ path_stats_hourly (小时聚合):"
npx wrangler d1 execute path-stats-db --env="$ENV" --command="SELECT COUNT(*) as paths, SUM(requests) as total_requests FROM path_stats_hourly" --remote 2>/dev/null || echo "  ❌ 无法查询（数据库未部署或表不存在）"

# 查看最近的路径统计
echo ""
echo "3️⃣ 最近 5 条路径统计:"
npx wrangler d1 execute path-stats-db --env="$ENV" --command="SELECT path, hour_bucket, requests, errors FROM path_stats_hourly ORDER BY updated_at DESC LIMIT 5" --remote 2>/dev/null || echo "  ❌ 无法查询"

echo ""
echo "========================================="
echo ""

# 2. 检查 KV 快照数据
echo "📦 KV Snapshot 统计"
echo "-------------------"
echo "查询 KV 中的快照配置和版本..."
# 这里需要通过 API 或者直接读取 KV，但 wrangler 没有直接的 KV 查询命令
# 建议通过 API 端点查询

echo ""
echo "💡 提示：KV 数据需要通过 API 查询"
echo "   可以访问：GET /admin/paths/migration-config"
echo ""

# 3. PathCollector DO 数据估算
echo "🔄 PathCollector DO 数据估算"
echo "-------------------"
echo "⚠️  DO 数据无法直接查询，需要通过以下方式检查："
echo "   1. 查看 Cloudflare Dashboard > Durable Objects > PathCollector"
echo "   2. 或调用 API: GET /admin/paths (旧版会查 DO)"
echo ""

echo "========================================="
echo ""
echo "✅ 检查完成"
echo ""
echo "📋 建议的检查步骤："
echo "   1. 查看上面的 D1 统计数据"
echo "   2. 访问 API 端点查看实际返回的数据量"
echo "   3. 对比 D1 vs DO 的数据差异"
echo ""

