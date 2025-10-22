# 🔍 错误诊断完整指南

## 快速判断：是网关问题还是业务问题？

### 1. 按状态码分类

```bash
# 查看错误分布（今天）
cd apps/api
npx wrangler d1 execute path-stats-db --remote --command="
SELECT
  CASE
    WHEN status BETWEEN 400 AND 499 THEN '4xx-客户端错误'
    WHEN status >= 500 THEN '5xx-服务器错误'
  END AS error_type,
  status,
  COUNT(*) AS count,
  ROUND(AVG(response_time), 2) AS avg_response_time
FROM traffic_events
WHERE event_date = date('now')
  AND status >= 400
GROUP BY error_type, status
ORDER BY count DESC;
"
```

**判断标准：**
- **4xx 错误** (400-499)：
  - 通常是**业务逻辑问题**
  - 403: 权限不足
  - 404: 资源不存在
  - 422: 参数验证失败
  - 429: 被限流（可能是我们的限流规则）
  
- **5xx 错误** (500-599)：
  - 可能是**网关或上游问题**
  - 500: 上游服务内部错误
  - 502/504: 网关无法连接上游或超时
  - 503: 服务不可用

### 2. 查看具体错误请求（以香港地区为例）

```bash
# 查看香港地区某个路径的所有错误
npx wrangler d1 execute path-stats-db --remote --command="
SELECT
  datetime(timestamp/1000, 'unixepoch', 'localtime') AS local_time,
  path,
  method,
  status,
  response_time,
  country,
  client_ip_hash,
  SUBSTR(user_agent, 1, 50) AS user_agent_short
FROM traffic_events
WHERE event_date = '2025-10-20'
  AND country = 'HK'
  AND path = '/biz-client/biz/gameTypeNewspaperIssue/getDetailById'
  AND status >= 400
ORDER BY timestamp DESC
LIMIT 20;
"
```

### 3. 按小时分析错误趋势

```bash
# 查看错误是否集中在某个时间段
npx wrangler d1 execute path-stats-db --remote --command="
SELECT
  strftime('%H:00', datetime(timestamp/1000, 'unixepoch')) AS hour,
  COUNT(*) AS total_requests,
  SUM(CASE WHEN status BETWEEN 400 AND 499 THEN 1 ELSE 0 END) AS count_4xx,
  SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) AS count_5xx,
  ROUND(AVG(response_time), 2) AS avg_rt,
  ROUND(100.0 * SUM(CASE WHEN status < 400 THEN 1 ELSE 0 END) / COUNT(*), 2) AS success_rate
FROM traffic_events
WHERE event_date = '2025-10-20'
  AND country = 'HK'
  AND path = '/biz-client/biz/gameTypeNewspaperIssue/getDetailById'
GROUP BY hour
ORDER BY hour;
"
```

**判断标准：**
- 如果错误**集中在某个时间段**：可能是那个时间上游服务异常
- 如果错误**分散在全天**：可能是代码逻辑问题或配置问题
- 如果某个小时**5xx 激增**：立即检查上游服务日志

### 4. 按边缘节点分析

```bash
# 检查是否某个 CDN 节点有问题
npx wrangler d1 execute path-stats-db --remote --command="
SELECT
  country,
  COUNT(*) AS total_requests,
  SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS errors,
  ROUND(100.0 * SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) / COUNT(*), 2) AS error_rate,
  ROUND(AVG(response_time), 2) AS avg_rt
FROM traffic_events
WHERE event_date = '2025-10-20'
GROUP BY country
HAVING errors > 0
ORDER BY error_rate DESC
LIMIT 10;
"
```

## 📋 完整诊断流程

### 步骤 1：快速概览

```bash
# 今天的整体错误率
npx wrangler d1 execute path-stats-db --remote --command="
SELECT
  COUNT(*) AS total_requests,
  SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS total_errors,
  ROUND(100.0 * SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) / COUNT(*), 2) AS error_rate,
  SUM(CASE WHEN status BETWEEN 400 AND 499 THEN 1 ELSE 0 END) AS errors_4xx,
  SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) AS errors_5xx
FROM traffic_events
WHERE event_date = date('now');
"
```

### 步骤 2：定位问题路径

```bash
# 找出错误率最高的路径
npx wrangler d1 execute path-stats-db --remote --command="
SELECT
  path,
  COUNT(*) AS total_requests,
  SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS total_errors,
  ROUND(100.0 * SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) / COUNT(*), 2) AS error_rate,
  SUM(CASE WHEN status BETWEEN 400 AND 499 THEN 1 ELSE 0 END) AS errors_4xx,
  SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) AS errors_5xx
FROM traffic_events
WHERE event_date = date('now')
GROUP BY path
HAVING total_errors > 0
ORDER BY error_rate DESC
LIMIT 10;
"
```

### 步骤 3：查看具体错误（替换 PATH 为实际路径）

```bash
# 查看具体的错误请求
npx wrangler d1 execute path-stats-db --remote --command="
SELECT
  datetime(timestamp/1000, 'unixepoch', 'localtime') AS time,
  status,
  response_time,
  country,
  SUBSTR(client_ip_hash, 1, 12) AS ip_short
FROM traffic_events
WHERE event_date = date('now')
  AND path = '/your/path/here'
  AND status >= 400
ORDER BY timestamp DESC
LIMIT 30;
"
```

## 🔧 问题来了怎么办？

### 场景 1：发现大量 4xx 错误

**原因分析：**
```bash
# 查看具体的 4xx 状态码分布
npx wrangler d1 execute path-stats-db --remote --command="
SELECT
  status,
  COUNT(*) AS count,
  path
FROM traffic_events
WHERE event_date = date('now')
  AND status BETWEEN 400 AND 499
GROUP BY status, path
ORDER BY count DESC
LIMIT 20;
"
```

**处理方案：**
- **403 Forbidden**: 检查权限配置、IP 黑名单、地理位置规则
- **404 Not Found**: 检查路由配置，可能是路径配置错误
- **422 Unprocessable**: 业务验证失败，需要业务方排查
- **429 Too Many Requests**: 检查限流配置是否过严

### 场景 2：发现大量 5xx 错误

**原因分析：**
```bash
# 查看 5xx 错误的响应时间分布
npx wrangler d1 execute path-stats-db --remote --command="
SELECT
  status,
  COUNT(*) AS count,
  ROUND(AVG(response_time), 2) AS avg_rt,
  ROUND(MIN(response_time), 2) AS min_rt,
  ROUND(MAX(response_time), 2) AS max_rt
FROM traffic_events
WHERE event_date = date('now')
  AND status >= 500
GROUP BY status
ORDER BY count DESC;
"
```

**判断标准：**
- **响应时间很短 (< 100ms)** → 可能是网关层面的错误
- **响应时间很长 (> 10s)** → 可能是上游超时
- **响应时间正常** → 可能是上游业务逻辑错误

**处理方案：**
1. **立即检查 Worker 日志：**
   ```bash
   npx wrangler tail --env production
   ```

2. **检查上游服务状态：**
   - 查看上游服务的监控和日志
   - 确认上游服务是否正常运行
   - 检查网络连接是否正常

3. **临时措施：**
   - 如果是特定路径问题，可以临时禁用或降级
   - 增加重试机制
   - 启用缓存降低上游压力

### 场景 3：成功率突然下降

**快速诊断：**
```bash
# 对比今天和昨天的情况
npx wrangler d1 execute path-stats-db --remote --command="
SELECT
  event_date,
  COUNT(*) AS total_requests,
  ROUND(100.0 * SUM(CASE WHEN status < 400 THEN 1 ELSE 0 END) / COUNT(*), 2) AS success_rate,
  ROUND(AVG(response_time), 2) AS avg_rt
FROM traffic_events
WHERE event_date >= date('now', '-1 day')
GROUP BY event_date
ORDER BY event_date DESC;
"
```

**处理步骤：**
1. 确认是否刚部署了新代码
2. 检查是否修改了配置（限流、地理位置等）
3. 查看是否有大量新 IP 访问（可能是攻击）
4. 必要时**立即回滚**

## 🚨 应急响应清单

### 紧急情况处理流程

1. **✅ 确认影响范围**
   - 是所有用户还是特定地区？
   - 是所有接口还是特定路径？
   - 错误率是多少？

2. **✅ 快速止损**
   - 如果是代码问题 → 立即回滚
   - 如果是配置问题 → 修改配置
   - 如果是上游问题 → 联系上游团队

3. **✅ 通知相关人员**
   - 通知业务方
   - 上报运维团队
   - 记录事件时间线

4. **✅ 收集证据**
   - 保存错误日志查询结果
   - 截图监控数据
   - 记录操作步骤

5. **✅ 事后分析**
   - 根因分析
   - 改进措施
   - 更新文档和监控

## 📊 常用查询模板

### 模板 1：查询特定路径的所有错误

```bash
export DATE="2025-10-20"
export PATH="/your/path/here"

npx wrangler d1 execute path-stats-db --remote --command="
SELECT
  datetime(timestamp/1000, 'unixepoch', 'localtime') AS time,
  method,
  status,
  response_time,
  country,
  client_ip_hash
FROM traffic_events
WHERE event_date = '$DATE'
  AND path = '$PATH'
  AND status >= 400
ORDER BY timestamp DESC
LIMIT 50;
"
```

### 模板 2：查询特定 IP 的请求历史

```bash
export IP_HASH="your-ip-hash"

npx wrangler d1 execute path-stats-db --remote --command="
SELECT
  datetime(timestamp/1000, 'unixepoch', 'localtime') AS time,
  path,
  method,
  status,
  response_time
FROM traffic_events
WHERE event_date >= date('now', '-7 days')
  AND client_ip_hash = '$IP_HASH'
ORDER BY timestamp DESC
LIMIT 100;
"
```

### 模板 3：查询慢请求

```bash
# 查询响应时间超过 5 秒的请求
npx wrangler d1 execute path-stats-db --remote --command="
SELECT
  datetime(timestamp/1000, 'unixepoch', 'localtime') AS time,
  path,
  method,
  status,
  response_time,
  country
FROM traffic_events
WHERE event_date = date('now')
  AND response_time > 5000
ORDER BY response_time DESC
LIMIT 50;
"
```

## 🔗 相关资源

- **Cloudflare Worker 日志**: `npx wrangler tail --env production`
- **数据库迁移状态**: `npx wrangler d1 migrations list path-stats-db`
- **API 测试脚本**: `./scripts/test-all-apis.sh`

## 💡 预防措施

1. **设置监控告警**
   - 成功率低于 95% 时告警
   - 5xx 错误率超过 1% 时告警
   - 平均响应时间超过 2s 时告警

2. **定期检查**
   - 每天查看错误趋势
   - 每周分析 top 错误路径
   - 每月回顾事故和改进

3. **完善日志**
   - 在 Worker 中记录更多上下文
   - 添加 Request ID 追踪
   - 记录上游响应详情

4. **自动化**
   - 将常用查询做成脚本
   - 设置定时任务监控
   - 自动生成日报/周报

