#!/bin/bash

# Worker 内部耗时分析工具
# 通过添加时间戳日志来分析 Worker 各个阶段的耗时

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "════════════════════════════════════════════════════════════════════"
echo "              🔍 Worker 内部耗时分析工具"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "本工具将帮助你分析 Worker 内部各个阶段的耗时："
echo "  1. 请求接收到处理开始"
echo "  2. D1 查询耗时"
echo "  3. 源站 API 调用耗时"
echo "  4. 响应处理和返回"
echo ""
echo -e "${YELLOW}📝 使用方法：${NC}"
echo "────────────────────────────────────────────────────────────────────"
echo ""
echo "方案 1: 使用 wrangler tail (实时日志)"
echo "  在一个终端运行："
echo "    ${BLUE}wrangler tail --format pretty${NC}"
echo ""
echo "  在另一个终端发送测试请求："
echo "    ${BLUE}curl -X POST https://api-proxy.pwtk.cc/biz-client/biz/relationship/batch-get \\${NC}"
echo "    ${BLUE}  -H 'Content-Type: application/json' \\${NC}"
echo "    ${BLUE}  --data '{\"targetUserIdList\":[\"1419717728603737560\"],\"direct\":1}'${NC}"
echo ""
echo "────────────────────────────────────────────────────────────────────"
echo ""
echo "方案 2: 在代码中添加性能标记"
echo ""
echo "在你的 Worker 代码中添加以下代码来测量各个阶段："
echo ""
cat << 'EOF'
// src/index.ts 或相关路由文件

import { Hono } from 'hono';

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  // 记录请求开始时间
  const startTime = Date.now();
  
  // 创建性能测量对象
  const timings = {
    start: startTime,
    beforeD1: 0,
    afterD1: 0,
    beforeUpstream: 0,
    afterUpstream: 0,
    beforeResponse: 0,
    end: 0
  };
  
  // 将 timings 存储到 context 中
  c.set('timings', timings);
  
  await next();
  
  // 请求完成，计算总耗时
  timings.end = Date.now();
  
  // 计算各阶段耗时
  const metrics = {
    total: timings.end - timings.start,
    d1Query: timings.afterD1 - timings.beforeD1,
    upstreamCall: timings.afterUpstream - timings.beforeUpstream,
    responseProcessing: timings.end - timings.beforeResponse
  };
  
  // 输出到日志（可以在 wrangler tail 中看到）
  console.log('[性能指标]', JSON.stringify({
    path: c.req.path,
    method: c.req.method,
    metrics: metrics,
    breakdown: {
      d1_percent: ((metrics.d1Query / metrics.total) * 100).toFixed(1) + '%',
      upstream_percent: ((metrics.upstreamCall / metrics.total) * 100).toFixed(1) + '%',
      response_percent: ((metrics.responseProcessing / metrics.total) * 100).toFixed(1) + '%'
    }
  }));
});

// 在需要测量的地方添加标记
app.post('/api/some-endpoint', async (c) => {
  const timings = c.get('timings');
  
  // 测量 D1 查询
  timings.beforeD1 = Date.now();
  const data = await c.env.DB.prepare('SELECT * FROM table').all();
  timings.afterD1 = Date.now();
  
  // 测量上游 API 调用
  timings.beforeUpstream = Date.now();
  const response = await fetch('https://api.example.com/data');
  const result = await response.json();
  timings.afterUpstream = Date.now();
  
  // 测量响应处理
  timings.beforeResponse = Date.now();
  return c.json(result);
});

export default app;
EOF

echo ""
echo "────────────────────────────────────────────────────────────────────"
echo ""
echo "方案 3: 使用 Cloudflare Analytics Engine (推荐用于生产环境)"
echo ""
cat << 'EOF'
// 在 wrangler.toml 中配置 Analytics Engine
[[analytics_engine_datasets]]
binding = "ANALYTICS"

// 在代码中记录性能数据
app.use('*', async (c, next) => {
  const startTime = Date.now();
  
  await next();
  
  const duration = Date.now() - startTime;
  
  // 写入 Analytics Engine
  c.env.ANALYTICS.writeDataPoint({
    blobs: [c.req.path, c.req.method],
    doubles: [duration],
    indexes: [c.req.path]
  });
});
EOF

echo ""
echo "────────────────────────────────────────────────────────────────────"
echo ""
echo "方案 4: 快速诊断 - 临时添加 console.time"
echo ""
cat << 'EOF'
// 在你的代理处理函数中
export async function handleProxy(request: Request, env: Env) {
  console.time('总耗时');
  
  console.time('D1查询');
  const pathConfig = await getPathConfig(env.DB, path);
  console.timeEnd('D1查询');
  
  console.time('源站调用');
  const upstreamResponse = await fetch(targetUrl, proxyRequest);
  console.timeEnd('源站调用');
  
  console.time('响应处理');
  const responseBody = await upstreamResponse.text();
  const finalResponse = new Response(responseBody, {
    status: upstreamResponse.status,
    headers: upstreamResponse.headers
  });
  console.timeEnd('响应处理');
  
  console.timeEnd('总耗时');
  
  return finalResponse;
}
EOF

echo ""
echo "────────────────────────────────────────────────────────────────────"
echo ""
echo -e "${GREEN}🎯 推荐流程：${NC}"
echo ""
echo "1. 首先使用 ${BLUE}wrangler tail${NC} 快速查看日志："
echo "   ${BLUE}wrangler tail --format pretty | grep -E 'time|duration|ms'${NC}"
echo ""
echo "2. 在代码中添加 console.time/timeEnd 标记关键点"
echo ""
echo "3. 重新部署并发送测试请求："
echo "   ${BLUE}npm run deploy${NC}"
echo "   ${BLUE}curl -X POST https://api-proxy.pwtk.cc/... [请求参数]${NC}"
echo ""
echo "4. 观察 tail 输出，找到耗时最长的操作"
echo ""
echo "5. 针对性优化（常见瓶颈）："
echo "   - D1 查询慢 → 添加索引、使用缓存"
echo "   - 源站调用慢 → 检查网络、考虑超时设置"
echo "   - 响应处理慢 → 避免不必要的转换、使用流式传输"
echo ""
echo "────────────────────────────────────────────────────────────────────"
echo ""
echo -e "${YELLOW}📊 示例输出（期望看到的内容）：${NC}"
echo ""
echo "✅ 健康的性能分布："
echo "  D1查询: 15ms (7%)"
echo "  源站调用: 120ms (60%)"
echo "  响应处理: 5ms (2%)"
echo "  其他: 60ms (31%)"
echo "  总耗时: 200ms"
echo ""
echo "⚠️  需要优化的情况："
echo "  D1查询: 150ms (43%) ← 太慢！需要添加索引"
echo "  源站调用: 180ms (51%)"
echo "  响应处理: 20ms (6%)"
echo "  总耗时: 350ms"
echo ""
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo -e "${GREEN}📝 下一步：${NC}"
echo ""
echo "1. 运行 ${BLUE}wrangler tail --format pretty${NC} 查看实时日志"
echo "2. 在代码中添加性能标记（如上面示例）"
echo "3. 运行 ${BLUE}./scripts/quick-proxy-benchmark.sh${NC} 再次测试"
echo "4. 根据瓶颈进行针对性优化"
echo ""
echo "需要帮助？查看完整文档："
echo "  ${BLUE}cat scripts/PROXY_BENCHMARK_README.md${NC}"
echo ""

