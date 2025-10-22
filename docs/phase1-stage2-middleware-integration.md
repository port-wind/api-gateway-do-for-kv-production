# Phase 1 Stage 2: 中间件集成完成

## 📅 完成日期
2025-10-15

## ✅ 实施内容

### 1. 中间件改造 ✅

**文件**：`apps/api/src/middleware/path-collector-do.ts`

**核心改动**：

#### 1.1 新增降级策略函数
```typescript
async function recordPathWithFallback(env, data) {
  // 1. 生成幂等 ID
  const idempotentId = await generateIdempotentId(...);
  
  // 2. 构造队列事件
  const event: TrafficEvent = {
    idempotentId,
    timestamp,
    path,
    method,
    clientIpHash: await hashIP(data.ip),
    ...
  };
  
  // 3. 优先发送到队列
  const queueSuccess = await safeSendToQueue(env, event);
  
  if (queueSuccess) {
    console.log(`✅ Queue sent: ${idempotentId}`);
    return;
  }
  
  // 4. 队列失败时降级到 DO
  console.warn(`⚠️ Fallback to DO: ${idempotentId}`);
  await recordPathToDO(env, ...);
}
```

#### 1.2 中间件调用更新
```typescript
// 旧代码：直接调用 recordPathToDO
c.executionCtx.waitUntil(
  recordPathToDO(c.env, clientIP, path, method, metadata)
);

// 新代码：调用降级策略函数
const requestId = c.req.header('CF-Ray') || crypto.randomUUID();
c.executionCtx.waitUntil(
  recordPathWithFallback(c.env, {
    ip: clientIP,
    path,
    method,
    requestId,
    userAgent,
    country
  })
);
```

---

### 2. 队列消费者实现 ✅

**文件**：`apps/api/src/queue-consumer.ts`

**Phase 1 功能**（仅验证数据流）：

```typescript
export default {
  async queue(batch, env, ctx) {
    console.log(`📦 Queue Batch Received: ${batch.messages.length} messages`);
    
    for (const msg of batch.messages) {
      const event = msg.body;
      
      // 验证字段
      if (!event.idempotentId || !event.path) {
        console.error('❌ Invalid event');
        msg.ack();
        continue;
      }
      
      // Phase 1: 打印日志验证
      console.log(`✅ Event: ${event.idempotentId}`);
      console.log(`   Path: ${event.path}`);
      console.log(`   Method: ${event.method}`);
      console.log(`   IP Hash: ${event.clientIpHash.substring(0, 8)}...`);
      
      // Phase 1: ack 所有消息
      msg.ack();
    }
  }
};
```

---

### 3. 主入口导出 ✅

**文件**：`apps/api/src/index.ts`

```typescript
import queueConsumer from './queue-consumer';

// ... app 定义 ...

export default app;
export { Counter, RateLimiter, TrafficMonitor, PathCollector, GlobalStatsAggregator };

// Phase 1: Workers Queue 消费者
export const queue = queueConsumer.queue;
```

---

## 📊 数据流图

```
┌───────────────────────────────────────────────────────────────┐
│                         请求到达                                │
└───────────────────┬───────────────────────────────────────────┘
                    ↓
      ┌─────────────────────────────┐
      │  pathCollectorDOMiddleware  │
      │  （中间件）                   │
      └─────────────┬───────────────┘
                    ↓
           recordPathWithFallback()
                    ↓
      ┌─────────────────────────────┐
      │  1. 生成幂等 ID               │
      │  2. 哈希 IP                   │
      │  3. 构造事件                  │
      └─────────────┬───────────────┘
                    ↓
        safeSendToQueue(env, event)
                    ↓
            ┌───────┴───────┐
            │               │
       成功 ✅            失败 ❌
            │               │
            ↓               ↓
    ┌───────────────┐  ┌────────────────┐
    │ Workers Queue │  │ PathCollector  │
    │  （新路径）    │  │      DO        │
    └───────┬───────┘  │  （兜底路径）   │
            │          └────────────────┘
            ↓
    ┌───────────────┐
    │ Queue Consumer│
    │  （Phase 1）  │
    │   打印日志     │
    └───────────────┘
```

---

## 🧪 本地测试指南

### 环境准备

#### 1. 配置本地环境变量

创建 `apps/api/.dev.vars` 文件：

```bash
# 启用队列（需要本地队列支持）
USE_TRAFFIC_QUEUE=true

# 或禁用队列（仅使用 DO）
# USE_TRAFFIC_QUEUE=false
```

#### 2. 创建队列（如果启用）

```bash
cd apps/api

# 创建主队列
npx wrangler queues create traffic-events

# 创建死信队列
npx wrangler queues create traffic-events-dlq
```

---

### 测试场景

#### 场景 1：队列启用（完整路径）

**配置**：`.dev.vars` 中 `USE_TRAFFIC_QUEUE=true`

**预期行为**：
1. 请求到达 → 中间件生成事件
2. 事件发送到 Queue
3. Queue Consumer 打印日志

**测试步骤**：

```bash
# 1. 启动开发服务器
npm run dev

# 2. 发送测试请求
curl http://localhost:8787/api/health

# 3. 观察日志输出
# 应该看到：
# ✅ Queue sent: <idempotentId> | Path: /api/health
# 📦 Queue Batch Received: 1 messages
# ✅ Event: <idempotentId>
#    Path: /api/health
#    Method: GET
#    IP Hash: abc12345...
```

#### 场景 2：队列禁用（降级路径）

**配置**：`.dev.vars` 中 `USE_TRAFFIC_QUEUE=false`

**预期行为**：
1. 请求到达 → 中间件生成事件
2. 队列不可用，直接降级到 DO
3. PathCollector DO 记录路径

**测试步骤**：

```bash
# 1. 修改 .dev.vars
echo "USE_TRAFFIC_QUEUE=false" > apps/api/.dev.vars

# 2. 重启开发服务器
npm run dev

# 3. 发送测试请求
curl http://localhost:8787/api/health

# 4. 观察日志输出
# 应该看到：
# ⚠️ Queue failed/unavailable, fallback to DO: <idempotentId>
# （然后是 DO 的日志）
```

#### 场景 3：队列失败模拟

**配置**：队列绑定不存在，但环境变量启用

**预期行为**：
1. `safeSendToQueue` 检测队列不可用，返回 `false`
2. 自动降级到 DO

**测试**：
```bash
# 1. 删除队列（模拟不可用）
npx wrangler queues delete traffic-events

# 2. .dev.vars 仍然设置为 true
# USE_TRAFFIC_QUEUE=true

# 3. 重启服务器并测试
npm run dev
curl http://localhost:8787/api/health

# 4. 应该看到降级日志
# ⚠️ TRAFFIC_QUEUE 不可用（可能是本地开发环境）
# ⚠️ Queue failed/unavailable, fallback to DO
```

---

### 验证清单

- [ ] **队列启用时**：
  - [ ] 请求成功到达
  - [ ] 日志显示 `✅ Queue sent`
  - [ ] 队列消费者接收到消息
  - [ ] 消费者日志显示完整事件信息
  - [ ] 幂等 ID 格式正确（`timestamp-hashprefix`）
  - [ ] IP 已哈希化（不可逆）

- [ ] **队列禁用时**：
  - [ ] 请求成功到达
  - [ ] 日志显示 `⚠️ Queue failed/unavailable, fallback to DO`
  - [ ] PathCollector DO 正常工作
  - [ ] 可以通过 `/api/admin/paths` 查询统计

- [ ] **降级逻辑**：
  - [ ] 队列失败不影响请求处理
  - [ ] DO 兜底正常工作
  - [ ] 无重复计数（幂等 ID 生效）

---

## 🐛 常见问题

### 1. 队列消息未消费

**症状**：日志显示 `✅ Queue sent`，但没有消费者日志

**原因**：
- 本地开发环境 Wrangler 可能不支持队列消费

**解决**：
- 使用 `wrangler dev --remote` 连接到远程环境
- 或直接部署到测试环境验证

### 2. 队列绑定未找到

**症状**：`TRAFFIC_QUEUE is undefined`

**原因**：
- `wrangler.toml` 配置未生效
- 队列未创建

**解决**：
```bash
# 检查队列
npx wrangler queues list

# 重新创建
npx wrangler queues create traffic-events
```

### 3. TypeScript 类型错误

**症状**：`Property 'TRAFFIC_QUEUE' does not exist on type 'Env'`

**原因**：
- `src/types/env.ts` 未更新

**解决**：
```typescript
export interface Env {
  TRAFFIC_QUEUE: Queue;
  USE_TRAFFIC_QUEUE?: string;
  // ...
}
```

---

## 📈 性能指标

### 预期延迟

- **Queue 发送**：< 5ms（异步，不阻塞请求）
- **DO 降级**：< 20ms（仅在 Queue 失败时）
- **整体中间件**：< 1ms（`waitUntil` 异步）

### 内存使用

- **事件对象**：~500 bytes/event
- **幂等 ID 生成**：~1ms（SHA-256 哈希）
- **IP 哈希**：~1ms（SHA-256 哈希）

---

## 🎯 下一步

- [ ] **本地测试**：验证完整数据流
- [ ] **部署到测试环境**：真实 Queue 环境验证
- [ ] **监控日志**：观察 Queue 消费情况
- [ ] **7 天验证**：对比新旧路径计数

---

**所有核心代码已实现，准备开始测试！** ✅

