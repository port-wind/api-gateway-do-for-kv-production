#!/bin/bash

# API Gateway 前端构建脚本
# 用途: Jenkins 自动化构建前端项目

set -e  # 遇到错误立即退出

# ================================
# 配置变量
# ================================

BUILD_TIME=$(date '+%Y%m%d_%H%M%S')
BUILD_ID="${BUILD_NUMBER:-${BUILD_TIME}}"
PROJECT_NAME="api-gateway-admin"

# 部署配置（通过 Jenkins 环境变量设置）
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/html/admin}"
BACKUP_PATH="${BACKUP_PATH:-/backup/admin}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# ================================
# 工具函数
# ================================

log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# ================================
# 构建流程
# ================================

log "========================================="
log "开始构建 ${PROJECT_NAME}"
log "构建号: ${BUILD_ID}"
log "Git Commit: ${GIT_COMMIT:-N/A}"
log "========================================="

# 检查环境
log "检查构建环境..."
if ! command -v pnpm &> /dev/null; then
    log "安装 pnpm..."
    npm install -g pnpm
fi

log "Node 版本: $(node --version)"
log "pnpm 版本: $(pnpm --version)"

# 清理旧构建
log "清理旧构建文件..."
rm -rf apps/web/dist

# 安装依赖
log "安装项目依赖..."
pnpm install --frozen-lockfile

# 代码检查
log "运行代码检查..."
pnpm --filter @gateway/web lint
pnpm --filter @gateway/web typecheck

# 构建项目
log "构建前端项目..."
NODE_ENV=production pnpm --filter @gateway/web build

# 验证构建结果
if [ ! -d "apps/web/dist" ]; then
    error "构建失败：dist 目录不存在"
fi

# 显示构建信息
log "构建产物信息:"
du -sh apps/web/dist/
ls -la apps/web/dist/

# 创建版本信息
cat > apps/web/dist/version.json << EOF
{
  "version": "${BUILD_ID}",
  "buildTime": "${BUILD_TIME}",
  "gitCommit": "${GIT_COMMIT:-N/A}",
  "gitBranch": "${GIT_BRANCH:-N/A}"
}
EOF

# 备份当前版本（如果存在）
if [[ -d "$DEPLOY_PATH" ]]; then
    log "备份当前版本..."
    mkdir -p "$BACKUP_PATH"
    BACKUP_NAME="backup-$(date +%Y%m%d_%H%M%S).tar.gz"
    tar -czf "$BACKUP_PATH/$BACKUP_NAME" -C "$(dirname "$DEPLOY_PATH")" "$(basename "$DEPLOY_PATH")"
    log "已备份到: $BACKUP_PATH/$BACKUP_NAME"
fi

# 部署新版本
log "部署到: $DEPLOY_PATH"
mkdir -p "$DEPLOY_PATH"
cp -r apps/web/dist/* "$DEPLOY_PATH/"

# 清理旧备份（保留最近3个）
cd "$BACKUP_PATH" && ls -t backup-*.tar.gz 2>/dev/null | tail -n +4 | xargs -r rm || true

success "========================================="
success "🎉 构建部署完成!"
success "构建号: ${BUILD_ID}"
success "部署路径: ${DEPLOY_PATH}"
success "========================================="