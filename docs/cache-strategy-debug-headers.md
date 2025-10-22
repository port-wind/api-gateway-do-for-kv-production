# 缓存策略调试 Headers

## 概述

本文档说明了缓存响应中新增的调试 headers，用于帮助开发者了解当前请求使用的缓存策略配置。

## 新增的 Headers

### X-Cache-Strategy

显示当前路径使用的缓存键生成策略。

**可能的值：**
- `path-only` - 仅基于路径生成缓存键
- `path-params` - 基于路径 + 查询参数生成缓存键
- `path-headers` - 基于路径 + 指定 headers 生成缓存键
- `path-params-headers` - 基于路径 + 参数 + headers 生成缓存键

**示例：**
```
X-Cache-Strategy: path-params-headers
```

### X-Cache-Key-Headers

显示参与缓存键生成的 headers 列表。

**可能的值：**
- `all` - 使用所有请求 headers
- 逗号分隔的 header 名称列表

**示例：**
```
X-Cache-Key-Headers: authorization,x-user-id,cid
```

或：
```
X-Cache-Key-Headers: all
```

### X-Cache-Key-Params

显示参与缓存键生成的参数列表。

**可能的值：**
- `all` - 使用所有查询参数
- 逗号分隔的参数名称列表

**示例：**
```
X-Cache-Key-Params: page,size,filter
```

或：
```
X-Cache-Key-Params: all
```

## 完整响应示例

### 示例 1：组合策略（path-params-headers）

```http
HTTP/1.1 200 OK
content-type: application/json

# 标准缓存 headers
x-cache-status: HIT
x-cache-version: 200
x-cache-created: 2025-10-08T02:59:34.741Z
x-cache-stored: 2025-10-08T02:59:34.741Z
x-cache-expires: 2025-10-08T03:04:21.741Z
x-cache-key: cache:v200:/kv/suppart-image-ser...
x-cache-ttl: 287
x-cache-remaining-ttl: 269

# 新增的策略 headers
x-cache-strategy: path-params-headers
x-cache-key-headers: authorization,x-user-id
x-cache-key-params: page,size

# 其他 headers...
x-proxy-by: api-gateway
x-proxy-route: /kv/*
x-proxy-target: https://dokv.pwtk.cc
x-ratelimit-limit: 100
x-ratelimit-remaining: 94
```

**说明：**
- 使用 `path-params-headers` 策略
- 根据 `authorization` 和 `x-user-id` headers 区分缓存
- 根据 `page` 和 `size` 参数区分缓存
- 其他 headers 和参数不影响缓存键

### 示例 2：仅 Headers 策略（path-headers）

```http
HTTP/1.1 200 OK
x-cache-status: HIT
x-cache-strategy: path-headers
x-cache-key-headers: authorization
x-cache-key: cache:v1:/api/user/profile:a3f8...

# 不会有 x-cache-key-params（因为策略不包含参数）
```

### 示例 3：使用所有 Headers

```http
HTTP/1.1 200 OK
x-cache-status: HIT
x-cache-strategy: path-params-headers
x-cache-key-headers: all
x-cache-key-params: page,size
```

### 示例 4：默认策略（未配置策略）

如果路径没有配置缓存策略，将不会显示这些 headers：

```http
HTTP/1.1 200 OK
x-cache-status: HIT
x-cache-version: 1
x-cache-key: cache:v1:/api/data:7b4e...

# 没有策略相关的 headers
# 使用默认的 path-params 策略（向后兼容）
```

## 在哪些情况下会显示这些 Headers

这些调试 headers 会在以下情况下出现：

### 1. 缓存命中 (HIT)
```
x-cache-status: HIT
x-cache-strategy: path-params-headers
x-cache-key-headers: authorization,x-user-id
x-cache-key-params: all
```

### 2. 缓存过期但返回旧数据 (STALE)
```
x-cache-status: STALE
x-cache-strategy: path-headers
x-cache-key-headers: authorization
```

### 3. 缓存未命中 (MISS)

首次请求（MISS）时不会在响应中显示这些 headers，但它们会被保存到缓存中，供后续请求（HIT/STALE）使用。

### 4. 后台刷新 (REFRESHED)

当缓存过期并在后台刷新时，刷新后的缓存会包含这些 headers。

## 使用场景

### 1. 调试缓存行为

当发现缓存行为不符合预期时，可以查看这些 headers 来确认：
- 是否使用了正确的策略
- 哪些 headers 参与了缓存键生成
- 哪些参数参与了缓存键生成

### 2. 验证配置

部署新的缓存配置后，通过这些 headers 验证配置是否生效。

### 3. 性能优化

分析不同策略对缓存命中率的影响，优化缓存配置。

### 4. 故障排查

当遇到缓存相关问题时，这些 headers 可以快速帮助定位问题：

**问题：为什么两个看起来相同的请求返回了不同的数据？**

检查响应 headers：
```
x-cache-strategy: path-headers
x-cache-key-headers: x-user-id
```

**答案：** 因为使用了 `path-headers` 策略，基于 `x-user-id` 区分缓存，不同用户会有不同的缓存条目。

## 实现细节

### 添加位置

这些 headers 在以下三个位置被添加到响应中：

1. **缓存命中时** (`cache.ts` 中间件，HIT)
   - 从缓存中读取并添加到响应

2. **缓存过期时** (`cache.ts` 中间件，STALE)
   - 从过期缓存中读取并添加到响应

3. **保存缓存时** (`cache.ts` 中间件，MISS 和 `cache-manager.ts` 后台刷新)
   - 保存到缓存中，供后续请求使用

### 代码示例

```typescript
// 辅助函数：添加缓存策略相关的调试 headers
function addCacheStrategyHeaders(headers: Headers, pathConfig: PathCacheConfig | null) {
  if (!pathConfig || !pathConfig.keyStrategy) {
    return;
  }

  // 添加缓存策略
  headers.set('X-Cache-Strategy', pathConfig.keyStrategy);

  // 添加 keyHeaders 信息
  if (pathConfig.keyHeaders) {
    if (pathConfig.keyHeaders === 'all') {
      headers.set('X-Cache-Key-Headers', 'all');
    } else if (Array.isArray(pathConfig.keyHeaders)) {
      headers.set('X-Cache-Key-Headers', pathConfig.keyHeaders.join(','));
    }
  }

  // 添加 keyParams 信息
  if (pathConfig.keyParams) {
    if (pathConfig.keyParams === 'all') {
      headers.set('X-Cache-Key-Params', 'all');
    } else if (Array.isArray(pathConfig.keyParams)) {
      headers.set('X-Cache-Key-Params', pathConfig.keyParams.join(','));
    }
  }
}
```

## 注意事项

1. **仅在配置了策略时显示**
   - 如果路径没有配置 `keyStrategy`，不会显示这些 headers
   - 向后兼容：旧的配置不会受影响

2. **不影响性能**
   - 这些 headers 的开销非常小
   - 仅在已有的 header 处理流程中添加

3. **安全性**
   - 这些 headers 只显示配置信息，不泄露敏感数据
   - 不显示 header 或参数的实际值

4. **区分大小写**
   - Header 名称按照 HTTP 标准，不区分大小写
   - 但为了一致性，我们使用 `X-Cache-*` 格式

## 相关文档

- [缓存策略配置指南](./cache-headers-all-support.md)
- [灵活缓存键策略](./flexible-cache-key-strategy.md)
- [缓存调试 Headers 指南](./cache-debug-headers-guide.md)

## 更新日期

2025-10-08
