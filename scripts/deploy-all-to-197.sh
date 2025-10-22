#!/bin/bash

# 完整部署脚本 - 同时部署 API 和 Web 到 r197
# 用法: 
#   bash scripts/deploy-all-to-197.sh              # 串行部署（默认）
#   bash scripts/deploy-all-to-197.sh --parallel   # 并行部署（更快）

set -e  # 遇到错误立即退出

# 解析命令行参数
PARALLEL_MODE=false
for arg in "$@"; do
  case $arg in
    --parallel|-p) PARALLEL_MODE=true ;;
  esac
done

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

log_parallel() {
    echo -e "${MAGENTA}[PARALLEL]${NC} $1"
}

# 错误处理函数
handle_error() {
    local ERROR_MESSAGE="$1"
    log_error "$ERROR_MESSAGE"
    exit 1
}

# 记录开始时间
DEPLOY_START_TIME=$(date '+%Y-%m-%d %H:%M:%S')
DEPLOY_START_TIMESTAMP=$(date +%s)

echo "========================================================"
echo "API Gateway 完整部署 - API + Web 到 r197"
echo "========================================================"
log_info "开始时间: $DEPLOY_START_TIME"
log_info "目标服务器: 192.168.0.197"
if [ "$PARALLEL_MODE" = true ]; then
    log_parallel "模式: 并行部署（更快）"
else
    log_info "模式: 串行部署（稳定）"
fi
echo "========================================================"
echo ""

# 获取项目根目录
PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
log_info "项目根目录: $PROJECT_ROOT"
cd "$PROJECT_ROOT"

# ==================== 并行部署模式 ====================
if [ "$PARALLEL_MODE" = true ]; then
    log_parallel "启动并行部署..."
    echo ""
    
    # 创建临时日志文件
    API_LOG="/tmp/deploy-api-$$.log"
    WEB_LOG="/tmp/deploy-web-$$.log"
    
    # ==================== API 部署（后台）====================
    log_step "[API] 启动 API 部署（后台）..."
    (
        API_START_TIME=$(date +%s)
        cd "$PROJECT_ROOT/apps/api"
        
        if [ ! -f "deploy.sh" ]; then
            echo "ERROR: API 部署脚本不存在" > "$API_LOG"
            exit 1
        fi
        
        if bash deploy.sh -y >> "$API_LOG" 2>&1; then
            API_END_TIME=$(date +%s)
            API_DURATION=$((API_END_TIME - API_START_TIME))
            echo "SUCCESS:$API_DURATION" >> "$API_LOG"
            exit 0
        else
            echo "FAILED" >> "$API_LOG"
            exit 1
        fi
    ) &
    API_PID=$!
    
    # ==================== Web 部署（后台）====================
    log_step "[WEB] 启动 Web 部署（后台）..."
    (
        WEB_START_TIME=$(date +%s)
        cd "$PROJECT_ROOT"
        
        if bash scripts/deploy-web-to-197.sh >> "$WEB_LOG" 2>&1; then
            WEB_END_TIME=$(date +%s)
            WEB_DURATION=$((WEB_END_TIME - WEB_START_TIME))
            echo "SUCCESS:$WEB_DURATION" >> "$WEB_LOG"
            exit 0
        else
            echo "FAILED" >> "$WEB_LOG"
            exit 1
        fi
    ) &
    WEB_PID=$!
    
    echo ""
    log_parallel "等待部署完成..."
    log_info "API 部署进程 PID: $API_PID"
    log_info "Web 部署进程 PID: $WEB_PID"
    echo ""
    
    # 等待 API 部署完成
    if wait $API_PID; then
        API_RESULT=$(tail -n 1 "$API_LOG")
        if [[ $API_RESULT == SUCCESS:* ]]; then
            API_DURATION=$(echo $API_RESULT | cut -d':' -f2)
            log_success "[API] API 部署成功 (耗时: ${API_DURATION}秒)"
        else
            log_error "[API] API 部署失败"
            cat "$API_LOG"
            rm -f "$API_LOG" "$WEB_LOG"
            handle_error "API 部署失败"
        fi
    else
        log_error "[API] API 部署进程异常退出"
        cat "$API_LOG"
        rm -f "$API_LOG" "$WEB_LOG"
        handle_error "API 部署进程异常"
    fi
    
    # 等待 Web 部署完成
    if wait $WEB_PID; then
        WEB_RESULT=$(tail -n 1 "$WEB_LOG")
        if [[ $WEB_RESULT == SUCCESS:* ]]; then
            WEB_DURATION=$(echo $WEB_RESULT | cut -d':' -f2)
            log_success "[WEB] Web 部署成功 (耗时: ${WEB_DURATION}秒)"
        else
            log_error "[WEB] Web 部署失败"
            cat "$WEB_LOG"
            rm -f "$API_LOG" "$WEB_LOG"
            handle_error "Web 部署失败"
        fi
    else
        log_error "[WEB] Web 部署进程异常退出"
        cat "$WEB_LOG"
        rm -f "$API_LOG" "$WEB_LOG"
        handle_error "Web 部署进程异常"
    fi
    
    # 清理日志文件
    rm -f "$API_LOG" "$WEB_LOG"
    
# ==================== 串行部署模式 ====================
else
    # ==================== 阶段 1: 部署 API ====================
    log_step "阶段 1/2: 部署 API (Cloudflare Worker)"
    echo "--------------------------------------------------------"
    
    API_START_TIME=$(date +%s)
    
    # 进入 API 目录
    cd "$PROJECT_ROOT/apps/api"
    
    # 检查 deploy.sh 是否存在
    if [ ! -f "deploy.sh" ]; then
        handle_error "API 部署脚本不存在: apps/api/deploy.sh"
    fi
    
    # 执行 API 部署
    log_info "执行 API 部署..."
    if bash deploy.sh -y; then
        API_END_TIME=$(date +%s)
        API_DURATION=$((API_END_TIME - API_START_TIME))
        log_success "API 部署成功 (耗时: ${API_DURATION}秒)"
    else
        handle_error "API 部署失败"
    fi
    
    echo ""
    
    # ==================== 阶段 2: 部署 Web ====================
    log_step "阶段 2/2: 部署 Web 前端到 r197"
    echo "--------------------------------------------------------"
    
    WEB_START_TIME=$(date +%s)
    
    # 回到项目根目录
    cd "$PROJECT_ROOT"
    
    # 执行 Web 部署
    log_info "执行 Web 前端部署..."
    if bash scripts/deploy-web-to-197.sh; then
        WEB_END_TIME=$(date +%s)
        WEB_DURATION=$((WEB_END_TIME - WEB_START_TIME))
        log_success "Web 前端部署成功 (耗时: ${WEB_DURATION}秒)"
    else
        handle_error "Web 前端部署失败"
    fi
fi

echo ""

# ==================== 部署完成总结 ====================
DEPLOY_END_TIME=$(date '+%Y-%m-%d %H:%M:%S')
DEPLOY_END_TIMESTAMP=$(date +%s)
DEPLOY_DURATION=$((DEPLOY_END_TIMESTAMP - DEPLOY_START_TIMESTAMP))
MINUTES=$((DEPLOY_DURATION / 60))
SECONDS=$((DEPLOY_DURATION % 60))

# 计算节省的时间（如果是并行模式）
if [ "$PARALLEL_MODE" = true ]; then
    MAX_DURATION=$API_DURATION
    if [ $WEB_DURATION -gt $API_DURATION ]; then
        MAX_DURATION=$WEB_DURATION
    fi
    SAVED_TIME=$((API_DURATION + WEB_DURATION - MAX_DURATION))
fi

echo "========================================================"
log_success "完整部署成功！"
echo "========================================================"
echo ""
echo "📊 部署统计："
echo "  • API 部署耗时:    ${API_DURATION}秒"
echo "  • Web 部署耗时:    ${WEB_DURATION}秒"
if [ "$PARALLEL_MODE" = true ]; then
    echo "  • 并行总耗时:      ${MINUTES}分${SECONDS}秒"
    echo "  • 节省时间:        约 ${SAVED_TIME}秒 ⚡"
else
    echo "  • 串行总耗时:      ${MINUTES}分${SECONDS}秒"
    echo "  💡 提示: 使用 --parallel 参数可以并行部署更快"
fi
echo ""
echo "🌐 访问地址："
echo "  • API Gateway:     https://your-worker.workers.dev"
echo "  • Web Dashboard:   http://192.168.0.197"
echo ""
echo "📝 管理命令："
echo "  • 完整部署:        pnpm run deploy"
echo "  • 只部署 API:      pnpm run deploy:api"
echo "  • 只部署 Web:      pnpm run deploy:web"
echo "========================================================"

exit 0