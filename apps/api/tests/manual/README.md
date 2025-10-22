# 缓存优化功能测试指南

## 概述

本目录包含三个关键的缓存优化测试：

1. **test-swr-mechanism.sh** - 测试 Stale-While-Revalidate (SWR) 机制
2. **test-cache-breakdown-protection.sh** - 测试缓存击穿防护（最重要）
3. **test-cache-warmup.sh** - 测试缓存预热功能

## 测试前准备

### 1. 启动 API 服务

```bash
# 进入 API 目录
cd apps/api

# 启动开发服务器
npm run dev

# 等待服务启动完成，看到类似输出：
# ⎔ Starting local server...
# [wrangler:inf] Ready on http://localhost:8787
```

### 2. 验证服务可用

在另一个终端执行：

```bash
curl -s "http://localhost:8787/api/admin/paths?limit=1" | jq '.success'
# 应该返回: true
```

## 运行测试

### 方式一：运行所有测试（推荐）

```bash
cd apps/api/tests/manual
./run-all-cache-tests.sh
```

这将依次运行所有三个测试，并生成详细报告。

### 方式二：单独运行测试

#### 测试 1：SWR 机制

```bash
cd apps/api/tests/manual
./test-swr-mechanism.sh
```

**测试内容**：
- ✅ 缓存过期后返回 STALE 状态
- ✅ 立即返回过期缓存（不等待后端）
- ✅ 后台异步刷新缓存
- ✅ 响应头正确标记（X-Cache-Status: STALE, X-Cache-Stale: true）
- ✅ 下次请求获取新缓存

**预期结果**：
- TTL 过期后，第一个请求返回 STALE（响应时间 < 100ms）
- 等待 3 秒后，再次请求返回 HIT（缓存已刷新）

#### 测试 2：缓存击穿防护（最重要！）

```bash
cd apps/api/tests/manual
./test-cache-breakdown-protection.sh
```

**测试内容**：
- ✅ 并发 20 个请求同时访问过期缓存
- ✅ 只有第一个请求触发后台刷新
- ✅ 后续请求检测到刷新中，直接返回过期缓存
- ✅ 使用 KV 标记防止重复刷新
- ✅ 后端不会被击穿

**预期结果**：
- 所有请求快速返回（< 200ms）
- `X-Cache-Updating: true` 数量 = 1（首个请求）
- `X-Cache-Updating: false` 数量 = 19（后续请求）
- **缓存击穿防护评分 >= 80 分**

**如果失败**：
- 评分 < 80：防重复刷新机制可能有问题
- 评分 = 0：所有请求都触发刷新，**后端被击穿**！

#### 测试 3：缓存预热功能

```bash
cd apps/api/tests/manual
./test-cache-warmup.sh
```

**测试内容**：
- ✅ 预热 API 正常工作
- ✅ 预热的缓存可用
- ✅ 已存在的缓存被跳过
- ✅ 支持批量预热

**预期结果**：
- `warmedCount` > 0（成功预热路径数）
- `errorCount` = 0（无失败）
- 预热的路径返回 `X-Cache-Status: HIT`
- 第二次预热跳过已存在的缓存

## 测试结果说明

### 成功的测试输出示例

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║                           测试结果汇总                                        ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

通过: 15
失败: 0
总计: 15

✓ 缓存击穿防护测试通过！

详细结果分析:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ 缓存击穿防护: 优秀 (100分)
  - 成功使用 KV 标记防止重复刷新
  - 只有首个请求触发后台刷新
  - 后续请求检测到刷新中，直接返回过期缓存

✓ 响应时间: 优秀 (45ms)
```

### 失败的测试输出示例

```
✗ 缓存击穿防护测试失败或存在问题！

详细结果分析:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✗ 缓存击穿防护: 失败 (0分)
  - 所有请求都触发了后台刷新
  - 防重复刷新机制完全失效
  - 后端可能被击穿！
```

## 测试文件说明

所有测试会在 `/tmp/` 目录下生成详细的响应文件：

### SWR 测试文件

```
/tmp/swr_test_first_request.txt       # 首次请求（创建缓存）
/tmp/swr_test_second_request.txt      # 第二次请求（缓存命中）
/tmp/swr_test_stale_request.txt       # 过期缓存请求（STALE）
/tmp/swr_test_refreshed_request.txt   # 刷新后请求（新缓存）
```

### 缓存击穿测试文件

```
/tmp/breakdown_test_concurrent/response_*.txt  # 每个并发请求的响应
/tmp/breakdown_test_concurrent/duration_*.txt  # 每个请求的耗时
/tmp/breakdown_test_initial.txt                # 初始缓存创建
/tmp/breakdown_test_after_refresh.txt          # 刷新后验证
```

### 预热测试文件

```
/tmp/warmup_test_result.json    # 首次预热结果
/tmp/warmup_test_result2.json   # 第二次预热结果（测试跳过逻辑）
/tmp/warmup_test_batch.json     # 批量预热结果
```

## 手动验证

如果自动化测试失败，可以手动验证：

### 手动验证 SWR

```bash
# 1. 配置短 TTL（5秒）
curl -X PUT 'http://localhost:8787/api/admin/paths/%2Fkv%2Fsuppart-image-service%2Fmeta%2Fgenerations-list' \
  -H 'Content-Type: application/json' \
  --data '{"cache": {"enabled": true, "ttl": 5, "keyStrategy": "path-only"}}'

# 2. 首次请求（创建缓存）
curl -I 'http://localhost:8787/kv/suppart-image-service/meta/generations-list'
# 应该看到: X-Cache-Status: HIT 或 MISS

# 3. 等待 6 秒（TTL 过期）
sleep 6

# 4. 再次请求（应该返回 STALE）
curl -I 'http://localhost:8787/kv/suppart-image-service/meta/generations-list'
# 应该看到:
#   X-Cache-Status: STALE
#   X-Cache-Stale: true
#   X-Cache-Updating: true 或 false

# 5. 等待 3 秒后再次请求（应该返回新缓存）
sleep 3
curl -I 'http://localhost:8787/kv/suppart-image-service/meta/generations-list'
# 应该看到: X-Cache-Status: HIT
```

### 手动验证缓存击穿防护

```bash
# 使用 Apache Bench 或 wrk 进行并发测试
ab -n 20 -c 20 'http://localhost:8787/kv/suppart-image-service/meta/generations-list'

# 或者使用循环
for i in {1..20}; do
  curl -I 'http://localhost:8787/kv/suppart-image-service/meta/generations-list' > /tmp/concurrent_$i.txt &
done
wait

# 检查结果
grep -r "X-Cache-Updating: true" /tmp/concurrent_*.txt | wc -l
# 应该只有 1 个（如果所有请求同时到达）
```

### 手动验证预热

```bash
# 1. 清除缓存
curl -X POST 'http://localhost:8787/api/admin/cache/flush' \
  -H 'Content-Type: application/json' \
  --data '{"paths": ["/kv/suppart-image-service/meta/generations-list"]}'

# 2. 预热
curl -X POST 'http://localhost:8787/api/admin/cache/warm' \
  -H 'Content-Type: application/json' \
  --data '{
    "paths": ["/kv/suppart-image-service/meta/generations-list"],
    "includeProxyRoutes": true
  }' | jq '.'

# 3. 验证预热的缓存
curl -I 'http://localhost:8787/kv/suppart-image-service/meta/generations-list'
# 应该看到:
#   X-Cache-Status: HIT
#   X-Cache-Warmer: true
```

## 故障排查

### 问题 1：测试一直失败

**可能原因**：
- API 服务未启动
- 端口不是 8787
- 代理路由未配置

**解决方法**：
```bash
# 检查服务状态
curl -s "http://localhost:8787/api/admin/paths?limit=1"

# 检查代理路由
curl -s "http://localhost:8787/api/admin/proxy-routes" | jq '.data.routes'

# 检查环境变量
export BASE_URL="http://localhost:YOUR_PORT"
./run-all-cache-tests.sh
```

### 问题 2：缓存击穿防护评分低

**可能原因**：
- KV 写入延迟
- 并发请求时序问题
- 更新标记未正确设置

**解决方法**：
- 查看 `/tmp/breakdown_test_concurrent/` 目录下的响应文件
- 检查每个请求的 `X-Cache-Updating` 头
- 如果多数是 `false`，说明防护正常
- 如果全是 `true`，说明防护失效，需要检查代码

### 问题 3：预热失败

**可能原因**：
- 代理路由未配置
- 后端服务不可用
- 路径不匹配任何路由

**解决方法**：
```bash
# 检查预热详细结果
cat /tmp/warmup_test_result.json | jq '.result.details[] | select(.success == false)'

# 检查代理路由配置
curl -s "http://localhost:8787/api/admin/proxy-routes" | jq '.data.routes[] | {pattern, target, enabled}'
```

## 性能基准

### 预期性能指标

| 指标 | 期望值 | 说明 |
|-----|-------|------|
| STALE 响应时间 | < 100ms | 从缓存读取，应该很快 |
| 并发请求平均响应时间 | < 200ms | 20 个并发请求 |
| 预热平均时间/路径 | < 500ms | 包括后端请求时间 |
| 缓存击穿防护评分 | >= 80 分 | 80-100 分为合格 |
| SWR 刷新成功率 | 100% | 后台刷新应该全部成功 |

## 相关文档

- [缓存优化策略详解](../../../docs/cache-optimization-strategies.md)
- [缓存生命周期测试](./cache-lifecycle-test.sh)
- [API 参考文档](../../../API_REFERENCE.md)

## 总结

这三个测试全面验证了系统的缓存优化机制：

1. **SWR 机制**：确保过期缓存能立即返回，用户无感知更新
2. **缓存击穿防护**：确保高并发下不会击穿后端
3. **缓存预热**：确保冷启动时也有良好性能

**所有测试通过**意味着系统具备：
- ✅ 高性能（响应时间 < 100ms）
- ✅ 高可用（后端故障时仍能响应）
- ✅ 高并发（防止缓存击穿）
- ✅ 好体验（冷启动快速）

如有问题，请查看测试文件或联系开发团队。
