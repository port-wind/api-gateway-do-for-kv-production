#!/bin/bash

# IP 监控系统 API 测试脚本
# 测试所有 IP 监控相关的 API 端点

BASE_URL="http://localhost:8787"
API_BASE="$BASE_URL/api/admin/ip-monitor"

echo "=========================================="
echo "IP 监控系统 API 测试"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试函数
test_api() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    
    echo -e "${YELLOW}测试: $name${NC}"
    echo "请求: $method $endpoint"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$endpoint")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}✓ 成功 (HTTP $http_code)${NC}"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        echo -e "${RED}✗ 失败 (HTTP $http_code)${NC}"
        echo "$body"
    fi
    echo ""
}

# 等待服务器启动
echo "等待服务器启动..."
for i in {1..10}; do
    if curl -s "$BASE_URL/api/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ 服务器已就绪${NC}"
        break
    fi
    echo "等待中... ($i/10)"
    sleep 2
done
echo ""

# 1. 测试创建封禁规则
echo "=========================================="
echo "1. 创建 IP 封禁规则"
echo "=========================================="
test_api "封禁单个 IP" "POST" "$API_BASE/rules" '{
  "ipPattern": "192.168.1.100",
  "mode": "block",
  "reason": "测试封禁 - 恶意扫描"
}'

# 2. 测试创建限流规则
echo "=========================================="
echo "2. 创建 IP 限流规则"
echo "=========================================="
test_api "限流 CIDR 网段" "POST" "$API_BASE/rules" '{
  "ipPattern": "10.0.0.0/24",
  "mode": "throttle",
  "limit": 10,
  "window": 60,
  "reason": "测试限流 - 可疑 IP 段"
}'

# 3. 测试查询规则列表
echo "=========================================="
echo "3. 查询规则列表"
echo "=========================================="
test_api "获取所有规则" "GET" "$API_BASE/rules"

# 4. 测试查询 IP 列表
echo "=========================================="
echo "4. 查询 IP 统计列表"
echo "=========================================="
TODAY=$(date +%Y-%m-%d)
test_api "获取今日 IP 列表" "GET" "$API_BASE/ips?date=$TODAY&limit=10"

# 5. 测试查询配置
echo "=========================================="
echo "5. 查询监控配置"
echo "=========================================="
test_api "获取当前配置" "GET" "$API_BASE/config"

# 6. 测试更新配置
echo "=========================================="
echo "6. 更新监控配置"
echo "=========================================="
test_api "设置保留期为 7 天" "PUT" "$API_BASE/config" '{
  "retentionDays": 7
}'

# 7. 模拟一些访问请求（触发 IP 数据收集）
echo "=========================================="
echo "7. 模拟访问请求"
echo "=========================================="
echo "发送测试请求以触发 IP 数据收集..."
for i in {1..5}; do
    curl -s -H "X-Real-IP: 192.168.100.$i" "$BASE_URL/api/health" > /dev/null
    echo "  请求 $i/5 已发送"
done
echo -e "${GREEN}✓ 测试请求已发送${NC}"
echo ""

# 8. 验证全局 IP Guard 中间件
echo "=========================================="
echo "8. 验证 IP 封禁功能"
echo "=========================================="
echo "使用被封禁的 IP 访问（应返回 403）..."
response=$(curl -s -w "\n%{http_code}" \
    -H "X-Real-IP: 192.168.1.100" \
    "$BASE_URL/api/health")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" = "403" ]; then
    echo -e "${GREEN}✓ 封禁功能正常工作 (HTTP 403)${NC}"
    echo "$body" | jq '.'
else
    echo -e "${RED}✗ 封禁功能未生效 (HTTP $http_code)${NC}"
    echo "$body"
fi
echo ""

# 总结
echo "=========================================="
echo "测试完成"
echo "=========================================="
echo ""
echo "接下来的步骤："
echo "1. 查看 IP 统计数据是否正确聚合"
echo "2. 验证限流功能（需要发送多次请求触发）"
echo "3. 检查队列消费者日志"
echo "4. 验证定时清理任务"
echo ""
echo "使用以下命令查看更多详情："
echo "  curl $API_BASE/rules | jq '.'"
echo "  curl $API_BASE/ips?date=$TODAY | jq '.'"
echo ""

