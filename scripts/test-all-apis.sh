#!/bin/bash

# ============================================
# API Gateway 前端 API 完整性测试脚本
# ============================================
# 测试所有前端调用的 API 端点，确保路径正确
# 使用方法: ./scripts/test-all-apis.sh <API_BASE_URL> <AUTH_TOKEN>
# 示例: ./scripts/test-all-apis.sh https://api-proxy.pwtk.cc "your-token-here"

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
API_BASE="${1:-https://api-proxy.pwtk.cc}"
AUTH_TOKEN="${2:-}"

if [ -z "$AUTH_TOKEN" ]; then
    echo -e "${RED}错误: 请提供认证 token${NC}"
    echo "使用方法: $0 <API_BASE_URL> <AUTH_TOKEN>"
    exit 1
fi

# 统计变量
TOTAL=0
SUCCESS=0
FAILED=0
FAILED_APIS=()

# 测试函数
test_api() {
    local method="$1"
    local path="$2"
    local data="$3"
    local desc="$4"
    
    TOTAL=$((TOTAL + 1))
    
    echo -e "\n${BLUE}[${TOTAL}] 测试: ${desc}${NC}"
    echo -e "    ${method} ${path}"
    
    local cmd="curl -s -w '\n%{http_code}' -X ${method} '${API_BASE}${path}'"
    cmd="$cmd -H 'Authorization: Bearer ${AUTH_TOKEN}'"
    cmd="$cmd -H 'Content-Type: application/json'"
    
    if [ -n "$data" ]; then
        cmd="$cmd -d '${data}'"
    fi
    
    # 执行请求
    local response=$(eval $cmd 2>&1)
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | head -n-1)
    
    # 判断结果
    if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 201 ] || [ "$http_code" -eq 204 ]; then
        echo -e "    ${GREEN}✓ 成功 (${http_code})${NC}"
        SUCCESS=$((SUCCESS + 1))
    elif [ "$http_code" -eq 401 ]; then
        echo -e "    ${YELLOW}⚠ 需要认证 (401) - Token 可能过期${NC}"
        FAILED=$((FAILED + 1))
        FAILED_APIS+=("$desc ($method $path) - 401")
    elif [ "$http_code" -eq 404 ]; then
        echo -e "    ${RED}✗ 路径不存在 (404)${NC}"
        FAILED=$((FAILED + 1))
        FAILED_APIS+=("$desc ($method $path) - 404")
    elif [ "$http_code" -eq 500 ]; then
        echo -e "    ${RED}✗ 服务器错误 (500)${NC}"
        echo -e "    响应: $(echo "$body" | head -c 200)"
        FAILED=$((FAILED + 1))
        FAILED_APIS+=("$desc ($method $path) - 500")
    else
        echo -e "    ${YELLOW}⚠ 其他状态 (${http_code})${NC}"
        FAILED=$((FAILED + 1))
        FAILED_APIS+=("$desc ($method $path) - ${http_code}")
    fi
}

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  API Gateway 完整性测试${NC}"
echo -e "${BLUE}======================================${NC}"
echo -e "API Base: ${API_BASE}"
echo -e "Token: ${AUTH_TOKEN:0:20}..."

# ============================================
# 1. 认证相关 API (不需要 token)
# ============================================
echo -e "\n${BLUE}=== 1. 认证 API ===${NC}"
# 注意：这些 API 不需要 token，但我们先跳过实际登录测试

# ============================================
# 2. Dashboard API
# ============================================
echo -e "\n${BLUE}=== 2. Dashboard API ===${NC}"
test_api "GET" "/api/admin/dashboard/overview" "" "Dashboard 概览"
test_api "GET" "/api/admin/dashboard/timeseries?range=24h&metric=requests" "" "时间序列数据"
test_api "GET" "/api/admin/dashboard/rate-limit/stats" "" "限流统计"
test_api "GET" "/api/admin/dashboard/realtime/recent?limit=20" "" "实时地图数据"
test_api "GET" "/api/admin/dashboard/alerts" "" "Dashboard 告警"

# ============================================
# 3. 路径管理 API
# ============================================
echo -e "\n${BLUE}=== 3. 路径管理 API ===${NC}"
test_api "GET" "/api/admin/paths?page=1&limit=50" "" "获取路径列表"
test_api "GET" "/api/admin/paths/health" "" "路径健康状态"
test_api "GET" "/api/admin/paths/%2Fapi%2Ftest/cache-entries?limit=50" "" "获取路径缓存条目"
test_api "POST" "/api/admin/paths/batch" '{"operations":[{"type":"toggle-cache","path":"/test"}]}' "批量操作 - Toggle 缓存"

# ============================================
# 4. 缓存管理 API
# ============================================
echo -e "\n${BLUE}=== 4. 缓存管理 API ===${NC}"
test_api "GET" "/api/admin/cache/config" "" "获取缓存配置"
test_api "GET" "/api/admin/cache/stats" "" "缓存统计"
test_api "GET" "/api/admin/cache/health" "" "缓存健康状态"
test_api "GET" "/api/admin/cache/paths?page=1&limit=50" "" "获取缓存路径列表"
test_api "POST" "/api/admin/cache/refresh" '{"path":"/test"}' "刷新缓存"

# ============================================
# 5. IP 监控 API
# ============================================
echo -e "\n${BLUE}=== 5. IP 监控 API ===${NC}"
test_api "GET" "/api/admin/ip-monitor/ips?date=$(date +%Y-%m-%d)&page=1&limit=50" "" "获取 IP 列表"
test_api "GET" "/api/admin/ip-monitor/rules?page=1&limit=50" "" "获取 IP 规则"
test_api "GET" "/api/admin/ip-monitor/config" "" "获取 IP 监控配置"

# ============================================
# 6. 代理路由 API
# ============================================
echo -e "\n${BLUE}=== 6. 代理路由 API ===${NC}"
test_api "GET" "/api/admin/proxy-routes?page=1&limit=50" "" "获取代理路由列表"
test_api "GET" "/api/admin/proxy-routes/stats" "" "代理路由统计"

# ============================================
# 7. 限流 API
# ============================================
echo -e "\n${BLUE}=== 7. 限流 API ===${NC}"
test_api "GET" "/api/admin/rate-limit/config" "" "获取限流配置"
test_api "GET" "/api/admin/rate-limit/health" "" "限流健康状态"

# ============================================
# 8. 地理位置规则 API
# ============================================
echo -e "\n${BLUE}=== 8. 地理位置规则 API ===${NC}"
test_api "GET" "/api/admin/geo/rules?page=1&limit=50" "" "获取地理位置规则"
test_api "GET" "/api/admin/geo/preset-groups" "" "获取预设地理位置组"
test_api "GET" "/api/admin/geo/access-list?date=$(date +%Y-%m-%d)&page=1&limit=50" "" "获取地理访问列表"

# ============================================
# 测试结果汇总
# ============================================
echo -e "\n${BLUE}======================================${NC}"
echo -e "${BLUE}  测试结果汇总${NC}"
echo -e "${BLUE}======================================${NC}"
echo -e "总计: ${TOTAL}"
echo -e "${GREEN}成功: ${SUCCESS}${NC}"
echo -e "${RED}失败: ${FAILED}${NC}"

if [ ${FAILED} -gt 0 ]; then
    echo -e "\n${RED}失败的 API:${NC}"
    for api in "${FAILED_APIS[@]}"; do
        echo -e "  ${RED}✗${NC} $api"
    done
    echo -e "\n${RED}测试未通过！请修复以上 API 路径问题。${NC}"
    exit 1
else
    echo -e "\n${GREEN}🎉 所有 API 测试通过！${NC}"
    exit 0
fi

