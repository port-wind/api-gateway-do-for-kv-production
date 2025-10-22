# 关键修复：缓存截断问题和 TTL 契约变更

**日期**: 2025-10-14  
**严重级别**: Critical  
**影响范围**: 所有 > 10KB 的缓存响应

## 问题概述

### Bug #1: 解压缩只读第一个 4KB Chunk（高危）

**根本原因**：
- `apps/api/src/lib/cache-manager.ts:516` 的解压缩逻辑只调用了一次 `reader.read()`
- `DecompressionStream` 的 reader 以 chunk 方式返回数据（默认 4KB）
- 只读取第一个 chunk 导致后续数据全部丢失

**影响**：
- 响应 > 10KB 时触发 gzip 压缩存储
- 从缓存读取时被截断到恰好 4096 字节
- 客户端收到不完整的 JSON 响应

**修复**：
```typescript
// ❌ 错误（只读第一个 chunk）
const { value } = await reader.read();
const decompressedText = new TextDecoder().decode(value);

// ✅ 正确（循环读取所有 chunks）
const chunks: Uint8Array[] = [];
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  if (value) chunks.push(value);
}
// ... 合并所有 chunks
```

### Bug #2: 压缩也只读第一个 Chunk（高危）

**根本原因**：
- `apps/api/src/lib/cache-manager.ts:580` 的压缩逻辑同样只调用一次 `reader.read()`
- 如果压缩后的数据 > 4KB，也会被截断

**影响**：
- 存储的压缩数据本身就不完整
- 解压时进一步截断

**修复**：同样改为循环读取所有 chunks

### Bug #3: 无 TTL 缓存永不过期（中危）

**旧行为**（10月14日之前）：
- 没有 `expiresAt` 的缓存被认为永不过期
- 导致 10月8日的旧缓存一直存在，包含截断的数据
- 存储空间持续增长

**新契约**（2025-10-14 生效）：
```
没有 TTL 的缓存条目默认使用 5 分钟 TTL
```

## 契约变更说明

### 旧契约（已废弃）
```typescript
// CacheEntry.ttl 和 expiresAt 为 undefined = 永不过期
ttl?: number;           // undefined = 永不过期
expiresAt?: number;     // undefined = 永不过期
```

### 新契约（2025-10-14 生效）
```typescript
// 没有 TTL 默认使用 5 分钟
ttl?: number;           // undefined = 默认 300 秒（5分钟）
expiresAt?: number;     // undefined = createdAt + 5分钟
```

### 理由

1. **避免数据陈旧**：旧缓存永不过期会导致用户看到过时数据
2. **防止存储浪费**：无限期缓存会占用大量 KV 存储空间
3. **确保定期刷新**：5 分钟足够降低后端压力，又能保证数据新鲜度
4. **修复历史遗留**：10月8日之前创建的无 TTL 缓存会自动过期

### 如何设置永不过期缓存？

如果确实需要永不过期，请**显式传递超大 TTL**：

```typescript
// 示例：1 年 = 365 * 24 * 3600 = 31536000 秒
await saveToCache(env, key, data, version, path, headers, 31536000);
```

## 代码变更

### 修改的文件

1. **apps/api/src/lib/cache-manager.ts**
   - ✅ 修复 `getFromCache` 解压缩逻辑：循环读取所有 chunks
   - ✅ 修复 `saveToCache` 压缩逻辑：循环读取所有 chunks
   - ✅ 修改 `isCacheExpired`：无 expiresAt 时使用默认 5 分钟 TTL
   - ✅ 修改 `getCacheRemainingTTL`：无 expiresAt 时计算剩余 TTL

2. **apps/api/src/types/config.ts**
   - ✅ 更新 `CacheEntry` 接口注释，明确新契约

### 影响的调用点

- `warmCache`: 调用 `saveToCache` 时未传 TTL，现在会应用 5 分钟默认值
- `refreshCacheInBackground`: 同上
- 所有缓存中间件的 `saveToCache` 调用：会使用路径配置的 TTL 或全局默认值

## 部署和清理

### 1. 部署修复
```bash
cd apps/api
npm run deploy
```

### 2. 清理旧缓存
```bash
# 方法1：通过管理 API 清理所有缓存
curl -X POST 'https://api-proxy.pwtk.cc/admin/cache/flush' \
  -H 'Authorization: Bearer <admin-token>'

# 方法2：更新缓存版本号（推荐）
curl -X PUT 'https://api-proxy.pwtk.cc/admin/cache/config' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <admin-token>' \
  -d '{"version": 2}'
```

### 3. 验证修复
```bash
# 测试大响应是否完整
curl -s 'https://api-proxy.pwtk.cc/biz-client/biz/bbsForumPost/list' \
  -H 'Content-Type: application/json' \
  -d '{"forumId":"userPublic,recommend","page":1,"size":10}' \
  | jq -r '.data.list | length'

# 应该返回完整列表（10条），而不是被截断
```

## 测试场景

### 场景1：小响应（< 10KB）
- ✅ 不触发压缩
- ✅ 直接存储和读取
- ✅ 完整返回

### 场景2：大响应（> 10KB）
- ✅ 触发 gzip 压缩
- ✅ 循环读取所有压缩 chunks
- ✅ 存储完整压缩数据
- ✅ 循环读取所有解压 chunks
- ✅ 完整返回

### 场景3：无 TTL 的旧缓存
- ✅ 超过 5 分钟后判定为已过期
- ✅ 触发 Stale-While-Revalidate
- ✅ 后台异步更新为新数据

## 监控和告警

### 需要关注的指标

1. **缓存命中率**：修复后初期会下降（旧缓存过期），然后恢复
2. **响应大小**：应该看到 > 4096 字节的完整响应
3. **压缩率**：大响应的压缩率应该正常（通常 60-80%）
4. **错误率**：应该看到 JSON 解析错误大幅减少

### 日志关键字

```bash
# 查看压缩日志
grep "cache_compression" /var/log/api-gateway.log

# 查看解压缩失败日志（应该减少）
grep "Decompression failed" /var/log/api-gateway.log

# 查看缓存过期日志
grep "Cache expired" /var/log/api-gateway.log
```

## 回滚方案

如果修复导致问题，可以回滚到上一个版本：

```bash
# 1. 回滚代码
git revert HEAD
cd apps/api && npm run deploy

# 2. 或者临时禁用压缩
# 将压缩阈值调到极大值，避免触发压缩逻辑
# apps/api/src/lib/cache-manager.ts:571
if (dataStr.length > 10240000) {  // 10MB
```

## 相关问题

- 10月8日修复：排除 `content-length` header 避免截断（commit 11f5a3e）
- 本次修复：解决压缩/解压缩流程的根本问题

## 团队沟通

**请通知所有团队成员**：
1. 新契约：无 TTL = 默认 5 分钟，而非永不过期
2. 如需永不过期，显式传递超大 TTL 值
3. 部署后请监控缓存行为和响应完整性
4. 旧缓存会在 5 分钟后自动过期和更新

## 作者

- **发现者**: 同事代码审查
- **修复者**: Claude + Leo
- **审核者**: Team Review

