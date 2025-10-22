# 缓存截断问题修复总结

**日期**: 2025-10-14  
**状态**: ✅ Code Review 通过，待部署  
**严重级别**: Critical

---

## 🎯 核心问题

### 1. 压缩/解压缩只读第一个 4KB Chunk（高危）
**根本原因**：Stream reader 只调用一次 `read()`，只拿到默认的 4KB chunk

**影响**：
- 响应 > 10KB 时触发 gzip 压缩
- 压缩/解压时只读第一个 chunk，后续数据全部丢失
- 客户端收到不完整的 JSON 响应（恰好 4096 字节）

### 2. TTL 继承链被破坏（高危）
**根本原因**：路径配置的 `undefined` TTL 会覆盖全局 defaultTtl

**影响**：
- 全局配置 30 分钟 TTL
- 路径未设置 TTL（想继承）
- 实际变成 5 分钟（fallback 默认值）

### 3. 旧缓存永不过期（中危）
**根本原因**：10月8日之前的缓存没有 `expiresAt`，被认为永不过期

**影响**：
- 包含截断数据的旧缓存一直存在
- 存储空间持续增长
- 数据陈旧

---

## ✅ 已完成的修复

### 1. **修复压缩/解压缩逻辑**
```typescript
// ❌ 旧代码（只读第一个 chunk）
const { value } = await reader.read();
const decompressedText = new TextDecoder().decode(value);

// ✅ 新代码（循环读取所有 chunks）
const chunks: Uint8Array[] = [];
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  if (value) chunks.push(value);
}
// 合并所有 chunks...
```

**修改位置**：
- `apps/api/src/lib/cache-manager.ts:516-540` - 解压缩
- `apps/api/src/lib/cache-manager.ts:580-598` - 压缩

### 2. **修复 TTL 继承链**
```typescript
// ❌ 旧代码
cacheTTL = pathConfig.ttl;  // undefined 覆盖全局值

// ✅ 新代码
if (pathConfig.ttl !== undefined) {
  cacheTTL = pathConfig.ttl;  // 只有显式设置时才覆盖
}
```

**修改位置**：
- `apps/api/src/middleware/cache.ts:115-118`

### 3. **保存时确定 TTL**
```typescript
// ✅ 在保存时应用默认值，而不是读取时
let effectiveTTL = ttl !== undefined ? ttl : DEFAULT_CACHE_TTL;
```

**修改位置**：
- `apps/api/src/lib/cache-manager.ts:628-630`

### 4. **修复 warmCache TTL 继承**
```typescript
// ✅ 获取缓存配置并应用 TTL 继承
const cacheConfig = await directKVGet(env, 'config:cache');
const globalDefaultTTL = cacheConfig?.defaultTtl || DEFAULT_CACHE_TTL;
const pathConfigs = cacheConfig?.pathConfigs || {};

let effectiveTTL = globalDefaultTTL;
const pathConfig = pathConfigs[path];
if (pathConfig && pathConfig.ttl !== undefined) {
  effectiveTTL = pathConfig.ttl;
}

// 传递继承后的 TTL
await saveToCache(env, cacheKey, responseText, version, path, headersToCache, effectiveTTL);
```

**修改位置**：
- `apps/api/src/lib/cache-manager.ts:950-978, 1083`

### 5. **更新所有文档和注释**

**类型定义**：
- `apps/api/src/types/config.ts:59` - PathCacheConfig.ttl
- `apps/api/src/types/config.ts:76-82` - CacheEntry 接口
- `apps/api/src/types/config.ts:156` - UnifiedPathConfig.cache.ttl
- `apps/web/src/types/api.ts:36, 151` - 前端类型定义

**代码注释**：
- `apps/api/src/lib/cache-manager.ts` - saveToCache, isCacheExpired, getCacheRemainingTTL
- `apps/api/src/middleware/cache.ts` - TTL 继承逻辑

**测试**：
- `apps/api/tests/unit/path-config-update.test.ts:283` - 更新测试用例
- `apps/api/tests/unit/README_REGRESSION_TESTS.md:53` - 更新测试文档
- `apps/api/tests/unit/cache-ttl-contract.test.ts` - **新增** 完整的 TTL 契约测试

**前端 UI**：
- `apps/web/src/features/paths/components/path-config-dialog.tsx` - 输入提示和说明
- `apps/web/src/features/paths/components/cache-preview-dialog.tsx` - TTL 显示
- `apps/web/src/components/cache-entries-table.tsx` - 缓存列表显示

---

## 📋 新契约（2025-10-14）

### TTL 行为

| 场景 | 旧契约 | 新契约 |
|------|--------|--------|
| **保存时未传递 TTL** | 不设置 expiresAt | 使用 DEFAULT_CACHE_TTL (300秒) |
| **读取无 expiresAt 的缓存** | 永不过期 | 基于 createdAt + 300秒 判断过期 |
| **TTL 继承** | undefined 覆盖继承链 | undefined 继续继承上层配置 |
| **永久缓存** | 留空即可 | 需显式设置超大值（如 31536000） |

### 继承链

```
全局 defaultTtl (或 300)
  ↓
代理路由（暂不支持 TTL）
  ↓
路径配置（只有显式设置时覆盖）
  ↓
保存时应用默认值（如仍为 undefined）
  ↓
TTL 随机化（±10%）
  ↓
存储到 KV（包含明确的 expiresAt）
```

### 防雪崩机制

**TTL 随机化**（已有，继续生效）：
- 在原始 TTL 基础上添加 ±10% 的随机偏移
- 300 秒 TTL → 270-330 秒范围
- 1000 个缓存过期时间分散到 60 秒窗口
- 有效避免雪崩

---

## 🧪 测试覆盖

### 新增测试文件
**`apps/api/tests/unit/cache-ttl-contract.test.ts`** (258 行)

包含以下测试场景：
1. ✅ TTL 随机化（100个样本验证）
2. ✅ 默认 TTL 行为
3. ✅ TTL 继承逻辑
4. ✅ 缓存过期计算
5. ✅ 防雪崩验证
6. ✅ 文档一致性检查

### 更新的测试
- `apps/api/tests/unit/path-config-update.test.ts` - 更新边界情况测试

---

## 📊 修改统计

| 文件类型 | 修改文件数 | 新增文件数 | 修改行数 |
|---------|-----------|-----------|---------|
| 后端代码 | 3 | 0 | ~150 行 |
| 前端代码 | 4 | 0 | ~30 行 |
| 类型定义 | 2 | 0 | ~10 行 |
| 测试代码 | 2 | 1 | ~280 行 |
| 文档 | 2 | 2 | ~500 行 |
| **总计** | **13** | **3** | **~970 行** |

---

## 🔍 Code Review 反馈

### Review Round 1 (同事)
**问题**：解压缩只读第一个 4KB chunk
**状态**：✅ 已修复（循环读取所有 chunks）

### Review Round 2 (同事)
**问题**：TTL fallback 破坏继承链
**状态**：✅ 已修复（保存时应用默认值，继承链正确）

### Review Round 3 (同事)
**问题**：warmCache 没有传递 TTL
**状态**：✅ 已修复（实现与 middleware 相同的继承逻辑）

### Review Round 4 (同事)
**问题**：缓存雪崩风险
**状态**：✅ 已有机制（TTL 随机化 ±10%）

### Final Review (同事)
> "No further blocking issues found. The chunked compression/decompression fix looks solid, and the TTL inheritance now flows through middleware, background refresh, and warmCache so new entries get an explicit expiry."

**后续建议**：
1. ✅ 清理旧的"永不过期"文档
2. ✅ 添加自动化测试

**状态**：✅ 全部完成

---

## 🚀 待办事项

### 部署前
- [ ] 本地测试验证所有修复
- [ ] 运行完整的测试套件
- [ ] 更新 CHANGELOG.md

### 部署步骤
```bash
# 1. 部署后端
cd apps/api
npm run deploy

# 2. 清理旧缓存（推荐方法：更新版本号）
curl -X PUT 'https://api-proxy.pwtk.cc/admin/cache/config' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <admin-token>' \
  -d '{"version": 2}'

# 或者：完全刷新
curl -X POST 'https://api-proxy.pwtk.cc/admin/cache/flush' \
  -H 'Authorization: Bearer <admin-token>'

# 3. 部署前端（可选，UI 改进）
cd apps/web
npm run build
# ... 部署到生产
```

### 部署后验证
```bash
# 1. 测试大响应是否完整
curl -s 'https://api-proxy.pwtk.cc/biz-client/biz/bbsForumPost/list' \
  -H 'Content-Type: application/json' \
  -d '{"forumId":"userPublic,recommend","page":1,"size":10}' \
  | jq '.data.list | length'
# 期望：返回 10（完整列表）

# 2. 检查缓存头
curl -I 'https://api-proxy.pwtk.cc/some-path'
# 期望：X-Cache-TTL 和 X-Cache-Remaining-TTL 存在

# 3. 监控错误率
# 期望：JSON 解析错误大幅减少
```

---

## 📚 相关文档

- **完整技术说明**：`docs/CRITICAL_FIX_CACHE_TRUNCATION.md`
- **本文档**：`docs/CACHE_FIX_SUMMARY_2025-10-14.md`
- **测试代码**：`apps/api/tests/unit/cache-ttl-contract.test.ts`

---

## 👥 团队沟通

**请通知所有团队成员**：

1. **新契约生效**：
   - 无 TTL = 默认 5 分钟（而非永不过期）
   - 需永久缓存请显式设置超大值（如 31536000）

2. **部署后影响**：
   - 旧缓存会在 5 分钟后自动过期
   - 新缓存有正确的 TTL
   - 响应不再被截断

3. **如何设置永久缓存**：
   ```typescript
   // 1年 = 365 * 24 * 3600 = 31536000 秒
   ttl: 31536000
   ```

---

## ✅ 总结

**修复内容**：
- ✅ 修复压缩/解压缩循环读取 chunks
- ✅ 修复 TTL 继承链
- ✅ 保存时应用默认 TTL
- ✅ warmCache 支持 TTL 继承
- ✅ 清理所有旧文档
- ✅ 添加完整测试覆盖

**Code Review**：
- ✅ 4 轮 review 全部通过
- ✅ 无阻塞问题
- ✅ 后续建议已完成

**准备就绪**：
- ✅ 代码质量
- ✅ 测试覆盖
- ✅ 文档完整
- ✅ 防雪崩机制

**可以部署了！** 🚀

