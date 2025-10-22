# PRP: 从 TrafficMonitor DO 迁移到 Cloudflare Analytics Engine

## 概述

将流量监控从 Durable Objects 架构迁移到 Cloudflare Analytics Engine，解决百万级请求的性能瓶颈问题。

### 当前问题
- TrafficMonitor 使用单个全局 DO 实例 (`idFromName('global')`)
- DO 并发限制：1000个并发请求
- 百万级 QPS 场景下会导致系统崩溃
- 所有请求都会调用 `recordTrafficHit()` 向同一个 DO 发送请求

### 解决方案
使用 Cloudflare Analytics Engine 替代 DO：
- 无并发限制，可处理百万级 QPS
- 自动扩展，无需分片管理
- SQL 查询支持，更强大的分析能力
- 成本更低（免费额度：每月 1000 万次写入）

## 研究发现

### Analytics Engine 文档
- 官方文档：https://developers.cloudflare.com/analytics/analytics-engine/get-started/
- SQL 参考：https://developers.cloudflare.com/analytics/analytics-engine/sql-reference/
- 示例代码：https://github.com/markdembo/cloudflare_analytics_engine_demo

### 关键概念
1. **数据点结构**：
   - `blobs`: 字符串数组（路径、IP、国家等）
   - `doubles`: 数值数组（计数、延迟、缓存命中等）
   - `indexes`: 索引字段（用于采样和分组）

2. **性能特性**：
   - 写入无阻塞（使用 `ctx.waitUntil()`）
   - 自动时间戳
   - SQL 查询支持

## 实现蓝图

### 架构变化

```
当前架构：
Worker → recordTrafficHit() → TrafficMonitor DO (单点瓶颈)

新架构：
Worker → ctx.waitUntil() → Analytics Engine (无限扩展)
       → Admin API → SQL 查询 → Analytics Engine
```

### 伪代码实现

```typescript
// 1. 替换 recordTrafficHit 函数
async function recordTrafficAnalytics(
  env: Env,
  ctx: ExecutionContext,
  path: string,
  clientIP: string,
  isCacheHit: boolean,
  responseTime: number
) {
  ctx.waitUntil(
    env.TRAFFIC_ANALYTICS.writeDataPoint({
      blobs: [
        path,                    // blob1: 请求路径
        clientIP,                // blob2: 客户端 IP
        ctx.req.cf?.country      // blob3: 国家
      ],
      doubles: [
        1,                       // double1: 请求计数
        isCacheHit ? 1 : 0,      // double2: 缓存命中
        responseTime             // double3: 响应时间
      ],
      indexes: [
        // 使用时间窗口作为索引，便于分组
        Math.floor(Date.now() / (5 * 60 * 1000)).toString()
      ]
    })
  );
}

// 2. 查询统计数据
async function queryTrafficStats(env: Env, minutes: number = 5) {
  const query = `
    SELECT 
      COUNT(*) as requests,
      SUM(double2) as cache_hits,
      AVG(double3) as avg_response_time,
      COUNT(DISTINCT blob2) as unique_ips
    FROM traffic
    WHERE timestamp > NOW() - INTERVAL '${minutes}' MINUTE
  `;
  
  return await env.TRAFFIC_ANALYTICS.query(query);
}
```

## 任务列表

### 阶段 1：配置和类型定义
1. 更新 `wrangler.toml` 添加 Analytics Engine 绑定
2. 更新 `src/types/env.ts` 添加 Analytics Engine 类型
3. 创建 `src/lib/analytics-engine.ts` 工具模块

### 阶段 2：数据写入迁移
4. 修改 `src/middleware/cache.ts` 中的 `recordTrafficHit` 调用
5. 添加向后兼容的特性开关（环境变量控制）
6. 实现数据点写入函数

### 阶段 3：查询接口迁移
7. 创建 `src/routes/admin/analytics.ts` 新的查询接口
8. 实现 SQL 查询封装函数
9. 迁移现有的统计端点

### 阶段 4：清理和优化
10. 添加测试用例
11. 更新文档
12. 性能测试和验证
13. 移除旧的 TrafficMonitor DO（可选）

## 详细实现步骤

### 步骤 1：更新 wrangler.toml

```toml
# 添加 Analytics Engine 绑定
[[analytics_engine_datasets]]
binding = "TRAFFIC_ANALYTICS"
dataset = "api_traffic"

# 保留 TrafficMonitor DO 用于向后兼容
[durable_objects]
bindings = [
  { name = "COUNTER", class_name = "Counter", script_name = "" },
  { name = "RATE_LIMITER", class_name = "RateLimiter", script_name = "" },
  { name = "TRAFFIC_MONITOR", class_name = "TrafficMonitor", script_name = "" }
]

# 添加特性开关
[vars]
USE_ANALYTICS_ENGINE = "true"
TRAFFIC_SAMPLING_RATE = "1.0"  # 1.0 = 100%, 0.01 = 1%
```

### 步骤 2：更新类型定义

```typescript
// src/types/env.ts
export interface Env {
  // 现有绑定...
  KV: KVNamespace;
  RATE_LIMITER: DurableObjectNamespace;
  TRAFFIC_MONITOR: DurableObjectNamespace;
  
  // 新增 Analytics Engine
  TRAFFIC_ANALYTICS: AnalyticsEngineDataset;
  
  // 特性开关
  USE_ANALYTICS_ENGINE?: string;
  TRAFFIC_SAMPLING_RATE?: string;
}
```

### 步骤 3：创建 Analytics Engine 工具模块

```typescript
// src/lib/analytics-engine.ts
import type { Env } from '../types/env';
import { createRequestLogger } from './logger';

export interface TrafficDataPoint {
  path: string;
  clientIP: string;
  country?: string;
  isCacheHit: boolean;
  responseTime: number;
  method: string;
  statusCode: number;
}

export async function recordTraffic(
  env: Env,
  ctx: ExecutionContext,
  data: TrafficDataPoint
): Promise<void> {
  const samplingRate = parseFloat(env.TRAFFIC_SAMPLING_RATE || '1.0');
  
  // 采样逻辑
  if (Math.random() > samplingRate) {
    return;
  }
  
  // 使用 Analytics Engine
  if (env.USE_ANALYTICS_ENGINE === 'true' && env.TRAFFIC_ANALYTICS) {
    ctx.waitUntil(
      env.TRAFFIC_ANALYTICS.writeDataPoint({
        blobs: [
          data.path,
          data.clientIP,
          data.country || 'unknown',
          data.method
        ],
        doubles: [
          1,                          // 请求计数
          data.isCacheHit ? 1 : 0,    // 缓存命中
          data.responseTime,          // 响应时间
          data.statusCode             // 状态码
        ],
        indexes: [
          // 5分钟时间窗口
          Math.floor(Date.now() / (5 * 60 * 1000)).toString()
        ]
      })
    );
  } else {
    // 向后兼容：使用原有 DO
    const id = env.TRAFFIC_MONITOR.idFromName('global');
    const trafficMonitor = env.TRAFFIC_MONITOR.get(id);
    
    const recordUrl = new URL('http://dummy/record');
    recordUrl.searchParams.set('path', data.path);
    recordUrl.searchParams.set('cache_hit', data.isCacheHit.toString());
    
    ctx.waitUntil(trafficMonitor.fetch(recordUrl.toString()));
  }
}

export async function queryTrafficStats(
  env: Env,
  timeRange: string = '5 MINUTE'
): Promise<any> {
  if (!env.TRAFFIC_ANALYTICS) {
    throw new Error('Analytics Engine not configured');
  }
  
  const query = `
    SELECT 
      COUNT(*) as total_requests,
      SUM(double2) as cache_hits,
      AVG(double3) as avg_response_time,
      COUNT(DISTINCT blob2) as unique_ips,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY double3) as p50_latency,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY double3) as p95_latency,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY double3) as p99_latency
    FROM api_traffic
    WHERE timestamp > NOW() - INTERVAL '${timeRange}'
  `;
  
  // 注意：实际查询需要通过 Cloudflare API
  // 这里返回模拟数据用于开发
  return {
    query,
    result: {
      total_requests: 0,
      cache_hits: 0,
      avg_response_time: 0,
      unique_ips: 0,
      p50_latency: 0,
      p95_latency: 0,
      p99_latency: 0
    }
  };
}

export async function getTopPaths(
  env: Env,
  limit: number = 10
): Promise<any> {
  if (!env.TRAFFIC_ANALYTICS) {
    throw new Error('Analytics Engine not configured');
  }
  
  const query = `
    SELECT 
      blob1 as path,
      COUNT(*) as requests,
      AVG(double3) as avg_response_time
    FROM api_traffic
    WHERE timestamp > NOW() - INTERVAL '1 HOUR'
    GROUP BY blob1
    ORDER BY requests DESC
    LIMIT ${limit}
  `;
  
  return { query, result: [] };
}
```

### 步骤 4：修改缓存中间件

```typescript
// src/middleware/cache.ts 修改
import { recordTraffic } from '../lib/analytics-engine';

// 替换原有的 recordTrafficHit 调用
async function recordTrafficMetrics(
  c: Context<{ Bindings: Env }>,
  path: string,
  isCacheHit: boolean,
  responseTime: number
) {
  await recordTraffic(
    c.env,
    c.executionCtx,
    {
      path,
      clientIP: c.req.header('cf-connecting-ip') || '',
      country: c.req.raw.cf?.country as string,
      isCacheHit,
      responseTime,
      method: c.req.method,
      statusCode: c.res.status
    }
  );
}
```

### 步骤 5：创建新的管理接口

```typescript
// src/routes/admin/analytics.ts
import { Hono } from 'hono';
import type { Env } from '../../types/env';
import { queryTrafficStats, getTopPaths } from '../../lib/analytics-engine';

const app = new Hono<{ Bindings: Env }>();

// 获取实时统计
app.get('/admin/analytics/stats', async (c) => {
  try {
    const timeRange = c.req.query('range') || '5 MINUTE';
    const stats = await queryTrafficStats(c.env, timeRange);
    
    return c.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// 获取热门路径
app.get('/admin/analytics/top-paths', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '10');
    const paths = await getTopPaths(c.env, limit);
    
    return c.json({
      success: true,
      paths,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default app;
```

## 验证门

### 语法和风格检查
```bash
# TypeScript 编译检查
npx tsc --noEmit

# 代码格式化
npx prettier --write "src/**/*.ts"
```

### 单元测试
```bash
# 运行测试
npm test

# 特定测试 Analytics Engine
npm test -- analytics-engine
```

### 集成测试
```bash
# 本地开发测试
npm run dev

# 测试写入
curl -X POST http://localhost:8787/api/test \
  -H "Content-Type: application/json"

# 测试查询
curl http://localhost:8787/admin/analytics/stats

# 压力测试
npm run load-test
```

### 部署验证
```bash
# 部署到 staging
npm run deploy:staging

# 验证 Analytics Engine 绑定
wrangler tail --env staging

# 生产部署前检查
npm run pre-deploy-check
```

## 错误处理策略

1. **降级策略**：Analytics Engine 失败时降级到 DO
2. **采样率控制**：通过环境变量动态调整
3. **重试机制**：使用 `ctx.waitUntil()` 异步重试
4. **监控告警**：记录失败日志，设置告警阈值

## 性能优化

1. **批量写入**：累积数据点批量发送（如果支持）
2. **采样策略**：高峰期自动降低采样率
3. **查询缓存**：缓存常用查询结果
4. **索引优化**：合理使用 indexes 字段

## 回滚计划

1. 保留原有 TrafficMonitor DO 代码
2. 通过环境变量 `USE_ANALYTICS_ENGINE=false` 快速切换
3. 双写模式：同时写入 DO 和 Analytics Engine
4. 监控对比两种方案的数据一致性

## 注意事项

1. **数据保留期**：Analytics Engine 默认 90 天
2. **查询限制**：单次查询最多 10000 行
3. **索引限制**：最多 10 个索引字段
4. **实时性**：数据可能有几秒延迟
5. **成本考虑**：超过免费额度后的计费

## 参考资料

- [Analytics Engine 官方文档](https://developers.cloudflare.com/analytics/analytics-engine/)
- [Workers 性能最佳实践](https://developers.cloudflare.com/workers/learning/performance/)
- [现有 TrafficMonitor 实现](../apps/api/src/durable-objects/TrafficMonitor.ts)
- [缓存中间件实现](../apps/api/src/middleware/cache.ts)

## 质量评分

**信心等级：9/10**

评分依据：
- ✅ 完整的实现路径
- ✅ 详细的代码示例
- ✅ 向后兼容策略
- ✅ 错误处理和回滚计划
- ✅ 性能优化建议
- ✅ 可执行的验证步骤
- ✅ 引用现有代码模式
- ⚠️  需要实际测试 SQL API 调用（-1分）

此 PRP 提供了从 TrafficMonitor DO 迁移到 Analytics Engine 的完整实施方案，包括所有必要的代码更改、配置更新和验证步骤。