# 应用性能监控 - 集成指南

本文档展示如何将性能监控集成到你的 API Gateway 中，以便精确定位性能瓶颈。

## 📦 已创建的文件

1. **性能监控中间件**：`src/middleware/performance-monitor.ts`
2. **测试工具**：
   - `scripts/quick-proxy-benchmark.sh` - 快速对比测试
   - `scripts/benchmark-proxy-vs-direct.js` - 详细性能测试
   - `scripts/analyze-worker-timing.sh` - Worker 分析指南

## 🔧 集成步骤

### 步骤 1: 在主入口文件中启用性能监控

编辑 `src/index.ts`，在所有中间件之前添加性能监控：

```typescript
// src/index.ts

import { performanceMonitorMiddleware } from './middleware/performance-monitor';

const app = createApp();

// ✅ 性能监控必须是第一个中间件
app.use('*', performanceMonitorMiddleware);

// 其他中间件
app.use('*', logger());
app.use('*', cors());
app.use('*', pathCollectorDOMiddleware);
// ...
```

### 步骤 2: 在各个中间件中添加性能标记

#### 2.1 path-collector-do 中间件

编辑 `src/middleware/path-collector-do.ts`：

```typescript
import { markPhaseStart, markPhaseEnd } from './performance-monitor';

export async function pathCollectorDOMiddleware(
  c: Context<{
    Bindings: Env;
    Variables: {
      pathCollected?: boolean;
      performanceTimeline?: PerformanceTimeline;  // ✅ 添加类型
    }
  }>,
  next: Next
) {
  // ✅ 标记阶段开始
  markPhaseStart(c, 'pathCollectorStart');
  
  try {
    // ... 现有逻辑 ...
    
    const shouldCollect = await shouldCollectPath(c.env, path);
    if (shouldCollect) {
      // 记录访问
      await recordPathAccess(c.env, path, /* ... */);
    }
    
    // ✅ 标记阶段结束
    markPhaseEnd(c, 'pathCollectorEnd');
    
    return next();
  } catch (error) {
    markPhaseEnd(c, 'pathCollectorEnd');
    throw error;
  }
}
```

#### 2.2 global-ip-guard 中间件

编辑 `src/middleware/global-ip-guard.ts`：

```typescript
import { markPhaseStart, markPhaseEnd } from './performance-monitor';

export async function globalIpGuardMiddleware(
  c: Context<{ Bindings: Env; Variables: { performanceTimeline?: PerformanceTimeline } }>,
  next: Next
) {
  markPhaseStart(c, 'ipGuardStart');
  
  try {
    // ... 现有逻辑 ...
    
    markPhaseEnd(c, 'ipGuardEnd');
    return next();
  } catch (error) {
    markPhaseEnd(c, 'ipGuardEnd');
    throw error;
  }
}
```

#### 2.3 geo-access-control 中间件

类似地在 `src/middleware/geo-access-control.ts` 中：

```typescript
import { markPhaseStart, markPhaseEnd } from './performance-monitor';

export function geoAccessControlMiddleware() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    markPhaseStart(c, 'geoControlStart');
    
    try {
      // ... 现有逻辑 ...
      
      markPhaseEnd(c, 'geoControlEnd');
      return next();
    } catch (error) {
      markPhaseEnd(c, 'geoControlEnd');
      throw error;
    }
  };
}
```

#### 2.4 rate-limit 中间件

编辑 `src/middleware/rate-limit.ts`：

```typescript
import { markPhaseStart, markPhaseEnd } from './performance-monitor';

export async function rateLimitMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next
) {
  markPhaseStart(c, 'rateLimitStart');
  
  try {
    // ... 现有逻辑 ...
    
    markPhaseEnd(c, 'rateLimitEnd');
    return next();
  } catch (error) {
    markPhaseEnd(c, 'rateLimitEnd');
    throw error;
  }
}
```

#### 2.5 cache 中间件

编辑 `src/middleware/cache.ts`：

```typescript
import { markPhaseStart, markPhaseEnd } from './performance-monitor';

export async function cacheMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next
) {
  markPhaseStart(c, 'cacheCheckStart');
  
  try {
    // 检查缓存
    const cached = await checkCache(/* ... */);
    
    markPhaseEnd(c, 'cacheCheckEnd');
    
    if (cached) {
      return cached;
    }
    
    // 执行实际请求
    await next();
    
    // 写入缓存
    markPhaseStart(c, 'cacheWriteStart');
    await writeCache(/* ... */);
    markPhaseEnd(c, 'cacheWriteEnd');
    
  } catch (error) {
    markPhaseEnd(c, 'cacheCheckEnd');
    throw error;
  }
}
```

#### 2.6 proxy 中间件

编辑 `src/middleware/proxy.ts`：

```typescript
import { markPhaseStart, markPhaseEnd } from './performance-monitor';

export function proxyMiddleware(route: ProxyRoute) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    markPhaseStart(c, 'proxyStart');
    
    try {
      // 路由查找
      markPhaseStart(c, 'routeLookupStart');
      const targetUrl = resolveTargetUrl(/* ... */);
      markPhaseEnd(c, 'routeLookupEnd');
      
      // 上游请求
      markPhaseStart(c, 'upstreamRequestStart');
      const response = await fetch(targetUrl, {
        method: c.req.method,
        headers: upstreamHeaders,
        body
      });
      
      // 记录首字节时间（可选：如果需要更细粒度）
      markPhaseEnd(c, 'upstreamFirstByte');
      
      const responseBody = await response.text();
      markPhaseEnd(c, 'upstreamComplete');
      
      return new Response(responseBody, response);
      
    } catch (error) {
      markPhaseEnd(c, 'upstreamComplete');
      throw error;
    }
  };
}
```

### 步骤 3: 在 D1 查询中添加监控

编辑任何执行 D1 查询的文件（例如 `src/lib/dashboard-aggregator.ts`）：

```typescript
import { measureD1Query } from '../middleware/performance-monitor';

// ❌ 之前
export async function getDashboardStats(env: Env): Promise<DashboardStats> {
  const result = await env.DB.prepare(`
    SELECT COUNT(*) as total FROM traffic_events WHERE timestamp > ?
  `).bind(cutoffTime).first();
  
  return result;
}

// ✅ 之后
export async function getDashboardStats(
  env: Env, 
  c: Context  // 需要传入 context
): Promise<DashboardStats> {
  const result = await measureD1Query(c, 'dashboard_stats', async () => {
    return env.DB.prepare(`
      SELECT COUNT(*) as total FROM traffic_events WHERE timestamp > ?
    `).bind(cutoffTime).first();
  });
  
  return result;
}
```

**更简单的方式（如果不方便传递 context）：**

```typescript
// 使用 console.time/timeEnd
export async function getDashboardStats(env: Env): Promise<DashboardStats> {
  console.time('D1: dashboard_stats');
  
  const result = await env.DB.prepare(`
    SELECT COUNT(*) as total FROM traffic_events WHERE timestamp > ?
  `).bind(cutoffTime).first();
  
  console.timeEnd('D1: dashboard_stats');
  
  return result;
}
```

## 🧪 测试性能监控

### 1. 部署更新后的代码

```bash
cd apps/api
npm run deploy
```

### 2. 运行性能测试

```bash
# 快速测试
./scripts/quick-proxy-benchmark.sh

# 详细测试
node scripts/benchmark-proxy-vs-direct.js
```

### 3. 查看实时日志

在一个终端中运行：

```bash
wrangler tail --format pretty
```

在另一个终端发送测试请求：

```bash
curl -X POST https://api-proxy.pwtk.cc/biz-client/biz/relationship/batch-get \
  -H 'Content-Type: application/json' \
  --data '{"targetUserIdList":["1419717728603737560"],"direct":1}'
```

### 4. 查看性能日志

你应该看到类似这样的输出：

```json
{
  "timestamp": "2025-10-18T10:30:45.123Z",
  "requestId": "abc-123-def",
  "event": "performance_metrics",
  "method": "POST",
  "path": "/biz-client/biz/relationship/batch-get",
  "status": 200,
  "metrics": {
    "total_ms": 175.4,
    "breakdown_ms": {
      "pathCollector": 12.3,
      "ipGuard": 8.5,
      "geoControl": 5.2,
      "rateLimit": 3.1,
      "cacheCheck": 15.7,
      "routeLookup": 2.4,
      "upstream": 120.5,
      "upstreamWait": 118.2,
      "upstreamTransfer": 2.3,
      "d1Total": 7.7
    },
    "percentages": {
      "middleware": "16.8%",
      "upstream": "68.7%",
      "cache": "9.0%",
      "d1": "4.4%"
    }
  },
  "d1_queries": [
    { "name": "get_path_config", "duration": 5.2 },
    { "name": "check_ip_status", "duration": 2.5 }
  ]
}
```

### 5. 检查响应头

```bash
curl -I -X POST https://api-proxy.pwtk.cc/biz-client/biz/relationship/batch-get \
  -H 'Content-Type: application/json' \
  --data '{"targetUserIdList":["1419717728603737560"],"direct":1}'
```

你应该看到：

```
x-performance-total: 175.40ms
x-performance-upstream: 120.50ms
x-performance-d1: 7.70ms
```

## 📊 分析性能数据

### 理想的性能分布

```
✅ 健康的请求 (总时间 ~200ms):
  - 中间件: 30ms (15%)
  - D1 查询: 10ms (5%)
  - 上游调用: 150ms (75%)
  - 缓存: 10ms (5%)
```

### 需要优化的情况

```
⚠️  D1 查询过慢:
  - D1 查询: 120ms (40%) ← 问题！
  → 解决方案：添加索引、使用缓存、优化查询

⚠️  中间件过慢:
  - 中间件: 80ms (30%) ← 问题！
  → 解决方案：减少不必要的检查、优化逻辑

⚠️  上游调用慢:
  - 上游调用: 300ms (90%) ← 源站问题
  → 解决方案：源站优化、增加缓存、考虑超时设置
```

## 🎯 常见优化场景

### 场景 1: D1 查询慢

**症状：**
```json
{
  "d1_queries": [
    { "name": "get_traffic_stats", "duration": 250.5 }  ← 太慢！
  ]
}
```

**解决方案：**
```sql
-- 添加索引
CREATE INDEX IF NOT EXISTS idx_traffic_events_timestamp 
ON traffic_events(timestamp) 
WHERE timestamp > datetime('now', '-24 hours');

-- 使用更精确的查询
SELECT COUNT(*) FROM traffic_events 
WHERE timestamp > datetime('now', '-24 hours')
  AND event_date = date('now')  -- 利用分区字段
LIMIT 1000;  -- 限制结果数
```

### 场景 2: 上游调用慢

**症状：**
```json
{
  "breakdown_ms": {
    "upstreamWait": 250.0,  ← 等待时间长
    "upstreamTransfer": 5.0
  }
}
```

**解决方案：**
```typescript
// 设置合理的超时
const response = await fetch(targetUrl, {
  method: c.req.method,
  headers: upstreamHeaders,
  body,
  // @ts-ignore
  cf: {
    timeout: 10000,  // 10秒超时
    cacheTtl: 60,    // 如果适用，缓存 60 秒
  }
});

// 或者使用 Promise.race 实现超时
const timeoutPromise = new Promise((_, reject) => 
  setTimeout(() => reject(new Error('Upstream timeout')), 10000)
);

const response = await Promise.race([
  fetch(targetUrl, options),
  timeoutPromise
]);
```

### 场景 3: 中间件过慢

**症状：**
```json
{
  "breakdown_ms": {
    "pathCollector": 80.5,  ← 太慢！
    "ipGuard": 45.2         ← 太慢！
  }
}
```

**解决方案：**
```typescript
// 使用异步非阻塞方式
// ❌ 之前：同步等待
await recordPathAccess(env, path, data);
return next();

// ✅ 之后：异步记录
ctx.waitUntil(recordPathAccess(env, path, data));
return next();

// 或者批量处理
ctx.waitUntil(
  batchRecordAccess(env, [path, data])
);
```

## 📝 最佳实践

1. **始终启用性能监控**：在开发和测试环境中
2. **定期审查日志**：使用 `wrangler tail` 或 Cloudflare Logs
3. **设置告警**：对于慢请求（> 1秒）
4. **逐步优化**：一次优化一个瓶颈
5. **测量效果**：优化后重新运行基准测试

## 🔗 相关工具

- `scripts/quick-proxy-benchmark.sh` - 快速性能测试
- `scripts/benchmark-proxy-vs-direct.js` - 详细性能分析
- `scripts/analyze-worker-timing.sh` - Worker 分析指南
- `scripts/PROXY_BENCHMARK_README.md` - 完整文档

## 💡 下一步

1. ✅ 集成性能监控中间件
2. ✅ 在关键点添加性能标记
3. ✅ 部署并测试
4. 🔍 分析性能日志
5. 🚀 针对性优化
6. 📊 验证优化效果

需要帮助？查看测试报告中的具体建议。

