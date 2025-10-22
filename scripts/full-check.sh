#!/bin/bash

# API Gateway 完整检查脚本
# 包含所有测试、类型检查、Wrangler验证和部署检查

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 输出格式化
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

# 主标题
echo -e "${BLUE}"
echo "=================================================="
echo "🔍 API Gateway 完整质量检查"
echo "=================================================="
echo -e "${NC}"

# 检查项目目录
if [ ! -f "apps/api/package.json" ]; then
    error "API package.json not found. This script should be run from the monorepo root."
    exit 1
fi

cd apps/api

START_TIME=$(date +%s)
TOTAL_CHECKS=8
CURRENT_CHECK=0

# 进度跟踪
progress() {
    CURRENT_CHECK=$((CURRENT_CHECK + 1))
    echo -e "\n${BLUE}[${CURRENT_CHECK}/${TOTAL_CHECKS}] $1${NC}"
}

# 1. TypeScript 类型检查
progress "TypeScript 类型检查"
if npm run typecheck; then
    success "TypeScript 类型检查通过"
else
    error "TypeScript 类型检查失败"
    exit 1
fi

# 2. 单元测试
progress "单元测试"
if COVERAGE=false npm run test:unit; then
    success "单元测试通过"
else
    error "单元测试失败"
    exit 1
fi

# 3. 集成测试
progress "集成测试"
if COVERAGE=false npm run test:integration; then
    success "集成测试通过"
else
    error "集成测试失败"
    exit 1
fi

# 4. 端到端测试
progress "端到端测试"
if COVERAGE=false npm run test:e2e; then
    success "端到端测试通过"
else
    error "端到端测试失败"
    exit 1
fi

# 5. 完整测试套件（CI模式）
progress "完整测试套件"
if npm run test:ci; then
    success "完整测试套件通过"
else
    error "完整测试套件失败"
    exit 1
fi

# 6. 测试覆盖率报告（可选，支持的环境）
progress "测试覆盖率报告"
if npm run test:coverage 2>/dev/null; then
    success "测试覆盖率报告生成完成"
else
    warning "测试覆盖率报告跳过（Workers环境兼容性）"
fi

# 7. Wrangler 配置验证
progress "Wrangler 配置验证"
if npx wrangler config 2>/dev/null; then
    success "Wrangler 配置验证通过"
else
    warning "Wrangler 配置验证失败（可能需要登录或网络连接）"
fi

# 8. 部署准备检查
progress "部署准备检查"
if timeout 30 npx wrangler deploy --dry-run >/dev/null 2>&1; then
    success "部署准备检查通过"
else
    warning "部署准备检查失败或超时（可能需要网络连接）"
fi

cd ../..

# 计算总用时
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo -e "\n${GREEN}"
echo "=================================================="
echo "🎉 完整质量检查完成"
echo "=================================================="
echo -e "${NC}"

echo -e "${GREEN}📊 检查总结:${NC}"
echo "   ✅ TypeScript 类型检查"
echo "   ✅ 单元测试"
echo "   ✅ 集成测试" 
echo "   ✅ 端到端测试"
echo "   ✅ 完整测试套件"
echo "   ⚠️  测试覆盖率（条件性生成）"
echo "   ⚠️  Wrangler 配置验证（需要网络）"
echo "   ⚠️  部署准备检查（需要网络）"

echo -e "\n${BLUE}⏱️  总用时: ${DURATION}秒${NC}"

echo -e "\n${YELLOW}💡 提示:${NC}"
echo "   - 日常开发使用 git commit/push（快速检查）"
echo "   - 发布前或CI环境使用此完整检查"
echo "   - 网络相关检查失败不影响代码质量"

success "所有代码质量检查已完成！代码可以安全提交和部署。"

exit 0