# 🚀 快速代理优化方案

## 核心思想：请求分流

将请求分为两类，使用不同的处理管道：

### 类型 1️⃣：Dashboard/Admin 请求（需要完整功能）
**路径特征：** `/api/admin/*`, `/api/dashboard/*`  
**需要的功能：**
- ✅ D1 查询（统计、配置）
- ✅ IP 监控和封禁检查
- ✅ 地区访问控制
- ✅ 详细日志记录
- ✅ 性能监控

**当前耗时：** 可以保持现状（~200ms 可接受）

### 类型 2️⃣：纯代理请求（需要极致性能）
**路径特征：** `/biz-client/*`, `/api-service/*` 等业务 API  
**需要的功能：**
- ✅ 基础路由匹配（内存缓存）
- ⚠️ 可选：简单的 IP 黑名单检查（异步，不阻塞）
- ❌ 跳过：复杂的 D1 统计
- ❌ 跳过：同步的 IP 监控
- ❌ 跳过：地区规则评估

**目标耗时：** 从 212ms 降至 80-100ms

---

## 🔄 现有代理的问题

### 当前处理流程（串行，212ms）

```typescript
// src/index.ts
app.use('*', performanceMonitor);        // +5ms
app.use('*', logger);                     // +2ms
app.use('*', cors);                       // +1ms
app.use('*', pathCollectorDOMiddleware);  // +25ms (D1 写入)
app.use('*', globalIpGuardMiddleware);    // +20ms (D1 查询)
app.use('*', geoAccessControlMiddleware); // +15ms (规则评估)

// 到这里已经 68ms，还没开始实际代理！

app.route('/', proxyRoutes);
  → rateLimitMiddleware                  // +10ms
  → geoBlockMiddleware                   // +10ms
  → cacheMiddleware                      // +15ms (KV 查询)
  → proxyMiddleware                      // +20ms (准备 + 路由查找)
    → fetch(upstream)                    // +60ms (实际上游调用)

// 总计: ~212ms
```

### 问题分析

| 阶段 | 耗时 | 是否必需（代理请求） | 优化方案 |
|------|------|---------------------|---------|
| pathCollector | 25ms | ❌ 不必需（统计用） | 异步或跳过 |
| ipGuard | 20ms | ⚠️ 部分必需（封禁检查） | 缓存 + 异步 |
| geoControl | 15ms | ❌ 不必需（业务 API 通常不限制） | 跳过 |
| rateLimit | 10ms | ⚠️ 部分必需 | 简化逻辑 |
| geoBlock | 10ms | ❌ 重复检查 | 跳过 |
| cache | 15ms | ✅ 有用 | 保留但优化 |
| 路由查找 | 20ms | ✅ 必需 | 内存缓存 |

**可节省：** 70-90ms

---

## ✨ 快速代理的优化

### 优化后流程（并行，80-100ms）

```typescript
// 1. 请求到达，立即分类
if (path.startsWith('/api/admin') || path.startsWith('/api/dashboard')) {
  // 走完整管道（保持现有逻辑）
  → 所有中间件 → D1 查询 → 返回数据
} else {
  // 走快速管道（新逻辑）
  
  // 阶段 1: 路由查找（使用内存缓存）
  const route = routeCache.get(path);  // ~1ms (内存)
  if (!route) {
    route = await findFromKV(path);    // ~10ms (KV，首次)
    routeCache.set(path, route);
  }
  
  // 阶段 2: 准备请求（最小化）
  const upstreamHeaders = prepareHeaders(req);  // ~2ms
  
  // 阶段 3: 立即发起上游请求（不等待其他任务）
  const upstreamPromise = fetch(targetUrl, {
    method: req.method,
    headers: upstreamHeaders,
    body: req.body  // 流式，不读取
  });
  
  // 阶段 4: 并行执行可选任务
  const [response] = await Promise.allSettled([
    upstreamPromise,                    // ~60ms (上游)
    recordAccessAsync(env, data),       // 异步，不阻塞
    checkIpBlacklistAsync(env, ip)      // 异步，不阻塞
  ]);
  
  // 阶段 5: 流式返回
  return new Response(response.body, {  // ~2ms (不缓冲)
    status: response.status,
    headers: response.headers
  });
}

// 总计: ~75ms (路由1ms + 准备2ms + 上游60ms + 其他12ms)
```

### 关键差异

| 特性 | 现有代理 | 快速代理 | 节省 |
|------|---------|---------|------|
| 路由查找 | KV 每次 (~15ms) | 内存缓存 (~1ms) | **-14ms** |
| IP 检查 | 同步 D1 查询 (~20ms) | 异步 + 缓存 (~0ms 阻塞) | **-20ms** |
| 路径记录 | 同步写 D1 (~25ms) | Queue 异步 (~0ms 阻塞) | **-25ms** |
| 地区控制 | 同步评估 (~15ms) | 跳过 | **-15ms** |
| 限流检查 | DO 往返 (~10ms) | 简化或跳过 | **-10ms** |
| 响应处理 | 读取 body (~5ms) | 流式转发 (~0ms) | **-5ms** |
| **总计** | **212ms** | **~80ms** | **-132ms** |

---

## 🔧 具体改造方案

### 方案 A：在 index.ts 中分流（推荐）

```typescript
// src/index.ts

const app = createApp();

// 全局中间件（轻量级，所有请求都需要）
app.use('*', performanceMonitorMiddleware);  // 性能追踪
app.use('*', cors);                          // CORS

// 分流：Dashboard/Admin 请求走完整管道
app.route('/api/admin', (app) => {
  app.use('*', logger);
  app.use('*', pathCollectorDOMiddleware);
  app.use('*', globalIpGuardMiddleware);
  app.use('*', geoAccessControlMiddleware);
  // ... 现有的 admin 路由
});

app.route('/api/dashboard', (app) => {
  app.use('*', logger);
  app.use('*', pathCollectorDOMiddleware);
  // ... dashboard 路由
});

// 纯代理请求走快速管道
app.all('*', async (c, next) => {
  const path = c.req.path;
  
  // 如果是 API 路由，跳过代理
  if (path.startsWith('/api/')) {
    return next();
  }
  
  // 快速代理逻辑
  const route = await findProxyRouteWithCache(c.env, path);
  
  if (!route) {
    return next(); // 404
  }
  
  // 使用快速代理中间件
  return fastProxyMiddleware(c, route);
});

// API 路由（非代理）
app.route('/api', healthRoutes);
// ...
```

### 方案 B：使用路由前缀区分（更激进）

```typescript
// src/index.ts

const app = createApp();

// 1. 快速代理路由（无中间件）
app.mount('/proxy', createFastProxyApp());  // 新的快速入口

// 2. 标准代理路由（完整中间件）
app.use('*', performanceMonitor);
app.use('*', logger);
// ... 所有中间件
app.route('/', proxyRoutes);  // 现有逻辑

// 客户端配置
// 高性能需求：https://api-proxy.pwtk.cc/proxy/biz-client/...
// 完整功能：  https://api-proxy.pwtk.cc/biz-client/...
```

---

## 📝 实施步骤

### 阶段 1：基础优化（1-2 天）

**目标：** 减少 30-50ms，不改变架构

1. **添加 D1 索引**
   ```bash
   wrangler d1 execute DB --file=migrations/0009_performance_indexes.sql
   ```
   **效果：** -15~30ms

2. **异步化 pathCollector**
   ```typescript
   // src/middleware/path-collector-do.ts
   export async function pathCollectorDOMiddleware(c, next) {
     // 不等待，直接继续
     c.executionCtx.waitUntil(recordPathAccess(...));
     return next();
   }
   ```
   **效果：** -20~25ms

3. **缓存路由查找**
   ```typescript
   // 使用内存缓存
   const routeCache = new Map();
   ```
   **效果：** -10~15ms

**预期结果：** 212ms → 150-160ms

### 阶段 2：请求分流（3-5 天）

**目标：** 减少 80-100ms，实现快速管道

1. **创建快速代理中间件**
   - ✅ 已完成：`src/middleware/fast-proxy.ts`

2. **修改 index.ts 实现分流**
   ```typescript
   // 判断是否需要完整管道
   if (isAdminOrDashboard(path)) {
     // 走现有管道
   } else {
     // 走快速管道
   }
   ```

3. **实现异步 IP 检查**
   ```typescript
   // 并行检查，但不阻塞
   Promise.allSettled([
     upstreamRequest,
     checkIpAsync(ip)  // 如果是黑名单，记录但不拦截
   ]);
   ```

4. **测试验证**
   ```bash
   ./scripts/quick-proxy-benchmark.sh
   ```

**预期结果：** 212ms → 80-100ms

### 阶段 3：深度优化（1-2 周）

**目标：** 接近直连性能（70-80ms）

1. **实现 KV 缓存**
   - 缓存热点路由配置
   - 缓存 IP 黑名单
   - 缓存地区规则

2. **优化上游调用**
   - 确保流式转发
   - 启用 HTTP/2 连接复用
   - 优化超时配置

3. **预聚合统计数据**
   - 使用 Scheduled Worker
   - 减少实时 D1 查询

**预期结果：** 80-100ms → 70-80ms

---

## 🎯 性能目标对比

| 阶段 | 代理耗时 | 直连耗时 | 增加延迟 | 完成时间 |
|------|---------|---------|---------|---------|
| **当前** | 212ms | 68ms | +144ms (+211%) | - |
| **阶段 1** | 150-160ms | 68ms | +82-92ms (+120-135%) | 1-2天 |
| **阶段 2** | 80-100ms | 68ms | +12-32ms (+18-47%) | 1周 |
| **阶段 3** | 70-80ms | 68ms | +2-12ms (+3-18%) | 2周 |

---

## ⚠️ 注意事项

### 功能取舍

快速代理会**牺牲部分功能**：

| 功能 | 完整管道 | 快速管道 | 说明 |
|------|---------|---------|------|
| 实时流量统计 | ✅ | ⚠️ 延迟 | 异步记录，有小延迟 |
| IP 封禁 | ✅ 实时 | ⚠️ 缓存 | 可能有 1 分钟延迟 |
| 地区限制 | ✅ | ❌ | 业务 API 通常不需要 |
| 详细日志 | ✅ | ⚠️ 简化 | 保留关键信息 |
| 限流 | ✅ 精确 | ⚠️ 简化 | 可能不够精确 |

### 兼容性

- ✅ 向后兼容：现有功能保持不变
- ✅ 渐进式：可以逐步迁移路径
- ✅ 可回退：出问题可以快速切回完整管道

### 监控

使用性能监控验证效果：
```bash
# 查看快速代理的性能
wrangler tail | grep "x-proxy-by: api-gateway-fast"

# 对比两种管道
wrangler tail | grep "x-proxy-timing"
```

---

## 🚀 立即行动

### 最小可行方案（今天就能做）

```bash
# 1. 添加 D1 索引
cd apps/api
wrangler d1 execute DB --file=migrations/0009_performance_indexes.sql

# 2. 测试当前性能
./scripts/quick-proxy-benchmark.sh > before.txt

# 3. 等待索引生效（几分钟）
sleep 300

# 4. 再次测试
./scripts/quick-proxy-benchmark.sh > after.txt

# 5. 对比结果
diff before.txt after.txt
```

**预期：** 立即减少 15-30ms

### 下一步（本周）

1. 异步化 pathCollector
2. 实现路由缓存
3. 修改 index.ts 实现简单分流

**预期：** 总共减少 80-100ms

---

## 📚 参考

- 快速代理实现：`src/middleware/fast-proxy.ts` ✅ 已创建
- 性能测试：`scripts/quick-proxy-benchmark.sh`
- 完整分析：`PERFORMANCE_ANALYSIS_REPORT.md`

