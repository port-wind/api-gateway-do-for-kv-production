# 🚀 性能测试与优化 - 快速开始

本指南提供快速测试和优化 API Gateway 性能的步骤。

---

## ⚡ 5 分钟快速测试

### 步骤 1: 运行性能对比测试

```bash
cd apps/api
./scripts/quick-proxy-benchmark.sh
```

**预期输出：**
```
════════════════════════════════════════════════════════════════════
                   🚀 API 代理快速性能测试
════════════════════════════════════════════════════════════════════

指标对比 (代理 vs 直连):
  总时间:          0.2126秒 vs 0.0683秒 (差: +0.1443秒, +211.0%)

💡 瓶颈分析:
  Worker/服务器处理时间: 0.1750秒 (代理) vs 0.0273秒 (直连)
  处理时间差异: +0.1477秒
```

### 步骤 2: 查看实时日志

在另一个终端运行：

```bash
cd apps/api
wrangler tail --format pretty
```

然后在浏览器或 curl 中发送请求，观察日志输出。

---

## 🔧 15 分钟快速优化

### 优化 1: 添加 D1 索引 ⚡ **（最快见效）**

```bash
# 部署索引（Test 环境）
cd apps/api
wrangler d1 execute DB --file=migrations/0009_performance_indexes.sql

# 部署索引（Production 环境）
wrangler d1 execute DB --file=migrations/0009_performance_indexes.sql --env production

# 验证索引
wrangler d1 execute DB --command "SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' ORDER BY tbl_name;"
```

**预期效果：** 减少 15-30ms 延迟

### 优化 2: 查看详细测试报告

```bash
# 运行详细测试（包含 P50/P95/P99）
node scripts/benchmark-proxy-vs-direct.js
```

查看输出的详细分析和优化建议。

### 优化 3: 重新测试验证效果

```bash
# 再次运行快速测试
./scripts/quick-proxy-benchmark.sh

# 比对优化前后的差异
```

---

## 📊 30 分钟深度分析

### 分析 1: 集成性能监控

按照 [性能监控集成指南](apps/api/scripts/apply-performance-monitoring.md) 集成性能监控中间件。

**快速版本：**

```typescript
// src/index.ts
import { performanceMonitorMiddleware } from './middleware/performance-monitor';

const app = createApp();

// ✅ 添加为第一个中间件
app.use('*', performanceMonitorMiddleware);

// ... 其他中间件
```

### 分析 2: 部署并查看详细日志

```bash
# 部署
npm run deploy

# 查看带性能指标的日志
wrangler tail --format pretty | grep performance_metrics
```

**预期输出：**
```json
{
  "event": "performance_metrics",
  "path": "/biz-client/biz/relationship/batch-get",
  "metrics": {
    "total_ms": 175.4,
    "breakdown_ms": {
      "pathCollector": 12.3,
      "ipGuard": 8.5,
      "upstream": 120.5,
      "d1Total": 7.7
    },
    "percentages": {
      "middleware": "16.8%",
      "upstream": "68.7%",
      "d1": "4.4%"
    }
  }
}
```

### 分析 3: 识别瓶颈

根据日志中的 `breakdown_ms` 识别耗时最长的部分：

- **D1 查询慢？** → 检查是否有索引，考虑缓存
- **上游调用慢？** → 检查网络，考虑超时设置
- **中间件慢？** → 考虑异步化，减少不必要操作

---

## 🎯 完整优化流程（按优先级）

### 优先级 1: D1 索引 ⚡⚡⚡

**时间：** 5 分钟  
**难度：** 简单  
**效果：** 15-30ms

```bash
wrangler d1 execute DB --file=migrations/0009_performance_indexes.sql
```

### 优先级 2: 异步化 PathCollector ⚡⚡

**时间：** 30 分钟  
**难度：** 中等  
**效果：** 20-30ms

```typescript
// src/middleware/path-collector-do.ts
export async function pathCollectorDOMiddleware(c: Context, next: Next) {
  const path = c.req.path;
  
  // ✅ 改为异步（不阻塞请求）
  c.executionCtx.waitUntil(
    recordPathAccess(c.env, path, data)
  );
  
  return next();
}
```

### 优先级 3: 启用查询缓存 ⚡⚡

**时间：** 1 小时  
**难度：** 中等  
**效果：** 30-50ms（缓存命中时）

```typescript
// 示例：缓存 Dashboard 统计
export async function getDashboardStats(env: Env) {
  const cacheKey = 'dashboard:stats:5m';
  
  // 检查缓存
  const cached = await env.KV.get(cacheKey, 'json');
  if (cached) return cached;
  
  // 查询并缓存
  const stats = await calculateStats(env.DB);
  await env.KV.put(cacheKey, JSON.stringify(stats), {
    expirationTtl: 300 // 5分钟
  });
  
  return stats;
}
```

### 优先级 4: 并行化查询 ⚡

**时间：** 1 小时  
**难度：** 简单  
**效果：** 10-20ms

```typescript
// ❌ 串行
const stats = await getStats(db);
const traffic = await getTraffic(db);
const ips = await getIPs(db);

// ✅ 并行
const [stats, traffic, ips] = await Promise.all([
  getStats(db),
  getTraffic(db),
  getIPs(db)
]);
```

---

## 📈 测试工具一览

| 工具 | 用途 | 命令 |
|------|------|------|
| **快速测试** | 日常监控 | `./scripts/quick-proxy-benchmark.sh` |
| **详细测试** | 完整分析 | `node scripts/benchmark-proxy-vs-direct.js` |
| **实时日志** | 调试分析 | `wrangler tail --format pretty` |
| **Worker 分析** | 内部耗时 | `./scripts/analyze-worker-timing.sh` |

---

## 📋 检查清单

### 测试阶段
- [ ] 运行快速性能测试
- [ ] 查看实时日志
- [ ] 识别主要瓶颈（D1/上游/中间件）
- [ ] 记录基准数据

### 优化阶段
- [ ] 添加 D1 索引
- [ ] 验证索引效果
- [ ] 异步化非关键操作
- [ ] 实现查询缓存
- [ ] 并行化独立查询

### 验证阶段
- [ ] 重新运行性能测试
- [ ] 对比优化前后数据
- [ ] 检查响应头中的性能指标
- [ ] 确认 P95/P99 指标改善

### 监控阶段
- [ ] 集成性能监控中间件
- [ ] 设置告警（慢请求 > 1s）
- [ ] 定期审查性能日志
- [ ] 持续优化瓶颈

---

## 🎯 性能目标

### 当前状态
```
代理：212.6ms
直连：68.3ms
差异：+144.3ms (+211%)
```

### 优化目标

**最小目标（1-2天）：**
```
代理：130-150ms
直连：68.3ms
差异：+62-82ms (+90-120%)
提升：30-40%
```

**理想目标（1周）：**
```
代理：90-110ms
直连：68.3ms
差异：+22-42ms (+32-62%)
提升：48-58%
```

**卓越目标（2周）：**
```
代理：70-90ms
直连：68.3ms
差异：+2-22ms (+3-32%)
提升：58-67%
```

---

## 📚 相关文档

- 📊 [完整性能分析报告](PERFORMANCE_ANALYSIS_REPORT.md)
- 🛠️ [性能测试工具文档](apps/api/scripts/PROXY_BENCHMARK_README.md)
- 🔧 [性能监控集成指南](apps/api/scripts/apply-performance-monitoring.md)
- 📝 [Worker 分析指南](apps/api/scripts/analyze-worker-timing.sh)

---

## 💡 常见问题

### Q: 测试结果波动大怎么办？

**A:** 多运行几次取平均值，或增加测试次数：

```bash
# 修改脚本中的 TEST_COUNT
# 从 10 增加到 20-30
```

### Q: 优化后没有明显改善？

**A:** 检查以下几点：

1. 索引是否真正创建？
   ```bash
   wrangler d1 execute DB --command "SELECT name FROM sqlite_master WHERE type='index';"
   ```

2. 缓存是否生效？
   ```bash
   # 检查响应头
   curl -I [URL]
   # 查找 X-Cache-Status 或类似头
   ```

3. 是否部署到正确环境？
   ```bash
   # 确认部署环境
   wrangler deploy --env production
   ```

### Q: 如何监控生产环境性能？

**A:** 使用 Cloudflare Analytics 和自定义日志：

```typescript
// 记录慢请求
if (duration > 1000) {
  console.warn(`Slow request: ${c.req.path} took ${duration}ms`);
}
```

然后使用 `wrangler tail` 或 Cloudflare Dashboard 查看。

---

## 🚀 开始优化

### 第一步：测试基准

```bash
cd apps/api
./scripts/quick-proxy-benchmark.sh > benchmark_before.txt
```

### 第二步：应用快速优化

```bash
# 添加索引
wrangler d1 execute DB --file=migrations/0009_performance_indexes.sql

# 等待几分钟让索引生效
sleep 60
```

### 第三步：验证效果

```bash
./scripts/quick-proxy-benchmark.sh > benchmark_after.txt
diff benchmark_before.txt benchmark_after.txt
```

### 第四步：持续优化

根据测试结果和性能日志，继续应用其他优化措施。

---

**需要帮助？** 查看 [完整性能分析报告](PERFORMANCE_ANALYSIS_REPORT.md)

