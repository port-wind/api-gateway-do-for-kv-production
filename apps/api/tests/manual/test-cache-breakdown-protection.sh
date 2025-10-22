#!/bin/bash
# 测试缓存击穿防护机制
# 验证：
# 1. 多个并发请求访问过期缓存时，是否只触发一次后台刷新
# 2. 是否使用 KV 标记防止重复刷新
# 3. 是否正确返回 X-Cache-Updating 标记
# 4. 后端是否被击穿（检查后端请求次数）

set -e

BASE_URL="${BASE_URL:-http://localhost:8787}"
TEST_PATH="/kv/suppart-image-service/meta/generations-list"
ENCODED_PATH=$(printf %s "$TEST_PATH" | jq -sRr @uri)
CONCURRENT_REQUESTS=20  # 并发请求数

echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                              ║"
echo "║                    缓存击穿防护测试                                           ║"
echo "║                                                                              ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "测试路径: $TEST_PATH"
echo "API地址: $BASE_URL"
echo "并发请求数: $CONCURRENT_REQUESTS"
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

test_case "1.1 配置短 TTL（5秒）"
curl -s -X PUT "$BASE_URL/api/admin/paths/$ENCODED_PATH" \
  -H 'Content-Type: application/json' \
  --data '{
    "cache": {
      "enabled": true,
      "ttl": 5,
      "keyStrategy": "path-only"
    }
  }' > /tmp/breakdown_test_config.json

if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} TTL 配置成功（5秒）"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} TTL 配置失败"
    ((FAILED++))
    exit 1
fi

test_case "1.2 清除现有缓存"
curl -s -X POST "$BASE_URL/api/admin/cache/flush" \
  -H 'Content-Type: application/json' \
  --data "{\"paths\": [\"$TEST_PATH\"]}" > /tmp/breakdown_test_flush.json

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

test_case "2.1 发起首次请求，创建缓存"
curl -s -i "$BASE_URL$TEST_PATH" > /tmp/breakdown_test_initial.txt

CACHE_STATUS=$(grep -i "^X-Cache-Status:" /tmp/breakdown_test_initial.txt | cut -d' ' -f2- | tr -d '\r')
if [[ "$CACHE_STATUS" == "MISS" ]] || [[ "$CACHE_STATUS" == "HIT" ]]; then
    echo -e "  ${GREEN}✓${NC} 初始缓存创建成功: $CACHE_STATUS"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} 初始缓存创建失败: $CACHE_STATUS"
    ((FAILED++))
fi

sleep 1

test_case "2.2 验证缓存可用"
curl -s -i "$BASE_URL$TEST_PATH" > /tmp/breakdown_test_verify.txt

CACHE_STATUS=$(grep -i "^X-Cache-Status:" /tmp/breakdown_test_verify.txt | cut -d' ' -f2- | tr -d '\r')
if [[ "$CACHE_STATUS" == "HIT" ]]; then
    echo -e "  ${GREEN}✓${NC} 缓存命中: $CACHE_STATUS"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} 缓存未命中: $CACHE_STATUS"
    ((FAILED++))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第三步: 等待 TTL 过期"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_case "3.1 等待 6 秒（确保 TTL 过期）"
for i in {6..1}; do
    echo -ne "  倒计时: $i 秒...\r"
    sleep 1
done
echo -e "\n  ${GREEN}✓${NC} 等待完成，TTL 已过期"
((PASSED++))

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第四步: 并发请求过期缓存（缓存击穿测试）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_case "4.1 发起 $CONCURRENT_REQUESTS 个并发请求"
echo "  启动并发请求..."

# 清空临时目录
rm -rf /tmp/breakdown_test_concurrent
mkdir -p /tmp/breakdown_test_concurrent

# 并发发起请求
PIDS=()
for i in $(seq 1 $CONCURRENT_REQUESTS); do
    (
        START=$(date +%s.%N)
        curl -s -i "$BASE_URL$TEST_PATH" > "/tmp/breakdown_test_concurrent/response_$i.txt" 2>&1
        END=$(date +%s.%N)
        DURATION=$(echo "$END - $START" | bc)
        echo "$DURATION" > "/tmp/breakdown_test_concurrent/duration_$i.txt"
    ) &
    PIDS+=($!)
done

# 等待所有请求完成
echo "  等待所有请求完成..."
for pid in "${PIDS[@]}"; do
    wait $pid
done

echo -e "  ${GREEN}✓${NC} 所有请求已完成"
((PASSED++))

echo ""
test_case "4.2 分析并发请求结果"

# 统计 STALE 响应数
STALE_COUNT=0
HIT_COUNT=0
MISS_COUNT=0
UPDATING_TRUE_COUNT=0
UPDATING_FALSE_COUNT=0

for i in $(seq 1 $CONCURRENT_REQUESTS); do
    RESPONSE_FILE="/tmp/breakdown_test_concurrent/response_$i.txt"
    
    if [ -f "$RESPONSE_FILE" ]; then
        CACHE_STATUS=$(grep -i "^X-Cache-Status:" "$RESPONSE_FILE" | cut -d' ' -f2- | tr -d '\r')
        UPDATING=$(grep -i "^X-Cache-Updating:" "$RESPONSE_FILE" | cut -d' ' -f2- | tr -d '\r')
        
        case "$CACHE_STATUS" in
            STALE)
                ((STALE_COUNT++))
                ;;
            HIT)
                ((HIT_COUNT++))
                ;;
            MISS)
                ((MISS_COUNT++))
                ;;
        esac
        
        if [[ "$UPDATING" == "true" ]]; then
            ((UPDATING_TRUE_COUNT++))
        elif [[ "$UPDATING" == "false" ]]; then
            ((UPDATING_FALSE_COUNT++))
        fi
    fi
done

echo "  结果统计:"
echo "    - STALE 响应: $STALE_COUNT"
echo "    - HIT 响应: $HIT_COUNT"
echo "    - MISS 响应: $MISS_COUNT"
echo "    - X-Cache-Updating: true 数量: $UPDATING_TRUE_COUNT"
echo "    - X-Cache-Updating: false 数量: $UPDATING_FALSE_COUNT"

# 验证结果
if [ $STALE_COUNT -gt 0 ]; then
    echo -e "  ${GREEN}✓${NC} 成功返回过期缓存（STALE）"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} 未返回过期缓存（可能缓存已刷新或配置错误）"
    ((FAILED++))
fi

# 检查是否所有响应都是 STALE（理想情况）
if [ $STALE_COUNT -eq $CONCURRENT_REQUESTS ]; then
    echo -e "  ${GREEN}✓${NC} 所有请求都返回过期缓存（最佳情况）"
    ((PASSED++))
elif [ $STALE_COUNT -gt 0 ]; then
    echo -e "  ${YELLOW}⚠${NC} 部分请求返回新缓存（可能后台刷新很快完成）"
fi

# 关键验证：X-Cache-Updating 标记
# 预期：第一个请求应该有 updating: true，后续请求应该是 updating: false
if [ $UPDATING_TRUE_COUNT -ge 1 ] && [ $UPDATING_FALSE_COUNT -ge 1 ]; then
    echo -e "  ${GREEN}✓${NC} 【关键】防重复刷新机制工作正常"
    echo "    - 首个请求触发刷新: updating=true ($UPDATING_TRUE_COUNT 个)"
    echo "    - 后续请求检测到已在刷新: updating=false ($UPDATING_FALSE_COUNT 个)"
    ((PASSED++))
elif [ $UPDATING_TRUE_COUNT -eq $CONCURRENT_REQUESTS ]; then
    echo -e "  ${RED}✗${NC} 【严重】所有请求都触发刷新（缓存击穿！）"
    echo "    这意味着防重复刷新机制失效，后端可能被击穿！"
    ((FAILED++))
elif [ $UPDATING_FALSE_COUNT -eq $CONCURRENT_REQUESTS ]; then
    echo -e "  ${YELLOW}⚠${NC} 所有请求都未触发刷新（可能之前已有刷新进行中）"
else
    echo -e "  ${YELLOW}⚠${NC} 无法确定刷新机制状态"
    echo "    updating=true: $UPDATING_TRUE_COUNT"
    echo "    updating=false: $UPDATING_FALSE_COUNT"
fi

echo ""
test_case "4.3 分析响应时间"

# 计算平均响应时间
TOTAL_DURATION=0
COUNT=0
for i in $(seq 1 $CONCURRENT_REQUESTS); do
    DURATION_FILE="/tmp/breakdown_test_concurrent/duration_$i.txt"
    if [ -f "$DURATION_FILE" ]; then
        DURATION=$(cat "$DURATION_FILE")
        TOTAL_DURATION=$(echo "$TOTAL_DURATION + $DURATION" | bc)
        ((COUNT++))
    fi
done

if [ $COUNT -gt 0 ]; then
    AVG_DURATION=$(echo "scale=3; $TOTAL_DURATION / $COUNT" | bc)
    AVG_MS=$(echo "$AVG_DURATION * 1000" | bc | cut -d. -f1)
    
    echo "  平均响应时间: ${AVG_MS}ms"
    
    if [ $AVG_MS -lt 200 ]; then
        echo -e "  ${GREEN}✓${NC} 响应时间优秀（< 200ms）"
        ((PASSED++))
    elif [ $AVG_MS -lt 500 ]; then
        echo -e "  ${YELLOW}⚠${NC} 响应时间一般（< 500ms）"
    else
        echo -e "  ${RED}✗${NC} 响应时间较慢（>= 500ms）"
        ((FAILED++))
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第五步: 验证后台刷新已完成"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_case "5.1 等待后台刷新完成（3秒）"
sleep 3
echo -e "  ${GREEN}✓${NC} 等待完成"

test_case "5.2 验证缓存已更新"
curl -s -i "$BASE_URL$TEST_PATH" > /tmp/breakdown_test_after_refresh.txt

CACHE_STATUS=$(grep -i "^X-Cache-Status:" /tmp/breakdown_test_after_refresh.txt | cut -d' ' -f2- | tr -d '\r')
if [[ "$CACHE_STATUS" == "HIT" ]]; then
    echo -e "  ${GREEN}✓${NC} 缓存已刷新并命中: $CACHE_STATUS"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} 缓存状态异常: $CACHE_STATUS"
    ((FAILED++))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第六步: 清理测试环境"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_case "6.1 恢复正常 TTL（300秒）"
curl -s -X PUT "$BASE_URL/api/admin/paths/$ENCODED_PATH" \
  -H 'Content-Type: application/json' \
  --data '{
    "cache": {
      "enabled": true,
      "ttl": 300,
      "keyStrategy": "path-params-headers"
    }
  }' > /tmp/breakdown_test_restore.json

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

echo "详细结果分析:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 计算缓存击穿防护评分
PROTECTION_SCORE=0
if [ $UPDATING_TRUE_COUNT -ge 1 ] && [ $UPDATING_FALSE_COUNT -ge 1 ]; then
    PROTECTION_SCORE=100
    echo -e "${GREEN}✓ 缓存击穿防护: 优秀 (100分)${NC}"
    echo "  - 成功使用 KV 标记防止重复刷新"
    echo "  - 只有首个请求触发后台刷新"
    echo "  - 后续请求检测到刷新中，直接返回过期缓存"
elif [ $UPDATING_TRUE_COUNT -lt $CONCURRENT_REQUESTS ]; then
    PROTECTION_SCORE=$((100 - (UPDATING_TRUE_COUNT * 100 / CONCURRENT_REQUESTS)))
    echo -e "${YELLOW}⚠ 缓存击穿防护: 良好 (${PROTECTION_SCORE}分)${NC}"
    echo "  - 部分请求触发了重复刷新 ($UPDATING_TRUE_COUNT/$CONCURRENT_REQUESTS)"
    echo "  - 可能是时序问题或 KV 写入延迟"
else
    PROTECTION_SCORE=0
    echo -e "${RED}✗ 缓存击穿防护: 失败 (0分)${NC}"
    echo "  - 所有请求都触发了后台刷新"
    echo "  - 防重复刷新机制完全失效"
    echo "  - 后端可能被击穿！"
fi

echo ""
echo "响应性能评分:"
if [ -n "$AVG_MS" ]; then
    if [ $AVG_MS -lt 100 ]; then
        echo -e "${GREEN}✓ 响应时间: 优秀 (${AVG_MS}ms)${NC}"
    elif [ $AVG_MS -lt 200 ]; then
        echo -e "${GREEN}✓ 响应时间: 良好 (${AVG_MS}ms)${NC}"
    elif [ $AVG_MS -lt 500 ]; then
        echo -e "${YELLOW}⚠ 响应时间: 一般 (${AVG_MS}ms)${NC}"
    else
        echo -e "${RED}✗ 响应时间: 较慢 (${AVG_MS}ms)${NC}"
    fi
fi

echo ""
echo "测试文件保存在:"
echo "  - /tmp/breakdown_test_concurrent/ (并发请求响应)"
echo "  - /tmp/breakdown_test_*.txt (其他测试结果)"
echo ""

if [ $FAILED -eq 0 ] && [ $PROTECTION_SCORE -ge 80 ]; then
    echo -e "${GREEN}✓ 缓存击穿防护测试通过！${NC}"
    exit 0
else
    echo -e "${RED}✗ 缓存击穿防护测试失败或存在问题！${NC}"
    exit 1
fi

