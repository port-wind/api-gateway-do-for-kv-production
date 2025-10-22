# Phase 3: PathCollector DO 清理指南

**版本**: v1.0  
**日期**: 2025-10-16  
**状态**: ⏳ **待执行**

---

## 📋 背景

Phase 3 已完成 PathCollector DO 的代码迁移，所有路径统计功能现在使用 **Queue + D1 + KV** 架构。本文档指导如何安全清理旧的 DO 实例和数据。

---

## ⚠️ 前置条件

在执行清理前，请确认：

- [ ] **新架构已验证**：dev/test 环境运行稳定至少 7 天
- [ ] **数据对比通过**：`GET /paths/compare` 显示准确率 > 99%
- [ ] **灰度切换完成**：`newAPIPercentage = 100%`
- [ ] **无 DO 依赖**：所有代码中已移除 PathCollector/GlobalStatsAggregator 引用
- [ ] **备份已完成**：（可选）如需审计，请先备份 DO 数据

---

## 🔧 清理步骤

### Step 1: 备份 DO 数据（可选）

⚠️ **注意**：`/paths/do/export` 端点已废弃。如需备份，请使用以下替代方案。

#### 方案 A: 从 D1 导出数据（推荐）

D1 现在是唯一的数据源，可以直接从 D1 导出：

```bash
# 导出最近 7 天的路径统计
wrangler d1 execute path-stats-db --command "
  SELECT 
    path,
    SUM(requests) as total_requests,
    SUM(errors) as total_errors,
    MAX(updated_at) as last_updated
  FROM path_stats_hourly
  WHERE hour_bucket >= datetime('now', '-7 days')
  GROUP BY path
  ORDER BY total_requests DESC
" > do-backup-from-d1.json
```

#### 方案 B: 手动调用旧端点（仅在代码未部署前可用）

如果旧代码仍在运行（Phase 3 未部署），可以使用：

```bash
# 导出为 JSON
curl -o do-backup.json \
  "https://your-worker.workers.dev/api/admin/paths/do/export?format=json"

# 导出为 CSV
curl -o do-backup.csv \
  "https://your-worker.workers.dev/api/admin/paths/do/export?format=csv"
```

---

### Step 2: 验证 DO 实例数量

使用 Cloudflare Dashboard 或 wrangler 查看当前 DO 实例数量：

```bash
# 查看 DO 命名空间
wrangler durable-objects:list

# 示例输出：
# PathCollector: 1,234 instances
# GlobalStatsAggregator: 1 instance
```

---

### Step 3: 删除 DO 绑定（代码已完成）

✅ **已完成**：`apps/api/wrangler.toml` 中的 DO 绑定已被注释掉：

```toml
bindings = [
  { name = "COUNTER", class_name = "Counter", script_name = "" },
  { name = "RATE_LIMITER", class_name = "RateLimiter", script_name = "" },
  { name = "TRAFFIC_MONITOR", class_name = "TrafficMonitor", script_name = "" }
  # PATH_COLLECTOR 和 GLOBAL_STATS_AGGREGATOR 已废弃（Phase 3：使用 Queue + D1 替代）
]
```

---

### Step 4: 部署新版本（移除 DO 代码）

部署 Phase 3 代码到所有环境：

```bash
# 部署到 dev 环境
cd apps/api
npm run deploy:dev

# 部署到 test 环境
npm run deploy

# 部署到 production 环境
npm run deploy:prod
```

部署后，DO 实例将**不再接收新流量**，但**历史实例仍然存在**。

---

### Step 5: 等待 DO 实例自动过期

Cloudflare Durable Objects 的实例在**无活动 30 天后**会自动被清理。

**选项 A：等待自动清理（推荐）**
- 时间：30 天
- 风险：无
- 成本：DO 实例在无活动后不计费

**选项 B：手动删除 Namespace（立即清理）**
- 时间：立即
- 风险：⚠️ **不可逆操作**
- 成本：无

---

### Step 6: 手动删除 DO Namespace（可选，谨慎）

⚠️ **警告**：此操作**不可逆**，将删除所有 PathCollector 和 GlobalStatsAggregator 实例。

#### 前置确认：

- [ ] 新架构已稳定运行 > 30 天
- [ ] 备份已完成（如有需要）
- [ ] 所有环境都已部署新代码
- [ ] 团队已知晓并批准此操作

#### 删除命令：

```bash
# ⚠️ 危险操作：删除 PathCollector DO Namespace
wrangler durable-objects:delete PATH_COLLECTOR

# ⚠️ 危险操作：删除 GlobalStatsAggregator DO Namespace
wrangler durable-objects:delete GLOBAL_STATS_AGGREGATOR
```

**注意**：
- Cloudflare 可能需要几分钟到几小时来处理删除请求
- 删除后，DO Namespace 将从所有区域中移除
- 无法恢复已删除的 DO 数据

---

### Step 7: 验证清理完成

#### 7.1 检查 DO 实例数量

```bash
# 应该不再显示 PathCollector 和 GlobalStatsAggregator
wrangler durable-objects:list
```

#### 7.2 检查 Cloudflare Dashboard

访问：https://dash.cloudflare.com/

1. 进入 Workers > Your Worker > Durable Objects
2. 确认 **PathCollector** 和 **GlobalStatsAggregator** 不再出现
3. 检查账单，确认 DO 相关费用已停止

#### 7.3 检查新 API 正常工作

```bash
# 测试路径统计 API（应返回 D1 数据）
curl "https://your-worker.workers.dev/api/admin/paths?page=1&limit=10" | jq .

# 检查数据来源
curl "https://your-worker.workers.dev/api/admin/paths" | jq '.metadata.dataSource'
# 期望输出: "kv-snapshot" 或 "d1-fallback"

# 测试健康检查（应从 D1 读取）
curl "https://your-worker.workers.dev/api/admin/paths/health" | jq '.dataSource'
# 期望输出: "d1"
```

#### 7.4 验证废弃端点

```bash
# 所有 DO 端点应返回 410 Gone
curl -I "https://your-worker.workers.dev/api/admin/paths/do/system-stats"
# 期望输出: HTTP/2 410

curl -I "https://your-worker.workers.dev/api/admin/paths/discovered"
# 期望输出: HTTP/2 410
```

---

## 📊 清理检查清单

| 步骤 | 状态 | 验证方式 |
|------|------|----------|
| ✅ 代码已迁移 | 完成 | Git commit history |
| ✅ 新架构验证 | 完成 | dev 环境运行 7 天 |
| ⏳ 备份 DO 数据 | 待执行 | `do-backup.json` 文件存在 |
| ⏳ 部署到所有环境 | 待执行 | dev/test/prod 都已部署 |
| ⏳ 验证 DO 无流量 | 待执行 | DO 实例 CPU 使用率 = 0 |
| ⏳ 等待 30 天 | 待执行 | 从部署日期计算 |
| ⏳ 删除 DO Namespace | 待执行 | `wrangler durable-objects:list` 无输出 |
| ⏳ 验证新 API | 待执行 | 所有测试通过 |

---

## 🎯 成功标准

清理完成后，应满足：

- ✅ **无 DO 实例**：`wrangler durable-objects:list` 中无 PathCollector/GlobalStatsAggregator
- ✅ **新 API 工作**：`GET /paths` 返回数据且 `dataSource != "do-legacy"`
- ✅ **废弃端点正确**：所有 `/paths/do/*` 返回 410 Gone
- ✅ **数据完整性**：`GET /paths/compare` 准确率 > 99%
- ✅ **性能正常**：p99 延迟 < 500ms
- ✅ **成本降低**：DO 相关费用归零

---

## 📝 回滚计划（如有问题）

⚠️ **注意**：如果在清理过程中发现问题，可以回滚到旧架构。

### 回滚步骤：

1. **恢复 DO 代码**：
   ```bash
   git revert <phase3-commit-hash>
   ```

2. **恢复 DO 绑定**：
   在 `wrangler.toml` 中取消注释 DO 绑定

3. **重新部署**：
   ```bash
   npm run deploy
   ```

4. **验证 DO 恢复**：
   ```bash
   curl "https://your-worker.workers.dev/api/admin/paths/do/system-stats"
   # 应返回 DO 统计数据
   ```

⚠️ **重要**：回滚窗口仅在 **DO Namespace 未删除前** 有效。一旦执行了 `wrangler durable-objects:delete`，将**无法恢复**。

---

## 📚 相关文档

- [Phase 3 实施计划](./path-stats-phase3-implementation-plan.md)
- [PathCollector DO 代码变更](../apps/api/src/durable-objects/PathCollector.ts)（已删除）
- [新架构设计](./path-stats-refactor.md)

---

## 🙋 常见问题

### Q1: 删除 DO 后数据会丢失吗？

**A**: 不会。所有数据已迁移到 D1 + KV，DO 只是旧的数据存储方式。

### Q2: 可以在生产环境直接删除 DO 吗？

**A**: 不推荐。建议先在 dev/test 环境验证至少 7 天，确认无问题后再清理生产环境。

### Q3: 如果新架构有问题怎么办？

**A**: 在删除 DO Namespace 前，可以随时回滚代码恢复旧架构。删除后无法回滚。

### Q4: DO 实例会一直计费吗？

**A**: 不会。DO 实例在无活动后不计费，30 天后自动删除。

### Q5: 手动删除 DO Namespace 有什么风险？

**A**: 主要风险是不可逆。如果新架构有隐藏 bug，删除后无法回滚到旧 DO 数据。

---

**报告生成日期**: 2025-10-16  
**报告版本**: v1.0  
**状态**: ⏳ 待执行

