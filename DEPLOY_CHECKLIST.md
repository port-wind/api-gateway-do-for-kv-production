# 部署检查清单 - 路由缓存优化

## ✅ Pre-Deploy 验证（已完成）

- [x] TypeScript 类型检查通过
- [x] 单元测试通过
- [x] 本地功能测试通过（`scripts/debug-404.sh`）
- [x] 404 Bug 修复已验证
- [x] 代码已提交（`0f79721`）

## 📝 部署步骤

### Stage 1: Dev 环境验证

```bash
cd apps/api

# 1. 部署到 Dev
npm run deploy:dev

# 2. 基础健康检查
curl https://api-gateway-do-for-kv-dev.andy-zhan.workers.dev/api/health

# 3. 测试代理功能（未启用缓存）
curl https://api-gateway-do-for-kv-dev.andy-zhan.workers.dev/biz-client/biz/relationship/batch-get \
  -H 'businesstype: XTK' \
  -H 'cid: test' \
  -H 'clienttype: C_WEB' \
  -H 'content-type: application/json' \
  --data-raw '{"targetUserIdList":["1419717728603737560"],"direct":1}' \
  -w '\n状态码: %{http_code}\n'

# 预期：状态码 200，正常返回数据
```

**验证点：**
- [ ] 健康检查返回 200
- [ ] 代理请求返回 200
- [ ] 响应数据正确
- [ ] 无错误日志

### Stage 2: 启用路由缓存（Dev）

```bash
# 启用路由缓存优化
curl -X PUT https://api-gateway-do-for-kv-dev.andy-zhan.workers.dev/api/admin/optimization/flags \
  -H "Content-Type: application/json" \
  -d '{
    "enableRouteCache": true,
    "enableIpBlacklistCache": false,
    "enableGeoRulesCache": false,
    "enableAsyncRecording": false,
    "enableParallelExecution": false
  }'

# 测试缓存功能
for i in {1..5}; do
  echo "测试 $i:"
  curl https://api-gateway-do-for-kv-dev.andy-zhan.workers.dev/biz-client/biz/relationship/batch-get \
    -H 'businesstype: XTK' \
    -H 'cid: test' \
    -H 'clienttype: C_WEB' \
    -H 'content-type: application/json' \
    --data-raw '{"targetUserIdList":["1419717728603737560"],"direct":1}' \
    -w 'TTFB: %{time_starttransfer}s\n' \
    -o /dev/null -s
  sleep 1
done
```

**验证点：**
- [ ] 第一次请求：`[RouteCache] Starting warmup...`
- [ ] 后续请求：`[RouteCache HIT]` 或正常 fallback
- [ ] 所有请求返回 200
- [ ] TTFB 有改善（预期：~150ms → ~100ms）

### Stage 3: Test（生产）部署

**⚠️ 仅在 Dev 环境验证通过后进行**

```bash
# 1. 部署到 Test（生产）
npm run deploy:direct

# 2. 验证基础功能（缓存默认关闭）
curl https://api-proxy.pwtk.cc/biz-client/biz/relationship/batch-get \
  -H 'businesstype: XTK' \
  -H 'cid: test' \
  -H 'clienttype: C_WEB' \
  -H 'content-type: application/json' \
  --data-raw '{"targetUserIdList":["1419717728603737560"],"direct":1}' \
  -w '\n状态码: %{http_code}\n'
```

**验证点：**
- [ ] 状态码 200
- [ ] 响应数据正确
- [ ] 现有功能不受影响

### Stage 4: 渐进式启用优化（生产）

#### 4.1 启用路由缓存（最安全）

```bash
curl -X PUT https://api-proxy.pwtk.cc/api/admin/optimization/flags \
  -H "Content-Type: application/json" \
  -d '{
    "enableRouteCache": true,
    "enableIpBlacklistCache": false,
    "enableGeoRulesCache": false,
    "enableAsyncRecording": false,
    "enableParallelExecution": false
  }'
```

**观察期：15-30分钟**
- [ ] 错误率未上升
- [ ] 响应时间有改善
- [ ] 无 404 错误

#### 4.2 启用 IP 黑名单缓存

```bash
curl -X PUT https://api-proxy.pwtk.cc/api/admin/optimization/flags \
  -H "Content-Type: application/json" \
  -d '{
    "enableRouteCache": true,
    "enableIpBlacklistCache": true,
    "enableGeoRulesCache": false,
    "enableAsyncRecording": false,
    "enableParallelExecution": false
  }'
```

**观察期：15-30分钟**
- [ ] IP 封禁功能正常
- [ ] 无误封/漏封

#### 4.3 启用地区规则缓存

```bash
curl -X PUT https://api-proxy.pwtk.cc/api/admin/optimization/flags \
  -H "Content-Type: application/json" \
  -d '{
    "enableRouteCache": true,
    "enableIpBlacklistCache": true,
    "enableGeoRulesCache": true,
    "enableAsyncRecording": false,
    "enableParallelExecution": false
  }'
```

**观察期：15-30分钟**
- [ ] 地区封禁功能正常

#### 4.4 启用并行执行

```bash
curl -X PUT https://api-proxy.pwtk.cc/api/admin/optimization/flags \
  -H "Content-Type: application/json" \
  -d '{
    "enableRouteCache": true,
    "enableIpBlacklistCache": true,
    "enableGeoRulesCache": true,
    "enableAsyncRecording": false,
    "enableParallelExecution": true
  }'
```

**观察期：15-30分钟**
- [ ] 性能进一步提升
- [ ] 无功能异常

#### 4.5 启用异步记录（可选，最后）

```bash
curl -X PUT https://api-proxy.pwtk.cc/api/admin/optimization/flags \
  -H "Content-Type: application/json" \
  -d '{
    "enableRouteCache": true,
    "enableIpBlacklistCache": true,
    "enableGeoRulesCache": true,
    "enableAsyncRecording": true,
    "enableParallelExecution": true
  }'
```

**观察期：30-60分钟**
- [ ] 统计数据完整性
- [ ] 队列消费正常

## 🔙 回滚方案

### 快速回滚（关闭 Feature Flags）

```bash
# 立即关闭所有优化
curl -X PUT https://api-proxy.pwtk.cc/api/admin/optimization/flags \
  -H "Content-Type: application/json" \
  -d '{
    "enableRouteCache": false,
    "enableIpBlacklistCache": false,
    "enableGeoRulesCache": false,
    "enableAsyncRecording": false,
    "enableParallelExecution": false
  }'
```

### 代码回滚（如果需要）

```bash
# 回滚到之前的版本
git revert 0f79721
npm run deploy:direct
```

## 📊 性能目标

### 当前基线（未优化）
- 代理 P50: ~350ms
- 代理 P95: ~450ms

### 目标（全部优化启用）
- 代理 P50: ~100ms（↓71%）
- 代理 P95: ~150ms（↓67%）

### 阶段性目标

| 优化阶段 | 预期 P50 | 预期改善 |
|---------|----------|----------|
| 仅路由缓存 | ~320ms | ↓9% |
| +IP缓存 | ~280ms | ↓20% |
| +地区缓存 | ~250ms | ↓29% |
| +并行执行 | ~150ms | ↓57% |
| +异步记录 | ~100ms | ↓71% |

## 📝 注意事项

1. **每次启用新优化后都要观察一段时间**
2. **优先关注错误率，其次是性能**
3. **保持 wrangler tail 监控开启**
4. **记录每个阶段的性能指标**
5. **发现问题立即关闭对应 Feature Flag**

## ✅ 完成标准

所有优化启用后：
- [ ] 错误率 < 0.1%
- [ ] P50 < 150ms
- [ ] P95 < 250ms
- [ ] 所有功能正常
- [ ] 稳定运行 24 小时

---

**创建时间**: 2025-10-18  
**最后更新**: 2025-10-18  
**相关文档**:
- `BUG_FIX_404.md` - 404 问题修复
- `docs/OPTIMIZED_PROXY_PLAN.md` - 优化方案
- `docs/IMPLEMENTATION_GUIDE.md` - 实施指南

