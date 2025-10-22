#!/bin/bash

# 缓存性能压测
# 使用 wrk 进行高并发测试，验证缓存性能

set -e

BASE_URL="http://localhost:8787"
TEST_PATH="/kv/suppart-image-service/meta/generations-list"
ENCODED_PATH=$(printf %s "$TEST_PATH" | jq -sRr @uri)

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                                              ║${NC}"
echo -e "${BLUE}║                    ⚡  缓存性能压测（wrk）  ⚡                                 ║${NC}"
echo -e "${BLUE}║                                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 检查wrk是否安装
if ! command -v wrk &> /dev/null; then
    echo -e "${RED}❌ 错误：wrk 未安装${NC}"
    echo ""
    echo "请安装 wrk："
    echo "  macOS: brew install wrk"
    echo "  Linux: sudo apt-get install wrk"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ wrk 已安装${NC}"
echo ""

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}准备阶段：配置缓存${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo ""

# 配置缓存：TTL=60秒
echo "⚙️  配置缓存（TTL=60秒，path-only策略）..."
curl -s -X PUT "${BASE_URL}/api/admin/paths/${ENCODED_PATH}" \
  -H 'Content-Type: application/json' \
  --data '{
    "cache": {
      "enabled": true,
      "version": 200,
      "ttl": 60,
      "keyStrategy": "path-only"
    }
  }' | jq -r 'if .success then "✅ 缓存配置成功" else "❌ 配置失败" end'
echo ""

# 预热缓存
echo "🔥 预热缓存..."
curl -s "${BASE_URL}${TEST_PATH}" > /dev/null
echo -e "${GREEN}✓ 缓存预热完成${NC}"
echo ""

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}测试1：缓存命中性能测试（500并发，持续10秒）${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo ""

echo "⚡ 启动压测..."
echo "   并发连接: 500"
echo "   持续时间: 10秒"
echo "   测试路径: ${TEST_PATH}"
echo ""

wrk -t8 -c500 -d10s --latency "${BASE_URL}${TEST_PATH}"

echo ""
echo -e "${GREEN}✓ 测试1完成${NC}"
echo ""

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}测试2：关闭缓存后的性能对比${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo ""

echo "⚙️  关闭缓存..."
curl -s -X POST "${BASE_URL}/api/admin/paths/batch" \
  -H 'Content-Type: application/json' \
  --data "{
    \"operations\": [{
      \"type\": \"toggle-cache\",
      \"path\": \"${TEST_PATH}\"
    }]
  }" | jq -r 'if .success then "✅ 缓存已关闭" else "❌ 关闭失败" end'
echo ""

sleep 2

echo "⚡ 启动压测（无缓存）..."
echo "   并发连接: 500"
echo "   持续时间: 10秒"
echo ""

wrk -t8 -c500 -d10s --latency "${BASE_URL}${TEST_PATH}"

echo ""
echo -e "${GREEN}✓ 测试2完成${NC}"
echo ""

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}测试3：不同并发级别对比${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo ""

# 重新开启缓存
echo "⚙️  重新开启缓存..."
curl -s -X POST "${BASE_URL}/api/admin/paths/batch" \
  -H 'Content-Type: application/json' \
  --data "{
    \"operations\": [{
      \"type\": \"toggle-cache\",
      \"path\": \"${TEST_PATH}\"
    }]
  }" > /dev/null
echo -e "${GREEN}✓ 缓存已开启${NC}"
echo ""

# 预热
curl -s "${BASE_URL}${TEST_PATH}" > /dev/null
sleep 1

echo "测试不同并发级别..."
echo ""

for concurrency in 100 300 500 1000; do
    echo -e "${YELLOW}━━━ 并发: ${concurrency} ━━━${NC}"
    wrk -t8 -c${concurrency} -d5s "${BASE_URL}${TEST_PATH}" 2>&1 | grep -E "Requests/sec|Latency"
    echo ""
    sleep 2
done

echo -e "${GREEN}✓ 测试3完成${NC}"
echo ""

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}测试4：查看缓存统计${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo ""

echo "📊 查看缓存条目..."
cache_entries=$(curl -s "${BASE_URL}/api/admin/paths/${ENCODED_PATH}/cache-entries?limit=5")
entry_count=$(echo "$cache_entries" | jq '.data.entries | length')
echo "   缓存条目数: $entry_count"

if [ "$entry_count" -gt 0 ]; then
    echo ""
    echo "最新缓存条目："
    echo "$cache_entries" | jq '.data.entries[0] | {cacheKey, ttl, version, createdAt}'
fi
echo ""

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                                              ║${NC}"
echo -e "${BLUE}║                        ✅  压测完成  ✅                                       ║${NC}"
echo -e "${BLUE}║                                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo "📊 性能对比总结："
echo ""
echo "关键指标："
echo "  1. Requests/sec（请求/秒）- 吞吐量"
echo "  2. Latency（延迟）- 响应时间"
echo "  3. Transfer/sec（传输速率）"
echo ""
echo "预期结果："
echo "  ✅ 缓存命中：高吞吐量（>1000 req/s），低延迟（<50ms）"
echo "  ⚠️  无缓存：低吞吐量（<500 req/s），高延迟（>100ms）"
echo "  ✅ 缓存性能提升：2-10倍"
echo ""

