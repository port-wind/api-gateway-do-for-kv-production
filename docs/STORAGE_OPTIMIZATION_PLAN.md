# 存储优化方案 - 解决 KV 写入限制问题

## 📋 问题总结

**当前状态：**
- KV 写入配额已用尽（1000次/天）
- 主要原因：
  1. 每次缓存写入都更新索引（125次）
  2. 每个新 IP 都更新活跃列表（237次+）
  3. 配置更新频繁

**影响：**
- ❌ 无法更新代理路由配置
- ❌ 无法保存新的缓存数据
- ❌ 系统配置被锁定

## 🎯 优化方案：三层存储架构

### 方案 A：立即修复（已部分完成）

**1. 禁用高频 KV 写入**
```typescript
// ✅ 已修复：禁用活跃 IP 列表的实时更新
// apps/api/src/durable-objects/PathCollector.ts
private updateActiveIPsList(ip: string): void {
  return; // 暂时禁用
}
```

**2. 批量更新缓存索引**
```typescript
// 当前：每次缓存写入都更新索引（125次写入）
// 优化：使用内存缓存，每5分钟批量写入1次（288次/天）
let indexUpdateQueue = new Map();
let lastIndexUpdate = 0;

async function updateCacheIndex(env: Env, key: string, path: string) {
  indexUpdateQueue.set(key, path);
  
  const now = Date.now();
  if (now - lastIndexUpdate > 5 * 60 * 1000) { // 5分钟
    await flushIndexUpdates(env);
    lastIndexUpdate = now;
  }
}
```

**3. 仅在配置真正变化时写入**
```typescript
// 保存前先比较，避免无意义的写入
async function saveProxyRoutesToKV(env: Env, routes: ProxyRoute[]) {
  const existing = await getProxyRoutesFromKV(env);
  if (JSON.stringify(existing) === JSON.stringify(routes)) {
    return; // 没有变化，跳过写入
  }
  await env.API_GATEWAY_STORAGE.put(PROXY_ROUTES_KEY, JSON.stringify(routes));
}
```

### 方案 B：迁移到 D1（推荐）

**优势：**
- ✅ 写入限制：10万次/天（是 KV 的 100倍）
- ✅ 支持复杂查询和索引
- ✅ 事务支持，避免竞态条件
- ✅ 更适合存储关系型数据

**实施步骤：**

1. **创建 D1 数据库**
```bash
wrangler d1 create api-gateway-db
```

2. **数据表设计**
```sql
-- 代理路由配置表
CREATE TABLE proxy_routes (
  id TEXT PRIMARY KEY,
  pattern TEXT NOT NULL,
  target TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 0,
  config TEXT, -- JSON 配置
  created_at INTEGER,
  updated_at INTEGER
);

-- 路径配置表
CREATE TABLE path_configs (
  path TEXT PRIMARY KEY,
  method TEXT,
  proxy_id TEXT,
  cache_enabled INTEGER DEFAULT 0,
  rate_limit_enabled INTEGER DEFAULT 0,
  config TEXT, -- JSON 配置
  request_count INTEGER DEFAULT 0,
  last_accessed INTEGER,
  FOREIGN KEY (proxy_id) REFERENCES proxy_routes(id)
);

-- 缓存索引表
CREATE TABLE cache_index (
  cache_key TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  created_at INTEGER,
  expires_at INTEGER
);

-- 索引优化
CREATE INDEX idx_path_configs_proxy ON path_configs(proxy_id);
CREATE INDEX idx_cache_index_path ON cache_index(path);
CREATE INDEX idx_cache_index_expires ON cache_index(expires_at);
```

3. **迁移现有数据**
```typescript
// 从 KV 迁移到 D1
async function migrateFromKVToD1(env: Env) {
  // 1. 迁移代理路由
  const routes = await env.API_GATEWAY_STORAGE.get('proxy-routes', 'json');
  for (const route of routes) {
    await env.DB.prepare(
      'INSERT INTO proxy_routes VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      route.id, route.pattern, route.target, 
      route.enabled ? 1 : 0, route.priority,
      JSON.stringify(route.config),
      Date.now(), Date.now()
    ).run();
  }
  
  // 2. 迁移路径配置
  const paths = await env.API_GATEWAY_STORAGE.get('unified-paths:list', 'json');
  // ... 类似处理
}
```

### 方案 C：使用 Cache API 存储响应数据

**当前问题：** 响应数据存储在 KV 中，占用存储和写入配额

**优化方案：**
```typescript
// 使用 Cloudflare Cache API 替代 KV 存储响应
async function saveToCache(env: Env, key: string, response: Response) {
  // 不再写入 KV，使用 Cache API
  const cache = caches.default;
  const cacheKey = new Request(`https://cache.internal/${key}`, {
    method: 'GET'
  });
  
  // Cache API 完全免费，无限制
  await cache.put(cacheKey, response.clone());
  
  // 索引数据仍存储在 D1（轻量级）
  await env.DB.prepare(
    'INSERT OR REPLACE INTO cache_index VALUES (?, ?, ?, ?)'
  ).bind(key, path, Date.now(), expiresAt).run();
}

async function getFromCache(env: Env, key: string): Promise<Response | null> {
  const cache = caches.default;
  const cacheKey = new Request(`https://cache.internal/${key}`, {
    method: 'GET'
  });
  
  return await cache.match(cacheKey);
}
```

## 🚀 综合推荐方案

### 第一阶段：紧急修复（立即部署）
1. ✅ 禁用活跃 IP 列表更新（已完成）
2. 🔧 添加配置变更检测，避免无效写入
3. 🔧 批量更新缓存索引

**预期效果：** KV 写入降至 200-300次/天

### 第二阶段：迁移到混合存储（本周完成）
1. 配置数据 → D1
2. 响应缓存 → Cache API
3. KV 仅保留全局配置（写入频率极低）

**预期效果：** 
- KV 写入 < 50次/天
- 支持高并发（D1 + Cache API 无限制）
- 响应速度更快（Cache API 边缘缓存）

### 第三阶段：Durable Objects 优化（长期）
1. 使用 DO 聚合统计数据
2. 定时批量同步到 D1
3. 实现真正的分布式架构

## 📈 性能对比

| 存储方案 | 读取速度 | 写入限制 | 适用场景 |
|---------|---------|---------|---------|
| **KV** | ~50ms | 1000次/天 | ❌ 不适合频繁写入 |
| **D1** | ~10ms | 10万次/天 | ✅ 配置、索引、统计 |
| **Cache API** | ~5ms | 无限制 | ✅ 响应缓存、边缘存储 |
| **DO Storage** | ~1ms | 无限制 | ✅ 实时计数、热数据 |

## 🔧 立即行动项

### 今天必须做（解决报错）
```bash
# 1. 部署紧急修复
cd apps/api
./deploy.sh -y

# 2. 等待配额重置（UTC 00:00，即北京时间 08:00）
# 或者升级到付费版（$5/月，10万次写入/天）
```

### 本周完成（根本解决）
1. 创建 D1 数据库
2. 实现数据迁移脚本
3. 修改代码使用 D1 + Cache API
4. 测试并部署

## 💰 成本对比

| 方案 | 月成本 | 写入限制 | 推荐度 |
|-----|--------|---------|--------|
| KV 免费版 | $0 | 1000次/天 | ❌ 已不够用 |
| KV 付费版 | $5 | 10万次/天 | ⚠️ 临时方案 |
| D1 免费版 | $0 | 10万次/天 | ✅ 强烈推荐 |
| Cache API | $0 | 无限制 | ✅ 必须使用 |

## 📝 总结

**最优方案：D1 + Cache API + Durable Objects**

- **配置存储** → D1（10万次写入/天）
- **响应缓存** → Cache API（无限制，边缘分发）
- **实时统计** → Durable Objects（内存 + 定时持久化）
- **KV** → 仅存储极少变化的全局配置

这个架构可以支持：
- ✅ 每天百万级请求
- ✅ 高并发无瓶颈
- ✅ 全球边缘加速
- ✅ 完全免费（在合理用量内）

