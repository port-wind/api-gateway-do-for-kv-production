#!/bin/bash

# 缓存测试环境配置脚本
# 自动配置测试所需的代理路由和缓存设置

set -e

# 默认配置
GATEWAY_URL="${1:-http://localhost:8787}"
BACKEND_URL="${2:-http://localhost:3001}"
TEST_PATH="/api/test"
CACHE_TTL=60
ADMIN_API_KEY="${ADMIN_API_KEY:-}"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 工具函数
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

# 检查网关连接
check_gateway() {
    print_step "检查 API 网关连接..."
    local response=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/health" || echo "000")
    if [ "$response" != "200" ]; then
        print_error "无法连接到 API 网关 ($GATEWAY_URL)"
        print_info "请确保网关正在运行: npm run dev (在 apps/api 目录下)"
        exit 1
    fi
    print_success "API 网关连接正常"
}

# 检查后端服务
check_backend() {
    print_step "检查后端模拟服务器..."
    if curl -s "$BACKEND_URL/stats" > /dev/null 2>&1; then
        print_success "后端服务器运行正常"
        return 0
    else
        print_warning "后端服务器未运行"
        return 1
    fi
}

# 启动后端服务器
start_backend() {
    print_step "启动后端模拟服务器..."
    
    # 检查是否已经有进程在运行
    if pgrep -f "mock-backend-server.js" > /dev/null; then
        print_warning "后端服务器已在运行"
        return 0
    fi

    # 启动后端服务器
    if [ -f "scripts/mock-backend-server.js" ]; then
        nohup node scripts/mock-backend-server.js > backend-server.log 2>&1 &
        local backend_pid=$!
        echo $backend_pid > backend-server.pid
        
        # 等待服务器启动
        sleep 2
        
        if check_backend; then
            print_success "后端服务器启动成功 (PID: $backend_pid)"
            return 0
        else
            print_error "后端服务器启动失败"
            return 1
        fi
    else
        print_error "找不到后端服务器脚本: scripts/mock-backend-server.js"
        return 1
    fi
}

# 发送管理员API请求
admin_api_request() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    
    local headers=()
    headers+=("-H" "Content-Type: application/json")
    
    if [ -n "$ADMIN_API_KEY" ]; then
        headers+=("-H" "Authorization: Bearer $ADMIN_API_KEY")
    fi
    
    if [ -n "$data" ]; then
        curl -s -X "$method" "${headers[@]}" -d "$data" "$GATEWAY_URL$endpoint"
    else
        curl -s -X "$method" "${headers[@]}" "$GATEWAY_URL$endpoint"
    fi
}

# 配置全局缓存
configure_global_cache() {
    print_step "配置全局缓存设置..."
    
    local cache_config='{
        "enabled": true,
        "defaultTtl": 300,
        "version": 1
    }'
    
    local response=$(admin_api_request "PUT" "/api/admin/cache/config" "$cache_config")
    
    if echo "$response" | grep -q '"success".*true'; then
        print_success "全局缓存配置成功"
        return 0
    else
        print_warning "全局缓存配置可能失败，继续执行..."
        return 0  # 不中断执行
    fi
}

# 配置测试代理路由
configure_proxy_route() {
    print_step "配置测试代理路由..."
    
    # 首先获取现有路由，检查是否已存在
    local existing_routes=$(admin_api_request "GET" "/api/admin/proxy-routes")
    
    if echo "$existing_routes" | grep -q "\"pattern\":\"$TEST_PATH\\*\""; then
        print_warning "测试路由已存在，跳过创建"
    else
        local route_config='{
            "pattern": "'$TEST_PATH'*",
            "target": "'$BACKEND_URL'",
            "enabled": true,
            "priority": 1,
            "stripPrefix": false,
            "cacheEnabled": true,
            "rateLimitEnabled": false,
            "geoEnabled": false
        }'
        
        local response=$(admin_api_request "POST" "/api/admin/proxy-routes" "$route_config")
        
        if echo "$response" | grep -q '"success".*true\|"id"'; then
            print_success "测试代理路由配置成功"
        else
            print_warning "代理路由配置可能失败: $response"
        fi
    fi
}

# 配置路径缓存
configure_path_cache() {
    print_step "配置测试路径缓存..."
    
    # URL encode the path
    local encoded_path=$(echo "$TEST_PATH" | sed 's|/|%2F|g')
    
    local path_config='{
        "cache": {
            "enabled": true,
            "ttl": '$CACHE_TTL',
            "version": 1
        }
    }'
    
    local response=$(admin_api_request "PUT" "/api/admin/paths/$encoded_path" "$path_config")
    
    if echo "$response" | grep -q '"success".*true'; then
        print_success "路径缓存配置成功 (TTL: ${CACHE_TTL}秒)"
    else
        print_warning "路径缓存配置可能失败: $response"
    fi
}

# 验证配置
verify_configuration() {
    print_step "验证配置..."
    
    # 测试基本代理功能
    print_info "测试基本代理功能..."
    local test_response=$(curl -s -w "%{http_code}" -o /dev/null \
        -X POST \
        -H "Content-Type: application/json" \
        -d '{"test": true}' \
        "$GATEWAY_URL$TEST_PATH" || echo "000")
    
    if [ "$test_response" = "200" ]; then
        print_success "代理功能正常"
    else
        print_error "代理功能异常 (状态码: $test_response)"
        return 1
    fi
    
    # 检查缓存头
    print_info "检查缓存响应头..."
    local cache_headers=$(curl -s -I -X POST \
        -H "Content-Type: application/json" \
        -d '{"test": true}' \
        "$GATEWAY_URL$TEST_PATH" | grep -i "x-cache")
    
    if [ -n "$cache_headers" ]; then
        print_success "缓存头信息正常:"
        echo "$cache_headers" | sed 's/^/    /'
    else
        print_warning "未检测到缓存头，配置可能未生效"
    fi
    
    return 0
}

# 清理测试配置
cleanup_test_config() {
    print_step "清理测试配置..."
    
    # 清除路径缓存配置
    local encoded_path=$(echo "$TEST_PATH" | sed 's|/|%2F|g')
    admin_api_request "DELETE" "/api/admin/paths/$encoded_path" > /dev/null || true
    
    # 获取并删除测试代理路由
    local routes=$(admin_api_request "GET" "/api/admin/proxy-routes")
    if echo "$routes" | grep -q "\"pattern\":\"$TEST_PATH\\*\""; then
        local route_id=$(echo "$routes" | grep -A5 -B5 "\"pattern\":\"$TEST_PATH\\*\"" | grep '"id"' | cut -d'"' -f4 | head -1)
        if [ -n "$route_id" ]; then
            admin_api_request "DELETE" "/api/admin/proxy-routes/$route_id" > /dev/null || true
        fi
    fi
    
    print_success "测试配置清理完成"
}

# 停止后端服务器
stop_backend() {
    print_step "停止后端服务器..."
    
    if [ -f "backend-server.pid" ]; then
        local pid=$(cat backend-server.pid)
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
            rm -f backend-server.pid
            print_success "后端服务器已停止"
        else
            print_warning "后端服务器进程不存在"
            rm -f backend-server.pid
        fi
    else
        # 尝试通过进程名停止
        if pkill -f "mock-backend-server.js"; then
            print_success "后端服务器已停止"
        else
            print_warning "未找到运行中的后端服务器"
        fi
    fi
}

# 显示配置信息
show_configuration() {
    print_header "缓存测试配置信息"
    echo "🔧 配置参数:"
    echo "  • 网关地址:   $GATEWAY_URL"
    echo "  • 后端地址:   $BACKEND_URL"
    echo "  • 测试路径:   $TEST_PATH"
    echo "  • 缓存TTL:    ${CACHE_TTL}秒"
    echo ""
    echo "📋 配置项目:"
    echo "  • 全局缓存:   启用 (默认TTL: 300秒)"
    echo "  • 代理路由:   $TEST_PATH* -> $BACKEND_URL (cacheEnabled: true)"
    echo "  • 路径缓存:   $TEST_PATH (TTL: ${CACHE_TTL}秒, 优先级最高)"
    echo ""
    echo "🧪 测试命令:"
    echo "  • 执行缓存测试:     ./scripts/test-cache-post.sh"
    echo "  • 生成详细报告:     node scripts/cache-test-report.js"
    echo "  • 检查后端统计:     curl $BACKEND_URL/stats"
    echo "  • 重置后端统计:     curl -X POST $BACKEND_URL/reset"
}

# 使用说明
show_usage() {
    echo "缓存测试环境配置脚本"
    echo ""
    echo "用法:"
    echo "  $0 [GATEWAY_URL] [BACKEND_URL]"
    echo ""
    echo "参数:"
    echo "  GATEWAY_URL    API网关地址 (默认: http://localhost:8787)"
    echo "  BACKEND_URL    后端服务地址 (默认: http://localhost:3001)"
    echo ""
    echo "环境变量:"
    echo "  ADMIN_API_KEY  管理员API密钥 (可选)"
    echo ""
    echo "操作模式:"
    echo "  setup          配置测试环境 (默认)"
    echo "  cleanup        清理测试配置"
    echo "  start-backend  启动后端服务器"
    echo "  stop-backend   停止后端服务器"
    echo "  verify         验证配置"
    echo "  show           显示配置信息"
    echo ""
    echo "示例:"
    echo "  $0 setup"
    echo "  $0 cleanup"
    echo "  $0 show"
}

# 主函数
main() {
    local command="${3:-setup}"
    
    case "$command" in
        "setup")
            print_header "缓存测试环境配置"
            check_gateway
            
            if ! check_backend; then
                start_backend
            fi
            
            configure_global_cache
            configure_proxy_route
            configure_path_cache
            verify_configuration
            show_configuration
            
            print_header "配置完成"
            print_success "缓存测试环境已准备就绪!"
            print_info "现在可以运行: ./scripts/test-cache-post.sh"
            ;;
            
        "cleanup")
            print_header "清理测试配置"
            check_gateway
            cleanup_test_config
            stop_backend
            print_success "测试环境清理完成"
            ;;
            
        "start-backend")
            start_backend
            ;;
            
        "stop-backend")
            stop_backend
            ;;
            
        "verify")
            check_gateway
            verify_configuration
            ;;
            
        "show")
            show_configuration
            ;;
            
        "help"|"-h"|"--help")
            show_usage
            ;;
            
        *)
            print_error "未知命令: $command"
            show_usage
            exit 1
            ;;
    esac
}

# 脚本入口
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi