# 清理无效路径数据

## 问题描述

当路径收集策略从"收集所有路径"改为"只收集启用的代理路由路径"后，D1 数据库中可能存在历史的无效路径数据（如内部管理端点、健康检查端点等）。

这些历史数据会：
1. 显示在路径统计列表中
2. 占用 D1 存储空间
3. 影响快照生成效率
4. 混淆实际的代理流量统计

## 解决方案

提供了一个清理工具，可以：
1. 从 KV 读取当前启用的代理路由
2. 扫描 D1 中所有路径数据
3. 删除不匹配任何启用路由的路径
4. 自动重新生成 KV snapshot

## 使用方法

### 方式 1: 通过 API 端点（推荐）

```bash
# Dev 环境
curl -X POST https://api-gateway-do-for-kv-dev.andy-zhan.workers.dev/api/admin/paths/cleanup/invalid

# 生产环境
curl -X POST https://api-gateway-do-for-kv-prod.andy-zhan.workers.dev/api/admin/paths/cleanup/invalid
```

### 方式 2: 通过 Wrangler

```bash
# 本地测试
cd apps/api
npx wrangler dev --local --env dev

# 在另一个终端
curl -X POST http://localhost:8787/api/admin/paths/cleanup/invalid
```

## 响应示例

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
    "enabledPatterns": [
      "/kv/*"
    ]
  }
}
```

## 清理逻辑

### 0. 表结构说明

根据实际的 D1 schema，系统使用以下表存储路径数据：

- **`path_stats_hourly`**: 小时级聚合统计数据（requests, errors, p50/p95/p99, unique_ips 等）
- **`traffic_events`**: 详细的请求事件数据（带幂等 ID，保留 3 天）

清理工具会同时清理这两个表中的无效路径数据，确保彻底删除。

### 1. 获取启用的代理路由

从 KV `proxy-routes:list` 中读取所有 `enabled: true` 的路由。

### 2. 路径匹配规则

使用 `PathMatcher.isPathMatchingPattern` 进行匹配：
- `/kv/*` 匹配 `/kv/test`, `/kv/service/data`
- `/kv/*` **不**匹配 `/api/health`, `/admin/paths`

### 3. 删除策略

**会被删除的路径**：
- 不匹配任何启用代理路由的路径
- 内部管理端点（`/api/admin/*`, `/api/health`）
- 测试路径

**会被保留的路径**：
- 匹配至少一个启用代理路由的路径
- 实际的代理流量路径

### 4. 清理范围

- `path_stats_hourly` 表（小时级聚合统计数据）
- `traffic_events` 表（详细事件数据）
- KV snapshot（自动删除并重新生成）

## 安全措施

1. **只读取启用的路由**：`enabled: true`
2. **分批删除**：每批 50 个路径，避免单次操作过大
3. **日志记录**：详细记录删除的路径和数量
4. **幂等性**：可以重复执行，不会影响有效数据

## 何时使用

### 必须使用的场景

- ✅ 从"收集所有路径"切换到"白名单策略"后
- ✅ 发现路径列表中有大量内部端点
- ✅ D1 存储空间接近限制

### 不需要使用的场景

- ❌ 正常的增量更新
- ❌ 所有路径都是有效的代理流量
- ❌ 刚部署系统，没有历史数据

## 注意事项

1. **不可逆操作**：删除的数据无法恢复，请谨慎使用
2. **执行时间**：数据量大时可能需要几秒钟到几分钟
   - 小数据集（< 100 路径）：通常 1-2 秒
   - 中等数据集（100-1000 路径）：2-10 秒
   - 大数据集（> 1000 路径）：可能需要更长时间
3. **查询性能**：使用 `GROUP BY` 优化查询，利用表索引
   - `path_stats_hourly`: 利用主键 `(path, hour_bucket)`
   - `traffic_events`: 利用索引 `idx_events_path_date`
4. **D1 限制**：单次查询最多返回 10,000 行，超大数据集需要分批处理
5. **KV Snapshot**：清理后会自动删除 snapshot，下次读取时重新生成
6. **权限**：确保有管理员权限
7. **时机**：建议在低峰期执行

## 验证清理结果

清理完成后，验证路径列表：

```bash
# 查看路径列表
curl 'https://api-gateway-do-for-kv-dev.andy-zhan.workers.dev/api/admin/paths?page=1&limit=50' | jq '.data | map({path})'
```

应该只看到匹配启用代理路由的路径。

## 故障排查

### 问题 1: 清理后路径列表仍有无效路径

**原因**: KV snapshot 缓存未失效

**解决方案**:
```bash
# 手动删除 snapshot（使用正确的 key 名称）
npx wrangler kv key delete "snapshot:config" --namespace-id=<YOUR_KV_ID> --remote
npx wrangler kv key delete "snapshot:latest" --namespace-id=<YOUR_KV_ID> --remote
```

### 问题 2: 清理失败，返回 500 错误

**原因**: D1 连接问题或权限不足

**解决方案**:
1. 检查 D1 绑定是否正确
2. 查看 Worker 日志: `npx wrangler tail --env dev`
3. 确认表是否存在

### 问题 3: 有效路径被误删

**原因**: 代理路由模式配置错误

**解决方案**:
1. 检查代理路由的 `pattern` 是否正确
2. 确认路由的 `enabled` 状态
3. 使用测试工具验证匹配规则

## 相关文件

- `apps/api/src/lib/cleanup-invalid-paths.ts` - 清理逻辑
- `apps/api/src/middleware/path-collector-do.ts` - 白名单策略
- `apps/api/src/lib/path-matcher.ts` - 路径匹配逻辑
- `apps/api/src/routes/admin/paths.ts` - 管理端点

