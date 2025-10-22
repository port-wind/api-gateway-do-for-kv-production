#!/bin/bash

# 缓存测试演示脚本
# 演示如何测试后端请求记录功能

set -e

BACKEND_URL="http://localhost:3001"
TEST_REQUESTS=10

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🚀 缓存测试工具演示${NC}"
echo "演示后端请求统计功能..."
echo ""

# 重置后端统计
echo -e "${BLUE}📊 重置后端统计${NC}"
curl -s -X POST $BACKEND_URL/reset > /dev/null
echo "✅ 统计数据已重置"
echo ""

# 发送一些测试请求
echo -e "${BLUE}🔄 发送 $TEST_REQUESTS 个测试请求${NC}"
for i in $(seq 1 $TEST_REQUESTS); do
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"testId\": $i, \"message\": \"Demo request $i\"}" \
        $BACKEND_URL/api/test)
    
    # 提取响应信息
    request_id=$(echo "$response" | jq -r '.requestId')
    total_requests=$(echo "$response" | jq -r '.totalRequests')
    
    printf "  请求 #%-2d: 后端请求ID %d (总数: %d)\n" "$i" "$request_id" "$total_requests"
    
    # 稍作延迟
    sleep 0.1
done

echo ""

# 获取最终统计
echo -e "${BLUE}📈 最终统计结果${NC}"
stats=$(curl -s $BACKEND_URL/stats)
total=$(echo "$stats" | jq -r '.totalRequests')
uptime=$(echo "$stats" | jq -r '.uptime')

echo "✅ 后端接收到 $total 个请求"
echo "⏱️  运行时长: $((uptime/1000)) 秒"
echo ""

echo -e "${GREEN}🎯 演示说明：${NC}"
echo "• 在真实的缓存测试中，100个请求应该只有2-3个到达后端"
echo "• 本演示中所有 $TEST_REQUESTS 个请求都直接到达后端（未经网关缓存）"
echo "• 当 API 网关运行时，缓存将大幅减少后端请求数量"
echo ""

echo -e "${YELLOW}💡 完整测试步骤：${NC}"
echo "1. 启动 API 网关: cd apps/api && npm run dev"
echo "2. 配置测试环境: ./scripts/setup-cache-test.sh setup"
echo "3. 执行缓存测试: ./scripts/test-cache-post.sh"
echo "4. 生成详细报告: node scripts/cache-test-report.js"