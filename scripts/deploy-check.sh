#!/bin/bash

# 部署后验证脚本
# 用途: 检查部署是否成功

set -e

# 配置
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/html/admin}"
CHECK_URL="${CHECK_URL:-http://localhost}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[CHECK]${NC} $1"
}

error() {
    echo -e "${RED}[FAIL]${NC} $1"
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log "开始部署验证..."

# 1. 检查部署目录是否存在
if [[ ! -d "$DEPLOY_PATH" ]]; then
    error "部署目录不存在: $DEPLOY_PATH"
fi
success "部署目录检查通过"

# 2. 检查关键文件是否存在
REQUIRED_FILES=("index.html" "version.json")
for file in "${REQUIRED_FILES[@]}"; do
    if [[ ! -f "$DEPLOY_PATH/$file" ]]; then
        error "关键文件缺失: $file"
    fi
done
success "关键文件检查通过"

# 3. 检查静态资源目录
if [[ ! -d "$DEPLOY_PATH/assets" ]]; then
    warn "静态资源目录不存在: assets"
else
    ASSET_COUNT=$(find "$DEPLOY_PATH/assets" -type f | wc -l)
    log "静态资源文件数: $ASSET_COUNT"
    success "静态资源检查通过"
fi

# 4. 显示版本信息
if [[ -f "$DEPLOY_PATH/version.json" ]]; then
    log "版本信息:"
    cat "$DEPLOY_PATH/version.json"
fi

# 5. 检查文件权限
PERM=$(stat -c "%a" "$DEPLOY_PATH" 2>/dev/null || stat -f "%A" "$DEPLOY_PATH" 2>/dev/null || echo "unknown")
if [[ "$PERM" != "unknown" ]]; then
    log "部署目录权限: $PERM"
fi

# 6. 计算总文件大小
TOTAL_SIZE=$(du -sh "$DEPLOY_PATH" | cut -f1)
log "部署总大小: $TOTAL_SIZE"

# 7. 简单的 HTTP 检查（可选）
if command -v curl &> /dev/null && [[ "$CHECK_URL" != "http://localhost" ]]; then
    log "检查 HTTP 访问..."
    if curl -f -s -o /dev/null "$CHECK_URL" --max-time 10; then
        success "HTTP 访问检查通过"
    else
        warn "HTTP 访问检查失败，请手动验证"
    fi
fi

success "========================================="
success "✅ 部署验证全部通过!"
success "部署路径: $DEPLOY_PATH"
success "部署大小: $TOTAL_SIZE"
success "========================================="