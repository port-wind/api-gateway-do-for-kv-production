#!/bin/bash

# 缓存状态检测脚本
# 用法: ./check-cache.sh <URL>

set -e

# 默认配置
BASE_URL="${1:-http://localhost:8787}"
if [[ ! "$BASE_URL" =~ ^https?:// ]]; then
  BASE_URL="http://localhost:8787$BASE_URL"
fi

echo "🔍 缓存状态检测"
echo "============================"
echo "URL: $BASE_URL"
echo

# 函数：检测单次请求
check_single_request() {
  local url="$1"
  local name="$2"
  
  echo "📡 $name"
  
  # 获取响应头和时间
  local temp_file=$(mktemp)
  local response=$(curl -s -w "%{http_code}|%{time_total}" \
    -D "$temp_file" "$url" -o /dev/null)
  
  local status_code=$(echo "$response" | cut -d'|' -f1)
  local time_total=$(echo "$response" | cut -d'|' -f2)
  
  # 提取缓存状态
  local cache_status=$(grep -i "x-cache-status" "$temp_file" 2>/dev/null | \
    cut -d' ' -f2 | tr -d '\r' || echo "未开启")
  
  # 提取内容长度
  local content_length=$(grep -i "content-length" "$temp_file" 2>/dev/null | \
    cut -d' ' -f2 | tr -d '\r' || echo "chunked")
  
  # 输出结果
  printf "  %-15s: %s\n" "HTTP状态" "$status_code"
  printf "  %-15s: %ss\n" "响应时间" "$time_total"
  printf "  %-15s: %s\n" "缓存状态" "$cache_status"
  printf "  %-15s: %s bytes\n" "内容大小" "$content_length"
  
  # 状态判断
  if [ "$cache_status" = "HIT" ]; then
    echo "  🟢 状态: 缓存命中 ✅"
  elif [ "$cache_status" = "MISS" ]; then
    echo "  🟡 状态: 缓存未命中（已建立缓存）"
  else
    echo "  🔴 状态: 缓存未开启"
  fi
  
  rm -f "$temp_file"
  echo
}

echo "🧪 开始测试..."
echo

# 第一次请求（可能建立缓存）
check_single_request "$BASE_URL" "第一次请求"

# 等待一秒，确保缓存已写入
sleep 1

# 第二次请求（应该命中缓存）
check_single_request "$BASE_URL" "第二次请求"

# 总结建议
echo "📋 建议："
echo "• 第一次请求应该显示 MISS（建立缓存）"
echo "• 第二次请求应该显示 HIT（命中缓存）"
echo "• 缓存命中时响应时间应该 <50ms"
echo "• 如果都显示'未开启'，请检查缓存配置"
echo

echo "🔧 相关调试命令："
echo "• 查看缓存配置: curl $BASE_URL/api/admin/cache/config"
echo "• 刷新缓存: curl -X POST $BASE_URL/api/admin/cache/flush -H 'Content-Type: application/json' -d '{\"keys\":[\"your-path\"]}'"
echo "• 实时日志: wrangler tail | grep Cache"