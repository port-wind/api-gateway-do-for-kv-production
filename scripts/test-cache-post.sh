#!/bin/bash

# POST 请求缓存测试脚本
# 用于测试 API 网关的 POST 请求缓存行为

set -e

# 默认配置
GATEWAY_URL="${1:-http://localhost:8787}"
BACKEND_URL="http://localhost:3001"
TEST_PATH="/api/test"
TOTAL_REQUESTS=100
CACHE_TTL=60
BATCH_SIZE=10

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 统计变量
CACHE_HITS=0
CACHE_MISSES=0
STALE_HITS=0
BACKEND_REQUESTS_START=0
BACKEND_REQUESTS_END=0
TOTAL_TIME=0

# 工具函数：打印带颜色的信息
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_header() {
    echo -e "\n${PURPLE}=== $1 ===${NC}"
}

print_step() {
    echo -e "${CYAN}🔹 $1${NC}"
}

# 检查后端服务器是否运行
check_backend_server() {
    print_step "检查后端模拟服务器..."
    if ! curl -s "$BACKEND_URL/stats" > /dev/null 2>&1; then
        print_error "后端模拟服务器未运行！"
        print_info "请先运行: node scripts/mock-backend-server.js"
        exit 1
    fi
    print_success "后端服务器运行正常"
}

# 检查网关服务
check_gateway() {
    print_step "检查 API 网关..."
    local response=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/health" || echo "000")
    if [ "$response" != "200" ]; then
        print_error "API 网关未运行或不健康！响应码: $response"
        print_info "请先运行: npm run dev (在 apps/api 目录下)"
        exit 1
    fi
    print_success "API 网关运行正常"
}

# 获取后端请求统计
get_backend_stats() {
    curl -s "$BACKEND_URL/stats" | grep '"totalRequests"' | cut -d':' -f2 | cut -d',' -f1 | tr -d ' '
}

# 重置后端统计
reset_backend_stats() {
    curl -s "$BACKEND_URL/reset" > /dev/null
    print_success "后端统计数据已重置"
}

# 发送单个 POST 请求并分析响应
send_post_request() {
    local request_id=$1
    local test_data="{\"testId\": $request_id, \"message\": \"Cache test request $request_id\", \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\"}"
    
    # 创建临时文件存储响应头
    local temp_headers=$(mktemp)
    local temp_body=$(mktemp)
    
    # 发送请求并测量时间
    local start_time=$(date +%s%3N)
    local response=$(curl -s -w "%{http_code}|%{time_total}" \
        -X POST \
        -H "Content-Type: application/json" \
        -H "User-Agent: CacheTestScript/1.0" \
        -D "$temp_headers" \
        -o "$temp_body" \
        -d "$test_data" \
        "$GATEWAY_URL$TEST_PATH")
    local end_time=$(date +%s%3N)
    
    # 解析响应
    local status_code=$(echo "$response" | cut -d'|' -f1)
    local curl_time=$(echo "$response" | cut -d'|' -f2)
    local response_time=$((end_time - start_time))
    
    # 提取缓存状态头
    local cache_status=$(grep -i "x-cache-status" "$temp_headers" 2>/dev/null | cut -d' ' -f2 | tr -d '\r' || echo "UNKNOWN")
    local cache_version=$(grep -i "x-cache-version" "$temp_headers" 2>/dev/null | cut -d' ' -f2 | tr -d '\r' || echo "")
    local cache_ttl=$(grep -i "x-cache-ttl" "$temp_headers" 2>/dev/null | cut -d' ' -f2 | tr -d '\r' || echo "")
    local cache_remaining=$(grep -i "x-cache-remaining-ttl" "$temp_headers" 2>/dev/null | cut -d' ' -f2 | tr -d '\r' || echo "")
    
    # 统计缓存状态
    case "$cache_status" in
        "HIT")
            CACHE_HITS=$((CACHE_HITS + 1))
            ;;
        "MISS")
            CACHE_MISSES=$((CACHE_MISSES + 1))
            ;;
        "STALE")
            STALE_HITS=$((STALE_HITS + 1))
            ;;
    esac
    
    # 累计总时间
    TOTAL_TIME=$((TOTAL_TIME + response_time))
    
    # 输出请求结果（简化版，避免刷屏）
    if [ $((request_id % 10)) -eq 1 ] || [ "$cache_status" = "MISS" ] || [ "$cache_status" = "STALE" ]; then
        printf "  请求 #%-3d: %s %-5s %4dms" "$request_id" "$status_code" "$cache_status" "$response_time"
        if [ -n "$cache_remaining" ] && [ "$cache_remaining" != "" ]; then
            printf " (TTL剩余: %ss)" "$cache_remaining"
        fi
        echo
    elif [ $((request_id % 10)) -eq 0 ]; then
        printf "  请求 #%-3d: %s %-5s %4dms (批次完成)\n" "$request_id" "$status_code" "$cache_status" "$response_time"
    fi
    
    # 清理临时文件
    rm -f "$temp_headers" "$temp_body"
    
    # 返回状态码用于错误检查
    echo "$status_code"
}

# 等待缓存过期
wait_for_cache_expiry() {
    local wait_seconds=$1
    print_step "等待缓存过期 ($wait_seconds 秒)..."
    
    for i in $(seq 1 $wait_seconds); do
        printf "\r  等待中... %d/%d 秒" "$i" "$wait_seconds"
        sleep 1
    done
    echo ""
    print_success "缓存应该已过期"
}

# 执行缓存测试
run_cache_test() {
    print_header "开始 POST 请求缓存测试"
    
    # 获取初始后端请求数
    BACKEND_REQUESTS_START=$(get_backend_stats)
    print_info "测试开始时后端请求数: $BACKEND_REQUESTS_START"
    
    # 第一阶段：发送首批请求（应该有1个MISS，其余HIT）
    print_step "第一阶段: 发送前50个请求 (建立缓存 + 命中测试)"
    for i in $(seq 1 50); do
        local status=$(send_post_request $i)
        if [ "$status" != "200" ]; then
            print_warning "请求 #$i 返回状态码: $status"
        fi
        
        # 在前几个请求间稍作延迟，让缓存有时间写入
        if [ $i -le 5 ]; then
            sleep 0.1
        fi
    done
    
    print_success "第一阶段完成: 50 个请求发送完毕"
    
    # 显示阶段性统计
    local backend_requests_mid=$(get_backend_stats)
    print_info "第一阶段后后端请求数: $backend_requests_mid (新增: $((backend_requests_mid - BACKEND_REQUESTS_START)))"
    
    # 等待缓存过期
    wait_for_cache_expiry $((CACHE_TTL + 1))
    
    # 第二阶段：缓存过期后再发送50个请求
    print_step "第二阶段: 发送后50个请求 (缓存过期 + 重建)"
    for i in $(seq 51 100); do
        local status=$(send_post_request $i)
        if [ "$status" != "200" ]; then
            print_warning "请求 #$i 返回状态码: $status"
        fi
        
        # 在缓存重建后的前几个请求间稍作延迟
        if [ $i -le 55 ]; then
            sleep 0.1
        fi
    done
    
    print_success "第二阶段完成: 所有 100 个请求发送完毕"
    
    # 获取最终后端请求数
    BACKEND_REQUESTS_END=$(get_backend_stats)
    
    # 等待一秒确保所有异步操作完成
    sleep 1
}

# 生成测试报告
generate_report() {
    print_header "缓存测试报告"
    
    local avg_time=$((TOTAL_TIME / TOTAL_REQUESTS))
    local cache_hit_rate=$((CACHE_HITS * 100 / TOTAL_REQUESTS))
    local backend_requests_total=$((BACKEND_REQUESTS_END - BACKEND_REQUESTS_START))
    local cache_effectiveness=$((100 - backend_requests_total * 100 / TOTAL_REQUESTS))
    
    echo "📊 请求统计:"
    echo "  • 总请求数:     $TOTAL_REQUESTS"
    echo "  • 缓存命中:     $CACHE_HITS (${cache_hit_rate}%)"
    echo "  • 缓存未命中:   $CACHE_MISSES"
    echo "  • 过期缓存:     $STALE_HITS"
    echo "  • 平均响应时间: ${avg_time}ms"
    echo ""
    echo "🎯 后端统计:"
    echo "  • 测试前请求数: $BACKEND_REQUESTS_START"
    echo "  • 测试后请求数: $BACKEND_REQUESTS_END"
    echo "  • 新增请求数:   $backend_requests_total"
    echo "  • 缓存有效性:   ${cache_effectiveness}%"
    echo ""
    echo "✨ 结果分析:"
    
    if [ $backend_requests_total -le 3 ]; then
        print_success "缓存工作优秀！只有 $backend_requests_total 个请求到达后端"
    elif [ $backend_requests_total -le 10 ]; then
        print_warning "缓存基本工作，但 $backend_requests_total 个请求到达后端（预期 ≤ 3）"
    else
        print_error "缓存未有效工作！$backend_requests_total 个请求到达后端（预期 ≤ 3）"
    fi
    
    if [ $cache_hit_rate -ge 95 ]; then
        print_success "缓存命中率优秀: ${cache_hit_rate}%"
    elif [ $cache_hit_rate -ge 80 ]; then
        print_warning "缓存命中率良好: ${cache_hit_rate}%"
    else
        print_error "缓存命中率较低: ${cache_hit_rate}%"
    fi
    
    if [ $avg_time -lt 100 ]; then
        print_success "平均响应时间优秀: ${avg_time}ms"
    elif [ $avg_time -lt 200 ]; then
        print_warning "平均响应时间良好: ${avg_time}ms"
    else
        print_error "平均响应时间较慢: ${avg_time}ms"
    fi
}

# 主函数
main() {
    print_header "POST 请求缓存测试"
    echo "🎯 测试目标:"
    echo "  • 验证 POST 请求缓存功能"
    echo "  • 测试 ${CACHE_TTL} 秒 TTL 过期机制"
    echo "  • 统计 ${TOTAL_REQUESTS} 个请求的缓存效果"
    echo "  • 确认缓存期间减少后端请求"
    echo ""
    echo "🔧 测试配置:"
    echo "  • 网关地址: $GATEWAY_URL"
    echo "  • 后端地址: $BACKEND_URL"
    echo "  • 测试路径: $TEST_PATH"
    echo "  • 缓存TTL:  ${CACHE_TTL}秒"
    echo ""
    
    # 环境检查
    check_backend_server
    check_gateway
    
    # 重置统计
    reset_backend_stats
    
    # 执行测试
    run_cache_test
    
    # 生成报告
    generate_report
    
    print_header "测试完成"
    print_success "详细的后端请求日志可通过访问 $BACKEND_URL/stats 查看"
}

# 脚本入口
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi