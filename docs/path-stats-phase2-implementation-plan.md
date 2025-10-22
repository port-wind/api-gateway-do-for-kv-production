# Phase 2 实施计划：Aggregator Worker + D1 存储

## 📋 概述

**目标**：实现完整的事件聚合、持久化存储、快照管理和归档流程

**依赖**：
- ✅ Phase 0：简化统计方案验证通过
- ✅ Phase 1：Workers Queue + 幂等 ID + 基础消费者

**预期成果**：
- ✅ 事件明细和聚合数据持久化到 D1
- ✅ KV 快照自动刷新（版本化管理）
- ✅ 每日自动归档至 R2 + D1 清理
- ✅ 单消费者心跳监控

---

## 🎯 Phase 2 任务清单

### Stage 1: 数据持久化基础 (Tasks 1-3)

#### Task 1: 设计并创建 D1 表结构 ⏳

**输出文件**：
- `apps/api/migrations/0001_create_path_stats_tables.sql`
- `apps/api/docs/d1-schema.md`（表结构文档）

**表设计**（基于简化统计方案）：

```sql
-- 明细事件表
CREATE TABLE traffic_events (
  id TEXT PRIMARY KEY,              -- 幂等 ID
  path TEXT NOT NULL,
  method TEXT,
  status INTEGER,
  response_time REAL,
  client_ip_hash TEXT,              -- 已哈希的 IP
  timestamp INTEGER,
  event_date TEXT,                  -- YYYY-MM-DD（用于分区）
  user_agent TEXT,
  country TEXT,
  is_error INTEGER DEFAULT 0        -- 1 = status >= 400
);

CREATE INDEX idx_events_date ON traffic_events(event_date);
CREATE INDEX idx_events_path_date ON traffic_events(path, event_date);
CREATE INDEX idx_events_timestamp ON traffic_events(timestamp);

-- 小时聚合表（使用简化统计）
CREATE TABLE path_stats_hourly (
  path TEXT NOT NULL,
  hour_bucket TEXT NOT NULL,        -- '2025-10-15T14'
  requests INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  sum_response_time REAL NOT NULL DEFAULT 0,
  count_response_time INTEGER NOT NULL DEFAULT 0,
  response_samples TEXT,            -- JSON 数组，最多 1000 个（水库采样）
  ip_hashes TEXT,                   -- JSON 数组，最多 1000 个（水库采样）
  unique_ips_seen INTEGER NOT NULL DEFAULT 0,  -- 水库中的唯一 IP 数（下界估计）
  created_at INTEGER,
  updated_at INTEGER,
  PRIMARY KEY (path, hour_bucket)
);

CREATE INDEX idx_stats_hour ON path_stats_hourly(hour_bucket);
CREATE INDEX idx_stats_updated ON path_stats_hourly(updated_at);

-- 归档元数据表
CREATE TABLE archive_metadata (
  date TEXT PRIMARY KEY,            -- YYYY-MM-DD
  r2_path TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  file_size_bytes INTEGER,
  archived_at INTEGER NOT NULL,
  status TEXT DEFAULT 'completed'   -- completed/failed
);
```

**验证步骤**：
```bash
# 创建 D1 数据库（如果还没有）
wrangler d1 create path-stats-db

# 执行迁移
wrangler d1 execute path-stats-db --file=./migrations/0001_create_path_stats_tables.sql

# 验证表结构
wrangler d1 execute path-stats-db --command="SELECT name FROM sqlite_master WHERE type='table'"
```

---

#### Task 2: 实现队列消费者聚合逻辑 ⏳

**修改文件**：`apps/api/src/queue-consumer.ts`

**核心逻辑**：

```typescript
import { aggregateEvents, generateStatsSummary } from './lib/simplified-stats';
import type { Env } from './types/env';

interface TrafficEvent {
  idempotentId: string;
  timestamp: number;
  path: string;
  method: string;
  clientIpHash: string;
  userAgent?: string;
  country?: string;
  responseTime?: number;
  isError?: boolean;
}

export default {
  async queue(
    batch: MessageBatch<TrafficEvent>,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log(`📦 Queue Batch: ${batch.messages.length} messages`);

    // 1. 更新心跳
    ctx.waitUntil(updateHeartbeat(env));

    // 2. 按 (path, hour_bucket) 分组
    const groups = new Map<string, TrafficEvent[]>();
    for (const msg of batch.messages) {
      const event = msg.body;
      const hourBucket = getHourBucket(event.timestamp);
      const key = `${event.path}:${hourBucket}`;
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(event);
    }

    // 3. 逐组处理聚合
    for (const [key, events] of groups.entries()) {
      try {
        await processGroup(env, key, events);
      } catch (error) {
        console.error(`❌ 聚合失败 [${key}]:`, error);
        // Phase 2: 继续处理其他组，记录错误
      }
    }

    // 4. 全部确认（Phase 2 简化版，Phase 3 实现选择性 ack）
    for (const msg of batch.messages) {
      msg.ack();
    }

    console.log(`✅ Batch processed: ${groups.size} groups`);
  }
};

// 辅助函数
function getHourBucket(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}T${String(date.getUTCHours()).padStart(2, '0')}`;
}

async function updateHeartbeat(env: Env) {
  await env.API_GATEWAY_STORAGE.put(
    'aggregator:heartbeat',
    Date.now().toString(),
    { expirationTtl: 300 }
  );
}

async function processGroup(env: Env, key: string, events: TrafficEvent[]) {
  const [path, hourBucket] = key.split(':');
  
  // 1. 插入明细事件到 D1
  await insertEvents(env, events);
  
  // 2. 读取现有聚合数据
  const existing = await getExistingStats(env, path, hourBucket);
  
  // 3. 聚合统计
  const updated = await aggregateEvents(events, existing);
  
  // 4. 写回 D1
  await upsertStats(env, updated);
  
  console.log(`✅ Aggregated [${key}]: ${events.length} events`);
}
```

**创建新文件**：`apps/api/src/lib/queue-aggregator.ts`
- 封装 `processGroup`、`insertEvents`、`getExistingStats`、`upsertStats` 等函数

---

#### Task 3: 实现 D1 写入逻辑 ⏳

**新文件**：`apps/api/src/lib/d1-writer.ts`

**核心函数**：

```typescript
import type { Env } from '../types/env';
import type { SimplifiedStats } from './simplified-stats';

/**
 * 批量插入明细事件
 */
export async function insertEvents(
  env: Env,
  events: TrafficEvent[]
): Promise<void> {
  if (events.length === 0) return;

  // 批量插入（D1 支持事务）
  const statements = events.map(event => {
    const eventDate = new Date(event.timestamp).toISOString().split('T')[0];
    return env.D1.prepare(
      `INSERT OR IGNORE INTO traffic_events 
       (id, path, method, status, response_time, client_ip_hash, timestamp, event_date, user_agent, country, is_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      event.idempotentId,
      event.path,
      event.method,
      event.status || 200,
      event.responseTime || 0,
      event.clientIpHash,
      event.timestamp,
      eventDate,
      event.userAgent || null,
      event.country || null,
      event.isError ? 1 : 0
    );
  });

  await env.D1.batch(statements);
}

/**
 * 读取现有聚合统计
 */
export async function getExistingStats(
  env: Env,
  path: string,
  hourBucket: string
): Promise<SimplifiedStats | null> {
  const result = await env.D1.prepare(
    `SELECT * FROM path_stats_hourly WHERE path = ? AND hour_bucket = ?`
  ).bind(path, hourBucket).first();

  if (!result) return null;

  return {
    path: result.path as string,
    hour_bucket: result.hour_bucket as string,
    requests: result.requests as number,
    errors: result.errors as number,
    sum_response_time: result.sum_response_time as number,
    count_response_time: result.count_response_time as number,
    response_samples: JSON.parse(result.response_samples as string || '[]'),
    ip_hashes: JSON.parse(result.ip_hashes as string || '[]'),
    unique_ips_seen: result.unique_ips_seen as number
  };
}

/**
 * Upsert 聚合统计
 */
export async function upsertStats(
  env: Env,
  stats: SimplifiedStats
): Promise<void> {
  await env.D1.prepare(
    `INSERT OR REPLACE INTO path_stats_hourly 
     (path, hour_bucket, requests, errors, sum_response_time, count_response_time, 
      response_samples, ip_hashes, unique_ips_seen, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    stats.path,
    stats.hour_bucket,
    stats.requests,
    stats.errors,
    stats.sum_response_time,
    stats.count_response_time,
    JSON.stringify(stats.response_samples),
    JSON.stringify(stats.ip_hashes),
    stats.unique_ips_seen,
    Date.now()
  ).run();
}
```

---

### Stage 2: 快照管理 (Task 4)

#### Task 4: 实现 KV 快照生成与刷新 ⏳

**新文件**：`apps/api/src/lib/kv-snapshot.ts`

**核心逻辑**：

```typescript
/**
 * 生成并刷新 KV 快照
 * 
 * 版本化设计：
 * - paths:snapshot:{version} - 快照内容
 * - paths:snapshot:latest - 最新版本指针
 */
export async function refreshKVSnapshot(env: Env): Promise<void> {
  // 1. 从 D1 读取 Top 100 路径（按最近 24 小时请求数排序）
  const cutoffTime = Date.now() - 24 * 3600 * 1000;
  const hourBucket = getHourBucket(cutoffTime);
  
  const { results } = await env.D1.prepare(
    `SELECT path, 
            SUM(requests) as total_requests,
            SUM(errors) as total_errors,
            SUM(sum_response_time) / SUM(count_response_time) as avg_response_time
     FROM path_stats_hourly
     WHERE hour_bucket >= ?
     GROUP BY path
     ORDER BY total_requests DESC
     LIMIT 100`
  ).bind(hourBucket).all();

  // 2. 生成快照
  const snapshot = {
    version: Date.now(),
    generatedAt: new Date().toISOString(),
    paths: results,
    totalPaths: results?.length || 0
  };

  // 3. 获取旧版本指针
  const latestPointer = await env.API_GATEWAY_STORAGE.get(
    'paths:snapshot:latest',
    'json'
  );

  // 4. 写入新快照
  const newVersion = snapshot.version;
  await env.API_GATEWAY_STORAGE.put(
    `paths:snapshot:${newVersion}`,
    JSON.stringify(snapshot),
    { expirationTtl: 72 * 3600 } // 3 天
  );

  // 5. 更新指针
  await env.API_GATEWAY_STORAGE.put(
    'paths:snapshot:latest',
    JSON.stringify({
      version: newVersion,
      prev: latestPointer?.version || null,
      updatedAt: new Date().toISOString()
    })
  );

  console.log(`✅ KV snapshot refreshed: version ${newVersion}`);
}
```

**集成到聚合流程**：
- 在 `queue-consumer.ts` 中，每处理 10 个批次刷新一次 KV
- 或者使用独立的 Cron Trigger（每 5 分钟）

---

### Stage 3: 归档与清理 (Tasks 6-8)

#### Task 6: 实现 R2 归档 Worker ⏳

**新文件**：`apps/api/src/workers/archive-worker.ts`

**核心逻辑**（参考技术方案附录 G）：

```typescript
/**
 * 每日归档 Worker
 * 
 * Cron: 0 2 * * * (每日凌晨 2 点)
 */
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    await ctx.waitUntil(archiveDailyEvents(env));
  }
};

async function archiveDailyEvents(env: Env) {
  // 1. 计算目标日期（3 天前）
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - 3);
  const dateStr = targetDate.toISOString().split('T')[0];

  console.log(`开始归档 ${dateStr} 的数据`);

  // 2. 查询记录数
  const countResult = await env.D1.prepare(
    'SELECT COUNT(*) as count FROM traffic_events WHERE event_date = ?'
  ).bind(dateStr).first<{ count: number }>();

  const totalCount = countResult?.count || 0;
  if (totalCount === 0) {
    console.log(`${dateStr} 无数据，跳过`);
    return;
  }

  // 3. 决策上传策略
  const estimatedSizeMB = (totalCount * 150 * 0.25) / (1024 * 1024);
  
  if (estimatedSizeMB < 100) {
    await archiveWithSinglePut(env, dateStr, totalCount);
  } else {
    await archiveWithMultipart(env, dateStr, totalCount);
  }
}

// 实现 archiveWithSinglePut 和 archiveWithMultipart
// （参考技术方案附录 G 的完整代码）
```

---

#### Task 7: 实现 D1 清理逻辑 ⏳

**集成到归档流程**：

```typescript
async function cleanupArchivedData(env: Env, dateStr: string) {
  console.log(`开始清理 ${dateStr} 的 D1 数据`);

  let deletedTotal = 0;
  while (true) {
    const result = await env.D1.prepare(`
      DELETE FROM traffic_events 
      WHERE rowid IN (
        SELECT rowid FROM traffic_events 
        WHERE event_date = ? 
        LIMIT 5000
      )
    `).bind(dateStr).run();

    deletedTotal += result.meta.changes || 0;

    if ((result.meta.changes || 0) < 5000) break;

    // 短暂等待，避免长时间锁表
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`✅ 已清理 ${deletedTotal} 条记录`);
}
```

---

#### Task 8: 配置 Cron Triggers ⏳

**修改文件**：`apps/api/wrangler.toml`

```toml
# ============================================
# Cron Triggers（Phase 2: 归档与监控）
# ============================================

[triggers]
crons = [
  "0 2 * * *",      # 每日归档（凌晨 2 点）
  "0 */6 * * *",    # 每 6 小时检查 D1 容量
  "*/5 * * * *"     # 每 5 分钟刷新 KV 快照（可选，或通过消费者触发）
]
```

**在 `src/index.ts` 中实现 `scheduled` handler**：

```typescript
export default {
  fetch: app.fetch,
  queue: queueConsumer.queue,
  
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const cron = event.cron;
    
    if (cron === '0 2 * * *') {
      // 每日归档
      await archiveDailyEvents(env);
    } else if (cron === '0 */6 * * *') {
      // 容量检查
      await checkD1Capacity(env);
    } else if (cron === '*/5 * * * *') {
      // KV 快照刷新
      await refreshKVSnapshot(env);
    }
  }
} as ExportedHandler<Env>;
```

---

### Stage 4: 测试与文档 (Tasks 5, 10-11)

#### Task 5: 编写聚合逻辑单元测试 ⏳

**新文件**：`apps/api/tests/unit/queue-aggregator.test.ts`

**测试场景**：
- ✅ 单组事件聚合
- ✅ 多组并行聚合
- ✅ 增量聚合（已有数据 + 新事件）
- ✅ 水库采样正确性
- ✅ 幂等 ID 去重

---

#### Task 10: 本地测试完整流程 ⏳

**测试步骤**：

```bash
# 1. 启动本地开发环境
npm run dev

# 2. 发送测试请求
for i in {1..100}; do
  curl http://localhost:8787/api/health
done

# 3. 检查 D1 数据
wrangler d1 execute path-stats-db --command="SELECT COUNT(*) FROM traffic_events"
wrangler d1 execute path-stats-db --command="SELECT * FROM path_stats_hourly LIMIT 5"

# 4. 检查 KV 快照
wrangler kv:key get --namespace-id=xxx "paths:snapshot:latest"

# 5. 测试归档流程（手动触发）
curl -X POST http://localhost:8787/admin/archive/trigger \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-10-12"}'
```

---

#### Task 11: 编写 Phase 2 完成报告 ⏳

**输出文件**：`docs/phase2-completion-report.md`

**内容结构**：
- ✅ 完成的功能清单
- ✅ 测试结果总结
- ✅ 性能指标（聚合耗时、D1 写入速度）
- ✅ 已知问题与限制
- ✅ Phase 3 准备事项

---

## 📊 验收标准

### 功能验收

- [ ] D1 表结构创建成功，索引正常
- [ ] 队列消费者能正确聚合事件并写入 D1
- [ ] 明细事件和聚合数据正确存储
- [ ] KV 快照自动刷新，版本化管理正常
- [ ] R2 归档流程能完整执行（包括清理）
- [ ] Cron Triggers 正常触发

### 性能验收

- [ ] 单批次（100 条消息）聚合耗时 < 500ms
- [ ] D1 批量插入 100 条记录 < 200ms
- [ ] KV 快照生成 < 1s
- [ ] 归档 10 万条记录 < 2 分钟

### 数据一致性验收

- [ ] 幂等 ID 正确生成，无重复
- [ ] 聚合计数准确（与明细表对比）
- [ ] 水库采样统计误差 < 5%（对于 <1000 请求应为 0%）
- [ ] 归档后 D1 数据正确清理

---

## 🚀 开始执行

**当前任务**：Task 1 - 设计并创建 D1 表结构

**预计耗时**：Phase 2 全部完成约 2-3 天开发时间

---

## 📝 修订历史

| 日期 | 版本 | 修改内容 |
|------|------|----------|
| 2025-10-15 | v1.0 | 初始版本，Phase 2 实施计划 |

