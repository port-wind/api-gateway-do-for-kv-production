#!/bin/bash

# 本地 404 问题排查脚本
# 逐步测试集成优化缓存后的路由匹配

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 本地 404 问题排查"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

LOCAL_URL="http://localhost:8787"
TEST_PATH="/biz-client/biz/relationship/batch-get"

# 等待开发服务器启动
echo "⏳ 等待开发服务器启动..."
sleep 5

# 测试 1: 健康检查
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 1: 健康检查"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
curl -s "${LOCAL_URL}/api/health" | jq . || echo "❌ 健康检查失败"

# 测试 2: 代理路由列表（管理 API）
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 2: 获取代理路由配置"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
curl -s "${LOCAL_URL}/api/admin/proxy-routes?limit=5" | jq '.data[] | {pattern, target, enabled}' || echo "❌ 获取路由失败"

# 测试 3: 优化管理 API（检查是否注册）
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 3: 优化管理 API"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
curl -s "${LOCAL_URL}/api/admin/optimization/health" | jq . || echo "❌ 优化管理 API 未注册"

# 测试 4: 测试代理路由（未集成优化）
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 4: 代理请求（当前版本，未集成优化）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "${LOCAL_URL}${TEST_PATH}" \
  -H 'businesstype: XTK' \
  -H 'cid: test' \
  -H 'clienttype: C_WEB' \
  -H 'content-type: application/json' \
  --data-raw '{"targetUserIdList":["1419717728603737560"],"direct":1}')

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ 当前版本工作正常（状态码: $HTTP_CODE）"
else
  echo "❌ 当前版本失败（状态码: $HTTP_CODE）"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 排查步骤"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "接下来需要："
echo "1. 临时应用优化缓存集成的改动"
echo "2. 重启开发服务器"
echo "3. 重新运行此脚本看是否出现 404"
echo "4. 如果出现 404，检查："
echo "   - RouteCache.get() 是否正确返回匹配的路由"
echo "   - findMatchingProxyRoute() 是否被正确调用"
echo "   - 路由注册顺序是否有问题"
echo ""
echo "💡 提示: 查看开发服务器日志，搜索："
echo "   - '[RouteCache HIT]'"
echo "   - '[RouteCache] Starting warmup'"
echo "   - 'Dynamic proxy route matched'"
echo ""

