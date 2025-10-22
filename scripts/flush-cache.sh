#!/bin/bash

# 批量刷新缓存脚本
# 用法: ./flush-cache.sh [BASE_URL] [path1] [path2] ...

set -e

# 默认配置
BASE_URL="${1:-http://localhost:8787}"
if [[ ! "$BASE_URL" =~ ^https?:// ]]; then
  BASE_URL="http://localhost:8787"
fi

# 移除BASE_URL参数
shift

echo "🧹 批量缓存刷新工具"
echo "============================"
echo "API网关: $BASE_URL"
echo

# 如果没有提供路径参数，交互式输入
if [ $# -eq 0 ]; then
  echo "请选择刷新方式："
  echo "1. 刷新指定路径"
  echo "2. 刷新所有缓存"
  echo "3. 按模式刷新"
  
  read -p "请选择 (1-3): " choice
  
  case $choice in
    1)
      echo "请输入要刷新的路径（一行一个，空行结束）："
      paths=()
      while IFS= read -r line; do
        [[ -z "$line" ]] && break
        paths+=("$line")
      done
      ;;
    2)
      echo "⚠️  即将刷新所有缓存，此操作不可逆！"
      read -p "确认继续？(y/N): " confirm
      if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        echo "操作已取消"
        exit 0
      fi
      # 刷新所有缓存使用空的keys数组
      paths=()
      ;;
    3)
      read -p "请输入路径模式（如 /api/*）: " pattern
      ;;
    *)
      echo "❌ 无效选择"
      exit 1
      ;;
  esac
else
  # 使用命令行参数
  paths=("$@")
fi

# 构建请求数据
if [ -n "$pattern" ]; then
  request_data="{\"pattern\":\"$pattern\"}"
elif [ ${#paths[@]} -eq 0 ]; then
  request_data="{}"
else
  # 转换数组为JSON格式
  json_paths=$(printf '"%s",' "${paths[@]}")
  json_paths="[${json_paths%,}]"  # 移除最后的逗号并添加方括号
  request_data="{\"keys\":$json_paths}"
fi

echo "📤 发送刷新请求..."
echo "请求数据: $request_data"
echo

# 发送刷新请求
response=$(curl -s -w "\n%{http_code}" \
  -X POST "$BASE_URL/api/admin/cache/flush" \
  -H "Content-Type: application/json" \
  -d "$request_data")

# 分离响应体和状态码
body=$(echo "$response" | head -n -1)
status_code=$(echo "$response" | tail -n 1)

echo "📊 刷新结果："
echo "HTTP状态码: $status_code"

if [ "$status_code" = "200" ]; then
  echo "✅ 刷新成功！"
  
  # 解析响应数据
  if command -v jq >/dev/null 2>&1; then
    echo "$body" | jq -r '
      "刷新数量: " + (.result.flushedCount | tostring) + " 个",
      "耗时: " + (.result.totalTime | tostring) + " ms",
      "失败项目: " + (if .result.failedKeys | length > 0 then (.result.failedKeys | join(", ")) else "无" end)
    '
  else
    echo "响应详情:"
    echo "$body"
    echo
    echo "💡 提示：安装 jq 可以获得更好的响应格式化显示"
  fi
else
  echo "❌ 刷新失败！"
  echo "错误详情:"
  echo "$body"
fi

echo

# 验证建议
if [ "$status_code" = "200" ]; then
  echo "🔍 验证建议："
  if [ ${#paths[@]} -gt 0 ]; then
    echo "• 测试指定路径是否已刷新:"
    for path in "${paths[@]}"; do
      test_url="$BASE_URL$path"
      echo "  curl -v \"$test_url\" 2>&1 | grep -i 'x-cache-status'"
    done
  elif [ -n "$pattern" ]; then
    echo "• 测试匹配模式的路径是否已刷新"
    echo "• 下次访问应该显示 x-cache-status: MISS"
  else
    echo "• 所有缓存已刷新，下次访问应该重新建立缓存"
  fi
  
  echo "• 查看实时缓存日志: wrangler tail | grep Cache"
fi

echo
echo "🛠️ 其他有用命令："
echo "• 查看缓存配置: curl \"$BASE_URL/api/admin/cache/config\""
echo "• 查看缓存统计: curl \"$BASE_URL/api/admin/cache/stats\""
echo "• 缓存状态检测: ./check-cache.sh [URL]"