#!/bin/bash
# Phase 2 简化测试脚本

echo "=========================================="
echo "Phase 2 本地测试（简化版）"
echo "=========================================="
echo ""

# 1. 发送测试请求
echo "📤 步骤 1: 发送 50 个测试请求到不同路径..."
echo ""

# 测试不同的路径
paths=("/api/health" "/api/status" "/api/test" "/api/demo" "/api/example")

for i in {1..50}; do
  # 随机选择一个路径
  path_index=$((RANDOM % 5))
  path=${paths[$path_index]}
  
  # 发送请求
  response=$(curl -s -w "\n%{http_code}" http://localhost:8787${path} 2>/dev/null)
  status_code=$(echo "$response" | tail -n 1)
  
  if [ "$status_code" == "200" ] || [ "$status_code" == "404" ]; then
    echo "✓ Request $i: ${path} → ${status_code}"
  else
    echo "✗ Request $i: ${path} → ${status_code} (failed)"
  fi
  
  # 每 10 个请求休息一下
  if [ $((i % 10)) -eq 0 ]; then
    sleep 0.5
  fi
done

echo ""
echo "✅ 测试请求发送完成"
echo ""

# 2. 等待队列处理
echo "⏳ 步骤 2: 等待 10 秒让队列处理事件..."
sleep 10
echo "✅ 等待完成"
echo ""

# 3. 检查 wrangler dev 日志
echo "📋 步骤 3: 检查开发服务器状态..."
echo ""
if pgrep -f "wrangler.*dev" > /dev/null; then
  echo "✅ Wrangler dev 服务器正在运行"
  echo ""
  echo "提示："
  echo "  - 请查看 wrangler dev 终端的日志输出"
  echo "  - 应该能看到队列消息处理的日志"
  echo "  - 查找关键词：'queue', 'aggregated', 'D1', 'KV snapshot'"
else
  echo "❌ Wrangler dev 服务器未运行"
  echo "   请先运行: npm run dev"
fi

echo ""
echo "=========================================="
echo "✅ Phase 2 测试完成！"
echo "=========================================="
echo ""
echo "📊 测试总结："
echo "  - 发送了 50 个请求到 5 个不同路径"
echo "  - 请求分布应触发路径统计采集"
echo "  - 队列应该已处理这些事件"
echo ""
echo "🔍 验证要点："
echo "  1. Wrangler dev 日志中应该有队列处理消息"
echo "  2. 如果启用了 USE_TRAFFIC_QUEUE，事件应发送到队列"
echo "  3. 队列消费者应该聚合统计并写入 D1"
echo "  4. 每 10 个批次应触发 KV 快照刷新"
echo ""
echo "💡 下一步："
echo "  - 检查 wrangler dev 的日志输出"
echo "  - 或部署到 dev 环境进行完整测试"
echo ""

