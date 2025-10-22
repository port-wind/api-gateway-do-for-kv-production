# Phase 2 快速开始指南

## 🚀 5 分钟部署 Phase 2

本指南帮助您快速部署和测试 Phase 2 功能。

---

## 📋 前置条件

- ✅ Cloudflare 账号
- ✅ Wrangler CLI 已安装
- ✅ Phase 1 已部署（Workers Queue 已创建）
- ✅ 代码已拉取到本地

---

## 🔧 Step 1: 创建 D1 数据库（2 分钟）

### 测试环境

```bash
cd apps/api

# 1. 创建 D1 数据库
wrangler d1 create path-stats-db

# 2. 复制输出的 database_id，形如：
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# 3. 更新 wrangler.toml
# 找到 [[d1_databases]] 部分，替换 PLACEHOLDER 为实际 ID
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# 4. 应用迁移
wrangler d1 execute path-stats-db \
  --file=./migrations/0001_create_path_stats_tables.sql

# 5. 验证表创建
wrangler d1 execute path-stats-db \
  --command="SELECT name FROM sqlite_master WHERE type='table'"
```

**期望输出**:
```
traffic_events
path_stats_hourly
archive_metadata
consumer_heartbeat
```

---

## ☁️ Step 2: 创建 R2 存储桶（1 分钟）

```bash
# 创建 R2 存储桶（测试环境）
wrangler r2 bucket create api-gateway-archive

# 验证
wrangler r2 bucket list
```

**期望输出**:
```
api-gateway-archive
```

---

## 🚢 Step 3: 部署 Worker（1 分钟）

```bash
# 类型检查
npm run lint

# 部署到测试环境
wrangler deploy

# 查看日志
wrangler tail
```

**期望输出**:
```
✨ Worker deployed successfully
```

---

## ✅ Step 4: 验证部署（1 分钟）

### 4.1 检查队列消费者

```bash
# 发送测试请求（触发事件）
curl https://YOUR_WORKER.workers.dev/api/test

# 查看队列处理日志
wrangler tail
```

**期望日志**:
```
📦 Queue Batch Received
   Messages: 1
✅ Validated 1/1 events
📊 过滤结果: 1/1 条事件需要聚合
✅ Batch Processed Successfully
```

### 4.2 检查 D1 数据

```bash
# 查看明细事件
wrangler d1 execute path-stats-db \
  --command="SELECT COUNT(*) as count FROM traffic_events"

# 查看聚合统计
wrangler d1 execute path-stats-db \
  --command="SELECT * FROM path_stats_hourly LIMIT 5"
```

**期望输出**:
```sql
-- traffic_events
count: 1 (或更多)

-- path_stats_hourly
path           | hour_bucket    | requests | errors
/api/test      | 2025-10-15T14  | 1        | 0
```

### 4.3 检查 KV 快照

```bash
# 查看快照配置（需要处理 10 批次后才会生成）
wrangler kv:key get "snapshot:config" \
  --namespace-id=YOUR_KV_ID \
  --preview false
```

---

## 🧪 Step 5: 测试归档功能（可选）

### 5.1 插入测试数据（3 天前）

```sql
-- 创建临时脚本 test-archive.sql
INSERT INTO traffic_events 
  (id, path, method, status, response_time, client_ip_hash, timestamp, event_date, is_error)
VALUES 
  ('test-1', '/api/test', 'GET', 200, 100, 'hash-1', 
   strftime('%s', datetime('now', '-3 days')) * 1000, 
   date('now', '-3 days'), 0);

-- 执行
wrangler d1 execute path-stats-db --file=./test-archive.sql
```

### 5.2 手动触发归档 Cron

```bash
# 启动 dev 模式并触发定时任务
wrangler dev --test-scheduled

# 在交互式界面中选择：
# - Cron: 0 2 * * * (归档任务)
```

### 5.3 验证归档

```bash
# 检查 R2 对象
wrangler r2 object list api-gateway-archive

# 检查归档元数据
wrangler d1 execute path-stats-db \
  --command="SELECT * FROM archive_metadata"
```

**期望输出**:
```
# R2 对象
traffic-events/2025-10-12.jsonl.gz

# 归档元数据
date        | status    | record_count | d1_cleaned
2025-10-12  | completed | 1            | 0
```

---

## 🎯 快速测试清单

- [ ] D1 数据库创建并应用迁移
- [ ] R2 存储桶创建
- [ ] Worker 部署成功
- [ ] 队列消费者正常工作
- [ ] D1 数据正确写入
- [ ] KV 快照生成（10 批次后）
- [ ] 归档功能正常（可选测试）

---

## 🐛 常见问题

### Q1: `database_id = "PLACEHOLDER"` 错误

**问题**: 部署时提示 D1 数据库不存在

**解决**:
```bash
# 1. 创建数据库
wrangler d1 create path-stats-db

# 2. 复制 database_id
# 3. 更新 wrangler.toml 中的 PLACEHOLDER
```

---

### Q2: 队列未处理消息

**问题**: 日志中没有看到队列消费日志

**检查**:
```bash
# 1. 确认 USE_TRAFFIC_QUEUE = "true"
grep "USE_TRAFFIC_QUEUE" wrangler.toml

# 2. 确认队列绑定
grep "TRAFFIC_QUEUE" wrangler.toml

# 3. 检查队列状态
wrangler queues list
```

---

### Q3: D1 写入失败

**问题**: `meta.changes` 为 0

**检查**:
```bash
# 1. 确认表结构
wrangler d1 execute path-stats-db \
  --command="PRAGMA table_info(traffic_events)"

# 2. 确认主键冲突
wrangler d1 execute path-stats-db \
  --command="SELECT COUNT(*) FROM traffic_events WHERE id='YOUR_ID'"

# 3. 查看错误日志
wrangler tail
```

---

### Q4: R2 绑定错误

**问题**: `R2_ARCHIVE binding is not configured`

**解决**:
```bash
# 1. 创建 R2 存储桶
wrangler r2 bucket create api-gateway-archive

# 2. 确认 wrangler.toml 中的绑定
grep "R2_ARCHIVE" wrangler.toml

# 3. 重新部署
wrangler deploy
```

---

## 📊 监控和调试

### 实时日志

```bash
# 查看所有日志
wrangler tail

# 过滤错误日志
wrangler tail | grep "❌"

# 过滤队列日志
wrangler tail | grep "Queue"
```

### D1 查询

```bash
# 最近的事件
wrangler d1 execute path-stats-db \
  --command="SELECT * FROM traffic_events ORDER BY timestamp DESC LIMIT 10"

# 聚合统计
wrangler d1 execute path-stats-db \
  --command="SELECT path, SUM(requests) as total FROM path_stats_hourly GROUP BY path"

# 存储统计
wrangler d1 execute path-stats-db \
  --command="SELECT 
    (SELECT COUNT(*) FROM traffic_events) as events_count,
    (SELECT COUNT(*) FROM path_stats_hourly) as stats_count,
    (SELECT COUNT(*) FROM archive_metadata WHERE status='completed') as archived_count"
```

### R2 查询

```bash
# 列出所有归档
wrangler r2 object list api-gateway-archive

# 下载归档文件
wrangler r2 object get api-gateway-archive/traffic-events/2025-10-15.jsonl.gz \
  --file=./archive.jsonl.gz

# 解压并查看
gunzip -c archive.jsonl.gz | head -n 10
```

---

## 🔗 相关文档

- **完整报告**: `docs/PHASE2-COMPLETION-REPORT.md`
- **技术方案**: `docs/path-stats-refactor.md`
- **Bug 修复**: `docs/phase2-critical-fix-*.md`
- **开发总结**: `docs/phase2-progress-summary.md`

---

## 🎉 成功！

如果所有步骤都成功，恭喜！Phase 2 已成功部署。

**下一步**:
1. 观察运行几天，收集真实数据
2. 验证归档和清理功能（Cron 自动执行）
3. 根据实际情况调整配置（批次大小、刷新频率等）
4. 补充单元测试（Task 5）

---

**问题反馈**: 如有问题，请查看完整的 `PHASE2-COMPLETION-REPORT.md`

