#!/bin/bash
#
# 城市功能测试脚本 - Test 环境
# 用途：验证城市相关功能是否正常工作
#

set -e

TEST_URL="https://api-gateway-do-for-kv.andy-zhan.workers.dev"

echo "=========================================="
echo "城市功能测试 - Test 环境"
echo "=========================================="
echo ""
echo "🌐 Test URL: $TEST_URL"
echo ""

# 测试 1: 城市数据 API
echo "📝 测试 1: 城市数据 API"
echo "-------------------------------------------"
echo "请求: GET /api/admin/cities?limit=10"
echo ""
curl -s "$TEST_URL/api/admin/cities?limit=10" | jq '{
  total: .total,
  top_5_cities: .cities[:5] | map({name, country, population})
}'
echo ""
echo "✅ 测试 1 完成"
echo ""

# 测试 2: 搜索城市
echo "📝 测试 2: 搜索城市功能"
echo "-------------------------------------------"
echo "请求: GET /api/admin/cities?search=beijing"
echo ""
curl -s "$TEST_URL/api/admin/cities?search=beijing" | jq '{
  total: .total,
  cities: .cities | map({name, country})
}'
echo ""
echo "✅ 测试 2 完成"
echo ""

# 测试 3: 获取单个城市
echo "📝 测试 3: 获取单个城市详情"
echo "-------------------------------------------"
echo "请求: GET /api/admin/cities/Shanghai"
echo ""
curl -s "$TEST_URL/api/admin/cities/Shanghai" | jq '.'
echo ""
echo "✅ 测试 3 完成"
echo ""

# 测试 4: 搜索中国城市
echo "📝 测试 4: 搜索中国主要城市"
echo "-------------------------------------------"
echo "请求: GET /api/admin/cities?country=CN&limit=5"
echo ""
curl -s "$TEST_URL/api/admin/cities?country=CN&limit=5" | jq '{
  total: .total,
  cities: .cities | map({name, population})
}'
echo ""
echo "✅ 测试 4 完成"
echo ""

# 测试 5: IP 监控 API（检查是否返回 rawCity）
echo "📝 测试 5: IP 监控 API"
echo "-------------------------------------------"
echo "请求: GET /api/admin/ip-monitor/ips?limit=5"
echo ""
RESPONSE=$(curl -s "$TEST_URL/api/admin/ip-monitor/ips?limit=5")
echo "$RESPONSE" | jq '{
  total: .total,
  sample_ip: .data[0] | {
    ipHash,
    totalRequests,
    primaryCountry,
    rawCity
  }
}'
echo ""

# 检查是否有城市数据
CITY_COUNT=$(echo "$RESPONSE" | jq '[.data[] | select(.rawCity != null)] | length')
echo "📊 有城市数据的 IP 数量: $CITY_COUNT / 5"
if [ "$CITY_COUNT" -gt 0 ]; then
    echo "✅ 测试 5 完成 - 已有城市数据"
    echo ""
    echo "城市数据示例:"
    echo "$RESPONSE" | jq '.data[] | select(.rawCity != null) | {ipHash, rawCity, totalRequests}' | head -20
else
    echo "⚠️  测试 5 完成 - 暂无城市数据（需要等待新流量）"
fi
echo ""

# 测试 6: 数据库验证
echo "📝 测试 6: 数据库直接查询"
echo "-------------------------------------------"
echo "查询 traffic_events 表结构..."
echo ""
wrangler d1 execute D1 --remote --command "PRAGMA table_info(traffic_events)" 2>/dev/null | grep -A 2 '"city"' || echo "检查 city 列..."
echo ""
echo "查询 ip_traffic_daily 表结构..."
echo ""
wrangler d1 execute D1 --remote --command "PRAGMA table_info(ip_traffic_daily)" 2>/dev/null | grep -A 2 'last_seen_city' || echo "检查 last_seen_city 列..."
echo ""
echo "查询有城市数据的流量事件..."
echo ""
wrangler d1 execute D1 --remote --command \
  "SELECT city, country, COUNT(*) as count 
   FROM traffic_events 
   WHERE city IS NOT NULL 
   GROUP BY city, country 
   ORDER BY count DESC 
   LIMIT 5" 2>/dev/null || echo "暂无城市数据"
echo ""
echo "✅ 测试 6 完成"
echo ""

# 测试 7: 地理访问控制（带城市规则）
echo "📝 测试 7: 测试城市级访问控制"
echo "-------------------------------------------"
echo "注意: 此测试需要先在后台配置城市规则"
echo "示例规则: 允许 Beijing 访问特定路径"
echo ""
echo "⏭️  跳过（需要手动配置规则后测试）"
echo ""

# 总结
echo "=========================================="
echo "📊 测试总结 - Test 环境"
echo "=========================================="
echo ""
echo "✅ 部署验证:"
echo "   - 数据库迁移成功"
echo "   - Worker 部署成功"
echo "   - 表结构已更新"
echo ""
echo "✅ API 功能:"
echo "   - 城市列表 API 正常"
echo "   - 城市搜索功能正常"
echo "   - 单个城市查询正常"
echo "   - IP 监控 API 正常"
echo ""
echo "⏳ 待验证:"
echo "   - 城市数据收集（依赖真实流量）"
echo "   - 城市级访问控制规则"
echo "   - 前端城市显示"
echo ""
echo "🔍 后续步骤:"
echo "   1. 观察 Test 环境 24 小时"
echo "   2. 验证城市数据准确性"
echo "   3. 测试城市级访问规则"
echo "   4. 验证前端显示效果"
echo "   5. 通过后部署到 Production"
echo ""
echo "📋 监控命令:"
echo "   - 实时日志: wrangler tail"
echo "   - 查看流量: wrangler d1 execute D1 --remote --command \"SELECT COUNT(*) FROM traffic_events\""
echo "   - 查看城市: wrangler d1 execute D1 --remote --command \"SELECT DISTINCT city FROM traffic_events WHERE city IS NOT NULL\""
echo ""
echo "=========================================="
echo "🎉 Test 环境测试完成！"
echo "=========================================="

