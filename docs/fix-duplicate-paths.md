# 修复路径重复问题

## 问题描述

在路径管理页面发现了重复的路径记录，同一个路径出现多次。

## 根本原因

在 `apps/api/src/lib/kv-snapshot.ts` 的 `fetchHotPathsFromD1()` 函数中，SQL 查询没有按 `path` 进行 `GROUP BY`，导致同一个路径在不同时间桶（hour_bucket）中的多条记录都被返回。

例如：
```
/biz-client/biz/user/self  2025-10-18T10  36 requests
/biz-client/biz/user/self  2025-10-18T11  30 requests  
/biz-client/biz/user/self  2025-10-18T12  29 requests
```

这 3 条记录都会出现在快照中，导致前端显示时出现重复。

## 修复内容

### 1. 代码修复 ✅ 已完成

修改了 `apps/api/src/lib/kv-snapshot.ts` 第 75-91 行的查询：

**修复前：**
```sql
SELECT * FROM path_stats_hourly 
WHERE hour_bucket >= ? 
ORDER BY requests DESC 
LIMIT ?
```

**修复后：**
```sql
SELECT 
    path,
    MAX(hour_bucket) as hour_bucket,
    SUM(requests) as requests,          -- 聚合所有时间的请求数
    SUM(errors) as errors,              -- 聚合错误数
    SUM(sum_response_time) as sum_response_time,
    SUM(count_response_time) as count_response_time,
    SUM(unique_ips_seen) as unique_ips_seen,
    MAX(response_samples) as response_samples,
    MAX(ip_hashes) as ip_hashes
FROM path_stats_hourly 
WHERE hour_bucket >= ? 
GROUP BY path                           -- 关键：按路径分组去重
ORDER BY requests DESC 
LIMIT ?
```

### 2. 清理已有重复数据

修复代码后，需要清理 KV 中已有的重复快照数据。

## 修复步骤

### 方法 1：使用自动化脚本（推荐）

```bash
cd /Users/leo/tk.com/api-gateway-do-for-kv
./scripts/fix-duplicate-paths.sh
```

脚本会引导你完成：
1. 删除 KV 快照（`snapshot:config` 和 `snapshot:latest`）
2. 可选：调用清理 API 清理无效路径

### 方法 2：手动清理 KV

使用 Wrangler CLI：

```bash
cd apps/api

# 删除快照配置
npx wrangler kv:key delete snapshot:config --binding=API_GATEWAY_STORAGE

# 删除快照数据
npx wrangler kv:key delete snapshot:latest --binding=API_GATEWAY_STORAGE
```

### 方法 3：调用清理 API

```bash
curl -X POST https://your-worker.workers.dev/api/admin/paths/cleanup/invalid \
  -H "Content-Type: application/json"
```

这个 API 会：
- 清理 D1 中不匹配当前代理路由的历史数据
- 自动删除 KV 快照
- 强制下次访问时重新生成快照

## 部署修复

确保已部署修复后的代码：

```bash
cd apps/api
npm run deploy
```

## 验证修复

1. **清理快照**：执行上述任一清理方法
2. **刷新页面**：访问路径管理页面，触发快照重新生成
3. **检查结果**：确认路径列表中不再有重复记录

可以通过以下方式检查快照状态：

```bash
# 查看快照配置
npx wrangler kv:key get snapshot:config --binding=API_GATEWAY_STORAGE

# 查看快照数据（可能很大）
npx wrangler kv:key get snapshot:latest --binding=API_GATEWAY_STORAGE | jq '. | length'
```

## 预防措施

1. ✅ 已在查询中添加 `GROUP BY path` 确保路径唯一性
2. ✅ 已添加日志输出 "去重后的热点路径统计"
3. 🔄 建议：定期监控快照数据质量
4. 🔄 建议：添加单元测试覆盖快照生成逻辑

## 相关文件

- `apps/api/src/lib/kv-snapshot.ts` - 快照生成逻辑（已修复）
- `apps/api/src/lib/paths-api-v2.ts` - 路径 API 实现
- `apps/api/src/routes/admin/paths.ts` - 路径管理端点
- `scripts/fix-duplicate-paths.sh` - 修复脚本

## 问题时间线

- **发现时间**：2025-10-18
- **问题原因**：SQL 查询缺少 GROUP BY 导致数据重复
- **修复时间**：2025-10-18
- **修复人员**：Claude AI Assistant
- **影响范围**：路径管理页面显示重复记录
- **数据影响**：仅影响显示，不影响实际统计和缓存功能

## 相关 Issue

如需追踪后续优化，建议创建以下任务：

1. [ ] 添加快照数据质量检查（检测重复路径）
2. [ ] 添加单元测试覆盖 `fetchHotPathsFromD1()`
3. [ ] 考虑在快照生成时添加数据去重验证
4. [ ] 监控告警：快照生成失败或数据异常

---

**状态**: ✅ 已修复（代码层面）  
**清理状态**: ⏳ 需要手动清理 KV 快照  
**优先级**: 🔴 高（影响用户体验）

