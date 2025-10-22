#!/bin/bash

# 快速代理性能对比测试（基于 curl）
# 使用 curl 的 -w 参数测量详细的时间指标

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
PROXY_URL="https://api-proxy.pwtk.cc/biz-client/biz/relationship/batch-get"
DIRECT_URL="https://biz-client.pwtk.cc/biz/relationship/batch-get"
TEST_COUNT=10  # 默认测试次数

# 请求数据
REQUEST_BODY='{
  "targetUserIdList": [
    "1419717728603737560","1426958892054610548","1377322463452463107",
    "1304454470771408903","1304501599984420846","1289249852974170115",
    "1419638254369509156","1419638186107211550","1304500513764542441",
    "1309103765692874754","1362005949899869629","1352567054124714460",
    "1359531153609982636","1308805892744937772","1321816559647197001",
    "1402636777356789213","1311992759522951177","1387773546008152308",
    "1349415577281626492"
  ],
  "direct": 1
}'

# curl 时间格式字符串
CURL_FORMAT='
时间详情:
  DNS解析:         %{time_namelookup}s
  TCP连接:         %{time_connect}s
  TLS握手:         %{time_appconnect}s
  开始传输:        %{time_starttransfer}s
  总时间:          %{time_total}s
  
速度信息:
  下载速度:        %{speed_download} bytes/s
  总下载大小:      %{size_download} bytes
  
状态:
  HTTP状态码:      %{http_code}
  重定向次数:      %{num_redirects}
'

# 创建临时文件存储结果
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "════════════════════════════════════════════════════════════════════"
echo "                   🚀 API 代理快速性能测试"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "测试配置:"
echo "  - 代理地址: $PROXY_URL"
echo "  - 直连地址: $DIRECT_URL"
echo "  - 测试次数: $TEST_COUNT"
echo ""

# 函数：单次测试
test_single_request() {
    local url=$1
    local name=$2
    local output_file=$3
    
    echo -n "  ⏱️  测试 $name ... "
    
    # 执行请求并记录时间
    curl -s -o /dev/null -w "$CURL_FORMAT" \
        -X POST "$url" \
        -H 'accept: application/json, text/plain, */*' \
        -H 'accept-language: en,en-US;q=0.9,zh-CN;q=0.8,zh;q=0.7,ja;q=0.6' \
        -H 'businesstype: XTK' \
        -H 'cache-control: no-cache' \
        -H 'cid: 7376843548198440960.1.88fb130b6c541d26cceb9b79066b2b22b9aba357' \
        -H 'clienttype: C_WEB' \
        -H 'content-type: application/json' \
        -H 'origin: https://demo.pwtk.cc' \
        -H 'pragma: no-cache' \
        -H 'referer: https://demo.pwtk.cc/' \
        -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' \
        --data-raw "$REQUEST_BODY" \
        --compressed \
        > "$output_file" 2>&1
    
    echo "完成"
}

# 函数：提取时间值
extract_time() {
    local file=$1
    local field=$2
    grep "$field" "$file" | awk '{print $2}' | sed 's/s$//'
}

# 函数：计算平均值
calculate_average() {
    local sum=0
    local count=0
    for val in "$@"; do
        sum=$(echo "$sum + $val" | bc)
        count=$((count + 1))
    done
    if [ $count -gt 0 ]; then
        echo "scale=4; $sum / $count" | bc
    else
        echo "0"
    fi
}

# 函数：批量测试
batch_test() {
    local url=$1
    local name=$2
    local result_prefix=$3
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📊 测试: $name"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # 预热
    echo ""
    echo "🔥 预热请求..."
    test_single_request "$url" "预热" "$TEMP_DIR/warmup.txt"
    sleep 1
    
    # 正式测试
    echo ""
    echo "📈 正式测试 ($TEST_COUNT 次):"
    
    local dns_times=()
    local connect_times=()
    local tls_times=()
    local ttfb_times=()
    local total_times=()
    
    for i in $(seq 1 $TEST_COUNT); do
        local output_file="$TEMP_DIR/${result_prefix}_${i}.txt"
        test_single_request "$url" "#$i" "$output_file"
        
        # 提取时间数据
        dns_times+=( $(extract_time "$output_file" "DNS解析:") )
        connect_times+=( $(extract_time "$output_file" "TCP连接:") )
        tls_times+=( $(extract_time "$output_file" "TLS握手:") )
        ttfb_times+=( $(extract_time "$output_file" "开始传输:") )
        total_times+=( $(extract_time "$output_file" "总时间:") )
        
        # 短暂延迟避免请求过快
        sleep 0.1
    done
    
    # 计算平均值
    echo ""
    echo "📊 统计结果:"
    echo "────────────────────────────────────────────────────────────────────"
    printf "  DNS 解析:        %.4f 秒\n" $(calculate_average "${dns_times[@]}")
    printf "  TCP 连接:        %.4f 秒\n" $(calculate_average "${connect_times[@]}")
    printf "  TLS 握手:        %.4f 秒\n" $(calculate_average "${tls_times[@]}")
    printf "  首字节时间:      %.4f 秒\n" $(calculate_average "${ttfb_times[@]}")
    printf "  总时间:          %.4f 秒\n" $(calculate_average "${total_times[@]}")
    echo "────────────────────────────────────────────────────────────────────"
    
    # 存储结果供后续对比
    echo "$(calculate_average "${dns_times[@]}")" > "$TEMP_DIR/${result_prefix}_dns_avg"
    echo "$(calculate_average "${connect_times[@]}")" > "$TEMP_DIR/${result_prefix}_connect_avg"
    echo "$(calculate_average "${tls_times[@]}")" > "$TEMP_DIR/${result_prefix}_tls_avg"
    echo "$(calculate_average "${ttfb_times[@]}")" > "$TEMP_DIR/${result_prefix}_ttfb_avg"
    echo "$(calculate_average "${total_times[@]}")" > "$TEMP_DIR/${result_prefix}_total_avg"
}

# 执行测试
batch_test "$PROXY_URL" "代理路径" "proxy"
sleep 2
batch_test "$DIRECT_URL" "直连路径" "direct"

# 对比分析
echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "                      🔍 对比分析"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# 读取平均值
proxy_dns=$(cat "$TEMP_DIR/proxy_dns_avg")
proxy_connect=$(cat "$TEMP_DIR/proxy_connect_avg")
proxy_tls=$(cat "$TEMP_DIR/proxy_tls_avg")
proxy_ttfb=$(cat "$TEMP_DIR/proxy_ttfb_avg")
proxy_total=$(cat "$TEMP_DIR/proxy_total_avg")

direct_dns=$(cat "$TEMP_DIR/direct_dns_avg")
direct_connect=$(cat "$TEMP_DIR/direct_connect_avg")
direct_tls=$(cat "$TEMP_DIR/direct_tls_avg")
direct_ttfb=$(cat "$TEMP_DIR/direct_ttfb_avg")
direct_total=$(cat "$TEMP_DIR/direct_total_avg")

# 计算差异
dns_diff=$(echo "$proxy_dns - $direct_dns" | bc)
connect_diff=$(echo "$proxy_connect - $direct_connect" | bc)
tls_diff=$(echo "$proxy_tls - $direct_tls" | bc)
ttfb_diff=$(echo "$proxy_ttfb - $direct_ttfb" | bc)
total_diff=$(echo "$proxy_total - $direct_total" | bc)

# 计算百分比
total_percent=$(echo "scale=2; ($total_diff / $direct_total) * 100" | bc)

echo "指标对比 (代理 vs 直连):"
echo "────────────────────────────────────────────────────────────────────"
printf "  DNS 解析:        %.4f秒 vs %.4f秒 (差: %+.4f秒)\n" $proxy_dns $direct_dns $dns_diff
printf "  TCP 连接:        %.4f秒 vs %.4f秒 (差: %+.4f秒)\n" $proxy_connect $direct_connect $connect_diff
printf "  TLS 握手:        %.4f秒 vs %.4f秒 (差: %+.4f秒)\n" $proxy_tls $direct_tls $tls_diff
printf "  首字节时间:      %.4f秒 vs %.4f秒 (差: %+.4f秒)\n" $proxy_ttfb $direct_ttfb $ttfb_diff
printf "  总时间:          %.4f秒 vs %.4f秒 (差: %+.4f秒, %+.1f%%)\n" $proxy_total $direct_total $total_diff $total_percent
echo "────────────────────────────────────────────────────────────────────"

# 瓶颈分析
echo ""
echo "💡 瓶颈分析:"
echo "────────────────────────────────────────────────────────────────────"

# 计算 Worker 处理时间 (TTFB - DNS - TCP - TLS)
proxy_processing=$(echo "$proxy_ttfb - $proxy_dns - ($proxy_connect - $proxy_dns) - ($proxy_tls - $proxy_connect)" | bc)
direct_processing=$(echo "$direct_ttfb - $direct_dns - ($direct_connect - $direct_dns) - ($direct_tls - $direct_connect)" | bc)
processing_diff=$(echo "$proxy_processing - $direct_processing" | bc)

printf "  Worker/服务器处理时间: %.4f秒 (代理) vs %.4f秒 (直连)\n" $proxy_processing $direct_processing
printf "  处理时间差异: %+.4f秒\n" $processing_diff

# 给出建议
echo ""
echo "📝 优化建议:"
echo "────────────────────────────────────────────────────────────────────"

# 判断主要瓶颈
if (( $(echo "$total_diff < 0.05" | bc -l) )); then
    echo -e "  ${GREEN}✅ 性能优秀！代理几乎没有增加延迟${NC}"
elif (( $(echo "$total_diff < 0.15" | bc -l) )); then
    echo -e "  ${GREEN}✅ 性能良好，代理延迟在可接受范围内${NC}"
elif (( $(echo "$total_diff < 0.3" | bc -l) )); then
    echo -e "  ${YELLOW}⚠️  性能可接受，但有优化空间${NC}"
else
    echo -e "  ${RED}🚨 性能需要优化，代理增加了明显延迟${NC}"
fi

if (( $(echo "$processing_diff > 0.05" | bc -l) )); then
    echo -e "  ${YELLOW}⚠️  Worker 处理时间较长，建议:${NC}"
    echo "     - 使用 wrangler tail 分析详细耗时"
    echo "     - 检查 D1 查询性能，添加必要索引"
    echo "     - 优化数据处理逻辑"
    echo "     - 考虑使用 KV 缓存热点数据"
fi

if (( $(echo "($proxy_dns + ($proxy_connect - $proxy_dns) + ($proxy_tls - $proxy_connect)) > 0.1" | bc -l) )); then
    echo -e "  ${YELLOW}⚠️  网络连接耗时较长，建议:${NC}"
    echo "     - 确保使用 Cloudflare 边缘节点"
    echo "     - 检查网络路径是否最优"
fi

echo "────────────────────────────────────────────────────────────────────"
echo ""
echo "✅ 测试完成！"
echo ""
echo "💡 提示："
echo "  - 要获取更详细的分析，运行: node scripts/benchmark-proxy-vs-direct.js"
echo "  - 要分析 Worker 内部耗时，运行: wrangler tail --format pretty"
echo "  - 要查看详细日志，运行: wrangler tail --format json"
echo ""

