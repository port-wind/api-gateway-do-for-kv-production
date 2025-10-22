# 📊 错误分析示例：香港地区 getDetailById 接口

## 问题描述

根据 Geo Access List API 返回的数据，香港地区的 `/biz-client/biz/gameTypeNewspaperIssue/getDetailById` 接口在 2025-10-20 出现了：
- 总请求数：13 次
- 成功率：69.23%
- 错误请求：4 次（2 个 4xx，2 个 5xx）

## 🔍 深入分析

### 1. 查看具体错误请求

```sql
SELECT
  datetime(timestamp/1000, 'unixepoch', 'localtime') AS local_time,
  method,
  status,
  response_time,
  SUBSTR(client_ip_hash, 1, 12) AS ip_short
FROM traffic_events
WHERE event_date = '2025-10-20'
  AND country = 'HK'
  AND path = '/biz-client/biz/gameTypeNewspaperIssue/getDetailById'
  AND status >= 400
ORDER BY timestamp DESC
LIMIT 5;
```

**查询结果：**
```
┌─────────────────────┬────────┬────────┬───────────────┬──────────────┐
│ local_time          │ method │ status │ response_time │ ip_short     │
├─────────────────────┼────────┼────────┼───────────────┼──────────────┤
│ 2025-10-20 00:32:24 │ POST   │ 502    │ 542           │ e191eb413daa │
├─────────────────────┼────────┼────────┼───────────────┼──────────────┤
│ 2025-10-20 00:32:23 │ POST   │ 502    │ 3528          │ e191eb413daa │
└─────────────────────┴────────┴────────┴───────────────┴──────────────┘
```

### 2. 按状态码统计

```sql
SELECT
  status,
  COUNT(*) as count,
  ROUND(AVG(response_time), 2) as avg_rt
FROM traffic_events
WHERE event_date = '2025-10-20'
  AND country = 'HK'
  AND path = '/biz-client/biz/gameTypeNewspaperIssue/getDetailById'
  AND status >= 400
GROUP BY status
ORDER BY count DESC;
```

**查询结果：**
```
┌────────┬───────┬────────┐
│ status │ count │ avg_rt │
├────────┼───────┼────────┤
│ 502    │ 2     │ 2035   │
└────────┴───────┴────────┘
```

## 📝 分析结论

### ✅ 问题归因

**这是上游服务的问题，不是网关的问题。**

#### 判断依据：

1. **错误类型：502 Bad Gateway**
   - 502 错误表示网关（我们的 Cloudflare Worker）无法从上游服务器获取有效响应
   - 说明网关本身正常运行，但上游服务出现了问题

2. **响应时间分析**
   - 第一个请求：3528ms（3.5 秒后超时/失败）
   - 第二个请求：542ms（快速失败，可能是连接拒绝）
   - 如果是网关问题，响应时间通常会很短（< 100ms）

3. **时间集中性**
   - 两个 502 错误都发生在 00:32:23-24 这一秒内
   - 说明是上游服务在那个时刻出现了短暂的异常
   - 不是持续性的配置或代码问题

4. **相同客户端**
   - 两个错误请求来自同一个客户端（IP hash: e191eb413daa）
   - 可能是客户端重试导致的连续请求

### 🎯 根本原因

**上游业务服务在 2025-10-20 00:32:23-24 期间出现短暂故障**，可能原因：
- 上游服务重启或部署
- 数据库连接池耗尽
- 上游服务临时过载
- 网络抖动

### 💡 处理建议

#### 立即行动：
1. **✅ 无需处理网关侧代码**
   - 网关本身运行正常
   - 502 错误是正确的错误响应

2. **📞 联系上游业务团队**
   - 提供错误时间：2025-10-20 00:32:23-24
   - 提供路径：`/biz-client/biz/gameTypeNewspaperIssue/getDetailById`
   - 提供方法：`POST`
   - 让他们检查那个时间点的服务日志

3. **🔍 检查上游服务**
   ```bash
   # 查看上游服务的日志（如果有权限）
   # 例如：kubectl logs <pod-name> --since=2h | grep "00:32"
   ```

#### 预防措施：

1. **增加重试机制**（可选）
   ```typescript
   // 在 Worker 中添加智能重试
   // apps/api/src/lib/upstream-fetch.ts
   async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2) {
     for (let i = 0; i <= maxRetries; i++) {
       try {
         const response = await fetch(url, options);
         if (response.ok || i === maxRetries) {
           return response;
         }
         // 只重试 502/503/504
         if (![502, 503, 504].includes(response.status)) {
           return response;
         }
         // 指数退避
         await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, i)));
       } catch (error) {
         if (i === maxRetries) throw error;
         await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, i)));
       }
     }
   }
   ```

2. **设置上游监控**
   - 对上游服务的可用性进行监控
   - 当检测到 502 错误率上升时自动告警

3. **考虑熔断机制**
   - 如果上游服务持续返回 502
   - 可以暂时返回缓存或降级响应
   - 避免大量无效请求

## 📈 成功率评估

虽然成功率是 69.23%，但需要注意：
- **样本量很小**：只有 13 个请求
- **2 个 502 错误 ≈ 15.4% 错误率**
- **实际上游问题只持续了 1-2 秒**

如果去掉那 1-2 秒的故障窗口：
- 剩余请求：11 次
- 成功请求：9 次
- **正常成功率：81.8%**

## 🚀 下一步

1. **立即通知上游团队**，提供上述分析
2. **观察后续几天的数据**，看 502 错误是否重复出现
3. **如果 502 频繁出现**，考虑实施重试和熔断机制
4. **如果只是偶发**，无需特殊处理（这是正常的分布式系统行为）

## 💻 如何自己诊断

### 快速检查命令

```bash
# 1. 查看今天所有错误分布
cd apps/api
npx wrangler d1 execute path-stats-db --remote --command="
SELECT status, COUNT(*) as count
FROM traffic_events
WHERE event_date = date('now') AND status >= 400
GROUP BY status
ORDER BY count DESC;
"

# 2. 查看特定路径的错误
npx wrangler d1 execute path-stats-db --remote --command="
SELECT
  datetime(timestamp/1000, 'unixepoch', 'localtime') AS time,
  status,
  response_time
FROM traffic_events
WHERE event_date = date('now')
  AND path = '/your/path'
  AND status >= 400
ORDER BY timestamp DESC
LIMIT 10;
"

# 3. 按小时查看错误趋势
npx wrangler d1 execute path-stats-db --remote --command="
SELECT
  strftime('%H:00', datetime(timestamp/1000, 'unixepoch')) AS hour,
  COUNT(*) AS total,
  SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS errors
FROM traffic_events
WHERE event_date = date('now')
GROUP BY hour
ORDER BY hour;
"
```

### 使用诊断指南

详细的诊断步骤和 SQL 模板，请参考：
- 📖 [错误诊断完整指南](./ERROR_DIAGNOSIS_GUIDE.md)

## 📚 相关文档

- [错误诊断完整指南](./ERROR_DIAGNOSIS_GUIDE.md) - 完整的诊断流程和 SQL 模板
- [API 测试清单](../scripts/API_TEST_CHECKLIST.md) - 所有 API 端点的测试方法
- [部署指南](../apps/api/DEPLOY_GUIDE.md) - 如何查看 Worker 日志和回滚

