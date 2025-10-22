#!/bin/bash
#
# Quick Win 城市信息功能部署脚本
# 用途：部署城市信息显示功能到 Test 环境
# 

set -e

echo "=========================================="
echo "Quick Win: 城市信息显示功能部署"
echo "=========================================="

cd "$(dirname "$0")/.."

# 1. 运行数据库迁移
echo ""
echo "📝 步骤 1: 运行数据库迁移..."
echo "执行: wrangler d1 migrations apply D1 --remote"
npx wrangler d1 migrations apply D1 --remote

# 2. 部署 Worker 到 Test 环境
echo ""
echo "🚀 步骤 2: 部署 Worker 到 Test 环境..."
echo "执行: npm run deploy"
npm run deploy

# 3. 等待部署完成
echo ""
echo "⏳ 等待 5 秒让部署生效..."
sleep 5

# 4. 验证部署
echo ""
echo "✅ 步骤 3: 验证部署..."
echo ""
echo "请手动验证以下内容："
echo "1. 访问管理后台 IP 监控页面"
echo "2. 检查是否在国家信息下方显示城市名称（蓝色文字）"
echo "3. 观察一段时间，确认新的流量事件会记录城市信息"
echo ""
echo "数据库查询验证："
echo "wrangler d1 execute D1 --remote --command \"SELECT ip_hash, last_seen_city FROM ip_traffic_daily WHERE last_seen_city IS NOT NULL LIMIT 10\""
echo ""
echo "=========================================="
echo "部署完成！"
echo "=========================================="

