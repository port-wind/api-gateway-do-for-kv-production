# 🚀 优化实施指南 - 渐进式 Rollout

## 总览

本指南提供详细的分阶段实施计划，确保安全、可控地部署性能优化。

---

## 📋 前置检查

### 1. 环境准备

```bash
# 1. 确保已添加性能索引
wrangler d1 execute DB --file=migrations/0009_performance_indexes.sql --env test

# 2. 验证 Queue 配置
wrangler queues list

# 3. 检查 KV 命名空间
wrangler kv:namespace list
```

### 2. 基准测试

```bash
cd apps/api

# 记录当前性能基准
./scripts/quick-proxy-benchmark.sh > baseline_before.txt

# 记录详细指标
node scripts/benchmark-proxy-vs-direct.js > baseline_detailed.txt
```

### 3. 备份配置

```bash
# 备份当前路由配置
wrangler kv:key get proxy_routes --namespace-id YOUR_KV_ID > backup_routes.json

# 备份 IP 黑名单
wrangler d1 execute DB --command "SELECT * FROM ip_monitor WHERE status='banned'" > backup_banned_ips.sql
```

---

## 🎯 阶段 1：基础设施准备（第 1 天）

### 目标
- 部署新代码但不启用
- 配置 Feature Flags
- 验证基础功能

### 步骤

#### 1.1 部署代码

```bash
# 部署到测试环境
npm run deploy --env test

# 验证部署
curl https://your-test-worker.workers.dev/api/health
```

#### 1.2 配置 Feature Flags（全部关闭）

```bash
# 创建初始配置（所有优化关闭）
wrangler kv:key put optimization_flags \
  --namespace-id YOUR_KV_ID \
  '{"enableRouteCache":false,"enableIpBlacklistCache":false,"enableGeoRulesCache":false,"enableAsyncRecording":false,"enableParallelExecution":false}'

# 验证配置
curl https://your-test-worker.workers.dev/api/admin/optimization/flags
```

#### 1.3 测试基础功能

```bash
# 测试管理 API
curl -X POST https://your-test-worker.workers.dev/api/admin/optimization/cache/refresh

# 测试即时封禁
curl -X POST https://your-test-worker.workers.dev/api/admin/optimization/ip/ban \
  -H "Content-Type: application/json" \
  -d '{"ip":"1.2.3.4","reason":"test"}'

# 验证封禁生效
curl -X GET https://your-test-worker.workers.dev/api/admin/ip-monitor/1.2.3.4
```

#### 1.4 验证 Fallback

```bash
# 所有 flags 关闭，应该走原有逻辑
./scripts/quick-proxy-benchmark.sh > phase1_test.txt

# 对比基准
diff baseline_before.txt phase1_test.txt

# 应该没有显著差异（说明 fallback 正常）
```

**成功标准：**
- ✅ 代码部署成功
- ✅ Flags API 可访问
- ✅ 性能与基准一致（fallback 正常）
- ✅ 管理 API 功能正常

---

## 🎯 阶段 2：启用路由缓存（第 2-3 天）

### 目标
- 启用最安全的优化（路由缓存）
- 验证缓存机制和刷新逻辑
- 预期效果：-15~20ms

### 步骤

#### 2.1 启用路由缓存

```bash
# 更新 flags（只启用路由缓存）
curl -X PUT https://your-test-worker.workers.dev/api/admin/optimization/flags \
  -H "Content-Type: application/json" \
  -d '{"enableRouteCache":true}'

# 预热缓存
curl -X POST https://your-test-worker.workers.dev/api/admin/optimization/warmup
```

#### 2.2 性能测试

```bash
# 等待缓存预热（1分钟）
sleep 60

# 测试性能
./scripts/quick-proxy-benchmark.sh > phase2_with_cache.txt

# 对比
echo "=== 性能对比 ===" 
echo "基准: $(grep '总时间' baseline_before.txt)"
echo "优化后: $(grep '总时间' phase2_with_cache.txt)"
```

#### 2.3 功能测试

```bash
# 测试路由匹配
curl https://your-test-worker.workers.dev/biz-client/test

# 更新路由配置
# (通过 admin API 或直接修改 KV)

# 手动刷新缓存
curl -X POST https://your-test-worker.workers.dev/api/admin/optimization/cache/routes/refresh

# 验证新配置生效
curl https://your-test-worker.workers.dev/new-route
```

#### 2.4 冷启动测试

```bash
# 触发 Worker 重启（通过部署或等待自动回收）
npm run deploy --env test

# 立即测试（冷启动）
time curl https://your-test-worker.workers.dev/biz-client/test

# 第二次请求（缓存命中）
time curl https://your-test-worker.workers.dev/biz-client/test

# 应该看到第二次更快
```

#### 2.5 监控 24 小时

```bash
# 查看实时日志
wrangler tail --format pretty | grep -E "RouteCache|performance"

# 每小时测试一次
for i in {1..24}; do
  ./scripts/quick-proxy-benchmark.sh >> phase2_monitoring.log
  sleep 3600
done
```

**成功标准：**
- ✅ 性能提升 15-20ms
- ✅ 路由匹配功能正常
- ✅ 缓存刷新机制有效
- ✅ 冷启动处理正常
- ✅ 24 小时稳定运行

**如果失败：**
```bash
# 立即回退
curl -X PUT https://your-test-worker.workers.dev/api/admin/optimization/flags \
  -H "Content-Type: application/json" \
  -d '{"enableRouteCache":false}'
```

---

## 🎯 阶段 3：启用 IP 黑名单缓存（第 4-5 天）

### 目标
- 启用 IP 黑名单缓存
- 验证封禁逻辑和同步机制
- 预期效果：累计 -35~40ms

### 步骤

#### 3.1 启用 IP 缓存

```bash
curl -X PUT https://your-test-worker.workers.dev/api/admin/optimization/flags \
  -H "Content-Type: application/json" \
  -d '{"enableRouteCache":true,"enableIpBlacklistCache":true}'

# 预热
curl -X POST https://your-test-worker.workers.dev/api/admin/optimization/warmup
```

#### 3.2 功能测试

```bash
# 1. 测试封禁
curl -X POST https://your-test-worker.workers.dev/api/admin/optimization/ip/ban \
  -H "Content-Type: application/json" \
  -d '{"ip":"1.2.3.4","reason":"test ban"}'

# 2. 立即验证（应该被拒绝）
curl -H "X-Forwarded-For: 1.2.3.4" https://your-test-worker.workers.dev/test
# 预期: 403 Forbidden

# 3. 测试增量同步
# 在 D1 中直接添加封禁 IP
wrangler d1 execute DB --command \
  "INSERT INTO ip_monitor (ip, status, updated_at) VALUES ('5.6.7.8', 'banned', datetime('now'))"

# 等待同步（5秒）
sleep 6

# 验证新封禁生效
curl -H "X-Forwarded-For: 5.6.7.8" https://your-test-worker.workers.dev/test
# 预期: 403 Forbidden
```

#### 3.3 性能测试

```bash
./scripts/quick-proxy-benchmark.sh > phase3_with_ip_cache.txt

# 对比
echo "=== 累计优化效果 ===" 
echo "基准: $(grep '总时间' baseline_before.txt)"
echo "阶段3: $(grep '总时间' phase3_with_ip_cache.txt)"
```

**成功标准：**
- ✅ 性能累计提升 35-40ms
- ✅ 即时封禁功能正常
- ✅ 增量同步正常（5秒内生效）
- ✅ 已封禁 IP 立即拦截

---

## 🎯 阶段 4：启用并行执行（第 6-7 天）

### 目标
- 并行化独立查询
- 预期效果：累计 -55~70ms

### 步骤

```bash
curl -X PUT https://your-test-worker.workers.dev/api/admin/optimization/flags \
  -H "Content-Type: application/json" \
  -d '{"enableRouteCache":true,"enableIpBlacklistCache":true,"enableGeoRulesCache":true,"enableParallelExecution":true}'
```

**测试重点：**
- 并发场景
- 错误处理
- 性能提升

---

## 🎯 阶段 5：启用异步记录（第 8-10 天）

### 目标
- 最大性能提升
- 确保数据完整性
- 预期效果：累计 -80~100ms

### 步骤

#### 5.1 验证队列配置

```bash
# 检查队列状态
wrangler queues list

# 查看队列消费者
wrangler queues consumer list TRAFFIC_QUEUE
```

#### 5.2 启用异步记录

```bash
curl -X PUT https://your-test-worker.workers.dev/api/admin/optimization/flags \
  -H "Content-Type: application/json" \
  -d '{"enableRouteCache":true,"enableIpBlacklistCache":true,"enableGeoRulesCache":true,"enableParallelExecution":true,"enableAsyncRecording":true}'
```

#### 5.3 数据一致性测试

```bash
# 发送 100 个请求
for i in {1..100}; do
  curl https://your-test-worker.workers.dev/test-path &
done
wait

# 等待队列处理（30秒）
sleep 30

# 验证数据完整性
wrangler d1 execute DB --command \
  "SELECT COUNT(*) as total FROM traffic_events WHERE timestamp > datetime('now', '-5 minutes')"
# 预期: 接近 100 条

# 检查失败队列
curl https://your-test-worker.workers.dev/api/admin/optimization/recording/stats
```

**成功标准：**
- ✅ 性能累计提升 80-100ms
- ✅ 数据完整性 > 99%
- ✅ 队列无堆积
- ✅ Dashboard 数据正常

---

## 🎯 阶段 6：生产环境 Rollout（第 11-14 天）

### 策略：金丝雀发布

#### 6.1 部署到生产（Flags 关闭）

```bash
npm run deploy --env production

# 验证
curl https://api-proxy.pwtk.cc/api/admin/optimization/health
```

#### 6.2 渐进式启用

**Day 1：** 启用路由缓存
```bash
curl -X PUT https://api-proxy.pwtk.cc/api/admin/optimization/flags \
  -d '{"enableRouteCache":true}'
```

**Day 2：** 启用 IP 缓存
```bash
curl -X PUT https://api-proxy.pwtk.cc/api/admin/optimization/flags \
  -d '{"enableRouteCache":true,"enableIpBlacklistCache":true}'
```

**Day 3：** 启用并行执行
```bash
curl -X PUT https://api-proxy.pwtk.cc/api/admin/optimization/flags \
  -d '{"enableRouteCache":true,"enableIpBlacklistCache":true,"enableParallelExecution":true}'
```

**Day 4：** 启用异步记录
```bash
curl -X PUT https://api-proxy.pwtk.cc/api/admin/optimization/flags \
  -d '{"enableRouteCache":true,"enableIpBlacklistCache":true,"enableGeoRulesCache":true,"enableParallelExecution":true,"enableAsyncRecording":true}'
```

---

## 📊 监控指标

### 关键指标

1. **性能指标**
   ```bash
   # 实时监控
   wrangler tail | grep "x-performance-total"
   
   # P95 延迟
   # 目标: < 100ms
   ```

2. **成功率**
   ```bash
   # 请求成功率
   # 目标: > 99.9%
   
   # 队列成功率
   curl /api/admin/optimization/recording/stats
   # 目标: > 99.5%
   ```

3. **缓存命中率**
   ```bash
   # 路由缓存命中率
   # 目标: > 95%
   
   # IP 缓存命中率
   # 目标: > 90%
   ```

4. **数据完整性**
   ```bash
   # 对比队列发送数 vs D1 写入数
   # 目标: 差异 < 1%
   ```

---

## 🚨 Rollback 计划

### 快速回退

```bash
# 关闭所有优化
curl -X PUT https://api-proxy.pwtk.cc/api/admin/optimization/flags \
  -H "Content-Type: application/json" \
  -d '{"enableRouteCache":false,"enableIpBlacklistCache":false,"enableGeoRulesCache":false,"enableAsyncRecording":false,"enableParallelExecution":false}'

# 验证
./scripts/quick-proxy-benchmark.sh

# 应该恢复到基准性能
```

### 回退到特定版本

```bash
# 重新部署旧版本
git checkout <previous-commit>
npm run deploy --env production
```

### 数据恢复

```bash
# 恢复路由配置
wrangler kv:key put proxy_routes \
  --namespace-id YOUR_KV_ID \
  --path backup_routes.json

# 恢复 IP 黑名单
wrangler d1 execute DB --file backup_banned_ips.sql
```

---

## ✅ 验收标准

### 最终目标

- ✅ P50 延迟: < 90ms (vs 基准 212ms)
- ✅ P95 延迟: < 130ms (vs 基准 ~300ms)
- ✅ P99 延迟: < 180ms (vs 基准 ~400ms)
- ✅ 成功率: > 99.9%
- ✅ 数据完整性: > 99.5%
- ✅ 所有功能正常
- ✅ 安全检查实时

### 功能验证

- ✅ IP 封禁实时生效
- ✅ 地区限制正常
- ✅ 路径统计完整
- ✅ Dashboard 数据正常
- ✅ 限流功能正常

---

## 📞 应急联系

### 问题分类

1. **性能下降** → 检查 flags，逐个关闭
2. **功能异常** → 检查 fallback，启用同步模式
3. **数据丢失** → 检查队列状态，启用 fallback
4. **缓存不一致** → 手动刷新缓存

### 调试命令

```bash
# 查看实时日志
wrangler tail --format pretty

# 查看错误日志
wrangler tail | grep -i error

# 检查队列状态
wrangler queues consumer list TRAFFIC_QUEUE

# 查看 flags 状态
curl /api/admin/optimization/flags

# 刷新所有缓存
curl -X POST /api/admin/optimization/cache/refresh
```

---

## 📝 总结

**预期效果：**
- 性能提升：212ms → 70-90ms (67% 提升)
- 功能保留：100%
- 安全性：不降低
- 可靠性：> 99.9%

**关键成功因素：**
1. ✅ 渐进式 rollout
2. ✅ Feature flags 控制
3. ✅ Fallback 机制
4. ✅ 完善监控
5. ✅ 快速回退能力

按这个计划执行，可以安全、可控地完成性能优化！🚀

