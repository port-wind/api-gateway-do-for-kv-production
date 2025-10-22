#!/bin/bash
# Dev 环境测试脚本

echo "=========================================="
echo "Dev 环境测试"
echo "=========================================="
echo ""

DEV_URL="https://api-gateway-do-for-kv-dev.andy-zhan.workers.dev"

echo "📤 步骤 1: 发送 20 个测试请求..."
echo ""

for i in $(seq 1 20); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" ${DEV_URL}/api/health)
  if [ "$STATUS" = "200" ]; then
    echo "✓ Request $i: OK (200)"
  else
    echo "✗ Request $i: Failed ($STATUS)"
  fi
  sleep 0.1
done

echo ""
echo "✅ 测试请求发送完成"
echo ""

echo "=========================================="
echo "📊 查看实时日志"
echo "=========================================="
echo ""
echo "运行以下命令查看 dev 环境日志："
echo "  cd apps/api && npx wrangler tail --env dev"
echo ""
echo "或查看队列统计："
echo "  npx wrangler queues list"
echo ""

