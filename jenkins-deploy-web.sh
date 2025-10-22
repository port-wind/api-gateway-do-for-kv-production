#!/bin/bash

# Jenkins Web 部署脚本 - API Gateway Web 前端
# 只负责 Web 前端的构建和部署

set -e  # 遇到错误立即退出

# 飞书 Webhook URL
LARK_WEBHOOK_URL="https://open.larksuite.com/open-apis/bot/v2/hook/085f7571-9281-4840-92b6-14a382c33ee9"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# 发送飞书通知
send_lark_notification() {
    local message="$1"
    log_info "正在发送飞书通知..."
    
    # 转义消息中的特殊字符，避免 JSON 格式错误
    local escaped_message=$(echo "$message" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | tr '\n' ' ')
    
    local response
    local http_code
    
    # 创建临时 JSON 文件避免 shell 转义问题
    local json_file="/tmp/lark_message_$$.json"
    cat > "$json_file" << EOF
{
    "msg_type": "text",
    "content": {
        "text": "$escaped_message"
    }
}
EOF
    
    response=$(curl -s -w "\n%{http_code}" -X POST "$LARK_WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d @"$json_file")
    
    # 清理临时文件
    rm -f "$json_file"
    
    http_code=$(echo "$response" | tail -n1)
    local response_body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" = "200" ]; then
        log_success "飞书通知发送成功 (HTTP $http_code)"
    else
        log_warning "飞书通知发送失败 (HTTP $http_code)"
        if [ -n "$response_body" ]; then
            log_warning "响应内容: $response_body"
        fi
    fi
}

# 错误处理函数
handle_error() {
    local ERROR_MESSAGE="$1"
    log_error "$ERROR_MESSAGE"
    
    # 发送失败通知到飞书
    local FAIL_MESSAGE="Web 前端部署失败 - 错误: $ERROR_MESSAGE - 构建号: #${BUILD_NUMBER:-unknown} - 触发者: ${BUILD_USER:-unknown}"
    
    send_lark_notification "$FAIL_MESSAGE"
    exit 1
}

# 记录开始时间
BUILD_START_TIME=$(date '+%Y-%m-%d %H:%M:%S')
BUILD_START_TIMESTAMP=$(date +%s)

log_info "========================================="
log_info "API Gateway Web 前端部署开始"
log_info "开始时间: $BUILD_START_TIME"
log_info "构建号: #${BUILD_NUMBER:-local}"
log_info "触发者: ${BUILD_USER:-local}"
log_info "========================================="

# 1. 获取 Git 信息
log_info "获取 Git 提交信息..."
LAST_COMMIT_HASH=$(git log -1 --pretty=format:"%H" | cut -c1-8)
LAST_COMMIT_MESSAGE=$(git log -1 --pretty=format:"%s")
# 使用兼容旧版本 Git 的日期格式（兼容 Git 1.8.x）
LAST_COMMIT_DATE=$(git log -1 --pretty=format:"%ci" | cut -d' ' -f1,2)
LAST_COMMIT_AUTHOR=$(git log -1 --pretty=format:"%an")

log_info "最新提交: $LAST_COMMIT_HASH"
log_info "提交作者: $LAST_COMMIT_AUTHOR"
log_info "提交信息: $LAST_COMMIT_MESSAGE"
log_info "提交时间: $LAST_COMMIT_DATE"

# 发送开始通知
START_MESSAGE="Web 前端部署开始 - 构建号: #${BUILD_NUMBER:-local} - 触发者: ${BUILD_USER:-local} - Commit: $LAST_COMMIT_HASH by $LAST_COMMIT_AUTHOR"

send_lark_notification "$START_MESSAGE"

# 2. 安装依赖
log_info "安装项目依赖..."
if pnpm install --frozen-lockfile; then
    log_success "依赖安装成功"
else
    handle_error "依赖安装失败"
fi

# 3. 运行 Web 前端测试（可选）
if [ "$SKIP_TESTS" != "true" ]; then
    log_info "运行前端代码检查..."
    if pnpm --filter @gateway/web lint; then
        log_success "代码检查通过"
    else
        log_warning "代码检查失败，但继续部署"
    fi
    
    if pnpm --filter @gateway/web typecheck; then
        log_success "类型检查通过"
    else
        handle_error "TypeScript 类型检查失败"
    fi
else
    log_warning "跳过测试（SKIP_TESTS=true）"
fi

# 4. 构建 Web 前端
log_info "构建 Web 前端..."
if pnpm --filter @gateway/web build; then
    log_success "Web 构建成功"
else
    handle_error "Web 构建失败"
fi

# 5. 部署 Web 前端
log_info "部署 Web 前端到服务器..."
RETRY_COUNT=3
DEPLOY_SUCCESS=false

for i in $(seq 1 $RETRY_COUNT); do
    log_info "Web 部署尝试 $i/$RETRY_COUNT"
    
    # 获取当前项目根目录
    PROJECT_ROOT=$(pwd)
    log_info "项目根目录: $PROJECT_ROOT"
    
    # 检查构建产物是否存在
    if [ ! -d "apps/web/dist" ]; then
        log_warning "构建产物目录不存在: apps/web/dist"
        continue
    fi
    
    # 打包构建产物
    log_info "正在打包构建产物..."
    if cd "$PROJECT_ROOT/apps/web/dist" && zip -r "$PROJECT_ROOT/deploy.zip" * && cd "$PROJECT_ROOT"; then
        log_info "构建产物打包成功 -> deploy.zip"
    else
        log_warning "打包失败，尝试下一次重试"
        continue
    fi
    
    # 创建部署目录
    log_info "创建部署目录: /home/www/api-gateway/web"
    if sudo mkdir -p /home/www/api-gateway/web; then
        log_info "部署目录创建成功"
    else
        log_warning "部署目录创建失败"
        continue
    fi
    
    # 移动 ZIP 文件到部署目录
    log_info "移动部署包到目标目录..."
    if sudo cp deploy.zip /home/www/api-gateway/web/; then
        log_info "部署包移动成功"
        rm -f deploy.zip  # 清理本地临时文件
    else
        log_warning "部署包移动失败"
        continue
    fi
    
    # 进入部署目录并解压
    log_info "解压部署包到目标目录..."
    if cd /home/www/api-gateway/web && 
       sudo unzip -o deploy.zip && 
       sudo rm -f deploy.zip && 
       cd "$PROJECT_ROOT"; then
        log_success "Web 部署成功"
        DEPLOY_SUCCESS=true
        break
    else
        log_warning "解压部署包失败"
        cd "$PROJECT_ROOT"  # 确保回到项目目录
    fi
    
    if [ $i -lt $RETRY_COUNT ]; then
        log_warning "Web 部署失败，等待 10 秒后重试..."
        sleep 10
    fi
done

if [ "$DEPLOY_SUCCESS" = "false" ]; then
    handle_error "Web 部署失败（已重试 $RETRY_COUNT 次）"
fi

# 验证部署结果
log_info "验证部署结果..."
if [ -f "/home/www/api-gateway/web/index.html" ]; then
    log_success "部署验证成功：index.html 存在于目标目录"
    file_count=$(sudo find /home/www/api-gateway/web -type f | wc -l)
    log_info "部署文件总数: $file_count"
else
    log_warning "部署验证失败：未找到 index.html"
fi

# 6. 计算部署耗时
BUILD_END_TIME=$(date '+%Y-%m-%d %H:%M:%S')
BUILD_END_TIMESTAMP=$(date +%s)
BUILD_DURATION=$((BUILD_END_TIMESTAMP - BUILD_START_TIMESTAMP))
MINUTES=$((BUILD_DURATION / 60))
SECONDS=$((BUILD_DURATION % 60))

log_info "========================================="
log_success "Web 前端部署完成！"
log_info "结束时间: $BUILD_END_TIME"
log_info "总耗时: ${MINUTES}分${SECONDS}秒"
log_info "========================================="

# 7. 发送成功通知
SUCCESS_MESSAGE="Web 前端部署成功 - 构建号: #${BUILD_NUMBER:-local} - 触发者: ${BUILD_USER:-local} - Commit: $LAST_COMMIT_HASH - 耗时: ${MINUTES}分${SECONDS}秒"

send_lark_notification "$SUCCESS_MESSAGE"

log_success "Web 前端部署流程完成！"

exit 0