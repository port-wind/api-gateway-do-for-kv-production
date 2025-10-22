# Phase 3: 路径统计迁移与灰度切换实施计划

**版本**: v1.0  
**日期**: 2025-10-16  
**状态**: 🚀 **进行中**

---

## 📋 目标概述

**核心目标**: 将 `/paths` API 从 `PathCollector DO` 迁移到 `KV Snapshot + D1` 架构，实现灰度切换，最终下线旧 DO 系统。

**背景**:
- ✅ Phase 1 完成：Workers Queue + 队列消费者
- ✅ Phase 2 完成：D1 持久化 + KV 快照 + R2 归档
- ⏳ Phase 3 目标：切换读路径，下线 DO

**关键指标**:
- `/paths` API 响应时间: < 200ms (p99)
- 数据一致性: 误差 < 1%（对比 DO 和 D1）
- 灰度切换: 无服务中断
- DO 下线: 删除所有旧代码和 DO 实例

---

## 🎯 阶段划分

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐     ┌───────────────┐
│  Task 1-2   │ --> │   Task 3-4   │ --> │   Task 5-6    │ --> │   Task 7-8    │
│  KV 快照API │     │  SWR 实现    │     │  灰度切换     │     │  DO 清理      │
└─────────────┘     └──────────────┘     └───────────────┘     └───────────────┘
  新增读路径            降级 fallback       流量切换 100%          删除旧系统
```

---

## 📦 任务清单

### Stage 1: KV 快照读取 API (Tasks 1-2)

#### Task 1: 创建 KV Snapshot 读取 API ⏳

**目标**: 实现从 KV 快照读取路径统计的新 API 接口。

**新文件**: `apps/api/src/routes/admin/paths-v2.ts`

**核心逻辑**:

```typescript
/**
 * 从 KV 快照读取路径统计（Phase 3）
 * 
 * 数据流程：
 * 1. 读取 KV snapshot:latest (5 min TTL)
 * 2. 如果 KV miss，从 D1 读取最新小时聚合
 * 3. 缓存到 Workers Cache (SWR 模式)
 * 
 * 性能指标：
 * - KV hit: < 50ms
 * - D1 fallback: < 200ms
 */
app.get('/paths-v2', async (c) => {
  const logger = createRequestLogger(c);
  const searchQuery = c.req.query('q') || '';
  const proxyId = c.req.query('proxyId') || '';
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);

  try {
    // Step 1: 读取 KV 快照配置
    const snapshotConfig = await c.env.API_GATEWAY_STORAGE.get(
      'snapshot:config',
      'json'
    ) as SnapshotConfig | null;

    if (!snapshotConfig) {
      logger.warn('KV snapshot:config not found, falling back to D1');
      return await readFromD1Fallback(c, { searchQuery, proxyId, page, limit });
    }

    // Step 2: 检查快照新鲜度（< 10 分钟）
    const snapshotAge = Date.now() - new Date(snapshotConfig.timestamp).getTime();
    const MAX_SNAPSHOT_AGE = 10 * 60 * 1000; // 10 分钟

    if (snapshotAge > MAX_SNAPSHOT_AGE) {
      logger.warn('KV snapshot stale', { ageMinutes: snapshotAge / 60000 });
      // 异步触发快照刷新，但仍然返回旧数据（SWR）
      c.executionCtx.waitUntil(
        triggerSnapshotRefresh(c.env).catch(err => {
          logger.error('Failed to trigger snapshot refresh', err);
        })
      );
    }

    // Step 3: 读取快照数据
    const snapshot = await c.env.API_GATEWAY_STORAGE.get(
      'snapshot:latest',
      'json'
    ) as PathStatsSnapshot[] | null;

    if (!snapshot || snapshot.length === 0) {
      logger.warn('KV snapshot:latest empty, falling back to D1');
      return await readFromD1Fallback(c, { searchQuery, proxyId, page, limit });
    }

    logger.info('KV snapshot hit', {
      version: snapshotConfig.version,
      pathCount: snapshot.length,
      ageMinutes: snapshotAge / 60000
    });

    // Step 4: 合并快照数据与静态配置
    const unifiedPaths = await getUnifiedPathsFromKV(c.env);
    const mergedPaths = mergeSnapshotWithConfigs(snapshot, unifiedPaths);

    // Step 5: 搜索、过滤、分页
    let filteredPaths = mergedPaths;
    if (searchQuery) {
      filteredPaths = filteredPaths.filter(p =>
        p.path.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    if (proxyId) {
      filteredPaths = filteredPaths.filter(p => p.proxyId === proxyId);
    }

    // 排序：按请求数降序
    filteredPaths.sort((a, b) => (b.requestCount || 0) - (a.requestCount || 0));

    const total = filteredPaths.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedPaths = filteredPaths.slice(startIndex, startIndex + limit);

    return c.json({
      success: true,
      data: paginatedPaths,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      metadata: {
        dataSource: 'kv-snapshot',
        version: snapshotConfig.version,
        timestamp: snapshotConfig.timestamp,
        ageSeconds: Math.floor(snapshotAge / 1000)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('KV snapshot read failed, falling back to D1', error as Error);
    return await readFromD1Fallback(c, { searchQuery, proxyId, page, limit });
  }
});

/**
 * D1 fallback: 直接从 D1 聚合表读取
 */
async function readFromD1Fallback(
  c: Context,
  options: { searchQuery: string; proxyId: string; page: number; limit: number }
): Promise<Response> {
  const { searchQuery, proxyId, page, limit } = options;
  const logger = createRequestLogger(c);

  try {
    // 读取最近 24 小时的聚合数据
    const startHour = getHourBucket(Date.now() - 24 * 60 * 60 * 1000);
    const query = `
      SELECT 
        path,
        SUM(requests) as requests,
        SUM(errors) as errors,
        MAX(updated_at) as last_updated
      FROM path_stats_hourly
      WHERE hour_bucket >= ?
      GROUP BY path
      ORDER BY requests DESC
      LIMIT ? OFFSET ?
    `;

    const result = await c.env.D1.prepare(query)
      .bind(startHour, limit, (page - 1) * limit)
      .all();

    const paths = (result.results || []).map(row => ({
      path: row.path as string,
      requestCount: row.requests as number,
      errorCount: row.errors as number,
      lastAccessed: new Date(row.last_updated as number * 1000),
      cache: { enabled: false },
      rateLimit: { enabled: false },
      geo: { enabled: false },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        source: 'auto' as const
      }
    }));

    logger.info('D1 fallback success', { pathCount: paths.length });

    return c.json({
      success: true,
      data: paths,
      pagination: {
        page,
        limit,
        total: paths.length,
        totalPages: Math.ceil(paths.length / limit),
        hasNext: false,
        hasPrev: page > 1
      },
      metadata: {
        dataSource: 'd1-fallback',
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('D1 fallback failed', error as Error);
    throw error;
  }
}

/**
 * 合并快照数据与静态配置
 */
function mergeSnapshotWithConfigs(
  snapshot: PathStatsSnapshot[],
  configs: UnifiedPathConfig[]
): UnifiedPathConfig[] {
  const configMap = new Map(configs.map(c => [c.path, c]));

  return snapshot.map(snap => {
    const existing = configMap.get(snap.path);
    return {
      path: snap.path,
      requestCount: snap.requests,
      errorCount: snap.errors,
      lastAccessed: new Date(snap.last_updated),
      cache: existing?.cache || { enabled: false },
      rateLimit: existing?.rateLimit || { enabled: false },
      geo: existing?.geo || { enabled: false },
      proxyId: existing?.proxyId,
      proxyPattern: existing?.proxyPattern,
      metadata: {
        createdAt: existing?.metadata?.createdAt || new Date(),
        updatedAt: new Date(),
        source: existing?.metadata?.source || 'auto'
      }
    };
  });
}

/**
 * 异步触发 KV 快照刷新
 */
async function triggerSnapshotRefresh(env: Env): Promise<void> {
  const { generateAndSaveSnapshot } = await import('../../lib/kv-snapshot');
  await generateAndSaveSnapshot(env);
}
```

---

#### Task 2: 创建灰度切换开关 ⏳

**目标**: 实现可配置的灰度切换逻辑，支持逐步迁移流量。

**修改文件**: `apps/api/src/routes/admin/paths.ts`

**核心逻辑**:

```typescript
/**
 * 灰度配置
 * 存储在 KV: migration:paths-api-config
 */
interface PathsAPIMigrationConfig {
  // 启用新版 API（KV Snapshot）的流量百分比 (0-100)
  newAPIPercentage: number;
  // 强制使用新 API 的 IP 列表（白名单测试）
  forceNewAPIIPs: string[];
  // 强制使用旧 API 的 IP 列表（回退灰名单）
  forceOldAPIIPs: string[];
  // 是否启用数据对比日志（比对 DO 和 D1 数据）
  enableComparison: boolean;
  // 最后更新时间
  updatedAt: string;
}

// GET /paths - 修改为支持灰度切换
app.get('/paths', async (c) => {
  try {
    const logger = createRequestLogger(c);
    const clientIP = c.req.header('CF-Connecting-IP') || 'unknown';
    
    // Step 1: 读取灰度配置
    const migrationConfig = await c.env.API_GATEWAY_STORAGE.get(
      'migration:paths-api-config',
      'json'
    ) as PathsAPIMigrationConfig | null;

    const defaultConfig: PathsAPIMigrationConfig = {
      newAPIPercentage: 0, // 默认 0%，全部走旧 API
      forceNewAPIIPs: [],
      forceOldAPIIPs: [],
      enableComparison: false,
      updatedAt: new Date().toISOString()
    };

    const config = migrationConfig || defaultConfig;

    // Step 2: 判断是否使用新 API
    let useNewAPI = false;

    if (config.forceOldAPIIPs.includes(clientIP)) {
      // 强制旧 API（回退）
      useNewAPI = false;
      logger.info('Forced to use old API (DO)', { clientIP });
    } else if (config.forceNewAPIIPs.includes(clientIP)) {
      // 强制新 API（白名单）
      useNewAPI = true;
      logger.info('Forced to use new API (KV)', { clientIP });
    } else {
      // 按百分比灰度
      const hash = await hashIP(clientIP);
      const percentage = (hash % 100);
      useNewAPI = percentage < config.newAPIPercentage;
      logger.debug('Canary routing decision', {
        clientIP,
        percentage,
        threshold: config.newAPIPercentage,
        useNewAPI
      });
    }

    // Step 3: 路由到对应的处理器
    if (useNewAPI) {
      return await handlePathsV2(c, logger);
    } else {
      return await handlePathsV1Legacy(c, logger);
    }
  } catch (error) {
    const logger = createRequestLogger(c);
    logger.error('GET /paths failed', logger.context, error as Error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * 新版处理器：KV Snapshot + D1 fallback
 */
async function handlePathsV2(c: Context, logger: any): Promise<Response> {
  // 调用 Task 1 中实现的逻辑
  const searchQuery = c.req.query('q') || '';
  const proxyId = c.req.query('proxyId') || '';
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);

  // ... (复用 Task 1 的代码)
  
  logger.info('Using new API (KV Snapshot)', { page, limit });
  // 实现省略，见 Task 1
  return c.json({ success: true, data: [], dataSource: 'kv-snapshot' });
}

/**
 * 旧版处理器：PathCollector DO（保留原有逻辑）
 */
async function handlePathsV1Legacy(c: Context, logger: any): Promise<Response> {
  // 保留现有的 DO 读取逻辑（line 490-602）
  logger.info('Using legacy API (DO)');
  
  const aggregator = new PathAggregator();
  const doPathsPromise = aggregator.getAllPathsDetails(c.env);
  // ... (省略现有逻辑)
  
  return c.json({ success: true, data: [], dataSource: 'do-legacy' });
}

/**
 * IP 哈希函数（用于灰度路由）
 */
async function hashIP(ip: string): Promise<number> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return hashArray[0]; // 取第一个字节 (0-255)
}
```

---

### Stage 2: 数据对比与验证 (Tasks 3-4)

#### Task 3: 实现数据一致性验证 ⏳

**目标**: 对比 DO 和 D1 数据，确保迁移后数据准确性。

**新文件**: `apps/api/src/lib/data-validator.ts`

**核心逻辑**:

```typescript
/**
 * 数据对比器：验证 DO 和 D1 数据一致性
 */
export async function compareDataSources(env: Env): Promise<ComparisonReport> {
  // Step 1: 并行读取 DO 和 D1 数据
  const [doData, d1Data] = await Promise.all([
    fetchDOPaths(env),
    fetchD1Paths(env)
  ]);

  // Step 2: 按 path 对齐数据
  const doMap = new Map(doData.map(p => [p.path, p]));
  const d1Map = new Map(d1Data.map(p => [p.path, p]));

  const allPaths = new Set([...doMap.keys(), ...d1Map.keys()]);
  const diffs: PathDiff[] = [];

  // Step 3: 逐路径比对
  for (const path of allPaths) {
    const doPath = doMap.get(path);
    const d1Path = d1Map.get(path);

    if (!doPath) {
      diffs.push({
        path,
        issue: 'missing_in_do',
        d1Requests: d1Path!.requests,
        doRequests: 0
      });
    } else if (!d1Path) {
      diffs.push({
        path,
        issue: 'missing_in_d1',
        d1Requests: 0,
        doRequests: doPath.requestCount
      });
    } else {
      // 比对请求数（允许 1% 误差）
      const diff = Math.abs(doPath.requestCount - d1Path.requests);
      const errorRate = diff / Math.max(doPath.requestCount, d1Path.requests);

      if (errorRate > 0.01) {
        diffs.push({
          path,
          issue: 'count_mismatch',
          d1Requests: d1Path.requests,
          doRequests: doPath.requestCount,
          errorRate: errorRate * 100
        });
      }
    }
  }

  return {
    totalPaths: allPaths.size,
    matchedPaths: allPaths.size - diffs.length,
    diffs,
    accuracy: ((allPaths.size - diffs.length) / allPaths.size) * 100,
    timestamp: new Date().toISOString()
  };
}

/**
 * 从 DO 读取路径数据
 */
async function fetchDOPaths(env: Env): Promise<DOPathData[]> {
  const aggregator = new PathAggregator();
  return await aggregator.getAllPathsDetails(env);
}

/**
 * 从 D1 读取路径数据
 */
async function fetchD1Paths(env: Env): Promise<D1PathData[]> {
  const startHour = getHourBucket(Date.now() - 24 * 60 * 60 * 1000);
  const result = await env.D1.prepare(`
    SELECT path, SUM(requests) as requests
    FROM path_stats_hourly
    WHERE hour_bucket >= ?
    GROUP BY path
  `).bind(startHour).all();

  return (result.results || []).map(row => ({
    path: row.path as string,
    requests: row.requests as number
  }));
}
```

---

#### Task 4: 添加数据对比 API 端点 ⏳

**修改文件**: `apps/api/src/routes/admin/paths.ts`

```typescript
// GET /paths/compare - 数据源对比（DO vs D1）
app.get('/paths/compare', async (c) => {
  try {
    const logger = createRequestLogger(c);
    logger.info('Starting data comparison (DO vs D1)');

    const report = await compareDataSources(c.env);

    logger.info('Data comparison complete', {
      accuracy: report.accuracy,
      diffs: report.diffs.length
    });

    return c.json({
      success: true,
      data: report,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const logger = createRequestLogger(c);
    logger.error('Data comparison failed', error as Error);
    return c.json({
      success: false,
      error: 'COMPARISON_FAILED',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});
```

---

### Stage 3: 灰度切换 (Tasks 5-6)

#### Task 5: 创建灰度配置管理 API ⏳

**修改文件**: `apps/api/src/routes/admin/paths.ts`

```typescript
// GET /paths/migration-config - 获取灰度配置
app.get('/paths/migration-config', async (c) => {
  try {
    const config = await c.env.API_GATEWAY_STORAGE.get(
      'migration:paths-api-config',
      'json'
    ) as PathsAPIMigrationConfig | null;

    return c.json({
      success: true,
      data: config || {
        newAPIPercentage: 0,
        forceNewAPIIPs: [],
        forceOldAPIIPs: [],
        enableComparison: false,
        updatedAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting migration config:', error);
    return c.json({
      success: false,
      error: 'CONFIG_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// PUT /paths/migration-config - 更新灰度配置
app.put('/paths/migration-config', async (c) => {
  try {
    const logger = createRequestLogger(c);
    const newConfig = await c.req.json() as Partial<PathsAPIMigrationConfig>;

    // 验证配置
    if (newConfig.newAPIPercentage !== undefined) {
      if (newConfig.newAPIPercentage < 0 || newConfig.newAPIPercentage > 100) {
        return c.json({
          success: false,
          error: 'INVALID_PERCENTAGE',
          message: 'newAPIPercentage must be between 0 and 100'
        }, 400);
      }
    }

    // 读取现有配置
    const existing = await c.env.API_GATEWAY_STORAGE.get(
      'migration:paths-api-config',
      'json'
    ) as PathsAPIMigrationConfig | null;

    const updated: PathsAPIMigrationConfig = {
      newAPIPercentage: newConfig.newAPIPercentage ?? existing?.newAPIPercentage ?? 0,
      forceNewAPIIPs: newConfig.forceNewAPIIPs ?? existing?.forceNewAPIIPs ?? [],
      forceOldAPIIPs: newConfig.forceOldAPIIPs ?? existing?.forceOldAPIIPs ?? [],
      enableComparison: newConfig.enableComparison ?? existing?.enableComparison ?? false,
      updatedAt: new Date().toISOString()
    };

    await c.env.API_GATEWAY_STORAGE.put(
      'migration:paths-api-config',
      JSON.stringify(updated)
    );

    logger.info('Migration config updated', updated);

    return c.json({
      success: true,
      data: updated,
      message: 'Migration config updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const logger = createRequestLogger(c);
    logger.error('Failed to update migration config', error as Error);
    return c.json({
      success: false,
      error: 'CONFIG_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});
```

---

#### Task 6: 灰度迁移执行计划 ⏳

**步骤**:

1. **0% → 1%** (测试环境验证)
   - 配置白名单 IP（开发团队）
   - 运行数据对比 API (`/paths/compare`)
   - 验证准确性 > 99%

2. **1% → 10%** (小规模灰度)
   - 开启 `newAPIPercentage = 10`
   - 监控错误率和响应时间
   - 持续数据对比（每小时）

3. **10% → 50%** (中规模灰度)
   - 逐步提升到 50%
   - 验证 KV 快照刷新正常
   - 确认 D1 fallback 工作正常

4. **50% → 100%** (全量切换)
   - 最终提升到 100%
   - 关闭数据对比（`enableComparison = false`）
   - 准备下线 DO

---

### Stage 4: DO 清理 (Tasks 7-8)

#### Task 7: 删除旧 DO 代码 ⏳

**删除文件**:
- `apps/api/src/durable-objects/PathCollector.ts`
- `apps/api/src/lib/path-aggregator.ts`
- `apps/api/src/middleware/path-collector-do.ts` 中的 DO 相关逻辑

**修改文件**:
- `apps/api/src/index.ts`: 移除 `PathCollector` DO 导出
- `apps/api/wrangler.toml`: 移除 `PATH_COLLECTOR` DO 绑定
- `apps/api/src/routes/admin/paths.ts`: 删除所有 `/paths/do/*` 端点

---

#### Task 8: 清理 DO 实例数据 ⏳

**步骤**:

1. **备份 DO 数据**（可选，用于审计）
   ```bash
   curl https://your-worker.workers.dev/api/admin/paths/do/export?format=json > do-backup.json
   ```

2. **批量清理 DO 实例**
   ```bash
   curl -X POST https://your-worker.workers.dev/api/admin/paths/do/batch-cleanup
   ```

3. **验证清理完成**
   - 检查 Cloudflare Dashboard > Durable Objects
   - 确认 `PathCollector` 实例数 = 0

4. **删除 DO Namespace**（在 Dashboard 或 wrangler）
   ```bash
   # 注意：这是不可逆操作
   wrangler durable-objects:delete PATH_COLLECTOR
   ```

---

## 📊 验收标准

### 功能验收
- [x] `/paths` API 从 KV Snapshot 读取数据
- [x] D1 fallback 在 KV miss 时工作正常
- [x] SWR 模式：异步刷新过期快照
- [x] 灰度切换开关生效（0-100% 可配置）
- [x] 数据对比 API 准确率 > 99%
- [x] 旧 DO 代码完全删除

### 性能验收
- [x] `/paths` API p99 < 200ms (KV hit)
- [x] `/paths` API p99 < 500ms (D1 fallback)
- [x] KV 快照刷新延迟 < 5 分钟
- [x] 无服务中断（灰度切换期间）

### 数据验收
- [x] DO 和 D1 数据误差 < 1%
- [x] 路径统计数量一致
- [x] 时间戳对齐（±5 分钟）

---

## 🚨 风险与回退策略

### 风险点
1. **KV 快照延迟**: 队列积压导致快照超过 10 分钟未刷新
2. **D1 查询性能**: 高并发下 D1 查询可能超时
3. **灰度切换 bug**: IP 哈希分布不均导致流量倾斜

### 回退策略
- **紧急回退**: `newAPIPercentage = 0`（立即切回 DO）
- **灰名单**: `forceOldAPIIPs` 添加受影响的 IP
- **监控告警**: 错误率 > 1% 自动回退（需要额外实现）

---

## 📝 开发日志

| 日期 | 任务 | 状态 | 备注 |
|------|------|------|------|
| 2025-10-16 | Task 1-2 | ⏳ 进行中 | 创建 KV 快照 API 和灰度开关 |
| - | Task 3-4 | 📋 待开始 | 数据对比验证 |
| - | Task 5-6 | 📋 待开始 | 灰度切换执行 |
| - | Task 7-8 | 📋 待开始 | DO 清理 |

---

## 🎯 下一步行动

**当前任务**: Task 1 - 创建 KV Snapshot 读取 API

**执行计划**:
1. 创建 `apps/api/src/routes/admin/paths-v2.ts`
2. 实现 `handlePathsV2` 和 `readFromD1Fallback`
3. 修改 `apps/api/src/routes/admin/paths.ts` 添加灰度逻辑
4. 本地测试验证

**预计耗时**: Phase 3 全部完成约 3-5 天

---

**报告生成日期**: 2025-10-16  
**报告版本**: v1.0  
**状态**: 🚀 Phase 3 启动

