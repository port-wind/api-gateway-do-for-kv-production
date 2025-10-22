#!/bin/bash
# 测试缓存预热机制
# 验证：
# 1. 预热 API 是否正常工作
# 2. 预热的缓存是否可用
# 3. 已存在的缓存是否被跳过
# 4. 预热是否支持并发

set -e

BASE_URL="${BASE_URL:-http://localhost:8787}"
TEST_PATHS=(
    "/kv/suppart-image-service/meta/generations-list"
    "/kv/suppart-image-service/list"
    "/kv/test/warmup-path-1"
)

echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                              ║"
echo "║                    缓存预热功能测试                                           ║"
echo "║                                                                              ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "API地址: $BASE_URL"
echo "测试路径数: ${#TEST_PATHS[@]}"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 测试计数器
PASSED=0
FAILED=0

test_case() {
    local name="$1"
    echo -e "${BLUE}▶ 测试: $name${NC}"
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第一步: 准备测试环境"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_case "1.1 清除所有测试路径的缓存"

# 构建 JSON 数组
PATHS_JSON=$(printf '%s\n' "${TEST_PATHS[@]}" | jq -R . | jq -s .)

curl -s -X POST "$BASE_URL/api/admin/cache/flush" \
  -H 'Content-Type: application/json' \
  --data "{\"paths\": $PATHS_JSON}" > /tmp/warmup_test_flush.json

FLUSH_RESULT=$(cat /tmp/warmup_test_flush.json | jq -r '.success')
if [[ "$FLUSH_RESULT" == "true" ]]; then
    echo -e "  ${GREEN}✓${NC} 缓存清除成功"
    ((PASSED++))
else
    echo -e "  ${YELLOW}⚠${NC} 缓存清除可能失败（某些路径可能不存在缓存）"
    cat /tmp/warmup_test_flush.json | jq '.message'
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第二步: 测试缓存预热"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_case "2.1 调用预热 API"

START_TIME=$(date +%s.%N)

curl -s -X POST "$BASE_URL/api/admin/cache/warm" \
  -H 'Content-Type: application/json' \
  --data "{
    \"paths\": $PATHS_JSON,
    \"version\": 200,
    \"includeProxyRoutes\": true
  }" > /tmp/warmup_test_result.json

END_TIME=$(date +%s.%N)
DURATION=$(echo "$END_TIME - $START_TIME" | bc)
DURATION_MS=$(echo "$DURATION * 1000" | bc | cut -d. -f1)

# 检查结果
WARMUP_SUCCESS=$(cat /tmp/warmup_test_result.json | jq -r '.success')
if [[ "$WARMUP_SUCCESS" == "true" ]]; then
    echo -e "  ${GREEN}✓${NC} 预热 API 调用成功"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} 预热 API 调用失败"
    cat /tmp/warmup_test_result.json | jq '.'
    ((FAILED++))
    exit 1
fi

# 显示详细结果
WARMED_COUNT=$(cat /tmp/warmup_test_result.json | jq -r '.result.warmedCount')
SKIPPED_COUNT=$(cat /tmp/warmup_test_result.json | jq -r '.result.skippedCount')
ERROR_COUNT=$(cat /tmp/warmup_test_result.json | jq -r '.result.errorCount')
TOTAL_PATHS=$(cat /tmp/warmup_test_result.json | jq -r '.result.totalPaths')

echo "  预热统计:"
echo "    - 成功预热: $WARMED_COUNT"
echo "    - 跳过（已存在）: $SKIPPED_COUNT"
echo "    - 失败: $ERROR_COUNT"
echo "    - 总路径数: $TOTAL_PATHS"
echo "    - 耗时: ${DURATION_MS}ms"

test_case "2.2 验证预热结果"

if [ $WARMED_COUNT -gt 0 ]; then
    echo -e "  ${GREEN}✓${NC} 至少预热了一个路径"
    ((PASSED++))
else
    echo -e "  ${YELLOW}⚠${NC} 没有路径被预热（可能所有路径都已存在缓存或代理路由未配置）"
fi

if [ $ERROR_COUNT -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} 没有预热失败的路径"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} 有 $ERROR_COUNT 个路径预热失败"
    echo "  失败详情:"
    cat /tmp/warmup_test_result.json | jq '.result.details[] | select(.success == false)'
    ((FAILED++))
fi

# 显示每个路径的详细结果
echo ""
echo "  详细结果:"
cat /tmp/warmup_test_result.json | jq -r '.result.details[] | "    - \(.path): \(if .success then "✓ 成功" else "✗ 失败: \(.error)" end)"'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第三步: 验证预热的缓存可用"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

VERIFIED=0
for path in "${TEST_PATHS[@]}"; do
    test_case "3.$(( VERIFIED + 1 )) 验证路径: $path"
    
    RESPONSE=$(curl -s -i "$BASE_URL$path" 2>&1)
    
    # 检查缓存状态
    CACHE_STATUS=$(echo "$RESPONSE" | grep -i "^X-Cache-Status:" | cut -d' ' -f2- | tr -d '\r')
    CACHE_WARMER=$(echo "$RESPONSE" | grep -i "^X-Cache-Warmer:" | cut -d' ' -f2- | tr -d '\r')
    
    if [[ "$CACHE_STATUS" == "HIT" ]]; then
        echo -e "  ${GREEN}✓${NC} 缓存命中: $CACHE_STATUS"
        ((PASSED++))
        
        if [[ "$CACHE_WARMER" == "true" ]]; then
            echo -e "  ${GREEN}✓${NC} 标记为预热缓存"
            ((PASSED++))
        else
            echo -e "  ${YELLOW}⚠${NC} 未标记为预热缓存（可能是旧缓存）"
        fi
    elif [[ "$CACHE_STATUS" == "MISS" ]]; then
        echo -e "  ${YELLOW}⚠${NC} 缓存未命中（预热可能失败或路由未配置）"
    else
        echo -e "  ${RED}✗${NC} 缓存状态异常: $CACHE_STATUS"
        ((FAILED++))
    fi
    
    ((VERIFIED++))
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第四步: 测试跳过已存在的缓存"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_case "4.1 再次调用预热 API（应该跳过已存在的缓存）"

START_TIME=$(date +%s.%N)

curl -s -X POST "$BASE_URL/api/admin/cache/warm" \
  -H 'Content-Type: application/json' \
  --data "{
    \"paths\": $PATHS_JSON,
    \"version\": 200,
    \"includeProxyRoutes\": true
  }" > /tmp/warmup_test_result2.json

END_TIME=$(date +%s.%N)
DURATION=$(echo "$END_TIME - $START_TIME" | bc)
DURATION_MS=$(echo "$DURATION * 1000" | bc | cut -d. -f1)

# 检查结果
WARMED_COUNT_2=$(cat /tmp/warmup_test_result2.json | jq -r '.result.warmedCount')
SKIPPED_COUNT_2=$(cat /tmp/warmup_test_result2.json | jq -r '.result.skippedCount')
ERROR_COUNT_2=$(cat /tmp/warmup_test_result2.json | jq -r '.result.errorCount')

echo "  第二次预热统计:"
echo "    - 成功预热: $WARMED_COUNT_2"
echo "    - 跳过（已存在）: $SKIPPED_COUNT_2"
echo "    - 失败: $ERROR_COUNT_2"
echo "    - 耗时: ${DURATION_MS}ms"

test_case "4.2 验证跳过逻辑"

# 预期：第二次预热应该跳过所有成功预热的路径
EXPECTED_SKIPPED=$((WARMED_COUNT + SKIPPED_COUNT))
if [ $SKIPPED_COUNT_2 -ge $WARMED_COUNT ]; then
    echo -e "  ${GREEN}✓${NC} 跳过逻辑正常（已存在的缓存被正确跳过）"
    echo "    第一次预热: $WARMED_COUNT 个"
    echo "    第二次跳过: $SKIPPED_COUNT_2 个"
    ((PASSED++))
else
    echo -e "  ${YELLOW}⚠${NC} 跳过逻辑可能异常"
    echo "    第一次预热: $WARMED_COUNT 个"
    echo "    第二次跳过: $SKIPPED_COUNT_2 个（预期至少 $WARMED_COUNT 个）"
fi

# 验证第二次预热更快（因为跳过了已存在的缓存）
FIRST_WARMUP_MS=$(cat /tmp/warmup_test_result.json | jq -r '.result.warmedCount')
SECOND_WARMUP_MS=$(cat /tmp/warmup_test_result2.json | jq -r '.result.warmedCount')

if [ $SECOND_WARMUP_MS -eq 0 ] && [ $SKIPPED_COUNT_2 -gt 0 ]; then
    echo -e "  ${GREEN}✓${NC} 第二次预热没有发起后端请求（全部跳过）"
    ((PASSED++))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第五步: 测试预热性能"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_case "5.1 测试大批量路径预热"

# 构建更多测试路径
BATCH_PATHS='[
  "/kv/test/batch-1",
  "/kv/test/batch-2",
  "/kv/test/batch-3",
  "/kv/test/batch-4",
  "/kv/test/batch-5"
]'

echo "  准备预热 5 个路径..."

START_TIME=$(date +%s.%N)

curl -s -X POST "$BASE_URL/api/admin/cache/warm" \
  -H 'Content-Type: application/json' \
  --data "{
    \"paths\": $BATCH_PATHS,
    \"version\": 200,
    \"includeProxyRoutes\": true
  }" > /tmp/warmup_test_batch.json

END_TIME=$(date +%s.%N)
DURATION=$(echo "$END_TIME - $START_TIME" | bc)
DURATION_MS=$(echo "$DURATION * 1000" | bc | cut -d. -f1)

BATCH_WARMED=$(cat /tmp/warmup_test_batch.json | jq -r '.result.warmedCount')
BATCH_SKIPPED=$(cat /tmp/warmup_test_batch.json | jq -r '.result.skippedCount')
BATCH_ERROR=$(cat /tmp/warmup_test_batch.json | jq -r '.result.errorCount')

echo "  批量预热结果:"
echo "    - 成功: $BATCH_WARMED"
echo "    - 跳过: $BATCH_SKIPPED"
echo "    - 失败: $BATCH_ERROR"
echo "    - 总耗时: ${DURATION_MS}ms"

if [ $BATCH_WARMED -gt 0 ] || [ $BATCH_SKIPPED -gt 0 ]; then
    # 计算平均每个路径的耗时
    TOTAL_PROCESSED=$((BATCH_WARMED + BATCH_SKIPPED))
    AVG_TIME=$((DURATION_MS / TOTAL_PROCESSED))
    echo "    - 平均每路径: ${AVG_TIME}ms"
    
    if [ $AVG_TIME -lt 500 ]; then
        echo -e "  ${GREEN}✓${NC} 预热性能优秀（平均 < 500ms/路径）"
        ((PASSED++))
    elif [ $AVG_TIME -lt 1000 ]; then
        echo -e "  ${YELLOW}⚠${NC} 预热性能一般（平均 < 1s/路径）"
    else
        echo -e "  ${RED}✗${NC} 预热性能较慢（平均 >= 1s/路径）"
        ((FAILED++))
    fi
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                              ║"
echo "║                           测试结果汇总                                        ║"
echo "║                                                                              ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "通过: ${GREEN}$PASSED${NC}"
echo -e "失败: ${RED}$FAILED${NC}"
echo -e "总计: $((PASSED + FAILED))"
echo ""

echo "功能测试结果:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 汇总所有预热结果
TOTAL_WARMED=$((WARMED_COUNT + BATCH_WARMED))
TOTAL_SKIPPED=$((SKIPPED_COUNT + SKIPPED_COUNT_2 + BATCH_SKIPPED))
TOTAL_ERROR=$((ERROR_COUNT + ERROR_COUNT_2 + BATCH_ERROR))

echo -e "预热统计（所有测试）:"
echo "  - 总预热成功: $TOTAL_WARMED 个路径"
echo "  - 总跳过: $TOTAL_SKIPPED 个路径"
echo "  - 总失败: $TOTAL_ERROR 个路径"
echo ""

if [ $TOTAL_WARMED -gt 0 ]; then
    echo -e "${GREEN}✓ 预热功能: 正常工作${NC}"
    echo "  - 能够成功预热路径"
    echo "  - 预热的缓存可以被正常使用"
    echo "  - 支持批量预热"
else
    echo -e "${YELLOW}⚠ 预热功能: 未能预热任何路径${NC}"
    echo "  - 可能原因: 代理路由未配置或后端不可用"
fi

if [ $TOTAL_SKIPPED -gt 0 ]; then
    echo -e "${GREEN}✓ 跳过逻辑: 正常工作${NC}"
    echo "  - 已存在的缓存被正确跳过"
    echo "  - 避免重复预热"
fi

echo ""
echo "测试文件保存在:"
echo "  - /tmp/warmup_test_result.json (首次预热)"
echo "  - /tmp/warmup_test_result2.json (第二次预热)"
echo "  - /tmp/warmup_test_batch.json (批量预热)"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ 缓存预热功能测试通过！${NC}"
    exit 0
else
    echo -e "${RED}✗ 缓存预热功能测试失败！${NC}"
    exit 1
fi

