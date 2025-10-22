#!/bin/bash

# 本地 wrk 压测脚本
# 参考: /Users/leo/tk.com/do-for-kv-main/loadtest/aws-fargate-loadtest

set -e

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                              ║"
echo "║                    API Gateway 本地压测工具 (wrk)                             ║"
echo "║                                                                              ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""

# 默认参数
TARGET_URL="${1:-https://api-proxy.pwtk.cc/biz-client/biz/user/self}"
THREADS="${2:-4}"           # 线程数（推荐：CPU 核心数）
CONNECTIONS="${3:-50}"      # 并发连接数
DURATION="${4:-30}"         # 持续时间（秒）
CID_HEADER="${5:-test-cid-123}"  # cid header 值

echo -e "${BLUE}📊 压测配置${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  目标 URL:       $TARGET_URL"
echo "  线程数:         $THREADS"
echo "  并发连接数:     $CONNECTIONS"
echo "  持续时间:       ${DURATION}s"
echo "  CID Header:     $CID_HEADER"
echo ""

# 检查 wrk 是否安装
if ! command -v wrk &> /dev/null; then
    echo -e "${RED}✗ wrk 未安装${NC}"
    echo ""
    echo "请先安装 wrk:"
    echo ""
    echo "  # macOS"
    echo "  brew install wrk"
    echo ""
    echo "  # Ubuntu/Debian"
    echo "  sudo apt-get install wrk"
    echo ""
    echo "  # 或者从源码编译"
    echo "  git clone https://github.com/wg/wrk.git"
    echo "  cd wrk && make"
    exit 1
fi

echo -e "${GREEN}✓ wrk 已安装${NC}"
wrk --version
echo ""

# 创建 Lua 脚本用于添加自定义 headers
LUA_SCRIPT="/tmp/wrk_custom_headers.lua"
cat > "$LUA_SCRIPT" << 'LUASCRIPT'
-- 自定义请求函数，添加必需的 headers
wrk.method = "GET"
wrk.headers["Content-Type"] = "application/json"
wrk.headers["cid"] = os.getenv("WRK_CID_HEADER") or "test-cid-123"
wrk.headers["User-Agent"] = "wrk-loadtest/1.0"

-- 记录统计信息
request_count = 0
error_count = 0

-- 每次请求前调用
function request()
    request_count = request_count + 1
    return wrk.format()
end

-- 每次响应后调用
function response(status, headers, body)
    if status ~= 200 then
        error_count = error_count + 1
    end
end

-- 压测结束后调用
function done(summary, latency, requests)
    io.write("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
    io.write("📊 详细统计\n")
    io.write("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n")
    
    io.write(string.format("  总请求数:       %d\n", summary.requests))
    io.write(string.format("  成功请求:       %d\n", summary.requests - error_count))
    io.write(string.format("  失败请求:       %d\n", error_count))
    io.write(string.format("  总耗时:         %.2fs\n", summary.duration / 1000000))
    io.write(string.format("  数据传输:       %.2f MB\n", summary.bytes / 1024 / 1024))
    
    io.write("\n延迟分布:\n")
    io.write(string.format("  P50 (中位数):   %.2fms\n", latency:percentile(50)))
    io.write(string.format("  P75:            %.2fms\n", latency:percentile(75)))
    io.write(string.format("  P90:            %.2fms\n", latency:percentile(90)))
    io.write(string.format("  P99:            %.2fms\n", latency:percentile(99)))
    io.write(string.format("  P99.9:          %.2fms\n", latency:percentile(99.9)))
    io.write(string.format("  最大延迟:       %.2fms\n", latency.max / 1000))
    
    io.write("\n吞吐量:\n")
    io.write(string.format("  QPS:            %.2f req/s\n", summary.requests / (summary.duration / 1000000)))
    io.write(string.format("  带宽:           %.2f MB/s\n", (summary.bytes / 1024 / 1024) / (summary.duration / 1000000)))
    
    local success_rate = ((summary.requests - error_count) / summary.requests) * 100
    io.write(string.format("\n成功率:          %.2f%%\n", success_rate))
    
    if error_count > 0 then
        io.write(string.format("\n⚠️  警告: 有 %d 个请求失败\n", error_count))
    end
end
LUASCRIPT

echo -e "${BLUE}⚙️  准备压测环境${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 预热请求
echo "  执行预热请求（3次）..."
for i in {1..3}; do
    curl -s -o /dev/null -w "    预热 $i: HTTP %{http_code}, 耗时 %{time_total}s\n" \
        -H "cid: $CID_HEADER" \
        "$TARGET_URL" || true
    sleep 0.5
done

echo ""
echo -e "${YELLOW}⏱️  压测开始（持续 ${DURATION}s）...${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 导出环境变量供 Lua 脚本使用
export WRK_CID_HEADER="$CID_HEADER"

# 执行压测
wrk -t"$THREADS" \
    -c"$CONNECTIONS" \
    -d"${DURATION}s" \
    -s "$LUA_SCRIPT" \
    --latency \
    "$TARGET_URL"

# 清理临时文件
rm -f "$LUA_SCRIPT"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✓ 压测完成${NC}"
echo ""

# 建议
echo -e "${BLUE}💡 优化建议${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "如果需要更高压力测试:"
echo "  1. 增加并发连接数: $0 \"$TARGET_URL\" $THREADS 100 $DURATION"
echo "  2. 增加线程数:     $0 \"$TARGET_URL\" 8 $CONNECTIONS $DURATION"
echo "  3. 延长测试时间:   $0 \"$TARGET_URL\" $THREADS $CONNECTIONS 60"
echo ""
echo "如果需要 AWS Fargate 分布式压测:"
echo "  cd /Users/leo/tk.com/do-for-kv-main/loadtest/aws-fargate-loadtest"
echo "  THREADS=8 CONNECTIONS=100 DURATION=90 ./deploy-fargate.sh 100 \"$TARGET_URL\""
echo ""

