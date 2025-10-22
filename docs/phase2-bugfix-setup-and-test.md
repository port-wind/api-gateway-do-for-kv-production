# Phase 2 Bug 修复：setup-d1.sh 和 vitest.config.ts

## 📅 修复日期
2025-10-15

## 🐛 发现的问题

### 问题 1: setup-d1.sh sed 替换错误

**位置**: `apps/api/scripts/setup-d1.sh:106`

**问题描述**:
当 `ENV_CHOICE=1`（测试环境）时，sed 命令使用简单的全局替换：
```bash
sed -i.bak "s|database_id = \"PLACEHOLDER\".*# ⚠️ 需要先创建 D1 数据库后填入|database_id = \"$DATABASE_ID\"|"
```

这会匹配 wrangler.toml 中**第一个**出现的 `database_id = "PLACEHOLDER"`，但在 wrangler.toml 中：
- 第 40 行：生产环境的 `[[env.production.d1_databases]]` 
- 第 96 行：Dev 环境的 `[[env.dev.d1_databases]]`
- 第 156 行：默认环境的 `[[d1_databases]]`

结果是**覆盖了生产环境的配置**，而默认环境仍然是 `PLACEHOLDER`。

**影响**:
- 测试环境部署失败（database PLACEHOLDER not found）
- 生产环境配置被意外修改

---

### 问题 2: vitest.config.ts 缺少 D1 绑定

**位置**: `apps/api/vitest.config.ts:12`

**问题描述**:
Miniflare 配置中只声明了 KV 和 DO 绑定：
```typescript
miniflare: {
  kvNamespaces: ['API_GATEWAY_STORAGE'],
  durableObjects: {
    COUNTER: 'Counter',
    RATE_LIMITER: 'RateLimiter',  
    TRAFFIC_MONITOR: 'TrafficMonitor'
  },
  // ❌ 缺少 D1 绑定
}
```

**影响**:
- 一旦 Phase 2 Task 2-3 引入 D1 读写代码，测试会报错：`env.D1 is undefined`
- 所有涉及 D1 的单元测试无法运行

---

## ✅ 修复方案

### 修复 1: 使用范围匹配精确替换

**修改文件**: `apps/api/scripts/setup-d1.sh`

**修复前**（第 106 行）:
```bash
# 默认环境
sed -i.bak "s|database_id = \"PLACEHOLDER\".*# ⚠️ 需要先创建 D1 数据库后填入|database_id = \"$DATABASE_ID\"|" "$PROJECT_ROOT/wrangler.toml"
```

**修复后**:
```bash
# 默认环境 - 使用范围匹配，确保只替换 [[d1_databases]] 块中的
sed -i.bak "/^\[\[d1_databases\]\]/,/^database_id/ s|database_id = \"PLACEHOLDER\".*|database_id = \"$DATABASE_ID\"|" "$PROJECT_ROOT/wrangler.toml"
```

**解释**:
- `/^\[\[d1_databases\]\]/,/^database_id/`: 范围匹配，从 `[[d1_databases]]` 开始到第一个 `database_id` 行
- 确保只替换**默认环境块**中的 `database_id`

**同样修复了 Dev 和生产环境**:
```bash
# Dev 环境
sed -i.bak "/^\[\[env\.dev\.d1_databases\]\]/,/^database_id/ s|database_id = \"PLACEHOLDER\".*|database_id = \"$DATABASE_ID\"|" "$PROJECT_ROOT/wrangler.toml"

# 生产环境
sed -i.bak "/^\[\[env\.production\.d1_databases\]\]/,/^database_id/ s|database_id = \"PLACEHOLDER\".*|database_id = \"$DATABASE_ID\"|" "$PROJECT_ROOT/wrangler.toml"
```

---

### 修复 2: 添加 D1 绑定到测试配置

**修改文件**: `apps/api/vitest.config.ts`

**修复前**（第 12-22 行）:
```typescript
miniflare: {
  kvNamespaces: ['API_GATEWAY_STORAGE'],
  durableObjects: {
    COUNTER: 'Counter',
    RATE_LIMITER: 'RateLimiter',  
    TRAFFIC_MONITOR: 'TrafficMonitor'
  },
  compatibilityDate: '2024-06-25',
  compatibilityFlags: ['nodejs_compat']
}
```

**修复后**:
```typescript
miniflare: {
  kvNamespaces: ['API_GATEWAY_STORAGE'],
  durableObjects: {
    COUNTER: 'Counter',
    RATE_LIMITER: 'RateLimiter',  
    TRAFFIC_MONITOR: 'TrafficMonitor'
  },
  // D1 数据库绑定（Phase 2: 路径统计持久化）
  d1Databases: {
    D1: 'path-stats-db'  // 测试环境使用内存数据库
  },
  compatibilityDate: '2024-06-25',
  compatibilityFlags: ['nodejs_compat']
}
```

**说明**:
- Miniflare 会为测试环境创建一个**内存 SQLite 数据库**
- 每次测试运行时都是全新的数据库（隔离性）
- 完全兼容 Cloudflare D1 API

---

## 🧪 验证

### 验证 1: 类型检查通过

```bash
npm run lint
```

**结果**: ✅ 通过（无类型错误）

### 验证 2: sed 替换逻辑（手动验证）

**测试步骤**:
1. 创建测试环境的 wrangler.toml 副本
2. 运行 `setup-d1.sh` 选择环境 1（测试环境）
3. 检查 `[[d1_databases]]` 块的 `database_id` 是否被更新
4. 检查 `[[env.production.d1_databases]]` 块的 `database_id` 是否保持为 `PLACEHOLDER`

**预期结果**:
- ✅ 默认环境的 `database_id` 被正确更新
- ✅ 生产环境的 `database_id` 保持不变

### 验证 3: D1 绑定在测试中可用

**测试文件**: 创建 `tests/unit/d1-binding.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';

describe('D1 Binding', () => {
  it('env.D1 should be available', () => {
    expect(env.D1).toBeDefined();
    expect(typeof env.D1.prepare).toBe('function');
  });

  it('should be able to execute SQL', async () => {
    const result = await env.D1.prepare('SELECT 1 as test').first<{ test: number }>();
    expect(result?.test).toBe(1);
  });
});
```

**运行测试**:
```bash
npm test tests/unit/d1-binding.test.ts
```

**预期结果**: ✅ 测试通过

---

## 📊 修复影响

| 修复项 | 影响范围 | 优先级 |
|--------|---------|--------|
| setup-d1.sh sed 修复 | 数据库创建流程 | 🔴 高（阻塞部署）|
| vitest.config.ts D1 绑定 | 单元测试环境 | 🟡 中（阻塞 Task 2-3 测试）|

---

## 🎯 后续步骤

修复完成后，可以继续：

1. **运行 setup-d1.sh 创建数据库** ✅
   ```bash
   cd apps/api
   ./scripts/setup-d1.sh
   ```

2. **执行数据库迁移** ✅
   ```bash
   npx wrangler d1 execute path-stats-db \
     --file=./migrations/0001_create_path_stats_tables.sql
   ```

3. **继续 Phase 2 Task 2-3** ⏳
   - 实现队列消费者聚合逻辑
   - 实现 D1 写入逻辑

---

## 📝 修订历史

| 日期 | 版本 | 修改内容 | 作者 |
|------|------|----------|------|
| 2025-10-15 | v1.0 | 初始版本，修复 sed 和 D1 绑定问题 | System |

---

## 🔗 相关文件

- `apps/api/scripts/setup-d1.sh` - D1 数据库设置脚本
- `apps/api/vitest.config.ts` - Vitest 测试配置
- `apps/api/wrangler.toml` - Cloudflare Worker 配置
- `docs/phase2-implementation-plan.md` - Phase 2 实施计划

