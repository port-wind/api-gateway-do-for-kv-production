#!/bin/bash

# API Gateway 压测场景脚本

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOADTEST_SCRIPT="$SCRIPT_DIR/loadtest-wrk.sh"

TARGET_URL="https://api-proxy.pwtk.cc/biz-client/biz/user/self"
CID_HEADER="test-loadtest-$(date +%s)"

echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                              ║"
echo "║                    API Gateway 压测场景                                       ║"
echo "║                                                                              ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""

# 检查 wrk 是否安装
if ! command -v wrk &> /dev/null; then
    echo -e "${RED}✗ wrk 未安装，请先安装:${NC}"
    echo "  brew install wrk  # macOS"
    exit 1
fi

echo -e "${BLUE}选择压测场景:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  1. 🔥 轻量级压测   (2线程, 10连接, 30秒)  - 测试基本性能"
echo "  2. 🚀 中等压力     (4线程, 50连接, 60秒)  - 模拟正常流量"
echo "  3. ⚡ 高压力测试   (8线程, 100连接, 90秒) - 接近生产峰值"
echo "  4. 💥 极限压测     (12线程, 200连接, 120秒) - 压力测试"
echo "  5. 🎯 缓存效果测试 (4线程, 20连接, 60秒)  - 单路径缓存"
echo "  6. 📊 自定义配置"
echo ""
read -p "请选择场景 (1-6): " choice

case $choice in
    1)
        echo ""
        echo -e "${GREEN}▶ 场景 1: 轻量级压测${NC}"
        echo "  用途: 验证基本功能，检查错误率"
        echo "  预期 QPS: 100-500"
        echo ""
        "$LOADTEST_SCRIPT" "$TARGET_URL" 2 10 30 "$CID_HEADER"
        ;;
    2)
        echo ""
        echo -e "${GREEN}▶ 场景 2: 中等压力${NC}"
        echo "  用途: 模拟正常业务流量"
        echo "  预期 QPS: 500-2000"
        echo ""
        "$LOADTEST_SCRIPT" "$TARGET_URL" 4 50 60 "$CID_HEADER"
        ;;
    3)
        echo ""
        echo -e "${YELLOW}▶ 场景 3: 高压力测试${NC}"
        echo "  用途: 接近生产环境峰值流量"
        echo "  预期 QPS: 2000-5000"
        echo "  ⚠️  可能触发限流或缓存击穿"
        echo ""
        "$LOADTEST_SCRIPT" "$TARGET_URL" 8 100 90 "$CID_HEADER"
        ;;
    4)
        echo ""
        echo -e "${YELLOW}▶ 场景 4: 极限压测${NC}"
        echo "  用途: 压力测试，寻找系统瓶颈"
        echo "  预期 QPS: 5000+"
        echo "  ⚠️  警告: 可能导致服务不可用，仅在测试环境使用！"
        echo ""
        read -p "确认执行极限压测? (yes/no): " confirm
        if [[ "$confirm" == "yes" ]]; then
            "$LOADTEST_SCRIPT" "$TARGET_URL" 12 200 120 "$CID_HEADER"
        else
            echo "已取消"
        fi
        ;;
    5)
        echo ""
        echo -e "${GREEN}▶ 场景 5: 缓存效果测试${NC}"
        echo "  用途: 测试缓存命中率和响应时间"
        echo "  特点: 所有请求都打同一个路径（相同 cid）"
        echo "  预期: 缓存命中率 > 95%, P50 < 20ms"
        echo ""
        "$LOADTEST_SCRIPT" "$TARGET_URL" 4 20 60 "$CID_HEADER"
        
        echo ""
        echo -e "${BLUE}💡 缓存分析${NC}"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "  查看缓存状态:"
        echo "    curl -I '$TARGET_URL' -H 'cid: $CID_HEADER'"
        echo ""
        echo "  预期响应头:"
        echo "    X-Cache-Status: HIT          # 缓存命中"
        echo "    Age: 15                      # 缓存年龄（秒）"
        echo "    X-Cache-Remaining-TTL: 285   # 剩余 TTL"
        echo ""
        ;;
    6)
        echo ""
        echo -e "${BLUE}▶ 场景 6: 自定义配置${NC}"
        echo ""
        read -p "  线程数 (推荐: CPU核心数): " threads
        read -p "  并发连接数: " connections
        read -p "  持续时间(秒): " duration
        echo ""
        "$LOADTEST_SCRIPT" "$TARGET_URL" "$threads" "$connections" "$duration" "$CID_HEADER"
        ;;
    *)
        echo "无效的选择"
        exit 1
        ;;
esac

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✓ 压测完成${NC}"
echo ""

# 查看缓存状态
echo -e "${BLUE}📊 检查缓存状态${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "执行命令查看缓存:"
echo "  curl -I '$TARGET_URL' -H 'cid: $CID_HEADER' | grep -E 'X-Cache|Age'"
echo ""

