#!/bin/bash
# Phase 2 本地测试脚本

echo "=========================================="
echo "Phase 2 本地测试"
echo "=========================================="
echo ""

# 1. 发送测试请求
echo "📤 步骤 1: 发送 100 个测试请求..."
for i in {1..100}; do
  curl -s http://localhost:8787/api/health > /dev/null
  if [ $? -eq 0 ]; then
    echo -ne "\r已发送: $i/100 请求"
  else
    echo -e "\n❌ 请求 $i 失败"
  fi
done
echo -e "\n✅ 测试请求发送完成\n"

# 2. 等待队列处理
echo "⏳ 步骤 2: 等待 5 秒让队列处理事件..."
sleep 5
echo "✅ 等待完成\n"

# 3. 检查 D1 数据
echo "📊 步骤 3: 检查 D1 数据..."
echo ""
echo "=== 明细事件表 (traffic_events) ==="
npx wrangler d1 execute path-stats-db --local --command="SELECT COUNT(*) as total FROM traffic_events"
echo ""
echo "=== 聚合统计表 (path_stats_hourly) ==="
npx wrangler d1 execute path-stats-db --local --command="SELECT path, hour_bucket, requests, errors FROM path_stats_hourly LIMIT 5"
echo ""

# 4. 检查 KV 快照
echo "📸 步骤 4: 检查 KV 快照..."
echo ""
echo "=== KV 快照配置 ==="
npx wrangler kv:key get "snapshot:config" --binding API_GATEWAY_STORAGE --local
echo ""
echo "=== KV 最新快照 (前 200 字符) ==="
npx wrangler kv:key get "snapshot:latest" --binding API_GATEWAY_STORAGE --local | head -c 200
echo "..."
echo ""

echo "=========================================="
echo "✅ Phase 2 测试完成！"
echo "=========================================="

