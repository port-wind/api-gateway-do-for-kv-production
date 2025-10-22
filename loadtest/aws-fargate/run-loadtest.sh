#!/bin/bash
#
# AWS Fargate 压测脚本
# 每个容器运行独立的 wrk 实例
#

# 从环境变量读取配置
TARGET_URL=${TARGET_URL:-"https://api-proxy.pwtk.cc/biz-client/biz/user/self?v=fixed"}
THREADS=${THREADS:-4}
CONNECTIONS=${CONNECTIONS:-500}
DURATION=${DURATION:-60}
CID=${CID:-"aws-fargate-loadtest"}
CONTAINER_ID=${CONTAINER_ID:-"unknown"}

echo "=================================================="
echo "AWS Fargate 分布式压测"
echo "=================================================="
echo "容器 ID: $CONTAINER_ID"
echo "目标 URL: $TARGET_URL"
echo "线程数: $THREADS"
echo "并发数: $CONNECTIONS"
echo "持续时间: ${DURATION}s"
echo "=================================================="
echo ""

# 创建 Lua 脚本来打印错误详情
cat > /tmp/report.lua << 'EOF'
done = function(summary, latency, requests)
   io.write("==== 详细错误统计 ====\n")
   for k, v in pairs(summary) do
      if type(v) ~= "table" then
         io.write(string.format("%s: %s\n", k, tostring(v)))
      end
   end
end
EOF

# 运行 wrk
wrk -t${THREADS} -c${CONNECTIONS} -d${DURATION}s \
    --latency \
    --script /tmp/report.lua \
    --header "cid: ${CID}-${CONTAINER_ID}" \
    --header "X-Container-ID: ${CONTAINER_ID}" \
    ${TARGET_URL}

# 上传结果到 S3（可选）
if [ -n "$RESULT_BUCKET" ]; then
    echo ""
    echo "上传结果到 S3..."
    # 需要安装 aws-cli
    # 这里可以把结果保存并上传
fi

