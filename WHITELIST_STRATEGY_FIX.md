# 路径收集白名单策略修复

## 问题描述

用户报告：只开启了一个代理路由（`/kv/*`），但路径统计中出现了大量不相关的路径。

### 观察到的症状

```bash
curl 'https://api-gateway-do-for-kv-dev.andy-zhan.workers.dev/api/admin/paths?page=1&limit=50'
```

返回了 9 个路径，包括：
- `/api/health` ❌ 内部健康检查
- `/api/admin/paths` ❌ 管理端点
- `/api/admin/paths/migration-config` ❌ 管理端点
- `/admin/paths` ❌ 管理端点
- `/api/admin/paths/compare` ❌ 管理端点
- `/api/admin/proxies` ❌ 管理端点
- `/api/admin/proxy-routes` ❌ 管理端点
- `/kv/test` ✅ 有效代理路径

## 根本原因分析

### 1. 白名单策略实现缺陷

**文件**: `apps/api/src/middleware/path-collector-do.ts`

**问题代码**:
```typescript
const routes = ((stored as any[]) || []).map(r => ({
  id: r.id,
  pattern: r.pattern
}));
```

**问题**: 没有过滤 `enabled: false` 的路由，导致所有路由（包括禁用的）都被用于路径匹配。

### 2. 历史数据污染

即使修复了白名单策略，D1 数据库中仍然保留了**之前**收集的无效路径数据。这些历史数据会：
- 显示在 KV snapshot 中
- 污染路径统计列表
- 所有路径显示相同的时间戳（因为 snapshot 合并时使用 `new Date()`）

## 修复方案

### 修复 1: 白名单策略过滤 ✅

**文件**: `apps/api/src/middleware/path-collector-do.ts:35-42`

```typescript
// 🔥 关键修复：只选择启用的路由（enabled: true）
const routes = ((stored as any[]) || [])
  .filter(r => r.enabled === true)  // ← 新增过滤
  .map(r => ({
    id: r.id,
    pattern: r.pattern
  }));
```

**效果**: 
- 只有 `enabled: true` 的路由才会用于路径匹配
- 未来不会再收集不相关的路径

### 修复 2: 历史数据清理工具 ✅

**新增文件**: `apps/api/src/lib/cleanup-invalid-paths.ts`

**功能**:
1. 从 KV 读取当前启用的代理路由
2. 扫描 D1 中所有路径
3. 删除不匹配任何启用路由的路径
4. 自动删除 KV snapshot（强制重新生成）

**新增端点**: `POST /api/admin/paths/cleanup/invalid`

### 修复 3: 使用文档 ✅

**新增文件**: `apps/api/docs/CLEANUP_INVALID_PATHS.md`

详细说明清理工具的使用方法、逻辑和注意事项。

## 使用指南

### Step 1: 验证当前状态

```bash
# 查看当前路径列表
curl -s 'https://api-gateway-do-for-kv-dev.andy-zhan.workers.dev/api/admin/paths?page=1&limit=50' \
  | jq '{total: .pagination.total, paths: .data | map(.path)}'

# 查看启用的代理路由
curl -s 'https://api-gateway-do-for-kv-dev.andy-zhan.workers.dev/api/admin/proxy-routes' \
  | jq '.data | map({pattern, enabled})'
```

### Step 2: 执行清理（本地测试）

```bash
# 1. 确保代码已更新
cd apps/api

# 2. 启动本地开发服务器
npm run dev

# 3. 在另一个终端执行清理
curl -X POST http://localhost:8787/api/admin/paths/cleanup/invalid | jq .
```

**预期响应**:
```json
{
  "success": true,
  "message": "路径数据清理完成",
  "data": {
    "success": true,
    "deletedCount": 7,
    "keptCount": 1,
    "invalidPaths": [
      "/api/health",
      "/api/admin/paths",
      "/api/admin/paths/migration-config",
      "/api/admin/paths/compare",
      "/api/admin/proxies",
      "/api/admin/proxy-routes",
      "/admin/paths"
    ],
    "enabledPatterns": ["/kv/*"]
  }
}
```

### Step 3: 验证清理结果

```bash
# 再次查看路径列表，应该只有有效路径
curl -s 'http://localhost:8787/api/admin/paths?page=1&limit=50' \
  | jq '{total: .pagination.total, paths: .data | map(.path)}'
```

### Step 4: 部署到 Dev 环境

```bash
# 部署
npm run deploy:dev

# 执行清理
curl -X POST https://api-gateway-do-for-kv-dev.andy-zhan.workers.dev/api/admin/paths/cleanup/invalid | jq .

# 验证结果
curl -s 'https://api-gateway-do-for-kv-dev.andy-zhan.workers.dev/api/admin/paths?page=1&limit=50' \
  | jq '{total: .pagination.total, paths: .data | map(.path)}'
```

## 测试计划

### 测试场景 1: 白名单策略工作

1. 发送请求到匹配代理路由的路径：`/kv/test-service/data`
2. 发送请求到不匹配的路径：`/api/health`
3. 等待几分钟让数据聚合
4. 检查路径列表，应该只有 `/kv/test-service/data`

### 测试场景 2: 清理工具工作

1. 手动向 D1 插入一些测试数据（包括有效和无效路径）
2. 执行清理工具
3. 验证只有无效路径被删除
4. 验证 KV snapshot 被删除并重新生成

### 测试场景 3: 启用/禁用路由的影响

1. 禁用 `/kv/*` 路由
2. 发送请求到 `/kv/test`
3. 等待聚合
4. 验证路径**不会**被收集

5. 重新启用 `/kv/*` 路由
6. 发送请求到 `/kv/test`
7. 等待聚合
8. 验证路径**会**被收集

## 文件变更清单

### 修改的文件

1. **apps/api/src/middleware/path-collector-do.ts**
   - 添加 `.filter(r => r.enabled === true)` 过滤逻辑
   - 只选择启用的代理路由

2. **apps/api/src/routes/admin/paths.ts**
   - 添加 `POST /paths/cleanup/invalid` 端点
   - 触发清理并删除 KV snapshot

### 新增的文件

3. **apps/api/src/lib/cleanup-invalid-paths.ts**
   - 清理逻辑实现
   - 路径匹配和删除

4. **apps/api/docs/CLEANUP_INVALID_PATHS.md**
   - 使用文档
   - 故障排查指南

5. **WHITELIST_STRATEGY_FIX.md** (本文件)
   - 问题分析
   - 修复方案
   - 使用指南

## 后续建议

### 1. 监控告警

添加监控来检测：
- 非代理路径是否被收集
- D1 中路径数量的异常增长
- 清理工具的执行频率

### 2. 自动化清理

考虑添加定期清理任务（如每周执行一次）：
```typescript
// 在 scheduled handler 中
case '0 0 * * 0': // 每周日凌晨
  await cleanupInvalidPaths(env);
  break;
```

### 3. 前端优化

在前端路径列表中添加过滤选项：
- 只显示匹配代理路由的路径
- 隐藏内部管理端点

### 4. 数据保留策略

明确定义：
- 哪些路径应该永久保留
- 哪些路径可以定期清理
- 数据保留时长（当前是 3 天）

## Review Checklist

在提交代码前，请确认：

- [ ] 白名单策略过滤逻辑正确
- [ ] 清理工具测试通过
- [ ] 文档完整且准确
- [ ] 类型检查通过（`npx tsc --noEmit`）
- [ ] 单元测试通过（`npm test`）
- [ ] 本地测试验证清理功能
- [ ] Dev 环境测试验证
- [ ] 代码已 review
- [ ] 确认不影响现有功能

## 风险评估

### 低风险 ✅

- 白名单策略修复：只是添加过滤，不会影响有效路径
- 清理工具：只删除不匹配的路径，有详细日志

### 中风险 ⚠️

- KV snapshot 删除：可能导致下次读取变慢（需要从 D1 重新生成）
- 历史数据删除：不可逆操作

### 缓解措施

1. **先在 dev 环境测试**
2. **查看清理预览**（可以先只返回 `invalidPaths` 列表，不执行删除）
3. **备份重要数据**（如果需要）
4. **低峰期执行**

## 总结

本次修复解决了路径收集白名单策略的两个核心问题：
1. **未来预防**：修复了白名单策略实现，确保只收集匹配启用路由的路径
2. **历史清理**：提供了清理工具，删除已存在的无效路径数据

修复后，路径统计将只包含实际的代理流量数据，不再被内部管理端点污染。

