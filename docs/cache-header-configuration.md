# 缓存 Header 配置指南

## 概述

本文档说明如何配置基于 Header 的缓存策略，实现用户隔离和个性化缓存。

## 功能说明

### 什么是基于 Header 的缓存？

不同于传统的只根据路径和参数生成缓存的方式，基于 Header 的缓存策略允许您**选择特定的 HTTP Headers**（如 `authorization`、`cid`、`x-user-id` 等）来参与缓存键的生成。

**核心原理：**
- **不是把所有 headers 都 hash**
- 而是**可选择**特定的 headers（用户可多选或自定义）
- 系统会提取这些 headers 的值来生成缓存键

### 使用场景

| Header 名称 | 使用场景 | 说明 |
|------------|---------|------|
| `authorization` | JWT 身份验证 | 不同用户的 token 会生成不同的缓存 |
| `x-token` | 自定义 token | 适用于自定义认证系统 |
| `x-user-id` | 用户 ID | 直接使用用户 ID 隔离缓存 |
| `x-tenant-id` | 租户隔离 | 多租户系统中隔离不同租户的缓存 |
| `cid` | 客户端 ID | 根据客户端 ID 区分缓存 |
| `x-client-id` | 客户端标识 | 移动端/Web 端分离 |
| `x-device-id` | 设备标识 | 按设备隔离缓存 |

## 配置步骤

### 1. 选择缓存策略

在路径配置对话框中，选择以下策略之一：

- **路径 + Headers**: 仅使用路径和选定的 headers 生成缓存键
- **路径 + 参数 + Headers**: 同时使用路径、请求参数和 headers 生成缓存键

### 2. 配置 Header 列表

#### 方式一：快速选择常用 Headers

点击预设的 header 按钮快速添加：
- `authorization` - JWT token
- `x-token` - 自定义 token
- `x-user-id` - 用户 ID
- `x-tenant-id` - 租户 ID
- `cid` - 客户端 ID
- `x-client-id` - 客户端标识
- `x-device-id` - 设备标识

**操作：**
- 点击按钮添加（按钮变为蓝色表示已选中）
- 再次点击可移除

#### 方式二：自定义 Headers

在"自定义 Headers"输入框中：
1. 输入 header 名称（如 `x-custom-header`）
2. 按 `Enter` 或 `,` 添加
3. 支持批量粘贴（逗号或换行分隔）

**规则：**
- Header 名称只能包含字母、数字和连字符 `-`
- 系统会自动转换为小写
- 不允许重复

### 3. 保存配置

点击"保存配置"按钮，配置立即生效。

## 工作原理

### 缓存键生成算法

以 `path-params-headers` 策略为例：

```typescript
// 假设配置：
path: "/api/user/orders"
keyHeaders: ["authorization", "cid"]
keyParams: "all"

// 请求 1
headers: { authorization: "Bearer token123", cid: "client1" }
params: { status: "pending" }
// 生成缓存键: cache:v1:/api/user/orders:hash(path|params:{"status":"pending"}|headers:{"authorization":"Bearer token123","cid":"client1"})

// 请求 2（不同用户）
headers: { authorization: "Bearer token456", cid: "client1" }
params: { status: "pending" }
// 生成缓存键: cache:v1:/api/user/orders:hash(path|params:{"status":"pending"}|headers:{"authorization":"Bearer token456","cid":"client1"})
// ⚠️ 不同的缓存键 - 因为 authorization 不同
```

### 关键特性

1. **选择性提取**: 只提取配置的 headers，忽略其他 headers
2. **大小写不敏感**: header 名称自动转为小写
3. **缺失处理**: 如果请求中没有配置的 header，该 header 不会参与 hash
4. **排序保证**: headers 按字母序排序后序列化，确保一致性

## 最佳实践

### ✅ 推荐做法

1. **仅选择必要的 headers**: 避免选择过多 headers，导致缓存碎片化
2. **使用稳定的 headers**: 选择值不会频繁变化的 headers（如 user-id，而非 timestamp）
3. **明确隔离目的**: 
   - 用户隔离: 使用 `authorization` 或 `x-user-id`
   - 租户隔离: 使用 `x-tenant-id`
   - 设备隔离: 使用 `x-device-id`

### ❌ 避免的做法

1. **不要选择所有 headers**: 这会导致几乎无法命中缓存
2. **避免使用易变的 headers**: 如 `x-request-id`、`x-timestamp`
3. **不要混淆参数和 headers**: 查询参数应该通过 `keyParams` 配置

## 示例配置

### 示例 1: 用户个人数据接口

```json
{
  "path": "/api/user/profile",
  "cache": {
    "enabled": true,
    "version": 1,
    "keyStrategy": "path-headers",
    "keyHeaders": ["authorization"]
  }
}
```

**效果**: 不同用户的 profile 数据被分别缓存

### 示例 2: 多租户订单查询

```json
{
  "path": "/api/orders",
  "cache": {
    "enabled": true,
    "version": 1,
    "keyStrategy": "path-params-headers",
    "keyParams": ["status", "page"],
    "keyHeaders": ["x-tenant-id", "x-user-id"]
  }
}
```

**效果**: 
- 不同租户的订单分开缓存
- 同一租户的不同用户分开缓存
- 同一用户的不同筛选条件（status）和分页（page）分开缓存

### 示例 3: 客户端版本隔离

```json
{
  "path": "/api/config",
  "cache": {
    "enabled": true,
    "version": 1,
    "keyStrategy": "path-headers",
    "keyHeaders": ["x-client-id", "x-app-version"]
  }
}
```

**效果**: 不同客户端（Web/iOS/Android）和不同版本的配置分别缓存

## 监控和调试

### 查看缓存条目

在路径配置对话框中：
1. 配置完成后，点击"查看缓存"按钮
2. 可以看到该路径下所有缓存条目及其 hash 值
3. 不同的 header 值会生成不同的 hash

### 常见问题

**Q: 为什么配置了 headers 但缓存没有区分？**

A: 检查以下几点：
1. 确保请求中包含了配置的 headers
2. 确认 header 名称拼写正确（不区分大小写）
3. 查看缓存条目列表，验证是否生成了多个缓存键

**Q: 缓存碎片化严重怎么办？**

A: 
1. 减少 `keyHeaders` 的数量
2. 考虑使用更粗粒度的 header（如 tenant-id 而非 user-id）
3. 适当设置 TTL，让过期缓存自动清理

**Q: 如何测试配置是否生效？**

A:
1. 使用不同的 header 值发送请求
2. 在"查看缓存"中查看是否生成了多个缓存条目
3. 验证不同请求返回了各自的缓存数据

## 技术实现

### 后端处理流程

```typescript
// 1. 中间件收集 headers
if (pathConfig.keyStrategy === 'path-headers' || 
    pathConfig.keyStrategy === 'path-params-headers') {
  requestHeaders = {};
  c.req.raw.headers.forEach((value, key) => {
    requestHeaders[key.toLowerCase()] = value;
  });
}

// 2. 生成缓存键
const cacheKey = await getCacheKey(path, {
  version,
  strategy: pathConfig.keyStrategy,
  params,
  headers: requestHeaders,
  keyHeaders: pathConfig.keyHeaders,  // 指定要使用的 headers
  keyParams: pathConfig.keyParams
});

// 3. processHeaders 函数只提取指定的 headers
function processHeaders(headers: Record<string, string>, keyHeaders: string[]): string {
  // 提取指定的 headers
  const headerValues = keyHeaders.reduce((acc, headerName) => {
    const value = headers[headerName.toLowerCase()];
    if (value) {
      acc[headerName.toLowerCase()] = value;
    }
    return acc;
  }, {});
  
  // 排序后序列化
  return JSON.stringify(sortObjectKeys(headerValues));
}
```

## 总结

- ✅ 系统**不会**把所有 headers 都 hash
- ✅ 用户可以**多选或自定义** header 列表
- ✅ 系统只会提取**配置的 headers** 的值来参与缓存键生成
- ✅ 实现了灵活的用户隔离、租户隔离、设备隔离等场景

