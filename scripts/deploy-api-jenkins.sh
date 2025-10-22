#!/bin/bash

# Jenkins API 部署脚本 - 支持多账号
# 用法: ENVIRONMENT=production bash scripts/deploy-api-jenkins.sh

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

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

# 从环境变量获取配置
ENVIRONMENT=${ENVIRONMENT:-test}
CLOUDFLARE_ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID}
CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN}

# 根据环境设置配置
if [ "$ENVIRONMENT" = "production" ]; then
    ENV_NAME="🟢 生产环境 (Production)"
    ENV_FLAG="--env production"
    EXPECTED_ACCOUNT="80e68ad465093681d7d893b6c122f9b8"
    EXPECTED_EMAIL="portwind520@gmail.com"
else
    ENV_NAME="🟡 测试环境 (Test)"
    ENV_FLAG=""
    EXPECTED_ACCOUNT="625675bb221d602eccde58bb23facbfb"
    EXPECTED_EMAIL="测试账号"
fi

# 显示部署信息
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  📦 Jenkins API 部署"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  环境:       $ENV_NAME"
echo "  邮箱:       $EXPECTED_EMAIL"
echo "  Account ID: $EXPECTED_ACCOUNT"
echo "  环境标志:   $ENV_FLAG"
echo "  构建号:     #${BUILD_NUMBER:-local}"
echo "  触发者:     ${BUILD_USER:-local}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 验证必要的环境变量
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    log_error "CLOUDFLARE_API_TOKEN 未设置"
    exit 1
fi

# 验证账号 ID（如果提供了）
if [ -n "$CLOUDFLARE_ACCOUNT_ID" ] && [ "$CLOUDFLARE_ACCOUNT_ID" != "$EXPECTED_ACCOUNT" ]; then
    log_warning "账号 ID 不匹配"
    log_warning "  期望: $EXPECTED_ACCOUNT"
    log_warning "  实际: $CLOUDFLARE_ACCOUNT_ID"
    log_warning "将使用环境变量中的账号"
fi

# 进入 API 目录
cd "$(dirname "$0")/../apps/api" || {
    log_error "无法进入 apps/api 目录"
    exit 1
}

log_info "当前目录: $(pwd)"

# 检查 wrangler.toml
if [ ! -f "wrangler.toml" ]; then
    log_error "wrangler.toml 不存在"
    exit 1
fi

log_info "开始部署..."

# 执行部署
if wrangler deploy $ENV_FLAG; then
    log_success "API 部署成功！"
    
    # 显示部署信息
    echo ""
    log_info "部署完成信息:"
    if [ "$ENVIRONMENT" = "production" ]; then
        log_info "  🌐 生产环境 Worker 已更新"
    else
        log_info "  🌐 测试环境 Worker 已更新"
    fi
    
    echo ""
    exit 0
else
    log_error "API 部署失败"
    exit 1
fi
