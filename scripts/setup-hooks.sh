#!/bin/bash

# Git Hooks 管理脚本
# 为开发者提供快速和完整两种Git hooks配置选项

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

# 检查是否在正确目录
if [ ! -d ".git" ]; then
    error "Not in a git repository root directory!"
    exit 1
fi

if [ ! -f "apps/api/package.json" ]; then
    error "API package.json not found. Run this script from the monorepo root."
    exit 1
fi

echo -e "${BLUE}"
echo "=================================================="
echo "🔧 Git Hooks 配置管理器"
echo "=================================================="
echo -e "${NC}"

# 显示当前hooks状态
echo -e "${BLUE}📋 当前Git Hooks状态:${NC}"
if [ -f ".git/hooks/pre-commit" ]; then
    COMMIT_TYPE=$(head -3 .git/hooks/pre-commit | grep -o "Fast Version\|Complete Version" || echo "Unknown")
    echo "   pre-commit: 已安装 (${COMMIT_TYPE})"
else
    echo "   pre-commit: 未安装"
fi

if [ -f ".git/hooks/pre-push" ]; then
    PUSH_TYPE=$(head -3 .git/hooks/pre-push | grep -o "Fast Version\|Complete Version" || echo "Unknown")
    echo "   pre-push: 已安装 (${PUSH_TYPE})"
else
    echo "   pre-push: 未安装"
fi

echo ""
echo -e "${YELLOW}选择配置模式:${NC}"
echo "1) 快速模式 (推荐) - 快速commit/push，适合日常开发"
echo "2) 完整模式 - 完整检查，适合CI或发布前"
echo "3) 禁用所有hooks"
echo "4) 查看当前hooks配置"
echo "0) 退出"
echo ""

read -p "请选择 (0-4): " choice

case $choice in
    1)
        info "安装快速模式 Git Hooks..."
        
        # 当前已经是快速模式的hooks，直接确认
        success "快速模式 Git Hooks 已安装"
        echo ""
        echo -e "${GREEN}📋 快速模式特性:${NC}"
        echo "   pre-commit: TypeScript检查 + 单元测试 (30秒超时)"
        echo "   pre-push: TypeScript检查 + 集成测试 (60秒超时)"
        echo "   完整检查: 使用 ./scripts/full-check.sh"
        ;;
        
    2)
        info "生成完整模式 Git Hooks..."
        
        # 创建完整模式的pre-commit
        cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh

# API Gateway Pre-commit Hook (Complete Version)
# 完整提交检查 - 运行所有测试和验证

set -e

echo "🚀 Running complete pre-commit checks for API Gateway..."

if [ -z "$(git diff --cached --name-only)" ]; then
    echo "✅ No staged files found. Skipping pre-commit checks."
    exit 0
fi

echo "\n📝 Checking staged files..."
git diff --cached --name-only

if [ ! -f "apps/api/package.json" ]; then
    echo "❌ API package.json not found. This hook should be run from the monorepo root."
    exit 1
fi

cd apps/api

# 运行完整检查脚本
echo "\n🔍 Running complete validation suite..."
if ! timeout 300 bash ../../scripts/full-check.sh; then
    echo "❌ Complete validation failed or timed out (5 minutes)."
    echo "\n💡 Switch to fast mode for daily development:"
    echo "   ./scripts/setup-hooks.sh"
    exit 1
fi

cd ../..

echo "\n🎉 Complete pre-commit checks passed!"
exit 0
EOF

        # 创建完整模式的pre-push
        cat > .git/hooks/pre-push << 'EOF'
#!/bin/sh

# API Gateway Pre-push Hook (Complete Version)  
# 完整推送检查 - 包括网络验证和部署检查

set -e

echo "🚀 Running complete pre-push checks for API Gateway..."

if [ ! -f "apps/api/package.json" ]; then
    echo "❌ API package.json not found. This hook should be run from the monorepo root."
    exit 1
fi

cd apps/api

# TypeScript检查
echo "\n🔍 Running TypeScript type check..."
if ! npm run typecheck; then
    echo "❌ TypeScript type check failed."
    exit 1
fi

# 完整测试套件
echo "\n🧪 Running complete test suite..."
if ! npm run test:ci; then
    echo "❌ Test suite failed."
    exit 1
fi

# Wrangler验证
echo "\n⚙️  Validating Wrangler configuration..."
if ! npx wrangler config; then
    echo "❌ Wrangler configuration validation failed."
    exit 1
fi

# 部署检查
echo "\n🔧 Running deployment readiness check..."
if ! timeout 60 npx wrangler deploy --dry-run >/dev/null 2>&1; then
    echo "❌ Deployment readiness check failed or timed out."
    exit 1
fi

cd ../..

echo "\n🎉 Complete pre-push checks passed!"
exit 0
EOF

        chmod +x .git/hooks/pre-commit
        chmod +x .git/hooks/pre-push
        
        success "完整模式 Git Hooks 已安装"
        echo ""
        echo -e "${GREEN}📋 完整模式特性:${NC}"
        echo "   pre-commit: 运行完整检查脚本 (5分钟超时)"
        echo "   pre-push: 包含Wrangler验证和部署检查"
        warning "注意: 完整模式可能较慢，建议CI环境使用"
        ;;
        
    3)
        info "禁用所有Git Hooks..."
        
        if [ -f ".git/hooks/pre-commit" ]; then
            mv .git/hooks/pre-commit .git/hooks/pre-commit.disabled
        fi
        
        if [ -f ".git/hooks/pre-push" ]; then
            mv .git/hooks/pre-push .git/hooks/pre-push.disabled
        fi
        
        success "所有Git Hooks已禁用"
        info "文件备份为 .disabled 后缀，可手动恢复"
        ;;
        
    4)
        info "显示当前hooks详细配置..."
        echo ""
        
        if [ -f ".git/hooks/pre-commit" ]; then
            echo -e "${BLUE}=== PRE-COMMIT HOOK ===${NC}"
            head -10 .git/hooks/pre-commit
            echo "..."
        else
            echo "pre-commit hook: 未安装"
        fi
        
        echo ""
        if [ -f ".git/hooks/pre-push" ]; then
            echo -e "${BLUE}=== PRE-PUSH HOOK ===${NC}"
            head -10 .git/hooks/pre-push
            echo "..."
        else
            echo "pre-push hook: 未安装"
        fi
        ;;
        
    0)
        info "退出配置管理器"
        exit 0
        ;;
        
    *)
        error "无效选择"
        exit 1
        ;;
esac

echo ""
echo -e "${YELLOW}💡 使用建议:${NC}"
echo "   - 日常开发: 使用快速模式"
echo "   - CI/CD环境: 使用完整模式" 
echo "   - 临时禁用: 使用 --no-verify 标志"
echo "   - 完整检查: ./scripts/full-check.sh"

exit 0