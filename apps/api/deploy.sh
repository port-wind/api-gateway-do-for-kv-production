#!/bin/bash

# ============================================
# 智能部署脚本
# 根据当前登录账号自动选择部署环境
#
# 使用方式:
#   ./deploy.sh           # 交互式确认
#   ./deploy.sh -y        # 自动确认（用于 CI/CD）
#   ./deploy.sh --yes     # 自动确认（用于 CI/CD）
# ============================================

set -e

# 检查是否有自动确认参数
AUTO_CONFIRM=false
if [[ "$1" == "-y" || "$1" == "--yes" ]]; then
    AUTO_CONFIRM=true
    shift  # 移除该参数，传递剩余参数给 wrangler
fi

echo "🔍 检查当前登录账号..."

# 获取当前登录的 Account ID（从表格中提取最后一列）
CURRENT_ACCOUNT_ID=$(wrangler whoami 2>/dev/null | grep -E "^│.*│.*│$" | grep -v "Account Name" | grep -v "^├" | grep -v "^└" | head -1 | awk -F'│' '{print $3}' | xargs)

if [ -z "$CURRENT_ACCOUNT_ID" ]; then
    echo "❌ 错误：未登录 Cloudflare 账号或无法获取 Account ID"
    echo "请先运行: wrangler login"
    exit 1
fi

# 获取当前登录的邮箱（仅用于显示）
CURRENT_EMAIL=$(wrangler whoami 2>/dev/null | grep "associated with the email" | sed -E 's/.*email ([^.]+@[^.]+\.[^.]+).*/\1/')
if [ -z "$CURRENT_EMAIL" ]; then
    CURRENT_EMAIL=$(wrangler whoami 2>/dev/null | grep "Account Name" | head -1 | awk -F'│' '{print $2}' | xargs)
fi

echo "📧 当前登录账号: $CURRENT_EMAIL"
echo "🆔 Account ID: $CURRENT_ACCOUNT_ID"
echo ""

# 根据 Account ID 判断环境
if [ "$CURRENT_ACCOUNT_ID" = "80e68ad465093681d7d893b6c122f9b8" ]; then
    ENV_NAME="🟢 生产环境 (Production)"
    ENV_FLAG="--env production"
    CONFIG_SOURCE="wrangler.toml [env.production]"
    ACCOUNT_ID="80e68ad465093681d7d893b6c122f9b8"
else
    ENV_NAME="🟡 测试环境 (Test)"
    ENV_FLAG=""
    CONFIG_SOURCE="wrangler.toml (根配置)"
    ACCOUNT_ID="625675bb221d602eccde58bb23facbfb"
fi

# 显示部署信息
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  📦 即将部署到："
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  环境:       $ENV_NAME"
echo "  账号:       $CURRENT_EMAIL"
echo "  Account ID: $ACCOUNT_ID"
echo "  配置来源:   $CONFIG_SOURCE"
echo "  部署命令:   wrangler deploy $ENV_FLAG $*"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 询问用户确认（除非使用了自动确认参数）
if [ "$AUTO_CONFIRM" = false ]; then
    read -p "❓ 确认部署到此环境吗？(y/N): " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        echo "❌ 部署已取消"
        exit 0
    fi
else
    echo "✅ 自动确认模式，跳过确认步骤"
fi

echo ""
echo "🚀 开始部署..."
echo ""

# 执行部署
wrangler deploy $ENV_FLAG "$@"

echo ""
echo "✅ 部署完成！"
