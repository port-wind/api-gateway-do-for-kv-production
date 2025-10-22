#!/bin/bash

# Web 前端部署脚本 - 部署到 r197 机器 (192.168.0.197)
# 目标路径: /srv/api-proxy-admin-web
# 用法: 
#   bash deploy-web-to-197.sh                  # 完整流程：安装依赖 + 构建 + 部署
#   bash deploy-web-to-197.sh --skip-install   # 跳过依赖安装
#   bash deploy-web-to-197.sh --skip-build     # 跳过构建（使用已有的 dist）
#   bash deploy-web-to-197.sh --fast           # 快速模式：跳过安装和构建

set -e  # 遇到错误立即退出

# 解析命令行参数
SKIP_INSTALL=false
SKIP_BUILD=false
for arg in "$@"; do
  case $arg in
    --skip-install) SKIP_INSTALL=true ;;
    --skip-build) SKIP_BUILD=true ;;
    --fast) SKIP_INSTALL=true; SKIP_BUILD=true ;;
  esac
done

# 配置变量
REMOTE_HOST="192.168.0.197"
REMOTE_USER="portwin"
REMOTE_PATH="/srv/api-proxy-admin-web"
WEB_PATH="/srv/api-proxy-admin-web/web"  # Web 应用实际路径
REMOTE_PORT="22"

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

# 错误处理函数
handle_error() {
    local ERROR_MESSAGE="$1"
    log_error "$ERROR_MESSAGE"
    exit 1
}

# 记录开始时间
BUILD_START_TIME=$(date '+%Y-%m-%d %H:%M:%S')
BUILD_START_TIMESTAMP=$(date +%s)

log_info "========================================="
log_info "Web 前端部署到 r197 开始"
log_info "开始时间: $BUILD_START_TIME"
log_info "目标服务器: $REMOTE_HOST"
log_info "目标路径: $REMOTE_PATH"
log_info "========================================="

# 1. 获取项目根目录
PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
log_info "项目根目录: $PROJECT_ROOT"

# 2. 检查 SSH 连接
log_info "检查 SSH 连接..."
if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "echo '连接成功'" > /dev/null 2>&1; then
    log_success "SSH 连接正常"
else
    handle_error "无法连接到远程服务器 $REMOTE_HOST，请检查：1) 服务器是否在线 2) SSH 密钥配置是否正确"
fi

# 3. 安装依赖（可选）
if [ "$SKIP_INSTALL" = true ]; then
    log_info "⏩ 跳过依赖安装"
else
    log_info "安装项目依赖..."
    cd "$PROJECT_ROOT"
    
    # 检查 node_modules 是否存在
    if [ -d "node_modules" ] && [ -d "apps/web/node_modules" ]; then
        log_info "检测到已有依赖，跳过安装..."
        log_success "依赖检查完成"
    else
        if pnpm install --frozen-lockfile --prefer-offline; then
            log_success "依赖安装成功"
        else
            log_warning "frozen-lockfile 安装失败，尝试普通安装..."
            if pnpm install --prefer-offline; then
                log_success "依赖安装成功"
            else
                handle_error "依赖安装失败"
            fi
        fi
    fi
fi

# 4. 构建 Web 前端
BUILD_DIR="$PROJECT_ROOT/apps/web/dist"

if [ "$SKIP_BUILD" = true ]; then
    log_info "⏩ 跳过构建，使用已有的 dist 目录"
    
    # 检查 dist 目录和 index.html 是否存在
    if [ ! -d "$BUILD_DIR" ]; then
        handle_error "构建产物目录不存在: $BUILD_DIR（请先运行构建）"
    fi
    
    if [ ! -f "$BUILD_DIR/index.html" ]; then
        handle_error "index.html 不存在: $BUILD_DIR/index.html（请先运行构建）"
    fi
    
    log_success "发现已有构建产物（包含 index.html）"
else
    log_info "构建 Web 前端..."
    if pnpm --filter @gateway/web build; then
        log_success "Web 构建成功"
    else
        handle_error "Web 构建失败"
    fi
fi

# 5. 验证和打包构建产物
log_info "验证构建产物..."
if [ ! -d "$BUILD_DIR" ]; then
    handle_error "构建产物目录不存在: $BUILD_DIR"
fi

if [ ! -f "$BUILD_DIR/index.html" ]; then
    handle_error "index.html 不存在: $BUILD_DIR/index.html"
fi

# 统计文件数量
FILE_COUNT=$(find "$BUILD_DIR" -type f | wc -l | tr -d ' ')
log_info "构建产物文件数: $FILE_COUNT"

log_info "打包构建产物..."

DEPLOY_PACKAGE="$PROJECT_ROOT/web-deploy-$(date +%Y%m%d_%H%M%S).tar.gz"
if cd "$BUILD_DIR" && tar -czf "$DEPLOY_PACKAGE" * && cd "$PROJECT_ROOT"; then
    log_success "构建产物打包成功: $(basename $DEPLOY_PACKAGE)"
else
    handle_error "打包失败"
fi

# 6. 创建远程目录
log_info "创建远程部署目录..."
if ssh "$REMOTE_USER@$REMOTE_HOST" "sudo mkdir -p $WEB_PATH/dist && sudo mkdir -p $REMOTE_PATH"; then
    log_success "远程目录创建成功"
else
    log_warning "远程目录创建失败（可能已存在）"
fi

# 7. 备份远程现有文件（如果存在）
log_info "备份远程现有文件..."
BACKUP_NAME="backup-$(date +%Y%m%d_%H%M%S)"
ssh "$REMOTE_USER@$REMOTE_HOST" "
    if sudo [ -d '$REMOTE_PATH' ] && [ \"\$(sudo ls -A $REMOTE_PATH 2>/dev/null)\" ]; then
        echo '发现现有文件，进行备份...'
        sudo mkdir -p $REMOTE_PATH/../backups
        sudo tar -czf $REMOTE_PATH/../backups/$BACKUP_NAME.tar.gz -C $REMOTE_PATH . 2>/dev/null || true
        echo '备份完成'
    else
        echo '无需备份（目录为空或不存在）'
    fi
"

# 8. 上传部署包
log_info "上传部署包到远程服务器..."
PACKAGE_NAME=$(basename "$DEPLOY_PACKAGE")
TEMP_UPLOAD_PATH="/tmp/$PACKAGE_NAME"

if scp "$DEPLOY_PACKAGE" "$REMOTE_USER@$REMOTE_HOST:$TEMP_UPLOAD_PATH"; then
    log_success "上传成功"
else
    handle_error "上传失败"
fi

# 9. 移动并解压部署包到正确的目录
log_info "在远程服务器部署..."
if ssh "$REMOTE_USER@$REMOTE_HOST" "
    # 移动部署包
    sudo mv $TEMP_UPLOAD_PATH $REMOTE_PATH/ &&
    cd $WEB_PATH && 
    # 清理旧的 dist 目录
    sudo rm -rf dist/* &&
    # 解压到 dist 目录
    sudo tar -xzf $REMOTE_PATH/$PACKAGE_NAME -C dist/ && 
    # 删除压缩包
    sudo rm -f $REMOTE_PATH/$PACKAGE_NAME &&
    echo '解压完成'
"; then
    log_success "远程部署成功"
else
    handle_error "远程解压失败"
fi

# 9.1 上传 serve.js 和 package.json（如果不存在）
log_info "检查并上传服务器文件..."
if ssh "$REMOTE_USER@$REMOTE_HOST" "sudo [ ! -f '$WEB_PATH/serve.js' ]"; then
    log_info "上传 serve.js..."
    scp "$PROJECT_ROOT/apps/web/serve.js" "$REMOTE_USER@$REMOTE_HOST:/tmp/serve.js"
    scp "$PROJECT_ROOT/apps/web/package.json" "$REMOTE_USER@$REMOTE_HOST:/tmp/package.json"
    
    ssh "$REMOTE_USER@$REMOTE_HOST" "
        sudo mv /tmp/serve.js $WEB_PATH/ &&
        sudo mv /tmp/package.json $WEB_PATH/ &&
        cd $WEB_PATH &&
        sudo npm install --production 2>/dev/null || true
    "
    log_success "服务器文件上传完成"
else
    log_info "服务器文件已存在，跳过上传"
fi

# 10. 验证部署结果
log_info "验证部署结果..."
VERIFY_RESULT=$(ssh "$REMOTE_USER@$REMOTE_HOST" "
    if sudo [ -f '$WEB_PATH/dist/index.html' ]; then
        file_count=\$(sudo find $WEB_PATH/dist -type f | wc -l)
        echo \"SUCCESS:\$file_count\"
    else
        echo 'FAILED'
    fi
")

if [[ $VERIFY_RESULT == SUCCESS:* ]]; then
    FILE_COUNT=$(echo $VERIFY_RESULT | cut -d':' -f2)
    log_success "部署验证成功：index.html 存在于 $WEB_PATH/dist/"
    log_info "部署文件总数: $FILE_COUNT"
else
    log_warning "部署验证失败：未找到 index.html"
fi

# 11. 清理本地临时文件
log_info "清理本地临时文件..."
rm -f "$DEPLOY_PACKAGE"
log_success "临时文件清理完成"

# 12. 计算部署耗时
BUILD_END_TIME=$(date '+%Y-%m-%d %H:%M:%S')
BUILD_END_TIMESTAMP=$(date +%s)
BUILD_DURATION=$((BUILD_END_TIMESTAMP - BUILD_START_TIMESTAMP))
MINUTES=$((BUILD_DURATION / 60))
SECONDS=$((BUILD_DURATION % 60))

log_info "========================================="
log_success "Web 前端部署到 r197 完成！"
log_info "结束时间: $BUILD_END_TIME"
log_info "总耗时: ${MINUTES}分${SECONDS}秒"
log_info "部署目录: $WEB_PATH/dist/"
log_info "========================================="

log_success "部署流程完成！"
echo ""
echo "📝 下一步（如果服务未运行）："
echo "  1. SSH 登录: ssh $REMOTE_USER@$REMOTE_HOST"
echo "  2. 进入目录: cd $WEB_PATH"
echo "  3. 检查文件: ls -la dist/"
echo "  4. 启动服务: pm2 start serve.js --name api-gateway-web"
echo "  5. 查看日志: pm2 logs api-gateway-web"
echo "  6. 访问地址: http://$REMOTE_HOST:14289"
echo ""

exit 0
