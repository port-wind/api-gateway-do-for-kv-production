#!/bin/bash
# 临时修复超时问题：清空活跃 IP 列表

API_URL="https://api-proxy.bugacard.com"

echo "🔧 正在修复超时问题..."
echo ""

# 方案1：尝试清空活跃 IP 列表（如果有相关管理 API）
# 这需要你的系统有清理 API

echo "📋 临时解决方案："
echo ""
echo "1. 登录 Cloudflare Dashboard"
echo "   https://dash.cloudflare.com"
echo ""
echo "2. 进入：Workers & Pages → KV"
echo ""
echo "3. 选择 namespace: API_GATEWAY_STORAGE"
echo ""
echo "4. 搜索并删除以下 key："
echo "   - active-ips-list"
echo ""
echo "5. 或者将其值改为空数组: []"
echo ""
echo "✅ 这会让系统只查询 2 个默认测试 IP，大幅提升速度"
echo ""
echo "🎯 预期效果："
echo "   - 接口响应时间从 超时 → 1-3秒"
echo "   - DO 查询数量从 N*100 → 2"
echo ""

