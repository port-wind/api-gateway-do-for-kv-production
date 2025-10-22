#!/bin/bash
# 运行所有缓存优化测试
# 包括：SWR、缓存击穿防护、预热

set -e

BASE_URL="${BASE_URL:-http://localhost:8787}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                              ║"
echo "║                    缓存优化完整测试套件                                       ║"
echo "║                                                                              ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "API地址: $BASE_URL"
echo "测试脚本目录: $SCRIPT_DIR"
echo ""

# 测试计数
TOTAL_TESTS=3
PASSED_TESTS=0
FAILED_TESTS=0

# 运行单个测试
run_test() {
    local test_name="$1"
    local test_script="$2"
    local test_number="$3"
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BLUE}[$test_number/$TOTAL_TESTS] $test_name${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    if [ -f "$test_script" ]; then
        if bash "$test_script"; then
            echo -e "\n${GREEN}✓ $test_name 通过${NC}\n"
            ((PASSED_TESTS++))
            return 0
        else
            echo -e "\n${RED}✗ $test_name 失败${NC}\n"
            ((FAILED_TESTS++))
            return 1
        fi
    else
        echo -e "${RED}✗ 测试脚本不存在: $test_script${NC}"
        ((FAILED_TESTS++))
        return 1
    fi
}

# 检查服务是否可用
echo "检查 API 服务状态..."
if curl -s -f "$BASE_URL/api/admin/paths?limit=1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ API 服务可用${NC}"
else
    echo -e "${RED}✗ API 服务不可用，请先启动服务：npm run dev${NC}"
    exit 1
fi

echo ""
read -p "按 Enter 键开始测试，或 Ctrl+C 取消..."
echo ""

# 运行所有测试
run_test "SWR 机制测试" "$SCRIPT_DIR/test-swr-mechanism.sh" 1
run_test "缓存击穿防护测试" "$SCRIPT_DIR/test-cache-breakdown-protection.sh" 2
run_test "缓存预热功能测试" "$SCRIPT_DIR/test-cache-warmup.sh" 3

# 输出最终结果
echo ""
echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                              ║"
echo "║                           最终测试结果                                        ║"
echo "║                                                                              ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "通过: ${GREEN}$PASSED_TESTS${NC} / $TOTAL_TESTS"
echo -e "失败: ${RED}$FAILED_TESTS${NC} / $TOTAL_TESTS"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}                    ✓ 所有测试通过！                                      ${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "测试结论:"
    echo "  ✅ SWR (Stale-While-Revalidate) 机制工作正常"
    echo "  ✅ 缓存击穿防护机制有效"
    echo "  ✅ 缓存预热功能可用"
    echo ""
    echo "系统优化验证:"
    echo "  ✅ 过期缓存能立即返回（响应快）"
    echo "  ✅ 后台刷新正常工作"
    echo "  ✅ 并发请求不会击穿缓存"
    echo "  ✅ 防重复刷新机制生效"
    echo "  ✅ 预热可消除冷启动"
    echo ""
    exit 0
else
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}                    ✗ 部分测试失败                                        ${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "请检查失败的测试日志，排查问题。"
    echo ""
    exit 1
fi

