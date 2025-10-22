# 清理工具修复总结

## 修复的问题

### 问题 1: 导入路径错误 ✅

**位置**: `apps/api/src/lib/cleanup-invalid-paths.ts:12`

**问题**:
```typescript
import type { Env } from '../src/types/env'; // ❌ 错误
```

**修复**:
```typescript
import type { Env } from '../types/env'; // ✅ 正确
```

**原因**: 文件位于 `apps/api/src/lib/` 目录，相对路径应该是 `../types/env`，而不是 `../src/types/env`。

**影响**: 修复前会导致编译错误 "Cannot find module '../src/types/env'"

---

### 问题 2: 表名错误 ✅

**位置**: `apps/api/src/lib/cleanup-invalid-paths.ts:95`

**问题**:
```sql
SELECT DISTINCT path FROM traffic_events_hourly  -- ❌ 表不存在
```

**修复**:
```sql
-- 正确的表名
SELECT DISTINCT path FROM path_stats_hourly      -- ✅ 聚合数据
SELECT DISTINCT path FROM traffic_events         -- ✅ 详细事件
```

**原因**: 
- 实际的 D1 schema 中**不存在** `traffic_events_hourly` 表
- 正确的表是 `path_stats_hourly`（小时级聚合）和 `traffic_events`（详细事件）

**影响**: 修复前会抛出 "no such table: traffic_events_hourly" 错误，导致清理失败

---

### 问题 3: 旧文件残留 ✅

**位置**: `apps/api/scripts/cleanup-invalid-paths.ts`

**问题**: 文件被复制而不是移动，导致存在两个版本（scripts 和 lib 目录各一个）

**修复**: 删除 `apps/api/scripts/cleanup-invalid-paths.ts`，只保留 `apps/api/src/lib/cleanup-invalid-paths.ts`

---

## 实际的 D1 表结构

根据 `apps/api/migrations/0001_create_path_stats_tables.sql`：

### `traffic_events` (详细事件表)
```sql
CREATE TABLE IF NOT EXISTS traffic_events (
  id TEXT PRIMARY KEY,           -- 幂等 ID
  path TEXT NOT NULL,
  method TEXT,
  timestamp INTEGER NOT NULL,
  ip_hash TEXT,
  status_code INTEGER,
  latency_ms INTEGER,
  error_message TEXT,
  -- ...
);
```

**用途**: 存储原始请求事件，带幂等 ID，保留 3 天

### `path_stats_hourly` (聚合统计表)
```sql
CREATE TABLE IF NOT EXISTS path_stats_hourly (
  path TEXT NOT NULL,
  hour_bucket TEXT NOT NULL,     -- '2025-10-15T14'
  requests INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  unique_ips INTEGER NOT NULL DEFAULT 0,
  latency_p50 INTEGER,
  latency_p95 INTEGER,
  latency_p99 INTEGER,
  -- ...
  PRIMARY KEY (path, hour_bucket)
);
```

**用途**: 小时级聚合统计，用于生成 KV snapshot 和快速查询

---

## 清理逻辑更新

### 修复前（错误）

```typescript
// ❌ 只查询一个不存在的表
const pathsQuery = `
  SELECT DISTINCT path 
  FROM traffic_events_hourly 
  ORDER BY path
`;
```

### 修复后（正确）

```typescript
// ✅ 查询两个实际存在的表并合并
const pathsFromHourly = await env.D1.prepare(`
  SELECT DISTINCT path FROM path_stats_hourly
`).all();

const pathsFromEvents = await env.D1.prepare(`
  SELECT DISTINCT path FROM traffic_events
`).all();

// 合并并去重
const allPathsSet = new Set<string>();
for (const row of pathsFromHourly.results || []) {
  allPathsSet.add(row.path as string);
}
for (const row of pathsFromEvents.results || []) {
  allPathsSet.add(row.path as string);
}
```

**优势**:
1. 覆盖所有路径数据（聚合 + 详细事件）
2. 自动去重
3. 提供详细的统计信息

---

## 删除逻辑更新

### 修复前（错误）

```typescript
// ❌ 删除不存在的表
DELETE FROM traffic_events_hourly WHERE path IN (...)
```

### 修复后（正确）

```typescript
// ✅ 同时删除两个表的数据
// 删除聚合数据
DELETE FROM path_stats_hourly WHERE path IN (...)

// 删除详细事件
DELETE FROM traffic_events WHERE path IN (...)
```

**优势**:
1. 彻底清理所有无效路径数据
2. 避免数据不一致
3. 释放更多存储空间

---

## 开放性问题的答案

### Q: Should the cleanup cover both path_stats_hourly and traffic_events?

**A: Yes**. 清理工具现在会同时清理这两个表，原因：

1. **数据一致性**: 两个表都存储了路径信息，只清理一个会导致数据不一致
2. **完整清理**: 聚合数据 (`path_stats_hourly`) 和详细事件 (`traffic_events`) 都需要清理
3. **存储优化**: 删除两个表的数据可以释放更多空间
4. **快照准确性**: KV snapshot 是从 `path_stats_hourly` 生成的，清理后重新生成的快照才准确

---

## 测试验证

### 测试 1: 验证表结构

```bash
# 连接到 D1 数据库
npx wrangler d1 execute path-stats-db --local --env dev --command="SELECT name FROM sqlite_master WHERE type='table'"

# 预期输出：
# traffic_events
# path_stats_hourly
# archive_metadata
# consumer_heartbeat
```

### 测试 2: 验证清理逻辑

```bash
# 查看清理前的路径数
npx wrangler d1 execute path-stats-db --local --env dev --command="SELECT COUNT(DISTINCT path) FROM path_stats_hourly"
npx wrangler d1 execute path-stats-db --local --env dev --command="SELECT COUNT(DISTINCT path) FROM traffic_events"

# 执行清理
curl -X POST http://localhost:8787/api/admin/paths/cleanup/invalid | jq .

# 查看清理后的路径数（应该减少）
npx wrangler d1 execute path-stats-db --local --env dev --command="SELECT COUNT(DISTINCT path) FROM path_stats_hourly"
npx wrangler d1 execute path-stats-db --local --env dev --command="SELECT COUNT(DISTINCT path) FROM traffic_events"
```

### 测试 3: 验证只删除无效路径

```bash
# 查看剩余路径（应该只有 /kv/* 模式的路径）
npx wrangler d1 execute path-stats-db --local --env dev --command="SELECT DISTINCT path FROM path_stats_hourly ORDER BY path"
```

---

## 文件变更清单

### 修改的文件

1. ✏️ `apps/api/src/lib/cleanup-invalid-paths.ts`
   - 修复导入路径: `../src/types/env` → `../types/env`
   - 修复表名: `traffic_events_hourly` → `path_stats_hourly` + `traffic_events`
   - 优化清理逻辑：同时查询和删除两个表

2. ✏️ `apps/api/docs/CLEANUP_INVALID_PATHS.md`
   - 添加表结构说明
   - 更新清理范围描述
   - 修正表名引用

### 删除的文件

3. ❌ `apps/api/scripts/cleanup-invalid-paths.ts`
   - 删除重复文件，只保留 lib 版本

---

## 验证清单

- [x] 导入路径正确
- [x] 表名正确（`path_stats_hourly` 和 `traffic_events`）
- [x] 类型检查通过（`npx tsc --noEmit`）
- [x] 文档已更新
- [x] 旧文件已删除
- [ ] 本地测试通过
- [ ] Dev 环境测试通过

---

## 下一步

1. **本地测试**: 启动本地开发服务器，测试清理功能
2. **Dev 环境测试**: 部署到 dev 环境，验证生产配置
3. **Review**: 用户 review 代码修改
4. **提交**: 确认无误后提交代码

