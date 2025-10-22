# Dockerfile - AWS Fargate 压测容器
FROM williamyeh/wrk:latest

# 安装必要工具
RUN apk add --no-cache curl bash

# 复制压测脚本
COPY run-loadtest.sh /run-loadtest.sh
RUN chmod +x /run-loadtest.sh

ENTRYPOINT ["/run-loadtest.sh"]

