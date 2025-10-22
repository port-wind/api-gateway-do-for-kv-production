# API Gateway 压测指南

## 概述

本项目提供了两个压测脚本，用于测试 API Gateway 的性能：

1. **loadtest-wrk.sh** - 基础 wrk 压测脚本
2. **loadtest-scenarios.sh** - 预设场景脚本

## 前置条件

### 安装 wrk

```bash
# macOS
brew install wrk

# Ubuntu/Debian
sudo apt-get install wrk

# 或从源码编译
git clone https://github.com/wg/wrk.git
cd wrk && make
```

## 快速开始

### 方式 1：使用预设场景（推荐）

```bash
./scripts/loadtest-scenarios.sh
```

选择场景：
- **场景 1**: 轻量级 (2线程, 10连接, 30秒) - 初次测试
- **场景 2**: 中等压力 (4线程, 50连接, 60秒) - 正常流量
- **场景 3**: 高压力 (8线程, 100连接, 90秒) - 接近峰值
- **场景 4**: 极限压测 (12线程, 200连接, 120秒) - ⚠️ 谨慎使用
- **场景 5**: 缓存测试 (4线程, 20连接, 60秒) - 测试缓存效果
- **场景 6**: 自定义配置

### 方式 2：直接使用脚本

```bash
./scripts/loadtest-wrk.sh <URL> <线程数> <连接数> <时长秒> [cid]
```

示例：

```bash
# 轻量级压测
./scripts/loadtest-wrk.sh \
  "https://api-proxy.pwtk.cc/biz-client/biz/user/self" \
  2 10 30

# 中等压力
./scripts/loadtest-wrk.sh \
  "https://api-proxy.pwtk.cc/biz-client/biz/user/self" \
  4 50 60 "custom-cid-123"
```

## 压测流程建议

### 第一次压测

1. **轻量级测试**（场景 1）
   - 目的：验证接口是否正常
   - 预期：错误率 0%, P99 < 100ms

2. **观察缓存命中率**
   ```bash
   curl -I 'https://api-proxy.pwtk.cc/biz-client/biz/user/self' \
     -H 'cid: test-cid-123' | grep X-Cache
   ```
   
   预期看到：
   ```
   X-Cache-Status: HIT  # 缓存命中
   Age: 15              # 缓存年龄（秒）
   X-Cache-TTL: 300     # 总 TTL
   ```

3. **逐步增加压力**
   - 场景 1 → 场景 2 → 场景 3
   - 观察：QPS、延迟、错误率
   - 停止条件：出现错误或延迟飙升

## 性能指标解读

### 成功标准 ✅

- 错误率 < 1%
- P99 延迟 < 200ms
- QPS > 1000（有缓存）
- 缓存命中率 > 95%

### 警告信号 ⚠️

- 错误率 > 5%
- P99 延迟 > 500ms
- QPS 持续下降
- 缓存命中率 < 80%

### 立即停止 🚨

- 错误率 > 10%
- 服务完全不响应
- P99 延迟 > 2s

## 缓存效果对比测试

### A. 测试有缓存（相同 cid）

```bash
./scripts/loadtest-wrk.sh \
  "https://api-proxy.pwtk.cc/biz-client/biz/user/self" \
  4 50 30 "same-cid-123"
```

预期：
- P50 < 20ms
- 缓存命中率 > 95%
- QPS > 2000

### B. 测试无缓存（不同 cid）

需要修改脚本动态生成不同的 cid。

预期：
- P50 > 100ms（需要请求后端）
- 缓存命中率接近 0%
- QPS < 500

## 性能瓶颈分析

### 1. 检查缓存状态

```bash
curl -I 'https://api-proxy.pwtk.cc/biz-client/biz/user/self' \
  -H 'cid: test-123' | grep -E "X-Cache-Status|Age"
```

响应头说明：
- `X-Cache-Status: HIT` - 缓存命中 ✅（快）
- `X-Cache-Status: MISS` - 缓存未命中（慢）
- `X-Cache-Status: STALE` - 过期缓存，正在刷新（中等）

### 2. 检查限流状态

如果大量 `429` 错误，说明触发了限流。

解决方案：
- 降低并发连接数
- 增加测试时长分散请求
- 调整限流配置

### 3. 检查后端性能

如果缓存未命中时延迟很高，问题在后端。

### 4. 检查网络延迟

本地压测可以排除网络因素。

## 进阶：AWS Fargate 分布式压测

如果本地压测通过，需要更大压力测试：

```bash
cd /Users/leo/tk.com/do-for-kv-main/loadtest/aws-fargate-loadtest

# 需要先修改脚本添加 cid header 支持
THREADS=8 CONNECTIONS=100 DURATION=90 \
  ./deploy-fargate.sh 100 \
  "https://api-proxy.pwtk.cc/biz-client/biz/user/self"
```

## 输出示例

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                    API Gateway 本地压测工具 (wrk)                             ║
╚══════════════════════════════════════════════════════════════════════════════╝

📊 压测配置
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  目标 URL:       https://api-proxy.pwtk.cc/biz-client/biz/user/self
  线程数:         4
  并发连接数:     50
  持续时间:       60s
  CID Header:     test-cid-123

Running 60s test @ https://api-proxy.pwtk.cc/biz-client/biz/user/self
  4 threads and 50 connections
  Thread Stats   Avg      Stdev     Max   +/- Stdev
    Latency    45.23ms   12.45ms  156.78ms   76.23%
    Req/Sec   275.34     45.67    389.00     68.00%
  65789 requests in 60.00s, 145.67MB read
Requests/sec:   1096.48
Transfer/sec:      2.43MB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 详细统计
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  总请求数:       65789
  成功请求:       65789
  失败请求:       0
  总耗时:         60.00s
  数据传输:       145.67 MB

延迟分布:
  P50 (中位数):   42.15ms
  P75:            51.23ms
  P90:            63.45ms
  P99:            98.76ms
  P99.9:          145.23ms
  最大延迟:       156.78ms

吞吐量:
  QPS:            1096.48 req/s
  带宽:           2.43 MB/s

成功率:          100.00%
```

## 故障排查

### 问题 1：wrk 未安装

```bash
# macOS
brew install wrk

# Linux
sudo apt-get install wrk
```

### 问题 2：接口返回 729 错误

原因：缺少 `cid` header

解决：脚本已自动添加，检查脚本是否正确执行

### 问题 3：大量 429 错误

原因：触发限流

解决：
- 降低并发数
- 增加测试时间
- 调整限流配置

### 问题 4：延迟很高

可能原因：
1. 缓存未生效（检查 `X-Cache-Status`）
2. 后端性能问题
3. 网络延迟
4. 限流导致排队

## 最佳实践

1. ✅ **从小开始** - 先执行轻量级压测
2. ✅ **逐步增加** - 确认稳定后再加压
3. ✅ **监控指标** - 关注错误率和延迟
4. ✅ **观察缓存** - 检查缓存命中率
5. ✅ **及时停止** - 发现问题立即停止

6. ❌ **避免直接极限压测** - 可能导致服务崩溃
7. ❌ **不要忽略错误** - 即使少量错误也要重视
8. ❌ **不要在生产环境盲目压测** - 使用测试环境

## 参考资料

- [wrk 官方文档](https://github.com/wg/wrk)
- [HTTP 缓存指南](../docs/cache-optimization-strategies.md)
- [Age 响应头说明](../docs/cache-debug-headers-guide.md)
- [API 参考文档](../API_REFERENCE.md)

## 联系支持

如有问题，请查看：
- 项目文档: `docs/`
- 测试脚本: `apps/api/tests/manual/`
- 代码审查: `docs/CODE_REVIEW_2025-10-07.md`
