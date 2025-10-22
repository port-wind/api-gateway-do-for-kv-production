# 🚀 代理性能对比测试工具

本目录包含用于测试 API Gateway 代理性能的工具，帮助识别性能瓶颈并优化系统。

## 📋 工具列表

### 1. quick-proxy-benchmark.sh (快速测试)
基于 `curl` 的快速性能测试脚本，适合快速验证和日常监控。

**特点：**
- ✅ 无需依赖，直接运行
- ✅ 快速执行（每个场景 10 次请求）
- ✅ 清晰的对比报告
- ✅ 实时显示进度

**使用方法：**
```bash
cd apps/api

# 使用默认配置运行
./scripts/quick-proxy-benchmark.sh

# 修改测试次数（编辑脚本中的 TEST_COUNT 变量）
```

**输出示例：**
```
════════════════════════════════════════════════════════════════════
                   🚀 API 代理快速性能测试
════════════════════════════════════════════════════════════════════

测试配置:
  - 代理地址: https://api-proxy.pwtk.cc/...
  - 直连地址: https://biz-client.pwtk.cc/...
  - 测试次数: 10

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 测试: 代理路径
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 统计结果:
────────────────────────────────────────────────────────────────────
  DNS 解析:        0.0234 秒
  TCP 连接:        0.0892 秒
  TLS 握手:        0.1567 秒
  首字节时间:      0.2891 秒
  总时间:          0.3124 秒
────────────────────────────────────────────────────────────────────

🔍 对比分析
  总时间:          0.3124秒 vs 0.2456秒 (差: +0.0668秒, +27.2%)

💡 瓶颈分析:
  ⚠️  Worker 处理时间较长，建议:
     - 使用 wrangler tail 分析详细耗时
     - 检查 D1 查询性能，添加必要索引
```

### 2. benchmark-proxy-vs-direct.js (详细测试)
基于 Node.js 的详细性能测试工具，提供完整的统计分析和性能洞察。

**特点：**
- ✅ 详细的性能指标（P50/P75/P90/P95/P99）
- ✅ 并发测试支持
- ✅ 智能瓶颈分析
- ✅ 专业的优化建议
- ✅ 可编程接口

**使用方法：**
```bash
cd apps/api

# 运行完整测试
node scripts/benchmark-proxy-vs-direct.js

# 或使用可执行文件
./scripts/benchmark-proxy-vs-direct.js
```

**配置项：**
在脚本中修改 `config` 对象：
```javascript
const config = {
  warmupRequests: 5,      // 预热请求数
  testRequests: 50,       // 正式测试请求数
  concurrency: 5,         // 并发数
  proxyUrl: '...',        // 代理地址
  directUrl: '...',       // 直连地址
  // ...
};
```

**输出示例：**
```
╔═══════════════════════════════════════════════════════════════════╗
║                🚀 API 代理性能对比测试工具                         ║
║                                                                   ║
║  测试配置:                                                        ║
║    - 预热请求: 5 次                                               ║
║    - 测试请求: 50 次                                              ║
║    - 并发数: 5                                                    ║
╚═══════════════════════════════════════════════════════════════════╝

════════════════════════════════════════════════════════════════════
📊 代理路径测试结果
════════════════════════════════════════════════════════════════════

✅ 成功率: 100.00%
❌ 失败数: 0
📦 平均响应大小: 1.23 KB

⏱️  性能指标 (单位: ms):
────────────────────────────────────────────────────────────────────
指标                      最小值        P50        P95        P99     最大值       平均
────────────────────────────────────────────────────────────────────
DNS 查询                 12.00ms    15.00ms    23.00ms    28.00ms    31.00ms    16.50ms
TCP 连接                 45.00ms    52.00ms    67.00ms    78.00ms    85.00ms    54.30ms
TLS 握手                 89.00ms    98.00ms   115.00ms   128.00ms   142.00ms   101.20ms
首字节时间 (TTFB)       234.00ms   267.00ms   312.00ms   345.00ms   378.00ms   272.40ms
内容传输                 12.00ms    18.00ms    28.00ms    35.00ms    42.00ms    19.80ms
总时间                  256.00ms   289.00ms   334.00ms   367.00ms   398.00ms   293.60ms

════════════════════════════════════════════════════════════════════
🔍 代理 vs 直连对比分析
════════════════════════════════════════════════════════════════════

⏱️  总响应时间对比:
────────────────────────────────────────────────────────────────────
指标                        代理        直连        差值      增加比例
────────────────────────────────────────────────────────────────────
P50                    289.00ms    234.00ms    55.00ms       23.50%
P95                    334.00ms    267.00ms    67.00ms       25.09%
P99                    367.00ms    298.00ms    69.00ms       23.15%
MEAN                   293.60ms    241.20ms    52.40ms       21.72%

🎯 瓶颈分析:

代理路径耗时分解 (平均):
  DNS 查询:        16.50ms
  TCP 连接:        37.80ms
  TLS 握手:        47.10ms
  处理时间:        171.00ms  <-- 主要瓶颈
  内容传输:        19.80ms

直连路径耗时分解 (平均):
  DNS 查询:        14.20ms
  TCP 连接:        36.50ms
  TLS 握手:        45.80ms
  处理时间:        144.70ms
  内容传输:        18.50ms

💡 主要瓶颈: Worker 处理 + 源站响应 (差异: 26.30ms)

📝 优化建议:
────────────────────────────────────────────────────────────────────
⚠️  Worker 处理时间较长，建议:
   - 检查 Worker 内部逻辑，减少不必要的计算
   - 优化 D1 查询，添加索引或使用预聚合
   - 考虑使用 KV 缓存热点数据
   - 使用 wrangler tail 分析详细耗时

⚠️ 性能可接受，代理增加 52.40ms 延迟 (21.7%)
```

### 3. benchmark-dashboard.js (Dashboard 专项测试)
专门用于测试 Dashboard API 性能的工具。

**使用方法：**
```bash
cd apps/api
node scripts/benchmark-dashboard.js
```

## 🎯 测试场景与策略

### 场景 1: 快速健康检查
**目的：** 日常监控，确保代理性能正常

```bash
./scripts/quick-proxy-benchmark.sh
```

**预期结果：**
- 代理增加延迟 < 50ms：优秀
- 代理增加延迟 50-150ms：良好
- 代理增加延迟 > 150ms：需要优化

### 场景 2: 详细性能分析
**目的：** 深入分析性能瓶颈，制定优化方案

```bash
node scripts/benchmark-proxy-vs-direct.js
```

**关注指标：**
- **P95 延迟**：95% 用户的体验
- **P99 延迟**：极端情况
- **处理时间**：Worker + D1 + 业务逻辑
- **网络时间**：DNS + TCP + TLS

### 场景 3: 压力测试
**目的：** 测试高并发下的性能表现

```bash
# 修改 benchmark-proxy-vs-direct.js 中的配置
# testRequests: 200
# concurrency: 20

node scripts/benchmark-proxy-vs-direct.js
```

### 场景 4: 定点测速（识别具体瓶颈）

#### 4.1 直接测试源站（建立基线）
```bash
curl -w "\n时间详情:\n  DNS解析: %{time_namelookup}s\n  TCP连接: %{time_connect}s\n  TLS握手: %{time_appconnect}s\n  首字节: %{time_starttransfer}s\n  总时间: %{time_total}s\n" \
  -X POST https://biz-client.pwtk.cc/biz/relationship/batch-get \
  -H 'Content-Type: application/json' \
  --data-raw '{"targetUserIdList":["1419717728603737560"],"direct":1}' \
  -o /dev/null -s
```

#### 4.2 测试代理入口
```bash
curl -w "\n时间详情:\n  DNS解析: %{time_namelookup}s\n  TCP连接: %{time_connect}s\n  TLS握手: %{time_appconnect}s\n  首字节: %{time_starttransfer}s\n  总时间: %{time_total}s\n" \
  -X POST https://api-proxy.pwtk.cc/biz-client/biz/relationship/batch-get \
  -H 'Content-Type: application/json' \
  --data-raw '{"targetUserIdList":["1419717728603737560"],"direct":1}' \
  -o /dev/null -s
```

#### 4.3 分析 Worker 内部耗时
```bash
# 在另一个终端运行
wrangler tail --format pretty

# 然后在主终端发送请求
curl -X POST https://api-proxy.pwtk.cc/biz-client/biz/relationship/batch-get \
  -H 'Content-Type: application/json' \
  --data-raw '{"targetUserIdList":["1419717728603737560"],"direct":1}'
```

## 🔍 性能指标解读

### 关键指标

| 指标 | 说明 | 目标值 |
|------|------|--------|
| **DNS 查询** | 域名解析时间 | < 30ms |
| **TCP 连接** | 建立 TCP 连接 | < 50ms |
| **TLS 握手** | SSL/TLS 协商 | < 100ms |
| **首字节时间 (TTFB)** | 开始接收数据 | < 300ms |
| **内容传输** | 下载响应体 | < 50ms |
| **总时间** | 完整请求周期 | < 400ms |

### 处理时间计算

```
处理时间 = TTFB - DNS查询 - (TCP连接 - DNS查询) - (TLS握手 - TCP连接)
         = TTFB - TLS握手时间点
```

处理时间包括：
1. Worker 内部逻辑执行
2. D1 数据库查询
3. 源站 API 调用
4. 数据转换和处理

## 🛠️ 常见瓶颈与优化

### 瓶颈 1: Worker 处理时间过长
**症状：** 处理时间 > 150ms

**原因：**
- D1 查询慢（缺少索引、全表扫描）
- 复杂的数据处理逻辑
- 同步等待外部 API

**优化方案：**
```typescript
// ❌ 不好：顺序执行多个查询
const stats = await getStats(db);
const traffic = await getTraffic(db);
const ips = await getIPs(db);

// ✅ 好：并行执行
const [stats, traffic, ips] = await Promise.all([
  getStats(db),
  getTraffic(db),
  getIPs(db)
]);

// ✅ 更好：使用预聚合
const cached = await env.KV.get('stats:hourly', 'json');
if (cached && Date.now() - cached.timestamp < 3600000) {
  return cached.data;
}
```

**添加索引：**
```sql
-- 为常用查询添加索引
CREATE INDEX IF NOT EXISTS idx_traffic_events_date_timestamp 
ON traffic_events(event_date, timestamp);

CREATE INDEX IF NOT EXISTS idx_traffic_events_timestamp 
ON traffic_events(timestamp) WHERE timestamp > datetime('now', '-24 hours');
```

### 瓶颈 2: D1 查询慢
**症状：** D1 查询时间 > 100ms

**优化方案：**
1. **添加索引** (见上面的 SQL)
2. **分页查询**：避免一次性加载大量数据
3. **预聚合**：使用 Scheduled Worker 定时计算统计数据
4. **缓存热数据**：将频繁访问的数据存入 KV

```typescript
// 预聚合示例（Scheduled Worker）
export default {
  async scheduled(event: ScheduledEvent, env: Env) {
    // 每小时计算一次统计数据
    const stats = await calculateHourlyStats(env.DB);
    await env.KV.put('stats:hourly', JSON.stringify(stats), {
      expirationTtl: 3600
    });
  }
}
```

### 瓶颈 3: 网络连接慢
**症状：** DNS + TCP + TLS > 150ms

**优化方案：**
1. 使用 Cloudflare CDN 边缘节点
2. 启用 HTTP/2 或 HTTP/3
3. 配置合理的连接复用
4. 优化源站网络

### 瓶颈 4: 内容传输慢
**症状：** 内容传输时间 > 50ms

**优化方案：**
1. 启用响应压缩（gzip/brotli）
2. 减小响应体大小
3. 使用流式传输

```typescript
// ✅ 流式代理
return fetch(upstreamUrl, request);

// ❌ 避免缓冲整个响应
const response = await fetch(upstreamUrl, request);
const data = await response.json();
return Response.json(data);
```

## 📊 性能优化检查清单

### Worker 代码层面
- [ ] 移除不必要的日志和计算
- [ ] 使用 Promise.all 并行执行独立操作
- [ ] 避免在热路径中使用同步操作
- [ ] 使用流式传输代理响应
- [ ] 启用响应压缩

### 数据库层面
- [ ] 为常用查询字段添加索引
- [ ] 避免全表扫描（使用 LIMIT 和 WHERE）
- [ ] 使用预聚合减少实时计算
- [ ] 定期清理历史数据

### 缓存层面
- [ ] 缓存热点数据到 KV
- [ ] 使用 staleWhileRevalidate 策略
- [ ] 设置合理的 TTL
- [ ] 实现多级缓存（边缘 + KV + D1）

### 网络层面
- [ ] 启用 Cloudflare CDN
- [ ] 配置合理的 CORS 头
- [ ] 使用 HTTP/2 或 HTTP/3
- [ ] 优化 DNS 解析

## 🔗 相关资源

- [Cloudflare Workers 性能最佳实践](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 数据库优化指南](https://developers.cloudflare.com/d1/platform/limits/)
- [KV 存储最佳实践](https://developers.cloudflare.com/kv/best-practices/)
- [wrangler tail 使用指南](https://developers.cloudflare.com/workers/wrangler/commands/#tail)

## 💡 实战案例

### 案例 1: Dashboard API 优化

**问题：** Dashboard 接口响应时间 > 500ms

**分析过程：**
```bash
# 1. 运行性能测试
node scripts/benchmark-dashboard.js

# 2. 发现 D1 查询耗时 300ms+
# 3. 使用 wrangler tail 确认瓶颈
wrangler tail --format pretty

# 4. 检查执行计划
wrangler d1 execute DB --command "EXPLAIN QUERY PLAN SELECT ..."
```

**优化方案：**
```typescript
// 添加索引
await env.DB.exec(`
  CREATE INDEX IF NOT EXISTS idx_traffic_events_date 
  ON traffic_events(event_date, timestamp);
`);

// 使用预聚合
const cached = await env.KV.get('dashboard:stats', 'json');
if (cached) return cached;

const stats = await calculateStats(env.DB);
await env.KV.put('dashboard:stats', JSON.stringify(stats), {
  expirationTtl: 300 // 5分钟
});
```

**结果：** 响应时间降低到 80ms (84% 提升)

### 案例 2: 业务接口代理优化

**问题：** 代理增加 200ms 延迟

**分析过程：**
```bash
# 1. 对比测试
./scripts/quick-proxy-benchmark.sh

# 2. 发现处理时间占主要部分
# 3. 检查 Worker 代码发现在记录每个请求
```

**优化方案：**
```typescript
// ❌ 之前：每个请求都写 D1
await logRequest(env.DB, requestData);
return proxyResponse;

// ✅ 优化：异步批量写入
ctx.waitUntil(batchLogRequests(env.DB, requestData));
return proxyResponse;
```

**结果：** 代理延迟降低到 30ms (85% 提升)

## 📞 获取帮助

如果遇到性能问题需要帮助：
1. 运行完整的性能测试并保存报告
2. 使用 `wrangler tail` 收集实时日志
3. 提供 D1 查询的 EXPLAIN 结果
4. 说明优化目标和当前瓶颈

