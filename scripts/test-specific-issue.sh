#!/bin/bash

# 专门测试特定问题的脚本
# 基于提供的 curl 命令进行诊断

set -e

# 从原始curl命令中提取的token
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsb2dpbnRpbWUiOiIxNzU4ODcyMjAxNzM2IiwiY2xpZW50VHlwZSI6IkNfV0VCIiwiaWQiOiIxMzY0NjYwNjM0MjIxODA3Mzc5IiwidXNlcm5hbWUiOiJDaHJpc3RvcGhlcjIwNzEyNTExMzA5NzQiLCJjaWQiOiI3Mzc2ODQzNTQ4MTk4NDQwOTYwLjEuODhmYjEzMGI2YzU0MWQyNmNjZWI5Yjc5MDY2YjJiMjJiOWFiYTM1NyIsImV4cCI6MTc1OTQ3NzAwMX0.H8bdKwx5EtuNPVWhsSnIBIxhnXt9XjHl2x0g0OZuR0s"

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🔍 专项问题诊断${NC}"
echo "测试路径: /biz-client/biz/search/topic/query"
echo "使用完整的原始请求头进行测试"
echo ""

# 使用原始的完整curl命令进行测试
echo -e "${YELLOW}▶ 执行原始请求...${NC}"

# 准备日志目录
mkdir -p ./logs
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="./logs/specific_test_$TIMESTAMP.log"

# 执行原始curl命令并记录详细信息
{
    echo "=== 原始 CURL 命令测试 ==="
    echo "时间: $(date)"
    echo "命令:"
    echo ""
    
    curl -v -w '\n\n===== 请求统计 =====\n时间_总计: %{time_total}s\n时间_连接: %{time_connect}s\n时间_首字节: %{time_starttransfer}s\nHTTP状态: %{http_code}\n下载大小: %{size_download} bytes\n' \
        'https://api-proxy.pwtk.cc/biz-client/biz/search/topic/query' \
        -H 'accept: application/json, text/plain, */*' \
        -H 'accept-language: en,en-US;q=0.9,zh-CN;q=0.8,zh;q=0.7,ja;q=0.6' \
        -H 'businesstype: XTK' \
        -H 'cid: 7376843548198440960.1.88fb130b6c541d26cceb9b79066b2b22b9aba357' \
        -H 'clienttype: C_WEB' \
        -H 'content-type: application/json' \
        -H 'origin: https://demo.pwtk.cc' \
        -H 'priority: u=1, i' \
        -H 'referer: https://demo.pwtk.cc/' \
        -H 'sec-ch-ua: "Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"' \
        -H 'sec-ch-ua-mobile: ?0' \
        -H 'sec-ch-ua-platform: "macOS"' \
        -H 'sec-fetch-dest: empty' \
        -H 'sec-fetch-mode: cors' \
        -H 'sec-fetch-site: same-site' \
        -H "token: $TOKEN" \
        -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' \
        --data-raw '{}'
        
} > "$LOG_FILE" 2>&1

CURL_EXIT_CODE=$?

echo ""
echo -e "${BLUE}▶ 分析结果...${NC}"

# 分析结果
if [ $CURL_EXIT_CODE -eq 0 ]; then
    # 提取关键信息
    HTTP_CODE=$(grep "HTTP状态:" "$LOG_FILE" | awk '{print $2}' || echo "未知")
    TOTAL_TIME=$(grep "时间_总计:" "$LOG_FILE" | awk '{print $2}' || echo "未知")
    SIZE_DOWNLOAD=$(grep "下载大小:" "$LOG_FILE" | awk '{print $2}' || echo "未知")
    
    echo -e "${GREEN}✅ 请求执行成功${NC}"
    echo "📊 关键指标:"
    echo "   - HTTP状态码: $HTTP_CODE"
    echo "   - 总耗时: $TOTAL_TIME"
    echo "   - 响应大小: $SIZE_DOWNLOAD"
    
    # 分析HTTP状态码
    case "$HTTP_CODE" in
        200)
            echo -e "${GREEN}✅ 状态码200 - 请求成功，代理服务工作正常${NC}"
            echo "🎯 结论: 问题很可能不在代理服务"
            ;;
        400)
            echo -e "${RED}❌ 状态码400 - 请求格式错误${NC}"
            echo "🔍 建议检查: 请求参数、请求体格式"
            ;;
        401)
            echo -e "${RED}❌ 状态码401 - 认证失败${NC}"
            echo "🔍 建议检查: token是否有效或已过期"
            ;;
        403)
            echo -e "${RED}❌ 状态码403 - 请求被拒绝${NC}"
            echo "🔍 建议检查: 权限问题、地域限制、IP封禁"
            ;;
        404)
            echo -e "${RED}❌ 状态码404 - 路径未找到${NC}"
            echo "🔍 建议检查: 代理路由配置是否正确"
            ;;
        429)
            echo -e "${RED}❌ 状态码429 - 请求过于频繁${NC}"
            echo "🔍 建议检查: 限流配置是否过于严格"
            ;;
        500)
            echo -e "${RED}❌ 状态码500 - 服务器内部错误${NC}"
            echo "🔍 建议检查: 代理服务日志、后端服务状态"
            ;;
        502)
            echo -e "${RED}❌ 状态码502 - 网关错误${NC}"
            echo "🔍 建议检查: 后端服务是否可用"
            ;;
        503)
            echo -e "${RED}❌ 状态码503 - 服务不可用${NC}"
            echo "🔍 建议检查: 后端服务负载、代理配置"
            ;;
        *)
            echo -e "${YELLOW}⚠️ 状态码$HTTP_CODE - 需要进一步分析${NC}"
            ;;
    esac
    
    # 检查响应内容中的错误信息
    echo ""
    echo -e "${BLUE}▶ 检查响应内容...${NC}"
    
    # 提取响应体（跳过HTTP头和curl的输出）
    RESPONSE_BODY=$(sed -n '/^{/,$p' "$LOG_FILE" | sed '/===== 请求统计 =====/,$d')
    
    if [ -n "$RESPONSE_BODY" ] && echo "$RESPONSE_BODY" | jq . >/dev/null 2>&1; then
        echo "📄 响应格式: JSON"
        
        # 检查是否包含错误信息
        ERROR_MSG=$(echo "$RESPONSE_BODY" | jq -r '.error // .message // empty' 2>/dev/null)
        if [ -n "$ERROR_MSG" ]; then
            echo -e "${RED}❌ 响应包含错误信息: $ERROR_MSG${NC}"
        fi
        
        # 检查数据是否存在
        DATA_EXISTS=$(echo "$RESPONSE_BODY" | jq -r '.data // empty' 2>/dev/null)
        if [ -n "$DATA_EXISTS" ]; then
            echo -e "${GREEN}✅ 响应包含数据${NC}"
        else
            echo -e "${YELLOW}⚠️ 响应不包含数据字段${NC}"
        fi
        
    elif [ -n "$RESPONSE_BODY" ]; then
        echo "📄 响应格式: 文本/其他"
        echo "前100字符预览: $(echo "$RESPONSE_BODY" | head -c 100)..."
    else
        echo "📄 无响应内容或响应为空"
    fi

else
    echo -e "${RED}❌ 请求执行失败 (curl退出码: $CURL_EXIT_CODE)${NC}"
    
    # 分析curl错误码
    case $CURL_EXIT_CODE in
        6)
            echo "🔍 错误原因: 无法解析主机名 api-proxy.pwtk.cc"
            echo "💡 建议: 检查DNS设置或网络连接"
            ;;
        7)
            echo "🔍 错误原因: 无法连接到服务器"
            echo "💡 建议: 检查服务是否运行，网络是否可达"
            ;;
        28)
            echo "🔍 错误原因: 请求超时"
            echo "💡 建议: 检查网络延迟或服务器响应时间"
            ;;
        35)
            echo "🔍 错误原因: SSL/TLS连接错误"
            echo "💡 建议: 检查证书配置"
            ;;
        *)
            echo "🔍 其他curl错误，检查详细日志: $LOG_FILE"
            ;;
    esac
fi

echo ""
echo -e "${BLUE}📋 快速检查清单:${NC}"
echo ""
echo "1. 代理服务健康状态:"
curl -s --max-time 5 https://api-proxy.pwtk.cc/health > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "   ${GREEN}✅ 代理服务可访问${NC}"
else
    echo -e "   ${RED}❌ 代理服务不可访问${NC}"
fi

echo ""
echo "2. 管理接口检查:"
ENCODED_PATH=$(echo "/biz-client/biz/search/topic/query" | sed 's|/|%2F|g')
curl -s --max-time 5 "https://api-proxy.pwtk.cc/api/admin/paths/${ENCODED_PATH}" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "   ${GREEN}✅ 路径配置可查询${NC}"
else
    echo -e "   ${YELLOW}⚠️ 路径配置查询异常${NC}"
fi

echo ""
echo "3. 代理路由配置检查:"
curl -s --max-time 5 "https://api-proxy.pwtk.cc/api/admin/proxy-routes" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "   ${GREEN}✅ 代理路由配置可查询${NC}"
else
    echo -e "   ${YELLOW}⚠️ 代理路由配置查询异常${NC}"
fi

echo ""
echo -e "${BLUE}📄 详细日志保存在: $LOG_FILE${NC}"
echo ""

# 根据检查结果给出最终建议
if [ $CURL_EXIT_CODE -eq 0 ] && [[ "$HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
    echo -e "${GREEN}🎯 最终结论: 代理服务工作正常${NC}"
    echo "如果用户仍然遇到问题，建议："
    echo "  • 检查用户的网络环境"
    echo "  • 确认用户使用的token是否有效"
    echo "  • 收集用户端的详细错误信息"
elif [ $CURL_EXIT_CODE -ne 0 ]; then
    echo -e "${RED}🎯 最终结论: 网络连接或基础设施问题${NC}"
    echo "建议立即检查："
    echo "  • 代理服务是否正常运行"
    echo "  • 网络连接和DNS解析"
    echo "  • 服务器资源使用情况"
else
    echo -e "${YELLOW}🎯 最终结论: 请求被处理但返回错误状态${NC}"
    echo "建议检查："
    echo "  • 后端服务状态"
    echo "  • 认证和权限配置"
    echo "  • 限流和安全策略"
fi

echo ""
echo -e "${BLUE}使用完整诊断工具进行更深入分析:${NC}"
echo "  ./scripts/diagnose-proxy.sh --full --token \"$TOKEN\""