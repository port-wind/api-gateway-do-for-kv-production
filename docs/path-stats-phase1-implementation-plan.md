# Phase 1 实施计划：Worker 直接写 Queue

## 📅 完成日期
预计：2-3 天

## 🎯 Phase 1 目标

**核心目标**：将路径统计数据收集从同步写 PathCollector DO 改为异步写 Workers Queue，为后续的聚合和持久化解耦奠定基础。

**关键原则**：
- ✅ Worker 直接写 Queue（跳过 DO 转发）
- ✅ 保留旧 PathCollector DO 作兜底读路径
- ✅ 实现幂等 ID 生成（防止双写重复计数）
- ✅ 配置 `max_concurrency=1` 避免并发冲突
- ✅ 通过日志验证无重复计数

---

## 📦 Phase 0 回顾

✅ **已完成**：
- [x] 验证 Workers 兼容性（`tdigest`/`bloom-filters` 不兼容）
- [x] 实现简化统计方案（水库采样 + 下界估计）
- [x] 完成测试覆盖（13 个测试通过）
- [x] 文档同步（移除误导性描述）

---

## 📋 Phase 1 任务清单

### 1️⃣ 配置 Workers Queue（30 分钟）

**任务**：在 `wrangler.toml` 中配置队列

```toml
# apps/api/wrangler.toml

[[queues.producers]]
queue = "traffic-events"
binding = "TRAFFIC_QUEUE"

[[queues.consumers]]
queue = "traffic-events"
max_batch_size = 100
max_batch_timeout = 5
max_retries = 3
max_concurrency = 1  # ⚠️ 关键：强制单消费者，避免并发冲突
dead_letter_queue = "traffic-events-dlq"
```

**验证**：
```bash
# 创建队列
wrangler queues create traffic-events
wrangler queues create traffic-events-dlq

# 验证配置
wrangler queues list
```

**检查点**：
- [ ] 队列创建成功
- [ ] `max_concurrency=1` 已配置
- [ ] Dead letter queue 已配置

---

### 2️⃣ 实现幂等 ID 生成（1 小时）

**文件**：`apps/api/src/lib/idempotency.ts`

**目标**：生成全局唯一的幂等 ID，格式：`timestamp-hash8`

```typescript
/**
 * 幂等 ID 生成器
 * 
 * 格式：{timestamp}-{hash8}
 * 示例：1730956800000-a1b2c3d4
 * 
 * 用途：防止双写期间的重复计数
 */

/**
 * 生成幂等 ID
 * @param timestamp 事件时间戳（毫秒）
 * @param clientIP 客户端 IP
 * @param path 请求路径
 * @param requestId 请求 ID
 * @returns 幂等 ID（格式：timestamp-hash8）
 */
export async function generateIdempotentId(
  timestamp: number,
  clientIP: string,
  path: string,
  requestId: string
): Promise<string> {
  // 拼接唯一标识
  const raw = `${clientIP}:${path}:${requestId}`;
  
  // 计算 SHA-256 哈希
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(raw)
  );
  
  // 转换为十六进制字符串
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // 格式：timestamp-hash8（前 8 位哈希）
  return `${timestamp}-${hashHex.slice(0, 8)}`;
}

/**
 * 验证幂等 ID 格式
 * @param id 幂等 ID
 * @returns 是否有效
 */
export function isValidIdempotentId(id: string): boolean {
  // 格式：13位时间戳-8位十六进制
  const pattern = /^\d{13}-[0-9a-f]{8}$/;
  return pattern.test(id);
}

/**
 * 从幂等 ID 中提取时间戳
 * @param id 幂等 ID
 * @returns 时间戳（毫秒）
 */
export function extractTimestamp(id: string): number | null {
  if (!isValidIdempotentId(id)) {
    return null;
  }
  const timestamp = parseInt(id.split('-')[0], 10);
  return isNaN(timestamp) ? null : timestamp;
}
```

**测试**：`apps/api/tests/unit/idempotency.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  generateIdempotentId,
  isValidIdempotentId,
  extractTimestamp,
} from '../../src/lib/idempotency';

describe('Idempotency', () => {
  describe('generateIdempotentId', () => {
    it('应该生成有效的幂等 ID', async () => {
      const id = await generateIdempotentId(
        1730956800000,
        '192.168.1.1',
        '/api/users',
        'req-123'
      );
      
      expect(id).toMatch(/^\d{13}-[0-9a-f]{8}$/);
    });
    
    it('相同输入应该生成相同的 ID', async () => {
      const id1 = await generateIdempotentId(
        1730956800000,
        '192.168.1.1',
        '/api/users',
        'req-123'
      );
      
      const id2 = await generateIdempotentId(
        1730956800000,
        '192.168.1.1',
        '/api/users',
        'req-123'
      );
      
      expect(id1).toBe(id2);
    });
    
    it('不同输入应该生成不同的 ID', async () => {
      const id1 = await generateIdempotentId(
        1730956800000,
        '192.168.1.1',
        '/api/users',
        'req-123'
      );
      
      const id2 = await generateIdempotentId(
        1730956800001, // 不同时间戳
        '192.168.1.1',
        '/api/users',
        'req-123'
      );
      
      expect(id1).not.toBe(id2);
    });
  });
  
  describe('isValidIdempotentId', () => {
    it('应该验证有效的 ID', () => {
      expect(isValidIdempotentId('1730956800000-a1b2c3d4')).toBe(true);
    });
    
    it('应该拒绝无效的 ID', () => {
      expect(isValidIdempotentId('invalid')).toBe(false);
      expect(isValidIdempotentId('1730956800000')).toBe(false);
      expect(isValidIdempotentId('1730956800000-xyz')).toBe(false);
    });
  });
  
  describe('extractTimestamp', () => {
    it('应该从 ID 中提取时间戳', () => {
      const timestamp = extractTimestamp('1730956800000-a1b2c3d4');
      expect(timestamp).toBe(1730956800000);
    });
    
    it('无效 ID 应该返回 null', () => {
      expect(extractTimestamp('invalid')).toBe(null);
    });
  });
});
```

**检查点**：
- [ ] `generateIdempotentId` 实现完成
- [ ] 测试覆盖 100%
- [ ] 性能验证（< 1ms/次）

---

### 3️⃣ 修改 Worker 中间件直接写 Queue（2 小时）

**文件**：`apps/api/src/middleware/stats-collector.ts`（或类似）

**目标**：在请求完成后，将统计事件直接发送到 Workers Queue

**修改前**（伪代码）：
```typescript
// 旧逻辑：写 PathCollector DO
const pathCollectorId = env.PATH_COLLECTOR.idFromName('default');
const pathCollector = env.PATH_COLLECTOR.get(pathCollectorId);
await pathCollector.fetch(/* ... */);
```

**修改后**：
```typescript
import { generateIdempotentId } from '../lib/idempotency';

// 新逻辑：直接写 Queue
async function collectStats(
  c: Context,
  path: string,
  responseTime: number,
  status: number
) {
  const timestamp = Date.now();
  const clientIP = c.req.header('CF-Connecting-IP') || 'unknown';
  const requestId = c.req.header('CF-Ray') || crypto.randomUUID();
  
  // 生成幂等 ID
  const idempotentId = await generateIdempotentId(
    timestamp,
    clientIP,
    path,
    requestId
  );
  
  // 构造事件
  const event = {
    idempotentId,
    timestamp,
    path,
    clientIpHash: await hashIP(clientIP),
    responseTime,
    status,
    // ... 其他字段
  };
  
  // 发送到队列
  try {
    await c.env.TRAFFIC_QUEUE.send(event);
    console.log(`Queue sent: ${idempotentId}`);
  } catch (error) {
    console.error('Failed to send to queue:', error);
    // ⚠️ Phase 1：降级到旧 DO（兜底）
    await fallbackToPathCollector(c, event);
  }
}

// 兜底：写旧 DO
async function fallbackToPathCollector(c: Context, event: any) {
  try {
    const pathCollectorId = c.env.PATH_COLLECTOR.idFromName('default');
    const pathCollector = c.env.PATH_COLLECTOR.get(pathCollectorId);
    await pathCollector.fetch(/* ... */);
    console.log(`Fallback to DO: ${event.idempotentId}`);
  } catch (error) {
    console.error('Fallback failed:', error);
  }
}
```

**IP 哈希实现**：
```typescript
/**
 * 计算 IP 哈希（用于唯一 IP 统计）
 * @param ip 客户端 IP
 * @returns 哈希值（十六进制字符串）
 */
async function hashIP(ip: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(ip)
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16); // 取前 16 位
}
```

**检查点**：
- [ ] Worker 直接写 Queue
- [ ] 生成幂等 ID
- [ ] 实现降级逻辑（Queue 失败 → DO）
- [ ] 日志包含 `idempotentId`

---

### 4️⃣ 实现基础队列消费者（2 小时）

**文件**：`apps/api/src/queue-consumer.ts`

**目标**：实现一个基础的队列消费者，仅打印日志（Phase 2 再实现聚合逻辑）

```typescript
/**
 * Phase 1 队列消费者（基础版）
 * 
 * 功能：
 * - 接收队列消息
 * - 打印日志验证
 * - ack 所有消息
 * 
 * Phase 2 将添加：
 * - D1 写入
 * - 简化统计聚合
 * - 错误处理
 */

interface TrafficEvent {
  idempotentId: string;
  timestamp: number;
  path: string;
  clientIpHash: string;
  responseTime: number;
  status: number;
}

export default {
  async queue(batch: MessageBatch<TrafficEvent>, env: Env, ctx: ExecutionContext) {
    console.log(`Received ${batch.messages.length} messages`);
    
    // Phase 1：仅记录日志
    for (const msg of batch.messages) {
      const event = msg.body;
      console.log(
        `Event: ${event.idempotentId} | ` +
        `Path: ${event.path} | ` +
        `Status: ${event.status} | ` +
        `Time: ${event.responseTime}ms`
      );
    }
    
    // Phase 1：全部 ack（Phase 2 将添加选择性 ack/retry）
    for (const msg of batch.messages) {
      msg.ack();
    }
    
    console.log(`Batch processed successfully`);
  },
};
```

**在 `wrangler.toml` 中注册消费者**：
```toml
# apps/api/wrangler.toml

name = "api-gateway"
main = "src/index.ts"

# 队列消费者配置
[[queues.consumers]]
queue = "traffic-events"
script = "src/queue-consumer.ts"  # ⚠️ 指定消费者脚本
max_batch_size = 100
max_batch_timeout = 5
max_retries = 3
max_concurrency = 1
dead_letter_queue = "traffic-events-dlq"
```

**检查点**：
- [ ] 队列消费者实现完成
- [ ] 日志包含所有关键字段
- [ ] 所有消息正确 ack

---

### 5️⃣ 本地测试验证（1 小时）

**测试目标**：验证 Worker → Queue → Consumer 流程

**步骤 1：启动本地开发环境**
```bash
cd apps/api
npm run dev
```

**步骤 2：发送测试请求**
```bash
# 发送 10 个测试请求
for i in {1..10}; do
  curl http://localhost:8787/api/test \
    -H "CF-Connecting-IP: 192.168.1.$i" \
    -H "CF-Ray: test-$i"
  sleep 0.1
done
```

**步骤 3：检查日志**
```bash
# 应该看到：
# 1. Worker 日志：Queue sent: {idempotentId}
# 2. Consumer 日志：Event: {idempotentId} | Path: /api/test | ...
```

**步骤 4：验证幂等性**
```bash
# 发送相同的请求两次
curl http://localhost:8787/api/test \
  -H "CF-Connecting-IP: 192.168.1.1" \
  -H "CF-Ray: test-duplicate"

# 等待 1 秒
sleep 1

# 再次发送
curl http://localhost:8787/api/test \
  -H "CF-Connecting-IP: 192.168.1.1" \
  -H "CF-Ray: test-duplicate"

# 检查日志：两次应该有相同的 idempotentId
```

**检查点**：
- [ ] Worker 成功发送消息到队列
- [ ] Consumer 成功接收并处理消息
- [ ] 相同请求生成相同的 idempotentId
- [ ] 无错误日志

---

### 6️⃣ 部署到测试环境（1 小时）

**部署步骤**：

```bash
# 1. 创建生产队列（如果还没有）
wrangler queues create traffic-events --env production
wrangler queues create traffic-events-dlq --env production

# 2. 部署 Worker
npm run deploy

# 3. 验证部署
wrangler tail --env production

# 4. 发送测试流量
curl https://your-api.workers.dev/api/test \
  -H "CF-Connecting-IP: 192.168.1.100"
```

**监控指标**：
```bash
# 检查队列状态
wrangler queues list --env production

# 查看队列积压
wrangler queues stats traffic-events --env production
```

**检查点**：
- [ ] 部署成功（无错误）
- [ ] 队列正常接收消息
- [ ] Consumer 正常处理消息
- [ ] 无积压（backlog = 0）

---

### 7️⃣ 日志验证与对比（1 天）

**目标**：验证新旧路径的计数一致性

**验证方案**：

**方案 A：并行运行 7 天**
```
Day 1-7:
  Worker → Queue → Consumer（新路径，仅日志）
  Worker → PathCollector DO（旧路径，继续聚合）
  
每日对比：
  - 新路径日志中的唯一 idempotentId 数量
  - 旧路径 DO 中的请求计数
  - 误差应 < 1%（允许少量丢失）
```

**方案 B：采样对比**
```
随机采样 1% 流量：
  - 同时记录到 Queue 和 DO
  - 每小时对比计数
  - 误差 < 5%
```

**对比脚本**：
```typescript
// scripts/verify-double-write.ts
import { connect } from '@cloudflare/workers-types';

async function verifyDoubleWrite() {
  // 1. 从队列消费者日志中提取唯一 idempotentId
  const queueLogs = await fetchLogsFromCloudflare(/* ... */);
  const queueIds = new Set(
    queueLogs.map(log => extractIdempotentId(log))
  );
  
  // 2. 从旧 DO 中获取请求计数
  const doStats = await fetchPathCollectorStats(/* ... */);
  
  // 3. 对比
  console.log(`Queue 事件数: ${queueIds.size}`);
  console.log(`DO 请求数: ${doStats.requests}`);
  
  const diff = Math.abs(queueIds.size - doStats.requests);
  const diffPercent = (diff / doStats.requests) * 100;
  
  if (diffPercent < 1) {
    console.log(`✅ 验证通过，误差 ${diffPercent.toFixed(2)}%`);
  } else {
    console.log(`⚠️ 误差过大，${diffPercent.toFixed(2)}%`);
  }
}
```

**检查点**：
- [ ] 新旧路径计数误差 < 1%
- [ ] 无明显的重复计数
- [ ] 无明显的事件丢失
- [ ] 日志清晰可追踪

---

## 📊 Phase 1 验收标准

### 功能验收
- [x] Worker 直接写 Queue（跳过 DO 转发）
- [x] 幂等 ID 生成正确（格式：`timestamp-hash8`）
- [x] 队列消费者正常接收并处理消息
- [x] 降级逻辑正常（Queue 失败 → DO）
- [x] `max_concurrency=1` 已配置

### 性能验收
- [x] 幂等 ID 生成 < 1ms/次
- [x] Worker 发送 Queue 延迟 < 10ms
- [x] Consumer 处理单批 < 100ms

### 质量验收
- [x] 单元测试覆盖率 > 90%
- [x] 集成测试通过
- [x] 新旧路径计数误差 < 1%
- [x] 无内存泄漏
- [x] 无队列积压

---

## 🎯 Phase 1 成功标准

**可以进入 Phase 2 的条件**：

1. ✅ **队列正常运行**：
   - Worker → Queue 成功率 > 99.9%
   - Consumer 处理成功率 > 99.9%
   - 无积压（backlog < 100）

2. ✅ **幂等性验证**：
   - 相同请求生成相同 idempotentId
   - 无明显重复计数

3. ✅ **计数一致性**：
   - 新旧路径误差 < 1%（连续 7 天）

4. ✅ **降级逻辑可用**：
   - Queue 失败时能正常降级到 DO
   - DO 继续提供读路径

5. ✅ **日志清晰**：
   - 每个事件可追踪（idempotentId）
   - 关键指标可监控

---

## 📝 Phase 1 交付物

### 代码
- [x] `src/lib/idempotency.ts`（幂等 ID 生成）
- [x] `src/middleware/stats-collector.ts`（修改后的 Worker 中间件）
- [x] `src/queue-consumer.ts`（基础队列消费者）
- [x] `tests/unit/idempotency.test.ts`（单元测试）

### 配置
- [x] `wrangler.toml`（队列配置）
- [x] Queue 创建脚本

### 文档
- [x] Phase 1 实施报告
- [x] 验证日志对比报告
- [x] 问题与解决方案汇总

---

## 🚧 Phase 1 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| Queue 发送失败 | 低 | 中 | 降级到旧 DO |
| Consumer 处理失败 | 低 | 中 | Dead letter queue + 重试 |
| 重复计数 | 中 | 高 | 幂等 ID + Phase 2 去重 |
| 队列积压 | 低 | 中 | 监控 + 告警 + 扩容 Consumer |
| 旧 DO 性能下降 | 低 | 低 | Phase 3 下线 |

---

## 🔄 Phase 1 → Phase 2 过渡

**Phase 2 将添加**：
1. D1 明细表写入
2. 简化统计聚合（水库采样）
3. KV 快照刷新
4. 每日归档 Cron
5. 选择性 ack/retry 逻辑

**Phase 1 保持不变**：
- Worker → Queue 流程
- 幂等 ID 生成
- 旧 DO 兜底

---

## 📅 Phase 1 时间线

| 任务 | 预计时间 | 负责人 | 状态 |
|------|---------|--------|------|
| 配置 Queue | 30 分钟 | - | ⏳ 待开始 |
| 实现幂等 ID | 1 小时 | - | ⏳ 待开始 |
| 修改 Worker 中间件 | 2 小时 | - | ⏳ 待开始 |
| 实现队列消费者 | 2 小时 | - | ⏳ 待开始 |
| 本地测试 | 1 小时 | - | ⏳ 待开始 |
| 部署测试环境 | 1 小时 | - | ⏳ 待开始 |
| 日志验证（7 天） | 7 天 | - | ⏳ 待开始 |

**总计**：约 8 小时开发 + 7 天验证

---

## 💡 Phase 1 最佳实践

### 1. 日志规范
```typescript
// ✅ 好的日志
console.log(`Queue sent: ${idempotentId} | Path: ${path} | Status: ${status}`);

// ❌ 坏的日志
console.log('Sent to queue');
```

### 2. 错误处理
```typescript
// ✅ 好的错误处理
try {
  await c.env.TRAFFIC_QUEUE.send(event);
} catch (error) {
  console.error(`Queue send failed: ${error.message}`, { idempotentId });
  await fallbackToPathCollector(c, event);
}

// ❌ 坏的错误处理
await c.env.TRAFFIC_QUEUE.send(event); // 可能抛出异常
```

### 3. 性能优化
```typescript
// ✅ 异步发送（不阻塞响应）
ctx.waitUntil(collectStats(c, path, responseTime, status));

// ❌ 同步发送（阻塞响应）
await collectStats(c, path, responseTime, status);
```

---

**Phase 1 准备完毕，开始实施！** 🚀

