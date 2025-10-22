#!/bin/bash

# 远程部署脚本
# 用法: bash remote-deploy.sh <DOWNLOAD_URL> [DEPLOY_DIR]

# 配置参数
DOWNLOAD_URL="$1"
DEPLOY_DIR="${2:-/srv/api-proxy-admin-web}"
BACKUP_DIR="$DEPLOY_DIR.backup.$(date +%Y%m%d%H%M%S)"

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

# 错误处理
handle_error() {
    log_error "$1"
    exit 1
}

# 检查参数
if [ -z "$DOWNLOAD_URL" ]; then
    echo "用法: bash remote-deploy.sh <DOWNLOAD_URL> [DEPLOY_DIR]"
    echo "示例: bash remote-deploy.sh http://192.168.1.100:8080/api-gateway-20250925_212345.tar.gz"
    exit 1
fi

echo "================================================"
echo "API Gateway 远程部署脚本"
echo "================================================"
echo "下载URL: $DOWNLOAD_URL"
echo "部署目录: $DEPLOY_DIR"
echo "================================================"

# 1. 检查依赖
log_info "检查依赖..."
command -v wget &>/dev/null || command -v curl &>/dev/null || handle_error "wget 或 curl 未安装"
command -v tar &>/dev/null || handle_error "tar 未安装"

# 2. 创建临时目录
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR" || handle_error "无法创建临时目录"

log_info "临时目录: $TEMP_DIR"

# 3. 下载构建包
log_info "下载构建包..."
PACKAGE_NAME=$(basename "$DOWNLOAD_URL")

if command -v wget &>/dev/null; then
    wget "$DOWNLOAD_URL" || handle_error "下载失败"
elif command -v curl &>/dev/null; then
    curl -O "$DOWNLOAD_URL" || handle_error "下载失败"
fi

log_success "下载完成: $PACKAGE_NAME"

# 4. 解压构建包
log_info "解压构建包..."
tar -xzf "$PACKAGE_NAME" || handle_error "解压失败"

# 5. 备份现有部署
if [ -d "$DEPLOY_DIR" ]; then
    log_info "备份现有部署..."
    sudo mv "$DEPLOY_DIR" "$BACKUP_DIR"
    log_info "备份到: $BACKUP_DIR"
fi

# 6. 部署新版本
log_info "部署新版本..."
sudo mkdir -p "$DEPLOY_DIR"
sudo cp -r * "$DEPLOY_DIR/"
sudo chown -R $(whoami) "$DEPLOY_DIR"

# 7. 安装 Node.js 和 PM2 (如果需要)
log_info "检查 Node.js 环境..."
if ! command -v node &>/dev/null; then
    log_info "安装 Node.js..."
    # 使用 NodeSource 仓库安装 Node.js 18
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

if ! command -v pm2 &>/dev/null; then
    log_info "安装 PM2..."
    sudo npm install -g pm2
fi

# 8. 启动服务
log_info "启动服务..."
cd "$DEPLOY_DIR" || handle_error "无法进入部署目录"

# 确保脚本有执行权限
chmod +x start.sh stop.sh

# 启动服务
./start.sh || handle_error "服务启动失败"

# 9. 清理临时文件
log_info "清理临时文件..."
cd /
rm -rf "$TEMP_DIR"

# 10. 验证部署
log_info "验证部署..."
sleep 3

if pm2 list | grep -q "api-gateway-web"; then
    log_success "服务启动成功！"
    
    # 显示状态
    pm2 list
    
    echo "================================================"
    echo "部署完成!"
    echo "================================================"
    echo "Web 服务: http://localhost:3000"
    echo "部署目录: $DEPLOY_DIR"
    echo "备份目录: $BACKUP_DIR"
    echo ""
    echo "管理命令:"
    echo "  查看日志: pm2 logs api-gateway-web"
    echo "  重启服务: pm2 restart api-gateway-web"
    echo "  停止服务: cd $DEPLOY_DIR && ./stop.sh"
    echo "================================================"
else
    handle_error "服务启动失败，请检查日志"
fi