#!/bin/bash
#
# 清理 AWS Fargate 压测资源
# 避免额外收费
#

set -e

AWS_REGION=${AWS_REGION:-"us-west-2"}
CLUSTER_NAME="api-gateway-loadtest-cluster"
TASK_FAMILY="api-gateway-loadtest-task"
ECR_REPO="api-gateway-loadtest-wrk"

echo "🧹 AWS Fargate 资源清理工具"
echo "=================================="
echo "区域: $AWS_REGION"
echo "=================================="
echo ""

# 1. 停止所有正在运行的任务
echo "📦 步骤 1: 停止所有正在运行的任务..."
RUNNING_TASKS=$(aws ecs list-tasks \
    --cluster $CLUSTER_NAME \
    --region $AWS_REGION \
    --desired-status RUNNING \
    --query 'taskArns[*]' \
    --output text)

if [ -n "$RUNNING_TASKS" ]; then
    echo "发现正在运行的任务，正在停止..."
    for task in $RUNNING_TASKS; do
        aws ecs stop-task \
            --cluster $CLUSTER_NAME \
            --task $task \
            --region $AWS_REGION \
            --query 'task.taskArn' \
            --output text
    done
    echo "✅ 所有任务已停止"
else
    echo "✅ 没有正在运行的任务"
fi

echo ""

# 2. 询问是否删除 ECS Cluster
echo "📦 步骤 2: ECS Cluster 管理"
echo "Cluster: $CLUSTER_NAME"
echo "状态: $(aws ecs describe-clusters --clusters $CLUSTER_NAME --region $AWS_REGION --query 'clusters[0].status' --output text)"
echo ""
read -p "是否删除 ECS Cluster? (y/N): " -n 1 -r
echo ""
cluster_choice="$REPLY"  # 保存选择，避免后续被覆盖
if [[ $cluster_choice =~ ^[Yy]$ ]]; then
    echo "删除 Cluster..."
    aws ecs delete-cluster \
        --cluster $CLUSTER_NAME \
        --region $AWS_REGION \
        --output text
    echo "✅ Cluster 已删除"
else
    echo "⏭️  保留 Cluster (不收费，除非有运行中的任务)"
fi

echo ""

# 3. 询问是否注销任务定义
echo "📦 步骤 3: 任务定义管理"
TASK_DEFINITIONS=$(aws ecs list-task-definitions \
    --family-prefix $TASK_FAMILY \
    --region $AWS_REGION \
    --query 'taskDefinitionArns[*]' \
    --output text)

if [ -n "$TASK_DEFINITIONS" ]; then
    echo "发现任务定义: $(echo $TASK_DEFINITIONS | wc -w) 个版本"
    read -p "是否注销所有任务定义? (y/N): " -n 1 -r
    echo ""
    task_def_choice="$REPLY"  # 保存选择
    if [[ $task_def_choice =~ ^[Yy]$ ]]; then
        for task_def in $TASK_DEFINITIONS; do
            aws ecs deregister-task-definition \
                --task-definition $task_def \
                --region $AWS_REGION \
                --output text > /dev/null
            echo "  ✅ 注销: $task_def"
        done
        echo "✅ 所有任务定义已注销"
    else
        echo "⏭️  保留任务定义 (不收费)"
    fi
else
    echo "✅ 没有任务定义"
    task_def_choice=""  # 标记为未询问
fi

echo ""

# 4. 询问是否删除 ECR 仓库
echo "📦 步骤 4: ECR 仓库管理"
ECR_EXISTS=$(aws ecr describe-repositories \
    --repository-names $ECR_REPO \
    --region $AWS_REGION \
    --query 'repositories[0].repositoryName' \
    --output text 2>/dev/null || echo "")

if [ -n "$ECR_EXISTS" ]; then
    IMAGE_COUNT=$(aws ecr list-images \
        --repository-name $ECR_REPO \
        --region $AWS_REGION \
        --query 'length(imageIds)' \
        --output text)
    
    echo "仓库: $ECR_REPO"
    echo "镜像数量: $IMAGE_COUNT"
    echo "⚠️  注意: ECR 仓库会收费（存储费用）"
    echo ""
    read -p "是否删除 ECR 仓库? (y/N): " -n 1 -r
    echo ""
    ecr_choice="$REPLY"  # 保存选择
    if [[ $ecr_choice =~ ^[Yy]$ ]]; then
        echo "删除 ECR 仓库..."
        aws ecr delete-repository \
            --repository-name $ECR_REPO \
            --region $AWS_REGION \
            --force \
            --output text
        echo "✅ ECR 仓库已删除"
    else
        echo "⏭️  保留 ECR 仓库"
        echo "💡 提示: 如果不再使用，建议删除以避免存储费用"
    fi
else
    echo "✅ ECR 仓库不存在"
    ecr_choice=""  # 标记为未询问
fi

echo ""
echo "=================================="
echo "✅ 清理完成！"
echo "=================================="
echo ""
echo "💰 收费说明:"
echo "  ✅ Fargate 任务: 已停止，不再收费"
echo "  ✅ ECS Cluster: $(if [[ $cluster_choice =~ ^[Yy]$ ]]; then echo "已删除"; else echo "保留中，不收费（空闲集群）"; fi)"
echo "  ℹ️  任务定义: $(if [[ $task_def_choice =~ ^[Yy]$ ]]; then echo "已注销"; elif [ -z "$task_def_choice" ]; then echo "无"; else echo "保留中"; fi)"
echo "  ⚠️  ECR 仓库: $(if [[ $ecr_choice =~ ^[Yy]$ ]]; then echo "已删除"; elif [ -z "$ecr_choice" ]; then echo "不存在"; else echo "保留中，按存储收费（约 \$0.10/GB/月）"; fi)"
echo ""
echo "📊 检查当前成本:"
echo "  aws ce get-cost-and-usage --time-period Start=\$(date -u -d '7 days ago' +%Y-%m-%d),End=\$(date -u +%Y-%m-%d) --granularity DAILY --metrics BlendedCost --region us-west-2"
echo ""

