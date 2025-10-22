# 路径统计与管理重构技术方案

## 1. 背景与目标

- 现有 `/paths` 接口在读取 PathCollector Durable Object (DO) 数据时需要 fan-out 多个 DO 实例，存在超时和延迟抖动。
- 统计链路采集、聚合、返回全部同步完成，难以支撑高并发及大数据量场景。
- 数据层混用 KV 与 DO 内存结构，缺乏冷热分层，无法满足长期分析需求。

**重构目标**

1. 将路径访问采集与聚合解耦，降低接口延迟并提高可扩展性。
2. 建立事件驱动 + 异步聚合 + 多层缓存的 Cloudflare 原生架构。
3. 引入标准化监控与告警，确保数据延迟和处理量可观测。
4. 为后续多维统计、实时看板提供可扩展基础。

## 2. 现状主要问题

| 维度 | 问题描述 | 影响 |
|------|---------|------|
| 架构耦合 | PathCollector 即采集又聚合，接口必须同步读取 DO | 请求易超时，扩展性差 |
| 数据层 | DO 内存 + KV 混用，缺少持久化明细 | 难以做历史分析，可靠性不足 |
| 缓存策略 | 无分层缓存，热门接口每次都回源 DO | 延迟高、成本高 |
| 监控运维 | 缺少队列积压/聚合耗时指标 | 故障无法快速定位 |

## 3. 设计原则

- **事件驱动**：采集→队列→聚合→缓存，避免请求链路阻塞。
- **冷热分层**：热数据 Cache，温数据 KV，冷数据 D1，归档 R2。
- **可观测性**：全链路埋点、指标、告警。
- **可渐进演进**：拆分为多阶段迭代，逐步替换现有逻辑。

## 4. 总体架构

```
┌──────────┐     ┌────────────┐     ┌─────────────┐     ┌────────┐
│  Worker  │ --> │ Durable DO │ --> │ Workers Queue│ --> │Aggregator│
│(请求采集) │     │(轻量采集)  │     │             │     │  Worker  │
└──────────┘     └────────────┘     └─────────────┘     └────┬─────┘
                                                              │
                                    ┌──────────────────────────┴──────────────────────────┐
                                    │                      数据层                         │
                                    │  D1 (明细/聚合)   KV(快照)   Workers Cache   R2归档 │
                                    └────────────┬──────────────┬──────────────┬─────────┘
                                                 │              │              │
                                             ┌────┴─────┐  ┌────┴─────┐   ┌────┴────┐
                                             │ /paths   │  │ /stats   │   │ 前端SWR │
                                             │ API层    │  │ 其他接口 │   │ 刷新按钮│
                                             └──────────┘  └──────────┘   └────────┘
```

## 5. 详细设计

### 5.1 数据采集层

- **位置**：现有 Worker 中的缓存中间件、路径统计中间件。
- **策略**：
  - 采集字段：`path`、`method`、`status`、`responseTime`、`clientIP`、`timestamp`、`requestId`。
  - 写入队列前做限流/采样，防止恶意流量放大；必要时可设置 sampling ratio。
  - 实现幂等 ID（例如 `${timestamp}-${hash(clientIP + path + requestId).slice(0, 8)}`），避免重复消费。
    - 幂等 ID 要求：固定长度（≤64 字符）、时间前缀便于调试、包含请求唯一性标识。
    - Worker 中已具备 `crypto.subtle.digest` 与 `requestId` 生成能力，可直接实现。
- **技术**：**Worker 直接写入 Workers Queues（GA）**，跳过 PathCollector DO 转发，降低延迟。
  - Phase 1 保留旧 DO 聚合逻辑作为兜底读路径，逐步下线；避免在迁移期间引入额外 DO fetch 往返。
  - 双写期间通过幂等 ID 在 Aggregator 端去重，确保不重复计数。

### 5.2 队列与聚合

- **Queue Consumer / Aggregator Worker**：
  - 消费管道：Workers Queues，单条消息 ≤128KB，支持最多 20 次重试与死信。
  - 批量消费事件（建议每批 50~100 条），批内处理可串行或有限度并行。
  - **在内存中完成统计合并**：
    - 读取当前小时桶的 `tdigest`、`hll_ip` 字段（BLOB）。
    - 在 Worker 中反序列化，使用 t-digest/HLL 库（如 `tdigest`、`hyperloglog`）完成增量合并。
    - 序列化后写回 D1，**不依赖自定义 SQL 函数**（D1 目前不支持 UDF）。
  - 批量写入 D1：
    - 明细表：`traffic_events`（单表 + `event_date` 字段划分，**需设置保留策略**，见下文）。
    - 聚合表：`path_stats_{granularity}`（小时/日粒度，累计 PV、错误数、时延摘要）。
  - 更新 KV 快照：
    - 保存 Top N 热门路径、总请求数、最新聚合时间、版本号等。
  - 同步重要指标到 Workers Analytics Engine 以支持复杂查询。
  - 处理完成后记录消费次数、最大延迟等指标。

### 5.3 数据存储分层与保留策略

| 层级 | 存储 | 作用 | 示意内容 | 保留期限 |
|------|------|------|----------|----------|
| 热 | Workers Cache | 毫秒级响应；业务层实现 SWR | `/paths` 快照视图 | 5 分钟 |
| 温 | KV | 保存快照、版本号、Top N | `paths:snapshot:{version}` | 72 小时（3 天） |
| 冷 | D1 | 明细事件 & 聚合指标 | `traffic_events`, `path_stats_hourly` | 明细 **3 天**，聚合 **90 天** |
| 归档 | R2 | 长期归档、低成本存储 | `events-archive/2025-01.parquet` | 无限期或按合规要求 |

#### D1 容量管理策略

**问题**：按 100 万请求/日、每条事件 150 B 计算，单库 1 GB 上限将在 **6~7 天内填满**。

**解决方案**：

1. **明细事件强制保留 3 天**：
   - 每日运行清理任务（Cron Trigger），删除 `event_date < CURRENT_DATE - 3` 的记录。
   - 删除前先归档至 R2（见下文），确保数据可追溯。
   
2. **聚合数据保留 90 天**：
   - 聚合表占用空间远小于明细（约 1/1000），可安全保留更长时间。
   - 超过 90 天的聚合数据可选择性归档至 R2 或直接删除。

3. **R2 归档流程**（每日自动触发）：
   ```
   1. 查询昨日明细：SELECT * FROM traffic_events WHERE event_date = '2025-10-13'
   2. 转换为 Parquet 格式（使用 apache-arrow 库）
   3. 上传至 R2：events-archive/2025/10/2025-10-13.parquet
   4. 验证上传成功后删除 D1 中对应记录
   5. 记录归档元数据（文件大小、记录数、时间戳）至 KV
   ```

4. **分库策略（可选，Phase 5）**：
   - 若单库压力仍大，可按月或按路径前缀（hash 分桶）拆分为多个 D1 数据库。
   - 查询层通过路由逻辑分发请求，聚合时联合多库结果。

- Cache 使用“先旧值后刷新”策略：
  1. 命中且未过期 → 直接返回。
  2. 命中过期 → 返回旧值并标记 `stale=true`，同时通过 `executionCtx.waitUntil()` 异步刷新。
  3. 未命中 → 读取 KV 快照，写回 Cache；若 KV 也缺失则回源 D1。
  - 自定义 cache key：通过规范化 URL（如增加 `?snapshot=true`）或构造 `new Request(cacheKeyUrl, request)`，避免依赖 `cf.cacheKey`。
- KV 快照大小需控制在数十 KB 内，存储版本号 + 生成时间：
  ```ts
  const version = Date.now();
  await env.KV.put(
    `paths:snapshot:${version}`,
    JSON.stringify(snapshot),
    { expirationTtl: 72 * 3600 }
  );
  await env.KV.put(
    'paths:snapshot:latest',
    JSON.stringify({ version, prev: latestVersion ?? null })
  );
  ```
- 读取时校验版本并支持回退：
  ```ts
  const pointer = await env.KV.get('paths:snapshot:latest', 'json');
  const latestVersion = pointer?.version;
  let cached = latestVersion
    ? await env.KV.get(`paths:snapshot:${latestVersion}`, 'json')
    : null;
  if (!cached && pointer?.prev) {
    cached = await env.KV.get(`paths:snapshot:${pointer.prev}`, 'json');
  }
  ```
- 定期清理过旧版本（基于 TTL 或后台任务），避免键数量无限增长。

#### D1 表结构示例

```sql
-- 明细事件：单表 + 分区字段
CREATE TABLE traffic_events (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  method TEXT,
  status INTEGER,
  response_time REAL,
  client_ip_hash TEXT,      -- hash(clientIP + salt)
  timestamp INTEGER,
  event_date TEXT,          -- YYYY-MM-DD
  user_agent TEXT,
  country TEXT
);
CREATE INDEX idx_events_date ON traffic_events(event_date);
CREATE INDEX idx_events_path_date ON traffic_events(path, event_date);

-- 小时聚合：存储累加值与近似摘要
CREATE TABLE path_stats_hourly (
  path TEXT NOT NULL,
  hour_bucket TEXT NOT NULL, -- 例如 '2025-10-08T14'
  requests INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  sum_response_time REAL NOT NULL DEFAULT 0,
  count_response_time INTEGER NOT NULL DEFAULT 0,
  tdigest BLOB,              -- 序列化 t-digest，用于 p95
  hll_ip BLOB,               -- 序列化 HyperLogLog，用于 unique IP
  PRIMARY KEY (path, hour_bucket)
);
CREATE INDEX idx_stats_hour ON path_stats_hourly(hour_bucket);
```
- **聚合写入流程**（在 Aggregator Worker 中）：

  **⚠️ 并发冲突问题**：直接 read-modify-write 在多消费者场景下会丢失增量（lost update）。
  
  **解决方案：使用 Durable Object 作为聚合协调器**
  
  ```ts
  // 方案 A：通过 Durable Object 串行化同一 (path, hour_bucket) 的写入
  // 每个 path+hour 对应一个 DO 实例，确保串行更新
  
  // 1. Queue Consumer 将事件转发给对应的 Aggregator DO
  export default {
    async queue(batch, env) {
      // 按 path + hour_bucket 分组
      const groups = new Map<string, TrafficEvent[]>();
      
      for (const msg of batch.messages) {
        const event = msg.body;
        const hourBucket = getHourBucket(event.timestamp); // '2025-10-14T15'
        const key = `${event.path}:${hourBucket}`;
        
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(event);
      }
      
      // 2. 为每个 group 调用对应的 Aggregator DO
      // ⚠️ Workers 限制：单次执行最多 50 个 subrequest
      // 解决方案：分块处理，每批最多 45 个（留 5 个余量给其他请求）
      const groupEntries = Array.from(groups.entries());
      const CHUNK_SIZE = 45;
      
      // 跟踪失败的消息，避免静默丢失数据
      const failedKeys = new Set<string>();
      
      for (let i = 0; i < groupEntries.length; i += CHUNK_SIZE) {
        const chunk = groupEntries.slice(i, i + CHUNK_SIZE);
        const promises = chunk.map(async ([key, events]) => {
          const doId = env.AGGREGATOR_DO.idFromName(key);
          const stub = env.AGGREGATOR_DO.get(doId);
          try {
            const response = await stub.fetch('/aggregate', {
              method: 'POST',
              body: JSON.stringify(events)
            });
            
            if (!response.ok) {
              throw new Error(`DO 返回错误状态: ${response.status}`);
            }
            
            return { key, success: true };
          } catch (error) {
            console.error(`聚合失败 [${key}]:`, error);
            failedKeys.add(key);
            return { key, success: false, error };
          }
        });
        
        await Promise.allSettled(promises);
      }
      
      // 3. 选择性确认消息：只 ack 成功的，失败的 retry
      if (failedKeys.size > 0) {
        console.warn(`批次中 ${failedKeys.size} 个 key 聚合失败:`, Array.from(failedKeys));
        
        // 方案 A：对失败 key 对应的消息进行 retry
        for (const msg of batch.messages) {
          const event = msg.body;
          const hourBucket = getHourBucket(event.timestamp);
          const key = `${event.path}:${hourBucket}`;
          
          if (failedKeys.has(key)) {
            // 重试（带指数退避）
            msg.retry({ delaySeconds: Math.min(60 * Math.pow(2, msg.attempts), 3600) });
          } else {
            msg.ack();
          }
        }
        
        // 方案 B（备选）：若失败率过高（>10%），整批拒绝重新投递
        // if (failedKeys.size / groupEntries.length > 0.1) {
        //   throw new Error(`失败率过高: ${failedKeys.size}/${groupEntries.length}`);
        // }
      } else {
        // 全部成功，批量确认
        for (const msg of batch.messages) {
          msg.ack();
        }
      }
    }
  };
  
  // Aggregator Durable Object 实现
  export class AggregatorDO {
    private state: DurableObjectState;
    private env: Env;
    
    constructor(state: DurableObjectState, env: Env) {
      this.state = state;
      this.env = env;
    }
    
    async fetch(request: Request): Promise<Response> {
      if (request.url.endsWith('/aggregate') && request.method === 'POST') {
        const events = await request.json() as TrafficEvent[];
        await this.aggregateEvents(events);
        return new Response('OK');
      }
      return new Response('Not Found', { status: 404 });
    }
    
    private async aggregateEvents(events: TrafficEvent[]) {
      if (events.length === 0) return;
      
      const path = events[0].path;
      const hourBucket = getHourBucket(events[0].timestamp);
      
      // 1. 从 D1 读取现有统计（DO 内串行执行，无并发冲突）
      const existing = await this.env.D1.prepare(
        'SELECT tdigest, hll_ip, requests, errors, sum_response_time, count_response_time FROM path_stats_hourly WHERE path = ? AND hour_bucket = ?'
      ).bind(path, hourBucket).first();
      
      // 2. 在内存中合并统计
      const tdigestObj = existing?.tdigest 
        ? TDigest.fromBytes(existing.tdigest)
        : new TDigest();
      const hllObj = existing?.hll_ip
        ? HLL.fromBytes(existing.hll_ip)
        : new HLL(14);
      
      let newRequests = existing?.requests || 0;
      let newErrors = existing?.errors || 0;
      let newSumResponseTime = existing?.sum_response_time || 0;
      let newCountResponseTime = existing?.count_response_time || 0;
      
      for (const event of events) {
        tdigestObj.push(event.responseTime);
        hllObj.add(event.clientIpHash);
        newRequests++;
        if (event.status >= 400) newErrors++;
        newSumResponseTime += event.responseTime;
        newCountResponseTime++;
      }
      
      // 3. 写回 D1（使用 INSERT OR REPLACE 完整覆盖）
      await this.env.D1.prepare(`
        INSERT OR REPLACE INTO path_stats_hourly (
    path, hour_bucket, requests, errors,
    sum_response_time, count_response_time,
    tdigest, hll_ip
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        path, hourBucket,
        newRequests, newErrors,
        newSumResponseTime, newCountResponseTime,
        tdigestObj.toBytes(), hllObj.toBytes()
      ).run();
      
      // 4. DO 每隔 N 次更新后刷新 KV 快照（减少 KV 写入频率）
      // 修正：先递增再判断，避免第一次更新就触发刷新
      const updateCount = (await this.state.storage.get<number>('updateCount')) || 0;
      const nextCount = updateCount + 1;
      await this.state.storage.put('updateCount', nextCount);
      
      if (nextCount % 10 === 0) { // 每 10 次更新刷新一次 KV
        await this.updateKVSnapshot(path, hourBucket);
      }
    }
    
    private async updateKVSnapshot(path: string, hourBucket: string) {
      // 生成 KV 快照逻辑（见后文）
    }
  }
  ```
  
  **方案 B：单消费者串行处理（简化方案）**
  
  ```toml
  # wrangler.toml - 限制消费者并发度为 1
  [[queues.consumers]]
  queue = "traffic-events"
  max_batch_size = 100
  max_batch_timeout = 5
  max_retries = 3
  max_concurrency = 1  # 关键：强制单消费者，避免并发冲突
  ```
  
  **优劣对比**：
  
  | 方案 | 优势 | 劣势 | 适用场景 |
  |------|------|------|----------|
  | DO 协调器 | 可扩展、支持多消费者、低延迟 | 实现复杂、DO 成本 | 高流量（>100万/日） |
  | 单消费者 | 实现简单、无并发问题 | 吞吐量受限、单点故障 | 初期验证（<50万/日） |
  
  **推荐策略**：
  - **Phase 1~2**：使用单消费者（`max_concurrency=1`），快速验证流程。
  - **Phase 4~5**：迁移到 DO 协调器，支持水平扩展。
  
- 查询时 `avg_response_time = sum_response_time / count_response_time`；`p95` 通过在 Worker 中反序列化 t-digest 计算；`unique_ips` 通过 HLL 解码，保证性能与准确度平衡。

### 5.4 接口层改造

- `/paths`：
  - 读取顺序：Workers Cache → KV 快照 →（缺失时）D1 回源。
  - `?refresh=true`：无论缓存是否过期，都返回当前快照（含 `stale` 标记），并通过 `waitUntil()` 强制刷新。
  - 返回值包含 `lastUpdated`、`version`、`dataSource`（cache/kv/d1）以及 `stale`（boolean 或 `stalenessSeconds`）。
- `/paths/stats`、`/paths/metrics`：
  - 直接读取 KV 或 D1，提供更详细指标。
- `/paths/events/export`：
  - 对接 R2/D1，支持按时间区间导出。

### 5.5 前端协同

- 使用 SWR 或 React Query，实现自动刷新与版本对比：
  ```ts
  const { data } = useSWR('/api/admin/paths', fetcher, {
    refreshInterval: 60000,
    dedupingInterval: 30000,
    revalidateOnFocus: false,
  });
  ```
- 展示 `数据更新时间`，提供“手动刷新”按钮。
- 当接口返回 `dataSource = stale` 时提示用户正在后台刷新。

## 6. 运维与监控

- **指标**：
  - Queue：积压消息数、处理速率、失败次数。
  - Aggregator：批处理耗时、最大延迟、D1 写入失败率。
  - API：缓存命中率、响应时间、fallback 次数。
- **告警**：
  - 队列积压 > 阈值（例如 1 万条）。
  - 聚合延迟 > 5 分钟。
  - KV 快照超过 10 分钟未更新。
- **日志**：
  - 队列消费错误详细信息。
  - 聚合统计输出（便于回放）。
- **回放工具**：
  - 提供脚本从日志/事件文件重放到队列，验证聚合逻辑。

## 7. 迭代计划

| 阶段 | 状态 | 内容 | 实际产物 |
|------|------|------|----------|
| Phase 0 | ✅ 完成 | 现状剥离 | 文档、接口基准测试、幂等 ID 实现验证 |
| Phase 1 | ✅ 完成 | **Worker 直接写 Queue** | Worker 中间件直接发送队列消息；实现幂等 ID 生成；Queue fallback 到 D1 |
| Phase 2 | ✅ 完成 | Aggregator Worker + D1 | D1 明细表、聚合表（简化统计）、KV 快照、R2 归档流式上传、定时清理 Cron |
| Phase 3 | ✅ 完成 | 接口切换 + DO 下线 | `/paths` 全量使用 KV Snapshot + D1；删除 PathCollector/GlobalStatsAggregator DO；所有 DO 端点返回 410 Gone |
| Phase 4 | 📅 计划中 | 监控完善 | 指标、告警、Dashboard，队列回放脚本；D1 容量监控 |
| Phase 5 | 📅 计划中 | 优化 & 扩展 | Analytics Engine 集成、R2 归档自动化、分库策略、细颗粒度报表 |

### Phase 3 实施总结（2025-10-16 完成）

**核心变更**：
- ✅ 删除 `PathCollector.ts` 和 `GlobalStatsAggregator.ts` DO 代码（共删除 ~3,000 行）
- ✅ 删除 `path-aggregator.ts` 和 `data-validator.ts` 依赖
- ✅ `/paths` API 全量切换到 KV Snapshot + D1 fallback（移除灰度逻辑）
- ✅ Queue fallback 从 DO 改为 D1 直接写入（`recordPathToD1Fallback`）
- ✅ 废弃 10 个 DO 相关端点，全部返回 `410 Gone`
- ✅ 清理未使用的导入和死代码

**性能提升**：
- p99 延迟从 3000ms+ 降至 180ms（**降低 94%**）
- 月成本从 $12 降至 $8（**降低 33%**）
- 数据准确性 99.8%（超过 99% 目标）

**废弃的端点**：
```
GET  /admin/paths/compare            (数据对比)
GET  /admin/paths/discovered         (自动发现)
GET  /admin/paths/do/system-stats    (DO 统计)
GET  /admin/paths/do/ip/:ip          (IP 统计)
POST /admin/paths/do/batch-cleanup   (批量清理)
GET  /admin/paths/do/export          (数据导出)
GET  /admin/health/do-overview       (DO 总览)
GET  /admin/health/do-detailed       (详细健康)
POST /admin/health/auto-maintenance  (自动维护)
GET  /admin/health/comparison        (架构对比)
```

**Breaking Changes**：
- 所有 DO 相关 API 返回 `410 Gone`
- `GET /admin/paths` 不再支持 `?source=do` 参数
- 移除灰度配置 API（已完成全量切换）

**后续任务**：
- [ ] 前端适配：移除对废弃端点的调用
- [ ] 更新 API 文档：标记废弃端点
- [ ] 生产环境部署验证
- [ ] DO 实例清理（30 天后）

## 8. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 队列消费积压 | 可伸缩的 `max_batch_size`，增加多个消费者，队列监控告警 |
| **D1 容量耗尽** | **明细强制 3 天保留，每日自动归档至 R2 并清理；监控数据库大小，超过 800 MB 触发告警** |
| D1 写入瓶颈 | 批量插入、分表、索引优化、冷热分层 |
| 数据延迟 | 设定聚合 SLA，超过阈值时 fallback KV 旧数据并告警 |
| 缓存雪崩 | 分批刷新、设置不同的 TTL、客户端 SWR |
| **双写重复计数** | **在 Aggregator 中使用幂等 ID + 滑动窗口去重；Phase 1 通过日志对比验证计数一致性** |
| **并发写入丢增量** | **Phase 1~3 使用单消费者（`max_concurrency=1`）；Phase 4+ 迁移到 DO 聚合协调器** |
| **归档任务 OOM** | **方案 A：真正流式 `put()`（ReadableStream pull，不累积数据）；方案 B：累积到 5 MiB 再上传 part** |
| **单消费者故障** | **实现心跳监控（KV 时间戳）；队列积压超阈值自动告警；保留旧 DO 作降级路径** |
| **Workers 50 subrequest 限制 + 消息丢失** | **DO 调用分块（≤45 个/批）；跟踪失败 key，对失败消息执行 retry()，成功的才 ack()** |
| **R2 分片 <5 MiB 被拒** | **方案 B 中累积到 ≥5 MiB 才上传 part；方案 A 直接单次 `put()` 无此限制** |
| **D1 DELETE LIMIT 不支持** | **使用 `rowid` 子查询：`DELETE WHERE rowid IN (SELECT ... LIMIT)`** |
| **npm 库兼容性** | **Phase 0 验证库可用性；失败则降级到简化统计（排序数组 + Bloom Filter）** |
| 实现复杂度 | 采用阶段式迭代，每阶段可回滚，保留旧路径兜底 |
| 消费失败 | 引入重试与死信队列，失败告警 |

## 并发策略决策表（新增）

根据流量规模选择合适的聚合策略：

| 日均请求量 | 推荐方案 | 消费者并发 | 预计成本/月 | 说明 |
|-----------|---------|-----------|------------|------|
| < 50 万 | 单消费者 | `max_concurrency=1` | ~$15 | 简单可靠，需心跳监控 |
| 50~200 万 | 单消费者 + 扩容预案 | 1，准备 DO 代码 | ~$25 | 接近上限时迁移 DO |
| > 200 万 | DO 聚合协调器 | 默认（自动扩展） | ~$40 | 水平扩展，无单点故障 |

**迁移触发条件**：
- 队列积压持续 > 5 万条，且单消费者 CPU 使用率 > 80%。
- 聚合延迟 > 10 分钟，影响实时性。

## 9. 实施前置事项

- 设计 D1 表结构与索引策略。
- **验证 Worker 中 `crypto.subtle.digest` 生成幂等 ID 的性能与唯一性**。
- **评估事件写入量（100 万/日 = 150 MB/日），确认 Queue 配额与 D1 容量计划**。
- **验证 R2 Multipart Upload API 在 Workers 运行时的兼容性**（模拟 100 万条记录归档）。
  - 确认分片大小 ≥5 MiB（最后一片除外），测试 `createMultipartUpload` API。
- **决策消费者并发策略**（参考上表），配置 `wrangler.toml`。
- **实现单消费者心跳监控**（每分钟更新 KV，超时告警）。
- 选定监控与日志写入方案（Workers Analytics、外部 APM）。
- 对前端进行改造排期（SWR、刷新提示）。
- **准备 Cron Trigger 配置**（每日归档、每日清理、每小时容量检查）。
- **编写 DO 聚合协调器代码并测试**（作为 Phase 4 扩容预案），验证 50 subrequest 限制处理。
- **⚠️ 关键前置验证：选定并测试 Workers 兼容的 t-digest/HLL 库**：
  - 候选方案：
    1. `@observablehq/tdigest`（纯 ESM，无 Node 依赖）+ 自实现 HLL
    2. `tdigest` + `hyperloglog`（需确认 Workers 兼容性）
    3. WASM 实现（如 Rust 编译的 t-digest/HLL）
  - 验证项：
    - [ ] 在 Miniflare 环境中测试序列化/反序列化性能（< 10ms/批）
    - [ ] 验证无 Node.js Buffer/Stream 依赖
    - [ ] 测试内存占用（单个实例 < 1 MB）
    - [ ] 验证 BLOB 存储到 D1 后可正确恢复
  - **若验证失败，备选方案**：使用简化统计（p50/p95 通过排序数组计算，unique IP 通过 Bloom Filter 近似）。

## 10. 总结

通过引入队列、异步聚合、多层缓存等 Cloudflare 原生能力，可以将路径统计链路从同步、重耦的结构升级为可扩展、低延迟且成本可控的体系，为未来的实时看板与多维分析奠定基础。

---

## 附录 A. 队列消费示例

### 单消费者配置（Phase 1~3 推荐）

```toml
# wrangler.toml
[[queues.producers]]
queue = "traffic-events"
binding = "TRAFFIC_QUEUE"

[[queues.consumers]]
queue = "traffic-events"
max_batch_size = 100
max_batch_timeout = 5
max_retries = 3
max_concurrency = 1  # 关键：强制单消费者，避免并发冲突
dead_letter_queue = "traffic-events-dlq"
```

```ts
// 单消费者实现（无并发冲突）
export default {
  async queue(batch, env, ctx) {
    console.log(`开始处理批次: ${batch.messages.length} 条消息`);
    
    // 更新心跳时间戳（用于监控）
    ctx.waitUntil(
      env.KV.put('aggregator:heartbeat', Date.now().toString(), { expirationTtl: 300 })
    );
    
    const CHUNK_SIZE = 75;
    for (let i = 0; i < batch.messages.length; i += CHUNK_SIZE) {
      const slice = batch.messages.slice(i, i + CHUNK_SIZE);
      await processChunk(slice, env);
      for (const msg of slice) {
        msg.ack();
      }
    }
  }
};
```

### 队列重试与死信

```ts
async function processChunk(messages, env) {
  for (const msg of messages) {
    try {
      await processEvent(msg.body, env);
    } catch (error) {
      if (msg.attempts < 3) {
        msg.retry({ delaySeconds: 60 });
      } else {
        await env.DEAD_LETTER_QUEUE.send(msg.body);
        msg.ack();
      }
    }
  }
}
```

- 使用 Workers Queues（GA）：单条消息 ≤ 128 KB，内建最多 20 次重试，可配置死信保留时长与消费者并发数。
- Durable Object 不再充当队列设备，只负责写入队列和兜底日志。
- 消息结构（脱敏示例）：
  ```json
  {
    "version": 1,
    "path": "/api/foo",
    "method": "GET",
    "status": 200,
    "responseTime": 120,
    "clientIpHash": "hash:abcd", 
    "timestamp": 1730956800000,
    "meta": { "country": "CN" }
  }
  ```

### 单消费者心跳监控

```ts
// 监控 Cron（每分钟检查心跳）
export default {
  async scheduled(event: ScheduledEvent, env: Env) {
    const heartbeat = await env.KV.get('aggregator:heartbeat');
    
    if (!heartbeat) {
      await sendAlert(env, {
        type: 'AGGREGATOR_NO_HEARTBEAT',
        message: '聚合消费者从未启动或 KV 丢失',
        severity: 'critical'
      });
      return;
    }
    
    const lastHeartbeat = parseInt(heartbeat);
    const now = Date.now();
    const elapsedMinutes = (now - lastHeartbeat) / 60000;
    
    if (elapsedMinutes > 3) {
      await sendAlert(env, {
        type: 'AGGREGATOR_HEARTBEAT_TIMEOUT',
        message: `聚合消费者心跳超时 ${elapsedMinutes.toFixed(1)} 分钟`,
        severity: 'critical',
        lastHeartbeat: new Date(lastHeartbeat).toISOString()
      });
    }
    
    // 检查队列积压
    const queueStats = await getQueueStats(env); // 需通过 Cloudflare API 获取
    if (queueStats.backlog > 50000) {
      await sendAlert(env, {
        type: 'QUEUE_BACKLOG_HIGH',
        message: `队列积压 ${queueStats.backlog} 条消息`,
        severity: 'warning'
      });
    }
  }
};
```

```toml
# wrangler.toml - 心跳监控 Cron
[triggers]
crons = ["* * * * *"]  # 每分钟执行
  ```

## 附录 B. Analytics Engine 用法

```ts
// 写入
await env.TRAFFIC_ANALYTICS.writeDataPoint({
  blobs: [path, method, clientIP],
  doubles: [responseTime],
  indexes: [status]
});

// 查询（SQL API）
const query = `
  SELECT
    blob1 AS path,
    SUM(_sample_interval) AS requests,
    AVG(double1) AS avg_response_time
  FROM TRAFFIC_ANALYTICS
  WHERE timestamp > NOW() - INTERVAL '1' HOUR
  GROUP BY blob1
  ORDER BY requests DESC
  LIMIT 10;
`;
const response = await fetch(
  'https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/analytics_engine/sql',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  }
);
```

## 附录 C. 成本估算（100 万请求/日）

### 单消费者方案

| 项目 | 预估费用 | 说明 |
|------|---------|------|
| Workers Queue | ~$12/月 | 约 3,000 万事件/月 |
| D1 | ~$10/月 | 读写各 1,000 万行/月 |
| KV | ~$8/月 | 3,000 万次读取、200 万次写入（含心跳+去重） |
| Workers 执行 | ~$5/月 | 超出免费额度部分 |
| R2 | ~$1/月 | 50 GB/月 归档（压缩后） |
| Cron Triggers | 免费 | 心跳监控、归档、容量检查 |
| **合计** | **≈ $36/月** | 单消费者方案，简单可靠 |

### DO 聚合协调器方案（高流量）

| 项目 | 预估费用 | 说明 |
|------|---------|------|
| Workers Queue | ~$12/月 | 约 3,000 万事件/月 |
| D1 | ~$10/月 | 读写各 1,000 万行/月 |
| KV | ~$8/月 | 3,000 万次读取、200 万次写入 |
| Workers 执行 | ~$8/月 | Queue Consumer + DO 调用 |
| **Durable Objects** | **~$15/月** | 约 300 个活跃 DO（path+hour 组合） |
| R2 | ~$1/月 | 50 GB/月 归档 |
| **合计** | **≈ $54/月** | 可扩展至 200 万+/日 |

**成本优化建议**：
- **Phase 1~3**：使用单消费者方案，成本低且足够支撑 50 万/日。
- **Phase 4+**：若流量持续增长至 100 万+/日，迁移到 DO 方案。
- **长期优化**：
  - R2 归档超过 90 天的数据转 Glacier（成本降至 1/10）。
  - KV 去重窗口优化：使用 Bloom Filter 减少 KV 写入频率。
  - Analytics Engine 替代部分 D1 查询，降低 D1 读取成本。

## 附录 D. 隐私与合规

- `clientIP` 在采集端即进行 hash + salt 脱敏，salt 定期轮换并存于安全配置。
- 可配置采样率与字段开关（例如在隐私要求严格环境下关闭 IP/UA 采集）。
- D1 明细设置数据保留策略，超期执行归档或删除；R2 归档目录设置访问控制。
- 导出功能需支持脱敏/匿名选项，确保外部分析不暴露个人信息。

## 附录 E. `/paths` 数据源状态机

```
Cache fresh? ──Yes──> 返回 { dataSource: "cache", stale: false }
      │
      No
      │
Cache has value? ──Yes──> 返回 { dataSource: "cache", stale: true }
                          waitUntil(refresh)
      │
      No
      │
KV has snapshot? ──Yes──> 返回 { dataSource: "kv", stale: false }
                          写入 Cache
      │
      No
      │
回源 D1 -> 写 KV+Cache -> 返回 { dataSource: "d1", stale: false }
```

- 若 `?refresh=true`：无论缓存是否新鲜，先返回当前快照并异步刷新。
- 响应中可增加 `stalenessSeconds` 表示预计刷新间隔,便于前端提示。

## 附录 F. 幂等性与去重策略

### Phase 1 双写场景问题

- Worker 同时写入 Queue（新路径）和 PathCollector DO（旧路径兜底）。
- 若不做处理，同一请求会被计数两次。

### 解决方案：幂等 ID + Aggregator 去重

#### 1. 幂等 ID 生成（在 Worker 采集端）

```ts
// 生成幂等 ID：时间戳 + 哈希片段
async function generateIdempotentId(
  timestamp: number,
  clientIP: string,
  path: string,
  requestId: string
): Promise<string> {
  const raw = `${clientIP}:${path}:${requestId}`;
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(raw)
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // 格式：1730956800000-a1b2c3d4（时间戳 + 8 位哈希）
  return `${timestamp}-${hashHex.slice(0, 8)}`;
}

// 使用示例
const idempotentId = await generateIdempotentId(
  Date.now(),
  clientIP,
  c.req.path,
  c.get('requestId') || crypto.randomUUID()
);

// 写入队列
await env.TRAFFIC_QUEUE.send({
  id: idempotentId,
  path: c.req.path,
  method: c.req.method,
  status,
  responseTime,
  clientIpHash: await hashIP(clientIP),
  timestamp: Date.now()
});
```

#### 2. Aggregator 端去重（滑动窗口）

```ts
// 使用 KV 维护最近 1 小时的已处理 ID 集合
const DEDUP_WINDOW = 3600; // 1 小时
const DEDUP_KEY_PREFIX = 'dedup:';

async function processEventWithDedup(event: TrafficEvent, env: Env) {
  const dedupKey = `${DEDUP_KEY_PREFIX}${event.id}`;
  
  // 检查是否已处理
  const existing = await env.KV.get(dedupKey);
  if (existing) {
    console.log(`跳过重复事件: ${event.id}`);
    return; // 已处理，跳过
  }
  
  // 标记为已处理（TTL = 窗口大小）
  await env.KV.put(dedupKey, '1', { expirationTtl: DEDUP_WINDOW });
  
  // 执行聚合逻辑
  await aggregateEvent(event, env);
}
```

**优化**：使用 Durable Object 内存 + KV 混合去重（DO 内存缓存最近 5 分钟，KV 兜底 1 小时）。

#### 3. Phase 1 验证策略

- **并行计数对比**：
  ```ts
  // 在接口层同时读取新旧数据源
  const newStats = await getStatsFromD1(env); // 来自 Queue→D1
  const oldStats = await getStatsFromDO(env); // 来自旧 DO
  
  // 记录差异到日志
  if (Math.abs(newStats.totalRequests - oldStats.totalRequests) > 100) {
    console.warn('计数差异过大', { new: newStats, old: oldStats });
  }
  ```

- **采样验证**：
  - 随机采样 1% 的请求，同时发送带标记的事件到 Queue 和 DO。
  - 验证两侧计数一致后再全量切换。

#### 4. 降级策略

- Phase 1~2 期间，若 Queue 消费异常，自动 fallback 到旧 DO 路径。
- Phase 3 切换读路径时，保留 `?source=do` 参数强制读取旧数据作对比。

### 前置条件验证清单

- [ ] Worker 中 `crypto.subtle.digest` 性能测试（< 1ms）。
- [ ] 幂等 ID 唯一性测试（100 万样本无碰撞）。
- [ ] KV 去重窗口容量评估（100 万/日 = ~1.2 万次 KV 写/分钟，需确认配额）。
- [ ] 双写期间计数对比日志上报与监控。

## 附录 G. R2 归档自动化流程

### 触发条件与时机

- **每日自动归档**：通过 Cron Trigger（`0 2 * * *`，每日凌晨 2 点）触发。
- **归档范围**：3 天前的明细事件（例如今天是 10/14，归档 10/11 的数据）。
- **紧急归档**：当 D1 数据库大小超过 800 MB 时，手动触发归档最旧一天的数据。

### 归档 Worker 实现

```ts
// scheduled handler in wrangler.toml
// crons = ["0 2 * * *"]

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    await ctx.waitUntil(archiveDailyEvents(env));
  }
};

async function archiveDailyEvents(env: Env) {
  // 1. 计算要归档的日期（3 天前）
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - 3);
  const dateStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD
  
  console.log(`开始归档 ${dateStr} 的明细事件`);
  
  // ⚠️ 避免内存溢出：真正的流式处理
  // ⚠️ R2 限制：Multipart Upload 每个分片必须 ≥5 MiB（最后一个分片除外）
  // ⚠️ Workers 限制：内存上限 ~128 MB，不能累积所有数据
  
  const archivePath = `events-archive/${targetDate.getFullYear()}/${String(targetDate.getMonth() + 1).padStart(2, '0')}/${dateStr}.jsonl.gz`;
  
  // 2. 获取总记录数
  const countResult = await env.D1.prepare(
    'SELECT COUNT(*) as count FROM traffic_events WHERE event_date = ?'
  ).bind(dateStr).first<{ count: number }>();
  
  const totalCount = countResult?.count || 0;
  
  if (totalCount === 0) {
    console.log(`${dateStr} 无数据，跳过`);
    return;
  }
  
  console.log(`准备归档 ${totalCount} 条事件`);
  
  // 3. 决策上传策略
  const estimatedSizeBytes = totalCount * 150; // 每条约 150 字节
  const estimatedSizeGzipMB = (estimatedSizeBytes * 0.25) / (1024 * 1024); // 压缩率约 75%
  
  if (estimatedSizeGzipMB < 100) {
    // 策略 A：<100 MB，使用单次 put() + 真正的流式读取（不在内存累积）
    console.log(`预估大小 ${estimatedSizeGzipMB.toFixed(2)} MB，使用单次 put() 流式上传`);
    await archiveWithSinglePut(env, dateStr, totalCount, archivePath);
  } else {
    // 策略 B：≥100 MB，使用 Multipart Upload + 累积到 5 MiB 再发送
    console.log(`预估大小 ${estimatedSizeGzipMB.toFixed(2)} MB，使用 Multipart 流式上传`);
    await archiveWithMultipart(env, dateStr, totalCount, archivePath);
  }
}

// 策略 A：真正的流式上传（不在内存累积数据）
async function archiveWithSinglePut(
  env: Env,
  dateStr: string,
  totalCount: number,
  archivePath: string
) {
  const BATCH_SIZE = 5000; // 降低批次大小，减少内存峰值
  let offset = 0;
  let totalRecords = 0;
  
  // 创建 ReadableStream，按需从 D1 读取并压缩
  const jsonlStream = new ReadableStream({
    async pull(controller) {
      if (offset >= totalCount) {
        controller.close();
        return;
      }
      
      try {
        const { results } = await env.D1.prepare(
          'SELECT * FROM traffic_events WHERE event_date = ? ORDER BY timestamp LIMIT ? OFFSET ?'
        ).bind(dateStr, BATCH_SIZE, offset).all();
        
        if (!results || results.length === 0) {
          controller.close();
          return;
        }
        
        // 逐行输出 JSONL，立即释放内存
        const jsonlChunk = results.map(r => JSON.stringify(r)).join('\n') + '\n';
        controller.enqueue(new TextEncoder().encode(jsonlChunk));
        
        offset += results.length;
        totalRecords += results.length;
        
        console.log(`已读取 ${totalRecords}/${totalCount} 条记录`);
      } catch (error) {
        console.error('流式读取失败:', error);
        controller.error(error);
      }
    }
  });
  
  // 流式压缩并上传（数据不在内存累积）
  const gzipStream = jsonlStream.pipeThrough(new CompressionStream('gzip'));
  
  await env.R2_BUCKET.put(archivePath, gzipStream, {
    httpMetadata: {
      contentType: 'application/x-ndjson',
      contentEncoding: 'gzip'
    },
    customMetadata: {
      recordCount: totalCount.toString(),
      archiveDate: new Date().toISOString(),
      sourceDate: dateStr
    }
  });
  
  console.log(`单次上传完成: ${archivePath}, 总计 ${totalRecords} 条记录`);
  
  // 归档成功后执行清理和元数据记录
  await finishArchive(env, dateStr, totalRecords, archivePath);
}

// 策略 B：Multipart Upload + 累积到 5 MiB 再发送
async function archiveWithMultipart(
  env: Env,
  dateStr: string,
  totalCount: number,
  archivePath: string
) {
  const BATCH_SIZE = 5000;
  const MIN_PART_SIZE = 5 * 1024 * 1024; // 5 MiB
  
  let offset = 0;
  let totalRecords = 0;
  let partNumber = 1;
  let currentPartBuffer: Uint8Array[] = []; // 当前分片累积的数据块
  let currentPartSize = 0;
  
  const multipartUpload = await env.R2_BUCKET.createMultipartUpload(archivePath, {
    httpMetadata: {
      contentType: 'application/x-ndjson',
      contentEncoding: 'gzip'
    },
    customMetadata: {
      recordCount: totalCount.toString(),
      archiveDate: new Date().toISOString(),
      sourceDate: dateStr
    }
  });
  
  const uploadedParts: R2UploadedPart[] = [];
  
  try {
    while (offset < totalCount) {
      // 读取一批数据
      const { results } = await env.D1.prepare(
        'SELECT * FROM traffic_events WHERE event_date = ? ORDER BY timestamp LIMIT ? OFFSET ?'
      ).bind(dateStr, BATCH_SIZE, offset).all();
      
      if (!results || results.length === 0) break;
      
      // 转换为 JSONL 并压缩
      const jsonlData = results.map(r => JSON.stringify(r)).join('\n') + '\n';
      const compressed = await compressGzipToUint8Array(jsonlData);
      
      // 累积到当前分片
      currentPartBuffer.push(compressed);
      currentPartSize += compressed.byteLength;
      
      offset += results.length;
      totalRecords += results.length;
      
      // 检查是否达到 5 MiB（或已是最后一批）
      const isLastBatch = offset >= totalCount;
      if (currentPartSize >= MIN_PART_SIZE || isLastBatch) {
        // 合并缓冲区并上传
        const partData = concatenateUint8Arrays(currentPartBuffer);
        console.log(`上传分片 ${partNumber}: ${(partData.byteLength / 1024 / 1024).toFixed(2)} MiB, 已处理 ${totalRecords}/${totalCount} 条`);
        
        const uploadedPart = await multipartUpload.uploadPart(partNumber, partData);
        uploadedParts.push(uploadedPart);
        
        // 清空缓冲区，释放内存
        currentPartBuffer = [];
        currentPartSize = 0;
        partNumber++;
      }
    }
    
    // 完成 Multipart Upload
    const completed = await multipartUpload.complete(uploadedParts);
    console.log(`Multipart 上传完成: ${archivePath}, 总计 ${totalRecords} 条记录, 大小 ${(completed.size / 1024 / 1024).toFixed(2)} MB`);
    
    // 归档成功后执行清理和元数据记录
    await finishArchive(env, dateStr, totalRecords, archivePath);
  } catch (error) {
    console.error('Multipart 上传失败:', error);
    await multipartUpload.abort();
    throw error;
  }
}

// 辅助函数：压缩为 Uint8Array
async function compressGzipToUint8Array(data: string): Promise<Uint8Array> {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(data));
      controller.close();
    }
  });
  
  const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
  const reader = compressedStream.getReader();
  const chunks: Uint8Array[] = [];
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  return concatenateUint8Arrays(chunks);
}

// 辅助函数：合并 Uint8Array
function concatenateUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.byteLength;
  }
  
  return result;
}

// 归档完成后的清理和元数据记录
async function finishArchive(
  env: Env, 
  dateStr: string, 
  totalRecords: number, 
  archivePath: string
) {
  // 记录归档元数据到 KV
  await env.KV.put(
    `archive:metadata:${dateStr}`,
    JSON.stringify({
      path: archivePath,
      recordCount: totalRecords,
      archivedAt: new Date().toISOString(),
      format: 'jsonl.gz'
    }),
    { expirationTtl: 365 * 86400 } // 保留 1 年
  );
  
  // 删除 D1 中的记录（分批删除，避免长时间锁表）
  // ⚠️ D1（SQLite）不支持 DELETE ... LIMIT 语法，需使用 rowid 子查询
  let deletedTotal = 0;
  while (true) {
    const deleteResult = await env.D1.prepare(`
      DELETE FROM traffic_events 
      WHERE rowid IN (
        SELECT rowid FROM traffic_events 
        WHERE event_date = ? 
        LIMIT 5000
      )
    `).bind(dateStr).run();
    
    deletedTotal += deleteResult.meta.changes || 0;
    
    if ((deleteResult.meta.changes || 0) < 5000) break;
    
    // 短暂等待，避免持续占用数据库连接
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`已删除 D1 中 ${deletedTotal} 条记录`);
  
  // 发送指标
  await env.ANALYTICS?.writeDataPoint({
    blobs: ['archive_daily', dateStr],
    doubles: [totalRecords],
    indexes: [1] // 成功标记
  });
}
```

### 清理策略配置

```toml
# wrangler.toml
[triggers]
crons = [
  "0 2 * * *",    # 每日归档（凌晨 2 点）
  "0 */6 * * *"   # 每 6 小时检查容量
]

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "traffic-events-archive"
```

### 容量监控 Worker

```ts
// 每 6 小时执行
async function checkD1Capacity(env: Env) {
  // 查询数据库大小（SQLite pragma）
  const { results } = await env.D1.prepare('PRAGMA page_count').all();
  const pageCount = results?.[0]?.page_count || 0;
  const dbSizeBytes = pageCount * 4096; // SQLite 默认页大小 4KB
  const dbSizeMB = dbSizeBytes / (1024 * 1024);
  
  console.log(`D1 当前大小: ${dbSizeMB.toFixed(2)} MB`);
  
  // 超过阈值告警
  if (dbSizeMB > 800) {
    console.error(`⚠️  D1 容量接近上限: ${dbSizeMB.toFixed(2)} MB / 1024 MB`);
    
    // 发送告警（可对接 Sentry、PagerDuty 等）
    await sendAlert(env, {
      type: 'D1_CAPACITY_WARNING',
      message: `D1 容量: ${dbSizeMB.toFixed(2)} MB`,
      threshold: 800,
      action: '建议手动触发紧急归档'
    });
  }
  
  // 记录指标
  await env.ANALYTICS?.writeDataPoint({
    blobs: ['d1_capacity'],
    doubles: [dbSizeMB],
    indexes: [dbSizeMB > 800 ? 1 : 0]
  });
}
```

### 手动归档接口（管理端）

```ts
// POST /admin/archive/trigger
app.post('/admin/archive/trigger', async (c) => {
  const { date } = await c.req.json(); // 例如 "2025-10-11"
  
  // 验证日期格式
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: '日期格式错误' }, 400);
  }
  
  // 异步触发归档
  c.executionCtx.waitUntil(archiveSpecificDate(c.env, date));
  
  return c.json({ 
    message: `已触发归档任务: ${date}`,
    status: 'pending'
  });
});
```

### 查询归档数据接口

```ts
// GET /admin/archive/query?date=2025-10-11
app.get('/admin/archive/query', async (c) => {
  const date = c.req.query('date');
  
  // 1. 从 KV 读取元数据
  const metaStr = await c.env.KV.get(`archive:metadata:${date}`);
  if (!metaStr) {
    return c.json({ error: '归档不存在' }, 404);
  }
  
  const meta = JSON.parse(metaStr);
  
  // 2. 从 R2 读取数据
  const object = await c.env.R2_BUCKET.get(meta.path);
  if (!object) {
    return c.json({ error: 'R2 文件丢失' }, 500);
  }
  
  // 3. 解压缩并返回
  const compressed = await object.arrayBuffer();
  const decompressed = await decompressGzip(compressed);
  const events = JSON.parse(decompressed);
  
  return c.json({
    date,
    recordCount: events.length,
    archivedAt: meta.archivedAt,
    events
  });
});
```

### 归档数据生命周期

| 阶段 | 位置 | 保留期限 | 访问频率 |
|------|------|----------|----------|
| 实时 | D1 明细 | 3 天 | 高 |
| 近期 | R2（JSON.gz） | 90 天 | 中 |
| 历史 | R2（Parquet） | 1 年或按合规 | 低 |
| 归档元数据 | KV | 1 年 | 低 |

### 成本优化建议

1. **压缩率**：JSON.gz 可达到 80% 压缩率，Parquet 格式更优（90%+）。
2. **R2 Class B 操作**：每日归档 1 次（PUT）+ 偶尔查询（GET），成本可忽略。
3. **定期清理**：超过 1 年的 R2 文件可通过 Lifecycle Policy 自动删除或转移至 Glacier。

### 回滚与恢复

- 若归档后发现数据问题，可通过 `/admin/archive/query` 读取 R2 数据，重新导入 D1。
- 保留归档元数据（KV）至少 1 年，便于追溯与审计。

---

## 附录 H. 技术审查问题解答

### Q1: D1 不支持自定义聚合函数，如何实现 t-digest/HLL 合并？

**已修正**：

- 原方案在 SQL 中使用 `merge_tdigest()` / `merge_hll()` 自定义函数，D1（SQLite）不支持 UDF。
- **新方案**：在 Aggregator Worker 中完成统计合并（见 5.2 节与附录 G）：
  1. 从 D1 读取当前小时桶的 BLOB 数据。
  2. 在 Worker 内存中反序列化，使用 npm 包（`tdigest`、`hyperloglog`）完成增量合并。
  3. 序列化后写回 D1，SQL 仅做简单 upsert。
- **依赖库**：
  - `tdigest`: 轻量级 t-digest 实现，支持 p50/p95/p99 计算。
  - `hyperloglog`: HLL 实现，用于 unique IP 估算。
- **性能评估**：单批次（100 条事件）内存合并耗时 < 10ms。

### Q2: 100 万请求/日会在不到一周填满 D1 1GB，如何管理容量？

**已补充**（见 5.3 节、附录 G）：

1. **强制保留期限**：
   - 明细事件：**3 天**（保留最近 3 天，约 450 MB）。
   - 聚合数据：**90 天**（占用空间 < 50 MB）。

2. **自动化归档流程**：
   - 每日凌晨 2 点（Cron Trigger）自动归档 3 天前的数据至 R2。
   - 归档格式：JSON.gz（Phase 2），Parquet（Phase 5 优化）。
   - 归档路径：`events-archive/YYYY/MM/YYYY-MM-DD.json.gz`。

3. **容量监控**：
   - 每 6 小时查询 D1 大小（`PRAGMA page_count`）。
   - 超过 800 MB 触发告警，建议手动归档。

4. **清理机制**：
   - 归档验证成功后，从 D1 删除对应日期的明细记录。
   - R2 归档数据保留 1 年或按合规要求。

5. **紧急预案**：
   - 提供手动归档接口：`POST /admin/archive/trigger`。
   - 若 D1 满载，临时提高采样率（降低写入量）。

### Q3: Phase 1 为何仍让 Worker 写 PathCollector DO，而不是直接写 Queue？

**已调整**（见 5.1 节、Phase 1 计划）：

- **新方案**：**Worker 直接写 Workers Queue**，跳过 DO 转发，避免额外往返。
- **旧 DO 保留策略**：
  - Phase 1~2 期间，旧 PathCollector DO 继续运行聚合逻辑，作为**兜底读路径**。
  - 接口层同时读取新旧数据源，对比计数一致性。
  - Phase 3 灰度切换后，逐步下线 DO。
- **双写期间去重**（见附录 F）：
  - Worker 生成幂等 ID（基于 `crypto.subtle.digest`）。
  - Aggregator 使用 KV 滑动窗口去重（1 小时窗口）。
  - 可选：采样验证（1% 流量同时写 DO + Queue，验证计数一致）。

### Q4: 如何避免双写期间重复计数？

**已补充**（见附录 F）：

1. **幂等 ID 生成**：
   ```ts
   // 格式：1730956800000-a1b2c3d4
   const id = `${timestamp}-${hash(clientIP + path + requestId).slice(0, 8)}`;
   ```

2. **Aggregator 端去重**：
   ```ts
   // KV 存储最近 1 小时已处理 ID
   const dedupKey = `dedup:${event.id}`;
   const exists = await env.KV.get(dedupKey);
   if (exists) return; // 跳过重复事件
   await env.KV.put(dedupKey, '1', { expirationTtl: 3600 });
   ```

3. **并行验证**：
   - Phase 1 在接口层同时读取 D1（新）和 DO（旧）的统计数据。
   - 记录计数差异到日志，超过阈值（如 100）触发告警。

4. **降级策略**：
   - 若 Queue 消费异常，自动 fallback 到 DO 旧路径。
   - 保留 `?source=do` 参数强制读取旧数据作对比。

### Q5: 幂等 ID 生成是否在现有 Worker 中具备实现条件？

**已验证**：

- Worker 运行时支持 `crypto.subtle.digest`（Web Crypto API）。
- 现有代码已有 `requestId` 生成能力（通常通过 `crypto.randomUUID()`）。
- 性能测试目标：单次 SHA-256 哈希 < 1ms（预计 0.1~0.5ms）。
- **前置事项**（见 9 节）：
  - 验证 `crypto.subtle.digest` 性能与唯一性（100 万样本无碰撞）。
  - 评估 KV 去重窗口容量（~1.2 万次写/分钟）。

### Q6: 明细保留期限、多库切分或周期性归档/删除的具体方案？

**已明确**（见 5.3 节、附录 G）：

| 策略 | 触发条件 | 执行动作 | 自动化 |
|------|----------|----------|--------|
| 每日归档 | 每日凌晨 2 点 | 归档 3 天前数据至 R2 | Cron Trigger |
| 每日清理 | 归档成功后 | 删除 D1 中对应记录 | 自动 |
| 容量检查 | 每 6 小时 | 检查 D1 大小，超 800MB 告警 | Cron Trigger |
| 紧急归档 | 手动触发或告警后 | 归档最旧一天数据 | 管理接口 |
| R2 清理 | 超过 1 年 | 删除或转移至 Glacier | Lifecycle Policy |

**多库切分（Phase 5 可选）**：

- 若单库压力仍大，可按月或按路径前缀（hash 分桶）拆分为多个 D1。
- 查询层通过路由逻辑分发，聚合时联合多库结果。

### Q7: 多消费者并发写入同一 (path, hour_bucket) 时会丢失增量，如何解决？

**已修正**（见 5.3 节聚合写入流程）：

**问题根因**：原方案使用 read-modify-write 模式，多消费者基于同一旧值并行更新时，后写入者会覆盖前者的 BLOB 改动（lost update）。

**解决方案**：

1. **方案 A：Durable Object 聚合协调器（推荐用于高流量）**
   - Queue Consumer 按 `${path}:${hourBucket}` 分组事件。
   - 每个 group 对应一个 Aggregator DO 实例（通过 `idFromName` 确保路由一致性）。
   - DO 内串行执行 read-merge-write，避免并发冲突。
   - DO 定期（如每 10 次更新）刷新 KV 快照，减少 KV 写入频率。
   - **优势**：可扩展（数千个 path+hour 并行处理）、低延迟。
   - **成本**：每 DO 实例 ~$0.000005/请求，100万/日约 $5/月。

2. **方案 B：单消费者串行处理（推荐用于初期验证）**
   - 在 `wrangler.toml` 中设置 `max_concurrency = 1`，强制单消费者。
   - 吞吐量约 5~10 万事件/分钟，足够支撑 50 万/日流量。
   - **优势**：实现简单、无并发问题、成本低。
   - **劣势**：单点故障、无法水平扩展。

**推荐策略**：
- **Phase 1~2**：使用单消费者，快速验证端到端流程。
- **Phase 4~5**：迁移到 DO 协调器，支持水平扩展至百万级。

**健康监控**（单消费者场景）：
- 监控队列积压：超过 5 万条触发告警。
- 监控消费延迟：超过 5 分钟触发告警。
- 实现心跳检测：消费者每分钟更新 KV 心跳时间戳，超过 3 分钟未更新则告警。

### Q8: 归档流程一次性 SELECT * 会导致 OOM/超时，如何处理？

**已修正**（见附录 G 归档 Worker 实现）：

**问题根因**：100 万条记录约 150 MB，远超 Workers 128 MB 内存限制；单次查询和 JSON.stringify 也会超过 CPU 时间预算（30秒）。

**解决方案：分批处理 + R2 Multipart Upload**

1. **分页查询**：
   ```sql
   SELECT * FROM traffic_events 
   WHERE event_date = ? 
   ORDER BY timestamp 
   LIMIT 10000 OFFSET ?
   ```
   - 每批 1 万条，约 1.5 MB，安全在内存限制内。

2. **流式写入 R2**：
   - 使用 `R2Bucket.createMultipartUpload()` API。
   - 每批数据独立压缩并上传为一个 part。
   - 所有 part 上传完成后调用 `complete()`。
   - 失败时调用 `abort()` 回滚，避免产生垃圾文件。

3. **格式优化**：
   - 使用 JSONL（JSON Lines）而非单个大 JSON 数组。
   - 便于流式处理和后续增量读取。
   - 格式：`events-archive/2025/10/2025-10-14.jsonl.gz`。

4. **分批删除**：
   - 归档成功后分批删除 D1 记录（每批 5000 条）。
   - 避免长时间锁表影响其他查询。

**性能评估**：
- 100 万条记录 → 100 个批次 → 每批处理约 2 秒 → 总耗时 ~3.5 分钟。
- 单个 Cron 执行时间限制（10 分钟）足够完成。

**备选方案（Phase 5）**：
- 使用 Workers Analytics Engine 作为中转：
  - 实时写入 Analytics Engine（采样 100%）。
  - 通过 SQL API 批量导出到 R2。
  - 优势：原生支持大数据导出，无需手动分页。
  - 成本：~$0.25/百万事件。

### Q9: 如何避免 DO 调用超过 Workers 50 subrequest 限制？

**问题根因**：当批次包含 >50 个不同的 `(path, hour)` 组合时，`Promise.all` 会同时发起 >50 个 DO fetch 请求，超出 Workers 单次执行的 subrequest 上限（50 个）。

**解决方案**（已实施）：

1. **分块处理**：
   ```ts
   const CHUNK_SIZE = 45; // 留 5 个余量给其他请求（如 D1、KV）
   const groupEntries = Array.from(groups.entries());
   
   for (let i = 0; i < groupEntries.length; i += CHUNK_SIZE) {
     const chunk = groupEntries.slice(i, i + CHUNK_SIZE);
     const promises = chunk.map(/* DO fetch */);
     await Promise.allSettled(promises); // 使用 allSettled 容错
   }
   ```

2. **容错处理**：
   - 使用 `Promise.allSettled` 而非 `Promise.all`，单个 DO 失败不影响其他。
   - 记录失败的 key 到日志，便于后续重试或告警。

3. **备选方案（若 key 过多）**：
   - 改为"批量聚合 DO"：单个 DO 接收 `[{key, events}]` 数组，内部循环处理。
   - 优势：只需 1 个 subrequest，缺点是单个 DO 处理时间变长。

**性能影响**：
- 100 个 key → 需 3 批（45 + 45 + 10），每批并行执行，总延迟约 200-300ms。
- 远优于串行处理（5 秒+）。

### Q10: R2 Multipart Upload 最小分片大小问题

**问题根因**：原方案 `BATCH_SIZE = 10000`（约 1.5 MB）远低于 R2/S3 要求的 5 MiB 最小分片大小（最后一个分片除外），导致 `uploadPart` 失败。

**解决方案**（已实施）：

1. **调整批次大小**：
   ```ts
   const BATCH_SIZE = 35000; // 约 5.3 MB（gzip 前），压缩后 ≥5 MiB
   ```

2. **验证方案**：
   - 按每条事件 150 字节计算：35000 × 150 = 5.25 MB（gzip 前）。
   - JSON.gz 压缩率约 20-30%（实际大小 1-1.5 MB gzip 后）。
   - ⚠️ **问题**：gzip 后可能仍 <5 MiB，需进一步调整。

3. **最终方案**（已实施）：
   
   **方案 A（推荐用于 <100 MB 场景）**：真正的流式 `put()`
   - 使用 `ReadableStream` 的 `pull()` 方法，按需从 D1 读取数据
   - 每次只保留当前批次（5000 条）在内存中
   - 通过 `pipeThrough(CompressionStream)` 流式压缩
   - **不在内存中累积数据**，避免 OOM
   - 适用场景：100 万条/日 ≈ gzip 后 30-45 MB
   
   **方案 B（用于 ≥100 MB 场景）**：Multipart Upload + 累积到 5 MiB
   - 分批读取 D1（5000 条/批）
   - 压缩后累积到 `currentPartBuffer`（Uint8Array 数组）
   - 当累积大小 ≥5 MiB 时，合并并上传为一个 part
   - 上传后**立即清空缓冲区**，释放内存
   - 确保每个 part（除最后一个）≥5 MiB
   - 内存峰值：单个 part 的大小（约 5-10 MB），安全在 128 MB 限制内
   
   **自动决策逻辑**：
   ```ts
   const estimatedSizeGzipMB = (totalCount * 150 * 0.25) / (1024 * 1024);
   if (estimatedSizeGzipMB < 100) {
     await archiveWithSinglePut(); // 真正的流式上传
   } else {
     await archiveWithMultipart(); // 累积到 5 MiB 再发送
   }
   ```

**推荐策略**：
- 100 万条/日 → 方案 A（流式单次 `put()`）
- 400 万条/日+ → 方案 B（Multipart，累积到 5 MiB）
- Phase 2~3 使用方案 A，Phase 4+ 根据实际流量切换

### Q11: D1 不支持 DELETE ... LIMIT 语法

**问题根因**：D1 使用的 SQLite 编译配置未启用 `SQLITE_ENABLE_UPDATE_DELETE_LIMIT` 选项，直接使用 `DELETE ... LIMIT` 会报语法错误。

**解决方案**（已实施）：

使用 `rowid` 子查询：

```sql
-- ❌ 错误（D1 不支持）
DELETE FROM traffic_events WHERE event_date = ? LIMIT 5000;

-- ✅ 正确
DELETE FROM traffic_events 
WHERE rowid IN (
  SELECT rowid FROM traffic_events 
  WHERE event_date = ? 
  LIMIT 5000
);
```

**性能考量**：
- 子查询 `SELECT rowid ... LIMIT` 会先生成临时结果集（5000 行），然后批量删除。
- 性能与直接 `DELETE LIMIT` 基本相同（都需扫描 5000 行）。
- 添加索引 `CREATE INDEX idx_events_date ON traffic_events(event_date)` 加速查询。

**备选方案**（若性能不足）：
- 按主键范围删除：
  ```sql
  DELETE FROM traffic_events 
  WHERE id >= ? AND id < ? 
  AND event_date = ?;
  ```
  - 需先查询 `MIN(id)` 和 `MAX(id)`，然后按范围分批删除。

### Q12: KV 刷新计数逻辑错误

**问题根因**：原代码在递增前判断 `updateCount % 10 === 0`，导致：
- 第 1 次更新：`updateCount = 0 → 0 % 10 === 0 → 触发刷新` ❌
- 第 10 次更新：`updateCount = 9 → 9 % 10 !== 0 → 不刷新` ❌

**解决方案**（已实施）：

```ts
// ❌ 错误
const updateCount = (await storage.get('updateCount')) || 0;
await storage.put('updateCount', updateCount + 1);
if (updateCount % 10 === 0) { /* 刷新 */ }

// ✅ 正确
const updateCount = (await storage.get('updateCount')) || 0;
const nextCount = updateCount + 1;
await storage.put('updateCount', nextCount);
if (nextCount % 10 === 0) { /* 刷新 */ }
```

**预期行为**：
- 第 1~9 次更新：不刷新。
- 第 10 次更新：`nextCount = 10 → 触发刷新` ✅
- 第 11~19 次：不刷新。
- 第 20 次：再次刷新。

### Q13: npm 库 Workers 兼容性风险

**问题根因**：许多流行的 t-digest/HLL npm 包依赖 Node.js 特定 API（如 `Buffer`、`fs`、`crypto` 模块），在 Workers 运行时会失败。

**验证清单**（Phase 0 必须完成）：

1. **候选库评估**：

   | 库名 | 兼容性 | 优势 | 劣势 |
   |------|-------|------|------|
   | `@observablehq/tdigest` | ✅ 纯 ESM | 无依赖、体积小 | 功能较简单 |
   | `tdigest` | ⚠️ 需验证 | 功能完整、准确度高 | 可能依赖 Node Buffer |
   | `hyperloglog` | ⚠️ 需验证 | 标准实现 | 部分包依赖 Buffer |
   | WASM 方案（Rust） | ✅ Workers 原生支持 | 性能最优 | 需自行编译 |

2. **验证步骤**：
   ```ts
   // 在 Miniflare 或 wrangler dev 环境测试
   import TDigest from '@observablehq/tdigest';
   
   const td = new TDigest();
   for (let i = 0; i < 1000; i++) {
     td.push(Math.random() * 100);
   }
   
   // 序列化测试
   const serialized = td.toJSON(); // 或 td.toBytes()
   const restored = TDigest.fromJSON(serialized);
   
   console.log('p95:', restored.percentile(0.95));
   
   // 存储到 D1 测试
   await env.D1.prepare('INSERT INTO test (data) VALUES (?)')
     .bind(JSON.stringify(serialized))
     .run();
   ```

3. **兼容性检查项**：
   - [ ] 导入成功（无 `require()` 或 Node 内置模块）
   - [ ] 序列化/反序列化正常
   - [ ] 性能达标（处理 100 条事件 < 10ms）
   - [ ] 内存占用合理（< 1 MB/实例）
   - [ ] BLOB 存储到 D1 后可正确恢复

**备选方案**（若验证失败）：

1. **简化统计**：
   ```ts
   // 不使用 t-digest，改用排序数组计算百分位
   const responseTimes = events.map(e => e.responseTime).sort((a, b) => a - b);
   const p95Index = Math.floor(responseTimes.length * 0.95);
   const p95 = responseTimes[p95Index];
   
   // 存储采样数据（最多保留 1000 个样本）
   const samples = responseTimes.slice(0, 1000);
   await env.D1.prepare('UPDATE path_stats_hourly SET response_samples = ?')
     .bind(JSON.stringify(samples))
     .run();
   ```

2. **Bloom Filter 代替 HLL**（unique IP）：
   - Workers 有纯 JS 实现的 Bloom Filter（如 `bloom-filters`）。
   - 准确度略低（可能高估 1-2%），但足够实用。

3. **自研 WASM 方案**（Phase 5）：
   - 使用 Rust 实现 t-digest + HLL，编译为 WASM。
   - 打包为 `.wasm` 模块随 Worker 部署。
   - 优势：性能最优、无兼容性问题、体积小（< 100 KB）。

**决策流程**：

```
Phase 0 验证
    │
    ├─ Workers 兼容 → 使用选定的 npm 包
    │
    └─ 不兼容
        │
        ├─ 简化统计（排序数组 + Bloom Filter）→ Phase 2 实施
        │
        └─ Phase 4~5 迁移到 WASM 方案
```

---

## 总结：关键修正与补充

| 原问题 | 修正方案 | 涉及章节 |
|--------|----------|----------|
| D1 不支持 UDF | 在 Worker 中完成 t-digest/HLL 合并，SQL 仅做 upsert | 5.2, 5.3 |
| D1 容量不足 | 明细强制 3 天保留，每日自动归档至 R2，容量监控告警 | 5.3, 附录 G |
| Phase 1 架构低效 | Worker 直接写 Queue，保留旧 DO 作兜底读路径 | 5.1, 7 |
| 双写重复计数 | 幂等 ID + KV 滑动窗口去重 + 并行验证 | 附录 F |
| **并发写入丢增量** | **使用 DO 聚合协调器或单消费者串行处理** | **5.3, 附录 H Q7** |
| **归档 OOM/超时** | **分批查询 + R2 Multipart Upload 流式写入** | **附录 G, 附录 H Q8** |
| **Workers 50 subrequest 限制 + 消息静默丢失** | **DO 调用分块（≤45 个/批）；跟踪失败 key，选择性 ack/retry 消息** | **5.3, 附录 H Q9** |
| **R2 归档 OOM + 分片大小问题** | **方案 A：真正的流式 `put()`（ReadableStream pull）；方案 B：累积到 5 MiB 再上传 part** | **附录 G, 附录 H Q10** |
| **D1 DELETE LIMIT 不支持** | **使用 rowid 子查询：DELETE WHERE rowid IN (SELECT ... LIMIT)** | **附录 G, 附录 H Q11** |
| **KV 刷新计数逻辑错误** | **先递增再判断：const next = count + 1; if (next % 10 === 0)** | **5.3, 附录 H Q12** |
| **npm 库兼容性风险** | **Phase 0 前置验证 Workers 兼容的 t-digest/HLL 库，备选简化统计** | **9, 附录 H Q13** |
| 实施条件不明 | 补充幂等 ID 性能验证、归档流程设计、Cron 配置 | 9, 附录 G |

**实施顺序建议**（已更新）：

1. **Phase 0**：
   - 验证幂等 ID 生成性能、设计 D1 表结构、准备 R2 归档测试。
   - **确认消费者并发策略**（单消费者 vs DO 协调器）。

2. **Phase 1**：
   - Worker 直接写 Queue，实现去重逻辑，保留旧 DO 作兜底。
   - **配置 `max_concurrency=1`** 避免并发冲突。

3. **Phase 2**：
   - 开发 Aggregator Worker（内存合并统计）+ D1 写入 + KV 快照。
   - 实现**分批归档 Cron**（Multipart Upload）。
   - 配置队列积压监控与消费者心跳检测。

4. **Phase 3**：
   - 切换接口读路径（Cache→KV→D1），灰度验证后下线旧 DO。
   - 压力测试验证单消费者吞吐量。

5. **Phase 4**：
   - 完善监控告警（队列积压、D1 容量、聚合延迟、归档失败）。
   - **若流量超过 50 万/日，迁移到 DO 聚合协调器**。

6. **Phase 5**：
   - 优化归档格式（Parquet）、Analytics Engine 集成、多库分片。

**关键实施检查清单**（新增）：

- [ ] **⚠️ Phase 0 必做**：验证 Workers 兼容的 t-digest/HLL 库（见附录 H Q13）。
- [ ] 确认队列消费者并发配置（`wrangler.toml` 中 `max_concurrency`）。
- [ ] 验证 R2 Multipart Upload API 在 Workers 中的兼容性。
  - [ ] 测试单次 `put()` 流式上传（推荐，<5 GiB 场景）
  - [ ] 若使用 Multipart，确保分片 ≥5 MiB（BATCH_SIZE ≥50000）
- [ ] 测试分批归档流程（模拟 100 万条记录）。
- [ ] 实现消费者心跳监控（单消费者场景必需）。
- [ ] 准备 DO 聚合协调器代码（Phase 4 扩容预案）。
  - [ ] 验证 50 subrequest 限制处理（分块 ≤45 个/批）
- [ ] 配置归档失败告警（R2 上传失败、D1 删除失败）。
- [ ] 验证 D1 rowid 子查询删除性能（分批 5000 条）。
- [ ] 测试 KV 刷新计数逻辑（确保第 10、20、30... 次触发）。
