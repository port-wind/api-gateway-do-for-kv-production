#!/bin/bash
# 测试 Stale-While-Revalidate (SWR) 机制
# 验证：
# 1. SWR 是否正确触发
# 2. 过期缓存是否立即返回
# 3. 后台刷新是否成功
# 4. 响应头是否正确标记

set -e

BASE_URL="${BASE_URL:-http://localhost:8787}"
TEST_PATH="/kv/suppart-image-service/meta/generations-list"
ENCODED_PATH=$(printf %s "$TEST_PATH" | jq -sRr @uri)

echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                              ║"
echo "║                    SWR 机制完整性测试                                         ║"
echo "║                                                                              ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "测试路径: $TEST_PATH"
echo "API地址: $BASE_URL"
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

# 测试函数
test_case() {
    local name="$1"
    echo -e "${BLUE}▶ 测试: $name${NC}"
}

assert_header() {
    local response="$1"
    local header="$2"
    local expected="$3"
    local description="$4"
    
    local actual=$(echo "$response" | grep -i "^$header:" | cut -d' ' -f2- | tr -d '\r')
    
    if [[ "$actual" == "$expected" ]]; then
        echo -e "  ${GREEN}✓${NC} $description: $actual"
        ((PASSED++))
    else
        echo -e "  ${RED}✗${NC} $description: 期望 '$expected', 实际 '$actual'"
        ((FAILED++))
    fi
}

assert_header_exists() {
    local response="$1"
    local header="$2"
    local description="$3"
    
    if echo "$response" | grep -qi "^$header:"; then
        local value=$(echo "$response" | grep -i "^$header:" | cut -d' ' -f2- | tr -d '\r')
        echo -e "  ${GREEN}✓${NC} $description: $value"
        ((PASSED++))
    else
        echo -e "  ${RED}✗${NC} $description: Header '$header' 不存在"
        ((FAILED++))
    fi
}

assert_response_time() {
    local duration="$1"
    local max_ms="$2"
    local description="$3"
    
    # 将秒转换为毫秒
    local duration_ms=$(echo "$duration * 1000" | bc)
    local duration_int=${duration_ms%.*}
    
    if (( duration_int < max_ms )); then
        echo -e "  ${GREEN}✓${NC} $description: ${duration_int}ms (< ${max_ms}ms)"
        ((PASSED++))
    else
        echo -e "  ${RED}✗${NC} $description: ${duration_int}ms (>= ${max_ms}ms)"
        ((FAILED++))
    fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第一步: 准备测试环境"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_case "1.1 配置短 TTL（10秒）以便测试"
curl -s -X PUT "$BASE_URL/api/admin/paths/$ENCODED_PATH" \
  -H 'Content-Type: application/json' \
  --data '{
    "cache": {
      "enabled": true,
      "ttl": 10,
      "keyStrategy": "path-only"
    }
  }' > /tmp/swr_test_config.json

if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} TTL 配置成功（10秒）"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} TTL 配置失败"
    ((FAILED++))
    exit 1
fi

test_case "1.2 清除现有缓存"
curl -s -X POST "$BASE_URL/api/admin/cache/flush" \
  -H 'Content-Type: application/json' \
  --data "{\"paths\": [\"$TEST_PATH\"]}" > /tmp/swr_test_flush.json

if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} 缓存清除成功"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} 缓存清除失败"
    ((FAILED++))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第二步: 创建初始缓存"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_case "2.1 第一次请求（缓存未命中，创建缓存）"
START_TIME=$(date +%s.%N)
RESPONSE=$(curl -s -i "$BASE_URL$TEST_PATH" 2>&1)
END_TIME=$(date +%s.%N)
DURATION=$(echo "$END_TIME - $START_TIME" | bc)

echo "$RESPONSE" > /tmp/swr_test_first_request.txt

# 检查响应
CACHE_STATUS=$(echo "$RESPONSE" | grep -i "^X-Cache-Status:" | cut -d' ' -f2- | tr -d '\r')
if [[ "$CACHE_STATUS" == "MISS" ]] || [[ "$CACHE_STATUS" == "HIT" ]]; then
    echo -e "  ${GREEN}✓${NC} 缓存状态: $CACHE_STATUS"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} 缓存状态异常: $CACHE_STATUS"
    ((FAILED++))
fi

echo "  响应时间: $(echo "$DURATION * 1000" | bc | cut -d. -f1)ms"

# 等待1秒，确保缓存已保存
sleep 1

test_case "2.2 第二次请求（验证缓存命中）"
START_TIME=$(date +%s.%N)
RESPONSE=$(curl -s -i "$BASE_URL$TEST_PATH" 2>&1)
END_TIME=$(date +%s.%N)
DURATION=$(echo "$END_TIME - $START_TIME" | bc)

echo "$RESPONSE" > /tmp/swr_test_second_request.txt

# 验证响应头
assert_header "$RESPONSE" "X-Cache-Status" "HIT" "缓存命中"
assert_header_exists "$RESPONSE" "X-Cache-Version" "版本号存在"
assert_header_exists "$RESPONSE" "X-Cache-Created" "创建时间存在"
assert_response_time "$DURATION" 100 "响应时间（从缓存读取应该很快）"

# 记录缓存创建时间
CACHE_CREATED=$(echo "$RESPONSE" | grep -i "^X-Cache-Created:" | cut -d' ' -f2- | tr -d '\r')
echo "  缓存创建时间: $CACHE_CREATED"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第三步: 等待 TTL 过期"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_case "3.1 等待 11 秒（确保 TTL 过期）"
for i in {11..1}; do
    echo -ne "  倒计时: $i 秒...\r"
    sleep 1
done
echo -e "\n  ${GREEN}✓${NC} 等待完成，TTL 已过期"
((PASSED++))

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第四步: 验证 SWR 机制（核心测试）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_case "4.1 请求过期缓存（应触发 SWR）"
START_TIME=$(date +%s.%N)
RESPONSE=$(curl -s -i "$BASE_URL$TEST_PATH" 2>&1)
END_TIME=$(date +%s.%N)
DURATION=$(echo "$END_TIME - $START_TIME" | bc)

echo "$RESPONSE" > /tmp/swr_test_stale_request.txt

# 核心验证：SWR 响应头
assert_header "$RESPONSE" "X-Cache-Status" "STALE" "【关键】缓存状态为 STALE"
assert_header "$RESPONSE" "X-Cache-Stale" "true" "【关键】标记为过期缓存"
assert_header_exists "$RESPONSE" "X-Cache-Updating" "【关键】后台更新标记"
assert_response_time "$DURATION" 100 "【关键】响应时间（STALE 应该快速返回）"

# 验证缓存创建时间与之前相同（返回的是旧缓存）
STALE_CREATED=$(echo "$RESPONSE" | grep -i "^X-Cache-Created:" | cut -d' ' -f2- | tr -d '\r')
if [[ "$STALE_CREATED" == "$CACHE_CREATED" ]]; then
    echo -e "  ${GREEN}✓${NC} 返回的是旧缓存（创建时间未变）: $STALE_CREATED"
    ((PASSED++))
else
    echo -e "  ${YELLOW}⚠${NC} 缓存创建时间不同（可能已刷新）: $STALE_CREATED"
fi

# 检查 Remaining TTL（应该是负数）
REMAINING_TTL=$(echo "$RESPONSE" | grep -i "^X-Cache-Remaining-TTL:" | cut -d' ' -f2- | tr -d '\r')
if [[ -n "$REMAINING_TTL" ]] && (( REMAINING_TTL < 0 )); then
    echo -e "  ${GREEN}✓${NC} Remaining TTL 为负数: ${REMAINING_TTL}s"
    ((PASSED++))
else
    echo -e "  ${YELLOW}⚠${NC} Remaining TTL 不是负数: ${REMAINING_TTL}s"
fi

test_case "4.2 等待后台刷新完成（3秒）"
sleep 3
echo -e "  ${GREEN}✓${NC} 等待完成"

test_case "4.3 再次请求（应该获取新缓存）"
START_TIME=$(date +%s.%N)
RESPONSE=$(curl -s -i "$BASE_URL$TEST_PATH" 2>&1)
END_TIME=$(date +%s.%N)
DURATION=$(echo "$END_TIME - $START_TIME" | bc)

echo "$RESPONSE" > /tmp/swr_test_refreshed_request.txt

# 验证新缓存
assert_header "$RESPONSE" "X-Cache-Status" "HIT" "缓存状态为 HIT（已刷新）"
assert_response_time "$DURATION" 100 "响应时间"

# 验证缓存创建时间已更新
NEW_CREATED=$(echo "$RESPONSE" | grep -i "^X-Cache-Created:" | cut -d' ' -f2- | tr -d '\r')
if [[ "$NEW_CREATED" != "$CACHE_CREATED" ]]; then
    echo -e "  ${GREEN}✓${NC} 缓存已刷新（创建时间已更新）"
    echo "    旧: $CACHE_CREATED"
    echo "    新: $NEW_CREATED"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} 缓存未刷新（创建时间相同）"
    ((FAILED++))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第五步: 清理测试环境"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_case "5.1 恢复正常 TTL（300秒）"
curl -s -X PUT "$BASE_URL/api/admin/paths/$ENCODED_PATH" \
  -H 'Content-Type: application/json' \
  --data '{
    "cache": {
      "enabled": true,
      "ttl": 300,
      "keyStrategy": "path-params-headers"
    }
  }' > /tmp/swr_test_restore.json

if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} TTL 恢复成功（300秒）"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} TTL 恢复失败"
    ((FAILED++))
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

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ SWR 机制测试全部通过！${NC}"
    echo ""
    echo "测试文件保存在:"
    echo "  - /tmp/swr_test_first_request.txt (首次请求)"
    echo "  - /tmp/swr_test_second_request.txt (缓存命中)"
    echo "  - /tmp/swr_test_stale_request.txt (STALE 响应)"
    echo "  - /tmp/swr_test_refreshed_request.txt (刷新后)"
    exit 0
else
    echo -e "${RED}✗ SWR 机制测试失败！${NC}"
    echo ""
    echo "请检查测试文件:"
    echo "  - /tmp/swr_test_*.txt"
    exit 1
fi

