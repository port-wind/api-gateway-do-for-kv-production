#!/bin/bash

# 代理服务问题诊断脚本
# 用于快速验证是否是代理服务的问题

set -e

# 配置
PROXY_URL="https://api-proxy.pwtk.cc"
ADMIN_URL="$PROXY_URL/api/admin"
TEST_PATH="/biz-client/biz/search/topic/query"
TARGET_URL="$PROXY_URL$TEST_PATH"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# 日志目录
LOG_DIR="./logs/diagnose"
mkdir -p "$LOG_DIR"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="$LOG_DIR/proxy_diagnosis_$TIMESTAMP.log"

# 帮助信息
show_help() {
    echo -e "${BLUE}🔍 代理服务诊断工具${NC}"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --help          显示此帮助信息"
    echo "  -u, --url URL       指定代理服务URL（默认: $PROXY_URL）"
    echo "  -p, --path PATH     指定测试路径（默认: $TEST_PATH）"
    echo "  -b, --backend URL   指定后端服务URL用于直连对比"
    echo "  -t, --token TOKEN   指定用户token"
    echo "  --quick             快速诊断模式"
    echo "  --full              完整诊断模式"
    echo ""
    echo "示例:"
    echo "  $0 --quick                                    # 快速诊断"
    echo "  $0 --full --backend https://backend.api.com  # 完整对比诊断"
    echo "  $0 --token eyJhbGci...                        # 使用特定token"
}

# 日志函数
log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

log_raw() {
    echo "$1" | tee -a "$LOG_FILE"
}

print_header() {
    log ""
    log "${BLUE}================================${NC}"
    log "${BLUE} $1${NC}"
    log "${BLUE}================================${NC}"
}

print_step() {
    log "${CYAN}▶ $1${NC}"
}

print_success() {
    log "${GREEN}✅ $1${NC}"
}

print_warning() {
    log "${YELLOW}⚠️ $1${NC}"
}

print_error() {
    log "${RED}❌ $1${NC}"
}

print_info() {
    log "${PURPLE}ℹ️ $1${NC}"
}

# 检查必要工具
check_dependencies() {
    print_step "检查必要工具..."
    
    local missing_tools=()
    
    command -v curl >/dev/null 2>&1 || missing_tools+=("curl")
    command -v jq >/dev/null 2>&1 || missing_tools+=("jq")
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        print_error "缺少必要工具: ${missing_tools[*]}"
        print_info "请安装: brew install ${missing_tools[*]}"
        exit 1
    fi
    
    print_success "依赖检查通过"
}

# 代理服务健康检查
check_proxy_health() {
    print_step "检查代理服务健康状态..."
    
    local health_response
    local health_status
    
    # 检查基本连通性
    if ! curl -s --max-time 10 "$PROXY_URL/health" > /dev/null 2>&1; then
        print_error "无法连接到代理服务: $PROXY_URL"
        print_info "可能原因: 网络问题、服务宕机、DNS解析问题"
        return 1
    fi
    
    # 获取健康状态
    health_response=$(curl -s --max-time 10 "$PROXY_URL/health" 2>/dev/null || echo '{}')
    health_status=$(echo "$health_response" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
    
    log_raw "Health Response: $health_response"
    
    if [ "$health_status" = "healthy" ]; then
        print_success "代理服务运行正常"
        
        # 显示服务信息
        local version=$(echo "$health_response" | jq -r '.version // "unknown"' 2>/dev/null)
        local uptime=$(echo "$health_response" | jq -r '.uptime // "unknown"' 2>/dev/null)
        print_info "版本: $version"
        print_info "运行时长: $uptime"
    else
        print_warning "代理服务状态异常: $health_status"
    fi
}

# 检查管理接口
check_admin_api() {
    print_step "检查管理接口..."
    
    # 检查路径配置
    local path_encoded=$(echo "$TEST_PATH" | sed 's|/|%2F|g')
    local path_config_url="$ADMIN_URL/paths/$path_encoded"
    
    print_info "检查路径配置: $path_config_url"
    
    local path_response=$(curl -s --max-time 10 "$path_config_url" 2>/dev/null || echo '{}')
    local path_success=$(echo "$path_response" | jq -r '.success // false' 2>/dev/null)
    
    if [ "$path_success" = "true" ]; then
        print_success "找到路径配置"
        
        # 显示路径配置信息
        local cache_enabled=$(echo "$path_response" | jq -r '.data.cache.enabled // false' 2>/dev/null)
        local rate_limit_enabled=$(echo "$path_response" | jq -r '.data.rateLimit.enabled // false' 2>/dev/null)
        local geo_enabled=$(echo "$path_response" | jq -r '.data.geo.enabled // false' 2>/dev/null)
        
        print_info "缓存: $cache_enabled"
        print_info "限流: $rate_limit_enabled"
        print_info "地域限制: $geo_enabled"
        
        log_raw "Path Config: $path_response"
    else
        print_warning "未找到特定路径配置，可能使用默认配置"
    fi
    
    # 检查代理路由配置
    print_info "检查代理路由配置..."
    local proxy_routes=$(curl -s --max-time 10 "$ADMIN_URL/proxy-routes" 2>/dev/null || echo '{}')
    local routes_count=$(echo "$proxy_routes" | jq -r '.data | length' 2>/dev/null || echo "0")
    
    print_info "配置的代理路由数量: $routes_count"
    
    # 查找匹配的路由
    if [ "$routes_count" -gt "0" ]; then
        local matching_route=$(echo "$proxy_routes" | jq -r ".data[] | select(.pattern | test(\"$(echo "$TEST_PATH" | sed 's|/|\\/|g')\")) | .target" 2>/dev/null || echo "")
        if [ -n "$matching_route" ]; then
            print_success "找到匹配的代理路由目标: $matching_route"
            echo "BACKEND_TARGET=$matching_route" >> "$LOG_FILE"
        else
            print_warning "未找到匹配的代理路由"
        fi
    fi
}

# 执行代理请求测试
test_proxy_request() {
    local token="$1"
    print_step "测试通过代理的请求..."
    
    local headers=(
        'accept: application/json, text/plain, */*'
        'accept-language: en,en-US;q=0.9,zh-CN;q=0.8,zh;q=0.7,ja;q=0.6'
        'businesstype: XTK'
        'cid: 7376843548198440960.1.88fb130b6c541d26cceb9b79066b2b22b9aba357'
        'clienttype: C_WEB'
        'content-type: application/json'
        'origin: https://demo.pwtk.cc'
        'priority: u=1, i'
        'referer: https://demo.pwtk.cc/'
        'sec-ch-ua: "Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"'
        'sec-ch-ua-mobile: ?0'
        'sec-ch-ua-platform: "macOS"'
        'sec-fetch-dest: empty'
        'sec-fetch-mode: cors'
        'sec-fetch-site: same-site'
        'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
    )
    
    # 添加token头（如果提供）
    if [ -n "$token" ]; then
        headers+=("token: $token")
    fi
    
    # 构建curl命令
    local curl_cmd="curl -v -w '\n\nTiming Info:\ntime_total: %{time_total}\ntime_connect: %{time_connect}\ntime_starttransfer: %{time_starttransfer}\nhttp_code: %{http_code}\nsize_download: %{size_download}\n'"
    
    for header in "${headers[@]}"; do
        curl_cmd="$curl_cmd -H '$header'"
    done
    
    curl_cmd="$curl_cmd --data-raw '{}' '$TARGET_URL'"
    
    print_info "执行请求: $TARGET_URL"
    
    local start_time=$(date +%s.%N)
    local response_file="$LOG_DIR/proxy_response_$TIMESTAMP.txt"
    
    # 执行请求并捕获详细信息
    eval "$curl_cmd" > "$response_file" 2>&1
    local curl_exit_code=$?
    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc -l 2>/dev/null || echo "unknown")
    
    log_raw ""
    log_raw "=== PROXY REQUEST DETAILS ==="
    log_raw "Command: $curl_cmd"
    log_raw "Exit Code: $curl_exit_code"
    log_raw "Duration: ${duration}s"
    log_raw "Response saved to: $response_file"
    log_raw ""
    
    # 分析响应
    if [ $curl_exit_code -eq 0 ]; then
        print_success "请求执行成功"
        
        # 提取关键信息
        local http_code=$(grep "http_code:" "$response_file" | awk '{print $2}' || echo "unknown")
        local total_time=$(grep "time_total:" "$response_file" | awk '{print $2}' || echo "unknown")
        local size_download=$(grep "size_download:" "$response_file" | awk '{print $2}' || echo "unknown")
        
        print_info "HTTP状态码: $http_code"
        print_info "总耗时: ${total_time}s"
        print_info "下载大小: ${size_download} bytes"
        
        # 检查响应内容
        if grep -q "HTTP/" "$response_file"; then
            local response_headers=$(sed -n '/^HTTP/,/^\s*$/p' "$response_file")
            local response_body=$(sed -n '/^\s*$/,$p' "$response_file" | tail -n +2 | sed '/^Timing Info:/,$d')
            
            log_raw "Response Headers:"
            log_raw "$response_headers"
            log_raw ""
            log_raw "Response Body:"
            log_raw "$response_body"
            
            # 分析常见问题
            if [ "$http_code" = "404" ]; then
                print_error "404错误 - 路径未找到或代理配置错误"
            elif [ "$http_code" = "502" ]; then
                print_error "502错误 - 后端服务不可用"
            elif [ "$http_code" = "503" ]; then
                print_error "503错误 - 服务暂时不可用"
            elif [ "$http_code" = "429" ]; then
                print_error "429错误 - 请求过于频繁（限流）"
            elif [ "$http_code" = "403" ]; then
                print_error "403错误 - 请求被拒绝（可能是地域限制）"
            elif [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
                print_success "请求成功 (HTTP $http_code)"
            else
                print_warning "请求返回状态码: $http_code"
            fi
            
            # 检查响应体中的错误信息
            if echo "$response_body" | jq -r '.error' 2>/dev/null | grep -q -v "null"; then
                local error_msg=$(echo "$response_body" | jq -r '.error' 2>/dev/null)
                print_error "响应包含错误信息: $error_msg"
            fi
        fi
    else
        print_error "请求执行失败 (退出码: $curl_exit_code)"
        
        # 分析常见的curl错误
        case $curl_exit_code in
            6)
                print_error "无法解析主机名"
                ;;
            7)
                print_error "无法连接到服务器"
                ;;
            28)
                print_error "请求超时"
                ;;
            35)
                print_error "SSL连接错误"
                ;;
            *)
                print_error "curl错误码: $curl_exit_code"
                ;;
        esac
    fi
}

# 测试后端直连（如果提供后端URL）
test_backend_direct() {
    local backend_url="$1"
    local token="$2"
    
    if [ -z "$backend_url" ]; then
        return 0
    fi
    
    print_step "测试后端直连..."
    print_info "后端URL: $backend_url$TEST_PATH"
    
    local headers=(
        'accept: application/json, text/plain, */*'
        'content-type: application/json'
        'user-agent: ProxyDiagnosis/1.0'
    )
    
    if [ -n "$token" ]; then
        headers+=("token: $token")
    fi
    
    local curl_cmd="curl -v -w '\n\nBackend Timing:\ntime_total: %{time_total}\nhttp_code: %{http_code}\n'"
    
    for header in "${headers[@]}"; do
        curl_cmd="$curl_cmd -H '$header'"
    done
    
    curl_cmd="$curl_cmd --data-raw '{}' '$backend_url$TEST_PATH'"
    
    local backend_response_file="$LOG_DIR/backend_response_$TIMESTAMP.txt"
    local start_time=$(date +%s.%N)
    
    eval "$curl_cmd" > "$backend_response_file" 2>&1
    local curl_exit_code=$?
    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc -l 2>/dev/null || echo "unknown")
    
    log_raw ""
    log_raw "=== BACKEND DIRECT REQUEST DETAILS ==="
    log_raw "Command: $curl_cmd"
    log_raw "Exit Code: $curl_exit_code"
    log_raw "Duration: ${duration}s"
    log_raw "Response saved to: $backend_response_file"
    log_raw ""
    
    if [ $curl_exit_code -eq 0 ]; then
        local backend_http_code=$(grep "http_code:" "$backend_response_file" | awk '{print $2}' || echo "unknown")
        local backend_time=$(grep "time_total:" "$backend_response_file" | awk '{print $2}' || echo "unknown")
        
        print_success "后端直连成功"
        print_info "后端状态码: $backend_http_code"
        print_info "后端耗时: ${backend_time}s"
        
        # 对比分析将在生成报告时进行
    else
        print_error "后端直连失败 (退出码: $curl_exit_code)"
        print_warning "这可能表明问题出在后端服务而非代理"
    fi
}

# 生成诊断报告
generate_report() {
    print_header "诊断报告生成"
    
    local report_file="$LOG_DIR/diagnosis_report_$TIMESTAMP.md"
    
    cat > "$report_file" << EOF
# 代理服务诊断报告

**诊断时间**: $(date)
**代理URL**: $PROXY_URL
**测试路径**: $TEST_PATH
**日志文件**: $LOG_FILE

## 摘要

EOF
    
    # 分析日志并生成摘要
    if grep -q "✅ 代理服务运行正常" "$LOG_FILE"; then
        echo "- ✅ 代理服务健康检查通过" >> "$report_file"
    else
        echo "- ❌ 代理服务健康检查失败" >> "$report_file"
    fi
    
    if grep -q "✅ 请求成功" "$LOG_FILE"; then
        echo "- ✅ 请求通过代理执行成功" >> "$report_file"
    else
        echo "- ❌ 请求通过代理执行失败" >> "$report_file"
    fi
    
    cat >> "$report_file" << EOF

## 详细信息

查看完整日志: \`$LOG_FILE\`

## 建议操作

EOF
    
    # 基于诊断结果提供建议
    if grep -q "❌" "$LOG_FILE"; then
        cat >> "$report_file" << EOF
基于诊断结果，建议进行以下操作：

1. **检查代理服务状态**
   - 确认服务是否正常运行
   - 查看服务日志是否有错误信息

2. **验证配置**
   - 检查代理路由配置
   - 确认路径匹配规则
   - 验证后端目标地址

3. **网络连通性**
   - 测试网络连接
   - 检查DNS解析
   - 验证防火墙规则

4. **后端服务**
   - 直接测试后端服务
   - 确认后端服务健康状态

EOF
    else
        cat >> "$report_file" << EOF
诊断结果显示代理服务工作正常。如果用户仍然遇到问题，建议：

1. 收集用户的详细错误信息
2. 检查特定时间段的服务日志
3. 验证用户网络环境

EOF
    fi
    
    print_success "诊断报告已生成: $report_file"
}

# 主函数
main() {
    local backend_url=""
    local user_token=""
    local mode="quick"
    
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -u|--url)
                PROXY_URL="$2"
                ADMIN_URL="$PROXY_URL/api/admin"
                TARGET_URL="$PROXY_URL$TEST_PATH"
                shift 2
                ;;
            -p|--path)
                TEST_PATH="$2"
                TARGET_URL="$PROXY_URL$TEST_PATH"
                shift 2
                ;;
            -b|--backend)
                backend_url="$2"
                shift 2
                ;;
            -t|--token)
                user_token="$2"
                shift 2
                ;;
            --quick)
                mode="quick"
                shift
                ;;
            --full)
                mode="full"
                shift
                ;;
            *)
                echo "未知参数: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    print_header "代理服务诊断开始"
    
    log "诊断配置:"
    log "- 代理URL: $PROXY_URL"
    log "- 测试路径: $TEST_PATH"
    log "- 后端URL: ${backend_url:-'未指定'}"
    log "- 诊断模式: $mode"
    log "- 日志文件: $LOG_FILE"
    
    # 执行诊断步骤
    check_dependencies
    
    check_proxy_health
    
    if [ "$mode" = "full" ]; then
        check_admin_api
    fi
    
    test_proxy_request "$user_token"
    
    if [ "$mode" = "full" ] && [ -n "$backend_url" ]; then
        test_backend_direct "$backend_url" "$user_token"
    fi
    
    generate_report
    
    print_header "诊断完成"
    print_success "详细日志: $LOG_FILE"
    print_success "诊断报告: $LOG_DIR/diagnosis_report_$TIMESTAMP.md"
    
    # 显示快速结论
    if grep -q "✅ 请求成功" "$LOG_FILE"; then
        print_success "结论: 代理服务工作正常，问题可能在其他地方"
    else
        print_error "结论: 检测到代理服务问题，需要进一步排查"
    fi
}

# 如果脚本被直接执行
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi