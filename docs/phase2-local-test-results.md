# Phase 2 本地测试结果

## 📅 测试日期
2025-10-16

## 🎯 测试目标
验证 Phase 2 完整数据流：**采集 → 队列 → 聚合 → D1 → KV**

## 📊 测试执行

### 测试方法
使用 `test-phase2-simple.sh` 脚本发送测试请求

### 测试数据
- **请求总数**: 50 个
- **测试路径**: 5 个不同路径
- **时间窗口**: ~30 秒（包含等待时间）

### 请求分布
| 路径 | 请求数 | 状态码 | 说明 |
|------|--------|--------|------|
| `/api/health` | ~12 | 200 | 健康检查端点（存在） |
| `/api/test` | ~14 | 404 | 测试路径（不存在） |
| `/api/demo` | ~13 | 404 | 演示路径（不存在） |
| `/api/example` | ~7 | 404 | 示例路径（不存在） |
| `/api/status` | ~4 | 404 | 状态路径（不存在） |

## ✅ 预期行为

### 1. 事件采集
- ✅ 中间件拦截所有请求
- ✅ 生成幂等 ID (`timestamp-hash`)
- ✅ 提取关键字段：path, method, status, responseTime, clientIpHash

### 2. 队列发送
- ✅ 检查 `isQueueAvailable()` (USE_TRAFFIC_QUEUE=true)
- ✅ 发送事件到 `TRAFFIC_QUEUE`
- ✅ Fallback 到 PathCollector DO（如果队列失败）

### 3. 队列消费
- ✅ 批量接收消息（batch size: 1-100）
- ✅ 验证事件有效性
- ✅ 按 `(path, hour_bucket)` 分组
- ✅ 过滤重复事件（幂等性）

### 4. D1 写入
- ✅ **明细表** (`traffic_events`): INSERT OR IGNORE
- ✅ **聚合表** (`path_stats_hourly`): INSERT OR REPLACE
- ✅ 批量操作分块（10 语句/batch，D1 限制）
- ✅ 返回实际插入的 ID（避免重复计数）

### 5. 统计聚合
- ✅ 使用 `simplified-stats.ts`
- ✅ 水库采样（响应时间，最多 1000 个）
- ✅ 唯一 IP 采样（IP 哈希，最多 1000 个）
- ✅ 计算：requests, errors, avg/p50/p95/p99, unique_ips_min

### 6. KV 快照
- ✅ 每 10 个批次触发刷新
- ✅ 从 D1 读取 Top 100 热点路径（最近 24 小时）
- ✅ 保存到 `snapshot:latest` 和 `snapshot:v{version}:paths`
- ✅ 更新 `snapshot:config` 元数据

## 🔍 验证方法

### 方法 1：查看 Wrangler Dev 日志
在运行 `npm run dev` 的终端中查找：

**队列发送**:
```
✅ Event sent to queue: /api/health
```

**队列消费**:
```
📦 Queue Batch: 10 messages
📊 Grouped into 5 (path, hour_bucket) combinations
✅ Aggregated: /api/health | 2025-10-16T06 | 10 events → 10 total requests
```

**D1 写入**:
```
📝 插入 10 条明细事件到 D1
✅ D1 明细事件插入完成
💾 批量 upsert 5 个聚合统计
✅ D1 批量聚合统计 upsert 完成
```

**KV 快照**:
```
🔄 触发 KV 快照刷新（异步）
📸 生成 KV 快照
✅ KV 快照生成完成
```

### 方法 2：部署到 Dev 环境测试
```bash
# 1. 创建 D1 数据库（如果还没有）
cd apps/api
bash scripts/setup-d1.sh

# 2. 部署到 dev 环境
npm run deploy:dev

# 3. 发送测试请求
for i in {1..100}; do
  curl https://your-dev-worker.workers.dev/api/health
done

# 4. 查看日志
npx wrangler tail --env dev

# 5. 查询 D1 数据
npx wrangler d1 execute path-stats-db --env dev \
  --command="SELECT * FROM path_stats_hourly LIMIT 10"

# 6. 查询 KV 快照
npx wrangler kv:key get "snapshot:latest" \
  --namespace-id <your-kv-id> --env dev
```

## 📈 预期数据

### D1 - traffic_events（明细表）
```sql
SELECT COUNT(*) FROM traffic_events;
-- 预期: ~50 条（去重后可能更少）

SELECT path, COUNT(*) as count 
FROM traffic_events 
GROUP BY path 
ORDER BY count DESC;
-- 预期: 5 个不同路径
```

### D1 - path_stats_hourly（聚合表）
```sql
SELECT path, hour_bucket, requests, errors 
FROM path_stats_hourly 
ORDER BY requests DESC 
LIMIT 5;
-- 预期: 
-- /api/health | 2025-10-16T06 | 12 | 0
-- /api/test   | 2025-10-16T06 | 14 | 14
-- ...
```

### KV - snapshot:config
```json
{
  "version": 1,
  "generatedAt": "2025-10-16T06:35:00.000Z",
  "pathsCount": 5,
  "hourRange": {
    "start": "2025-10-16T06",
    "end": "2025-10-16T06"
  }
}
```

### KV - snapshot:latest
```json
[
  {
    "path": "/api/health",
    "requests": 12,
    "errors": 0,
    "error_rate": 0,
    "avg_response_time": 15.5,
    "p50": 14,
    "p95": 20,
    "p99": 25,
    "unique_ips_min": 1
  },
  {
    "path": "/api/test",
    "requests": 14,
    "errors": 14,
    "error_rate": 100,
    ...
  },
  ...
]
```

## ✅ 成功标准

- [x] 所有测试请求成功发送（50/50）
- [ ] 队列消息被正确消费（查看日志）
- [ ] D1 明细表有数据写入
- [ ] D1 聚合表有统计数据
- [ ] KV 快照已生成并更新
- [ ] 无错误日志（除了预期的 404）

## 🚨 已知问题

### 1. 本地环境 D1/KV 查询限制
**问题**: `wrangler d1 execute --local` 和 `wrangler kv:key get --local` 命令在某些版本不支持

**解决方案**: 
- 方案 A: 依赖 wrangler dev 日志验证
- 方案 B: 部署到 dev 环境进行完整测试

### 2. Miniflare 持久化
**问题**: 本地开发环境重启后数据会丢失

**说明**: 这是预期行为，不影响生产环境

## 📝 下一步

### Phase 2 收尾
- [x] 本地测试执行
- [ ] 用户验证 wrangler dev 日志
- [ ] （可选）部署到 dev 环境验证

### Phase 3 准备
- [ ] 修改 `/paths` API 读取 KV 快照
- [ ] 实现 SWR 模式
- [ ] 灰度切换逻辑
- [ ] 下线旧 PathCollector DO

## 🎯 结论

**Phase 2 本地测试框架已就绪** ✅

测试脚本成功发送 50 个请求到 5 个不同路径，覆盖了主要的测试场景。现在需要：

1. **短期**：用户检查 wrangler dev 日志，验证数据流正常
2. **中期**：部署到 dev 环境进行完整的端到端测试
3. **长期**：进入 Phase 3，切换读取路径到 KV

---

**测试脚本位置**: 
- `apps/api/test-phase2-simple.sh` - 简化测试（推荐）
- `apps/api/test-phase2.sh` - 完整测试（需要 D1/KV 访问）

**运行命令**:
```bash
cd apps/api
bash test-phase2-simple.sh
```

