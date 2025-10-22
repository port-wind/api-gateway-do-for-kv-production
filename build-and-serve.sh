#!/bin/bash

# 本地构建和服务脚本
# 用法: bash build-and-serve.sh [PORT]

# 配置参数
DEFAULT_PORT=8080
SERVE_PORT=${1:-$DEFAULT_PORT}
BUILD_DIR="./build"
PACKAGE_NAME="api-gateway-$(date +%Y%m%d_%H%M%S).tar.gz"

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

echo "================================================"
echo "API Gateway 本地构建和服务脚本"
echo "================================================"

# 1. 检查依赖
log_info "检查依赖..."
command -v pnpm &>/dev/null || handle_error "pnpm 未安装"
command -v python3 &>/dev/null || command -v python &>/dev/null || handle_error "Python 未安装"

# 2. 清理旧构建
log_info "清理旧构建..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# 3. 安装依赖
log_info "安装项目依赖..."
pnpm install || handle_error "依赖安装失败"

# 4. 代码检查
log_info "运行代码检查..."
pnpm --filter @gateway/web lint || log_warning "Web 代码检查失败，但继续构建"

# 5. 构建 Web 前端
log_info "构建 Web 前端..."
pnpm --filter @gateway/web build || handle_error "Web 构建失败"

# 6. 准备构建产物
log_info "准备构建产物..."
mkdir -p "$BUILD_DIR/web/dist"
cp -r apps/web/dist/* "$BUILD_DIR/web/dist/"

# 7. 复制 API 代码
log_info "准备 API 代码..."
mkdir -p "$BUILD_DIR/api"
cp -r apps/api/* "$BUILD_DIR/api/"
cp package.json "$BUILD_DIR/"
cp pnpm-lock.yaml "$BUILD_DIR/"
cp pnpm-workspace.yaml "$BUILD_DIR/"

# 7.1 复制 Node.js 服务器文件
log_info "复制 SPA 服务器文件..."
cp apps/web/serve.js "$BUILD_DIR/web/"
cp apps/web/package.json "$BUILD_DIR/web/"

# 8. 创建部署配置
log_info "创建部署配置..."
cat > "$BUILD_DIR/ecosystem.config.js" << 'EOF'
module.exports = {
  apps: [{
    name: 'api-gateway-web',
    cwd: './web',
    script: 'node',
    args: ['serve.js'],
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 14289
    }
  }]
};
EOF

# 9. 创建启动脚本
cat > "$BUILD_DIR/start.sh" << 'EOF'
#!/bin/bash

# API Gateway 启动脚本
log_info() {
    echo -e "\033[0;34m[INFO]\033[0m $1"
}

log_success() {
    echo -e "\033[0;32m[SUCCESS]\033[0m $1"
}

log_info "启动 API Gateway..."

# 安装 PM2 (如果未安装)
command -v pm2 &>/dev/null || {
    log_info "安装 PM2..."
    npm install -g pm2
}

# 停止旧服务
pm2 delete api-gateway-web 2>/dev/null || true

# 安装 Web 服务依赖
log_info "安装 Web 服务依赖..."
cd web
pnpm install --production --silent
cd ..

# 启动 Web 服务
log_info "启动 Web 服务..."
pm2 start ecosystem.config.js

# 保存 PM2 配置
pm2 save

log_success "API Gateway 启动完成！"
log_info "Web 服务: http://localhost:14289"
log_info "查看日志: pm2 logs api-gateway-web"
log_info "停止服务: pm2 stop api-gateway-web"
EOF

chmod +x "$BUILD_DIR/start.sh"

# 10. 创建停止脚本
cat > "$BUILD_DIR/stop.sh" << 'EOF'
#!/bin/bash
echo "停止 API Gateway..."
pm2 stop api-gateway-web
pm2 delete api-gateway-web
echo "服务已停止"
EOF

chmod +x "$BUILD_DIR/stop.sh"

# 11. 打包构建产物
log_info "打包构建产物..."
cd "$BUILD_DIR"
tar -czf "../$PACKAGE_NAME" .
cd ..

# 12. 启动 HTTP 服务器
log_info "启动 HTTP 服务器..."
log_success "构建完成！打包文件: $PACKAGE_NAME"
echo "================================================"
echo "HTTP 服务器信息:"
echo "端口: $SERVE_PORT"
# 获取本机 IP 地址（兼容 macOS 和 Linux）
if command -v ifconfig &>/dev/null; then
    LOCAL_IP=$(ifconfig | grep 'inet ' | grep -v '127\.' | head -1 | awk '{print $2}' | sed 's/addr://')
else
    LOCAL_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "localhost")
fi

echo "下载链接: http://$LOCAL_IP:$SERVE_PORT/$PACKAGE_NAME"
echo ""
echo "服务器部署命令:"
echo "wget http://$LOCAL_IP:$SERVE_PORT/$PACKAGE_NAME"
echo "tar -xzf $PACKAGE_NAME"
echo "./start.sh"
echo "================================================"

# 启动 HTTP 服务器

# 杀死占用端口的进程
kill_port_process() {
    PORT=$1
    PID=$(lsof -t -i:$PORT)
    if [ -n "$PID" ]; then
        log_warning "端口 $PORT 已被进程 $PID 占用，正在尝试杀死..."
        kill -9 "$PID"
        log_success "进程 $PID 已杀死。"
    fi
}

kill_port_process $SERVE_PORT
if command -v python3 &>/dev/null; then
    python3 -m http.server $SERVE_PORT
elif command -v python &>/dev/null; then
    python -m SimpleHTTPServer $SERVE_PORT
else
    log_error "Python 未安装，无法启动 HTTP 服务器"
fi