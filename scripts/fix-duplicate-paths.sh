#!/bin/bash

# 修复重复路径问题 - 清理并重新生成快照
# 
# 用法：
#   ./scripts/fix-duplicate-paths.sh
#
# 或者手动调用 API：
#   curl -X POST https://your-worker.workers.dev/api/admin/paths/cleanup/invalid

echo "=========================================="
echo "🔧 修复重复路径问题"
echo "=========================================="
echo ""

# 读取 wrangler.toml 中的项目名称
if [ -f "apps/api/wrangler.toml" ]; then
  WORKER_NAME=$(grep 'name = ' apps/api/wrangler.toml | head -1 | cut -d'"' -f2)
  echo "📋 Worker 名称: $WORKER_NAME"
else
  echo "⚠️  未找到 wrangler.toml，请手动指定 Worker URL"
  exit 1
fi

# 方法 1：删除快照，让系统自动重新生成
echo ""
echo "方法 1: 删除 KV 快照（推荐）"
echo "----------------------------------------"
echo "执行命令："
echo "  cd apps/api"
echo "  npx wrangler kv:key delete snapshot:config --binding=API_GATEWAY_STORAGE"
echo "  npx wrangler kv:key delete snapshot:latest --binding=API_GATEWAY_STORAGE"
echo ""
read -p "是否执行删除快照？(y/n): " confirm1

if [ "$confirm1" = "y" ]; then
  cd apps/api
  echo ""
  echo "🗑️  删除 snapshot:config..."
  npx wrangler kv:key delete snapshot:config --binding=API_GATEWAY_STORAGE
  
  echo "🗑️  删除 snapshot:latest..."
  npx wrangler kv:key delete snapshot:latest --binding=API_GATEWAY_STORAGE
  
  echo ""
  echo "✅ 快照已删除！"
  echo "💡 下次访问路径列表时，系统会自动生成新的无重复快照"
  cd ../..
else
  echo "⏭️  跳过方法 1"
fi

echo ""
echo "=========================================="
echo "方法 2: 调用清理 API（可选）"
echo "=========================================="
echo ""
echo "这个方法会清理 D1 中不匹配的历史路径数据，并自动删除快照"
echo ""
read -p "是否调用清理 API？(y/n): " confirm2

if [ "$confirm2" = "y" ]; then
  # 需要提供 Worker URL
  read -p "请输入 Worker URL (例如: https://your-worker.workers.dev): " WORKER_URL
  
  if [ -z "$WORKER_URL" ]; then
    echo "❌ URL 不能为空"
    exit 1
  fi
  
  echo ""
  echo "🔄 调用清理 API..."
  echo "URL: $WORKER_URL/api/admin/paths/cleanup/invalid"
  
  response=$(curl -s -X POST "$WORKER_URL/api/admin/paths/cleanup/invalid" \
    -H "Content-Type: application/json")
  
  echo ""
  echo "📊 响应："
  echo "$response" | jq '.' 2>/dev/null || echo "$response"
  
  echo ""
  echo "✅ 清理完成！"
else
  echo "⏭️  跳过方法 2"
fi

echo ""
echo "=========================================="
echo "✅ 修复流程完成"
echo "=========================================="
echo ""
echo "📌 接下来："
echo "  1. 刷新浏览器页面"
echo "  2. 检查路径列表是否还有重复"
echo "  3. 如果还有问题，请检查代码是否已部署："
echo "     cd apps/api && npm run deploy"
echo ""

