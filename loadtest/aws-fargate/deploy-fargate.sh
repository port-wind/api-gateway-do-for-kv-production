#!/bin/bash
#
# 部署到 AWS Fargate 并启动分布式压测
#
# 使用方法:
# ./deploy-fargate.sh 10  # 启动 10 个容器
#

set -e

# 配置
AWS_REGION=${AWS_REGION:-"us-west-2"}
ECR_REPO="api-gateway-loadtest-wrk"
CLUSTER_NAME="api-gateway-loadtest-cluster"
TASK_FAMILY="api-gateway-loadtest-task"
CONTAINER_COUNT=${1:-20}  # 默认 20 个容器，目标 10000 RPS
TARGET_URL=${2:-"https://api-proxy.pwtk.cc/biz-client/biz/user/self?v=fixed"}  # API Gateway 测试接口

# 可配置的压测参数
THREADS=${THREADS:-4}         # 默认 4 线程
CONNECTIONS=${CONNECTIONS:-500}  # 默认 500 并发（每个容器）
DURATION=${DURATION:-60}      # 默认 60 秒

echo "🚀 AWS Fargate 分布式压测部署"
echo "=================================="
echo "区域: $AWS_REGION"
echo "容器数量: $CONTAINER_COUNT"
echo "单容器配置: ${THREADS}线程 × ${CONNECTIONS}并发"
echo "总并发: $((CONTAINER_COUNT * CONNECTIONS))"
echo "目标: $TARGET_URL"
echo "=================================="
echo ""

# 1. 构建并推送 Docker 镜像
echo "📦 步骤 1: 构建 Docker 镜像..."
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"

# 登录 ECR
echo "🔐 登录 ECR..."
aws ecr get-login-password --region $AWS_REGION | \
    docker login --username AWS --password-stdin $ECR_URI

# 构建镜像
echo "🔨 构建镜像..."
docker build -t $ECR_REPO .

# 标记并推送
docker tag $ECR_REPO:latest $ECR_URI:latest
docker push $ECR_URI:latest

echo "✅ 镜像推送完成: $ECR_URI:latest"
echo ""

# 2. 创建 ECS Cluster（如果不存在）
echo "📦 步骤 2: 创建 ECS Cluster..."
aws ecs create-cluster --cluster-name $CLUSTER_NAME --region $AWS_REGION 2>/dev/null || true
echo "✅ Cluster 就绪"
echo ""

# 3. 注册任务定义
echo "📦 步骤 3: 注册任务定义..."
cat > task-definition.json << EOF
{
  "family": "$TASK_FAMILY",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::${AWS_ACCOUNT_ID}:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "loadtest",
      "image": "$ECR_URI:latest",
      "essential": true,
      "environment": [
        {
          "name": "TARGET_URL",
          "value": "https://pwtk-kv-manager.andy-zhan.workers.dev/cached-kv/aws-test"
        },
        {
          "name": "THREADS",
          "value": "$THREADS"
        },
        {
          "name": "CONNECTIONS",
          "value": "$CONNECTIONS"
        },
        {
          "name": "DURATION",
          "value": "$DURATION"
        },
        {
          "name": "API_KEY",
          "value": "pwtk-api-key-2025"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/loadtest",
          "awslogs-region": "$AWS_REGION",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
EOF

aws ecs register-task-definition \
    --cli-input-json file://task-definition.json \
    --region $AWS_REGION > /dev/null

echo "✅ 任务定义注册完成"
echo ""

# 4. 获取默认 VPC 和子网
echo "📦 步骤 4: 获取网络配置..."
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text --region $AWS_REGION)
SUBNET_IDS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query "Subnets[*].SubnetId" --output text --region $AWS_REGION | tr '\t' ',')
SECURITY_GROUP=$(aws ec2 describe-security-groups --filters "Name=vpc-id,Values=$VPC_ID" "Name=group-name,Values=default" --query "SecurityGroups[0].GroupId" --output text --region $AWS_REGION)

echo "✅ VPC: $VPC_ID"
echo "✅ 子网: $SUBNET_IDS"
echo "✅ 安全组: $SECURITY_GROUP"
echo ""

# 5. 启动多个任务（并行）
echo "🚀 步骤 5: 启动 $CONTAINER_COUNT 个 Fargate 任务（并行）..."
START_TIME=$(date +%s)
echo "   开始时间: $(date '+%H:%M:%S')"
echo ""

TASK_ARNS=()
PIDS=()

# 并行启动所有任务（真正的并行，所有任务几乎同时发起）
for i in $(seq 1 $CONTAINER_COUNT); do
    (
        task_start=$(date +%s)
        
        TASK_ARN=$(aws ecs run-task \
            --cluster $CLUSTER_NAME \
            --task-definition $TASK_FAMILY \
            --launch-type FARGATE \
            --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_IDS],securityGroups=[$SECURITY_GROUP],assignPublicIp=ENABLED}" \
            --overrides "{\"containerOverrides\":[{\"name\":\"loadtest\",\"environment\":[{\"name\":\"CONTAINER_ID\",\"value\":\"container-$i\"},{\"name\":\"TARGET_URL\",\"value\":\"$TARGET_URL\"}]}]}" \
            --region $AWS_REGION \
            --query "tasks[0].taskArn" \
            --output text 2>/dev/null)
        
        task_end=$(date +%s)
        task_duration=$((task_end - task_start))
        
        echo "[$(date '+%H:%M:%S')] ✅ 任务 $i 已启动 (耗时: ${task_duration}s)"
        echo "$TASK_ARN" > "/tmp/task-arn-$i.txt"
    ) &
    PIDS+=($!)
    
    # 每 5 个任务稍微间隔一下，避免 AWS API 限流
    if [ $((i % 5)) -eq 0 ]; then
        sleep 0.1
    fi
done

# 等待所有并行任务完成
echo ""
echo "⏳ 等待所有任务启动完成..."
for pid in "${PIDS[@]}"; do
    wait $pid
done

END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))
echo "   结束时间: $(date '+%H:%M:%S')"
echo "   总耗时: ${TOTAL_TIME}s"
echo ""

# 收集所有任务 ARN
for i in $(seq 1 $CONTAINER_COUNT); do
    if [ -f "/tmp/task-arn-$i.txt" ]; then
        TASK_ARNS+=($(cat "/tmp/task-arn-$i.txt"))
        rm "/tmp/task-arn-$i.txt"
    fi
done

echo ""
echo "=================================================="
echo "✅ 所有任务已启动！"
echo "=================================================="
echo ""
echo "总并发: $((CONTAINER_COUNT * CONNECTIONS)) (每容器 $CONNECTIONS)"
echo "总线程: $((CONTAINER_COUNT * THREADS))"
echo ""
echo "查看实时日志:"
echo "  aws logs tail /ecs/loadtest --follow --region $AWS_REGION"
echo ""
echo "查看任务状态:"
echo "  aws ecs list-tasks --cluster $CLUSTER_NAME --region $AWS_REGION"
echo ""
echo "等待 70 秒后任务将完成..."
echo "=================================================="

# 等待任务完成
sleep 70

echo ""
echo "📊 收集结果..."
echo ""

# 获取日志
for TASK_ARN in "${TASK_ARNS[@]}"; do
    TASK_ID=$(echo $TASK_ARN | cut -d'/' -f3)
    echo "--- 容器 $TASK_ID 的结果 ---"
    aws logs get-log-events \
        --log-group-name /ecs/loadtest \
        --log-stream-name "ecs/loadtest/$TASK_ID" \
        --region $AWS_REGION \
        --query 'events[*].message' \
        --output text 2>/dev/null || echo "日志尚未可用"
    echo ""
done

echo "=================================================="
echo "✅ 压测完成！"
echo "=================================================="

