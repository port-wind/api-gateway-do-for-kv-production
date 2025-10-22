#!/bin/bash

# API Gateway 部署脚本
# 用法: bash deploy.sh [--skip-nvm] [--only-web] [--only-api]

# 配置参数
REPO_URL="https://sg-git.pwtk.cc/pp/api-gateway-do-for-kv.git"
APP_DIR="/srv/api-proxy-admin-web"
LOG_DIR="$APP_DIR/logs"
WEB_DEPLOY_DIR="/srv/api-proxy-admin-web/web"
NODE_ENV="production"
NODE_VERSION="18"

# 飞书 Webhook URL
LARK_WEBHOOK_URL="https://open.larksuite.com/open-apis/bot/v2/hook/085f7571-9281-4840-92b6-14a382c33ee9"

# 解析命令行参数
SKIP_NVM=false
ONLY_WEB=false
ONLY_API=false

for arg in "$@"; do
  case $arg in
    --skip-nvm) SKIP_NVM=true ;;
    --only-web) ONLY_WEB=true ;;
    --only-api) ONLY_API=true ;;
  esac
done

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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
    local FAIL_MESSAGE="API Gateway 部署失败 - 错误: $ERROR_MESSAGE - 时间: $(date '+%Y-%m-%d %H:%M:%S')"
    send_lark_notification "$FAIL_MESSAGE"
    exit 1
}

echo "==============================================="
echo "API Gateway 项目部署脚本 - $(date)"
echo "==============================================="

# 检查依赖
check_dependencies() {
    log_info "🔍 检查依赖..."
    
    # 检查基本工具
    command -v git &>/dev/null || { 
        log_warning "安装 Git..."
        sudo apt-get update && sudo apt-get install -y git || handle_error "Git 安装失败"
    }
    
    command -v curl &>/dev/null || { 
        log_warning "安装 curl..."
        sudo apt-get update && sudo apt-get install -y curl || handle_error "curl 安装失败"
    }
    
    command -v zip &>/dev/null || { 
        log_warning "安装 zip..."
        sudo apt-get update && sudo apt-get install -y zip unzip || handle_error "zip 安装失败"
    }
    
    log_success "依赖检查完成"
}

# 设置 Node.js 环境
setup_node() {
    if [ "$SKIP_NVM" = true ]; then
        log_info "⏩ 跳过 NVM 安装"
        return
    fi

    log_info "🔧 设置 NVM 和 Node.js..."

    # 安装 NVM
    if [ ! -d "$HOME/.nvm" ]; then
        log_info "安装 NVM..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash || handle_error "NVM 安装失败"
    fi

    # 加载 NVM
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

    # 安装 Node.js
    nvm install $NODE_VERSION || handle_error "Node.js 安装失败"
    nvm use $NODE_VERSION || handle_error "Node.js 切换失败"

    # 安装全局包
    command -v pnpm &>/dev/null || {
        log_info "安装 pnpm..."
        npm install -g pnpm || handle_error "pnpm 安装失败"
    }
    
    # 检查是否需要安装 wrangler
    if [ "$ONLY_WEB" != true ]; then
        command -v wrangler &>/dev/null || {
            log_info "安装 wrangler..."
            npm install -g wrangler || handle_error "wrangler 安装失败"
        }
    fi
    
    log_success "Node.js 环境设置完成"
}

# 设置代码
setup_code() {
    log_info "🔄 设置项目代码..."
    
    if [ -d "$APP_DIR" ]; then
        if [ -d "$APP_DIR/.git" ]; then
            log_info "更新现有 Git 仓库..."
            cd "$APP_DIR"
            git fetch origin || handle_error "Git fetch 失败"
            git reset --hard origin/main || handle_error "Git reset 失败"
            git clean -fd
        else
            log_warning "目录存在但不是 Git 仓库，备份并重新克隆..."
            backup_dir="$APP_DIR.backup.$(date +%Y%m%d%H%M%S)"
            sudo mv "$APP_DIR" "$backup_dir"
            log_info "旧目录已备份到: $backup_dir"
            
            # 创建新目录并克隆
            sudo mkdir -p "$APP_DIR"
            sudo chown $(whoami) "$APP_DIR"
            git clone "$REPO_URL" "$APP_DIR" || handle_error "代码克隆失败"
            cd "$APP_DIR"
        fi
    else
        log_info "创建新目录并克隆代码..."
        sudo mkdir -p "$APP_DIR"
        sudo chown $(whoami) "$APP_DIR"
        git clone "$REPO_URL" "$APP_DIR" || handle_error "代码克隆失败"
        cd "$APP_DIR"
    fi
    
    log_success "代码设置完成"
}

# 创建必要目录
create_directories() {
    log_info "📁 创建必要目录..."
    mkdir -p "$LOG_DIR"
    sudo mkdir -p "$WEB_DEPLOY_DIR"
    log_success "目录创建完成"
}

# 安装依赖
install_dependencies() {
    log_info "📦 安装项目依赖..."
    cd "$APP_DIR"
    
    if pnpm install --frozen-lockfile; then
        log_success "依赖安装成功"
    else
        handle_error "依赖安装失败"
    fi
}

# 部署 API
deploy_api() {
    if [ "$ONLY_WEB" = true ]; then
        log_info "⏩ 跳过 API 部署"
        return
    fi
    
    log_info "🚀 部署 API 到 Cloudflare Workers..."
    cd "$APP_DIR"
    
    # 检查 wrangler.toml 是否存在
    if [ ! -f "apps/api/wrangler.toml" ]; then
        handle_error "wrangler.toml 配置文件不存在"
    fi
    
    # 部署 API
    if pnpm deploy:api; then
        log_success "API 部署成功"
    else
        handle_error "API 部署失败"
    fi
}

# 构建和部署 Web
deploy_web() {
    if [ "$ONLY_API" = true ]; then
        log_info "⏩ 跳过 Web 部署"
        return
    fi
    
    log_info "🌐 构建和部署 Web 前端..."
    cd "$APP_DIR"
    
    # 代码检查
    log_info "运行前端代码检查..."
    if pnpm --filter @gateway/web lint; then
        log_success "代码检查通过"
    else
        log_warning "代码检查失败，但继续部署"
    fi
    
    # 构建
    log_info "构建 Web 前端..."
    if pnpm --filter @gateway/web build; then
        log_success "Web 构建成功"
    else
        handle_error "Web 构建失败"
    fi
    
    # 部署
    log_info "部署 Web 前端到服务器..."
    PROJECT_ROOT=$(pwd)
    
    # 检查构建产物是否存在
    if [ ! -d "apps/web/dist" ]; then
        handle_error "构建产物目录不存在: apps/web/dist"
    fi
    
    # 打包构建产物
    log_info "正在打包构建产物..."
    if cd "$PROJECT_ROOT/apps/web/dist" && zip -r "$PROJECT_ROOT/deploy.zip" * && cd "$PROJECT_ROOT"; then
        log_info "构建产物打包成功 -> deploy.zip"
    else
        handle_error "打包失败"
    fi
    
    # 部署到目标目录
    log_info "部署到目标目录: $WEB_DEPLOY_DIR"
    if sudo cp deploy.zip "$WEB_DEPLOY_DIR/" && 
       cd "$WEB_DEPLOY_DIR" && 
       sudo unzip -o deploy.zip && 
       sudo rm -f deploy.zip && 
       cd "$PROJECT_ROOT"; then
        rm -f deploy.zip  # 清理本地临时文件
        log_success "Web 部署成功"
    else
        handle_error "Web 部署失败"
    fi
}

# 验证部署
verify_deployment() {
    log_info "🔍 验证部署结果..."
    
    local verification_failed=false
    
    # 验证 Web 部署
    if [ "$ONLY_API" != true ]; then
        if [ -f "$WEB_DEPLOY_DIR/index.html" ]; then
            file_count=$(sudo find "$WEB_DEPLOY_DIR" -type f | wc -l)
            log_success "Web 部署验证成功：index.html 存在，共 $file_count 个文件"
        else
            log_error "Web 部署验证失败：未找到 index.html"
            verification_failed=true
        fi
    fi
    
    # 验证 API 部署（这里可以添加 API 健康检查）
    if [ "$ONLY_WEB" != true ]; then
        log_info "API 部署已完成（Cloudflare Workers）"
    fi
    
    if [ "$verification_failed" = true ]; then
        handle_error "部署验证失败"
    fi
}

# 显示部署摘要
show_summary() {
    local deploy_end_time=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo "==============================================="
    log_success "✅ API Gateway 部署完成!"
    echo "==============================================="
    
    if [ "$ONLY_API" != true ]; then
        echo "🌐 Web 管理后台: $WEB_DEPLOY_DIR"
    fi
    
    if [ "$ONLY_WEB" != true ]; then
        echo "🚀 API 服务: Cloudflare Workers"
    fi
    
    echo "📁 应用目录: $APP_DIR"
    echo "📂 日志目录: $LOG_DIR"
    echo "⏰ 完成时间: $deploy_end_time"
    echo "==============================================="
}

# 主函数
main() {
    # 记录开始时间
    local deploy_start_time=$(date '+%Y-%m-%d %H:%M:%S')
    local deploy_start_timestamp=$(date +%s)
    
    # 获取 Git 信息
    if [ -d "$APP_DIR/.git" ]; then
        cd "$APP_DIR"
        local commit_hash=$(git log -1 --pretty=format:"%H" | cut -c1-8)
        local commit_author=$(git log -1 --pretty=format:"%an")
        local commit_message=$(git log -1 --pretty=format:"%s")
    else
        local commit_hash="unknown"
        local commit_author="unknown"
        local commit_message="Initial deployment"
    fi
    
    # 发送开始通知
    local start_message="API Gateway 部署开始 - 时间: $deploy_start_time - Commit: $commit_hash by $commit_author"
    send_lark_notification "$start_message"
    
    # 执行部署步骤
    check_dependencies
    setup_node
    setup_code
    create_directories
    install_dependencies
    deploy_api
    deploy_web
    verify_deployment
    show_summary
    
    # 计算耗时
    local deploy_end_timestamp=$(date +%s)
    local duration=$((deploy_end_timestamp - deploy_start_timestamp))
    local minutes=$((duration / 60))
    local seconds=$((duration % 60))
    
    # 发送成功通知
    local success_message="API Gateway 部署成功 - Commit: $commit_hash - 耗时: ${minutes}分${seconds}秒"
    send_lark_notification "$success_message"
}

# 执行主函数
main