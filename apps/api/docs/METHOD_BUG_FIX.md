# Method 字段 Bug 修复文档

## 问题描述

### Bug 1: Method 未写回持久化配置

**问题**：在 `kv-snapshot.ts` 中，虽然从 `traffic_events` 表查询到了正确的 HTTP method，但这个值只保存在快照中，没有写回 `unified-paths:list`。

**影响**：
- 低流量路径（不在 Top 100）
- 新部署的路径
- 查询失败的路径

这些路径仍然从旧的 `unified-paths:list` 中读取到错误的 "GET" 默认值。

**表现**：
```bash
curl 'https://api-proxy.bugacard.com/api/admin/paths?page=1&limit=50' \
  -H 'Authorization: Bearer xxx'

# 响应中所有 method 都显示 "GET"
{
  "data": [
    {
      "path": "/api/user/profile",
      "method": "GET",  // ❌ 实际应该是 POST
      ...
    }
  ]
}
```

### Bug 2: undefined 导致 UI 不可用

**问题**：当从 `traffic_events` 查询不到 method 时，代码将 `snapshot.method` 设置为 `undefined`。

**影响**：
- 新路径（还没有流量）无法在 UI 中配置缓存和限流
- 操作员需要等待路径有流量后才能管理

## 修复方案

### 修复 1: 写回持久化配置

**代码位置**：`apps/api/src/lib/kv-snapshot.ts:470-513`

**修复逻辑**：
```typescript
// 步骤 4: 将发现的 method 写回 unified-paths:list
if (fromTrafficEvents > 0) {
    await writeMethodsBackToConfig(env, unifiedPaths, pathMethodMap);
}

async function writeMethodsBackToConfig(
    env: Env,
    configs: UnifiedPathConfig[],
    methodMap: Map<string, string>
): Promise<void> {
    let updatedCount = 0;
    
    for (const config of configs) {
        const discoveredMethod = methodMap.get(config.path);
        
        // 只更新：1) 没有 method 或 2) method 是 GET（可能是旧的默认值）
        if (discoveredMethod && (!config.method || config.method === 'GET')) {
            config.method = discoveredMethod;
            config.metadata.updatedAt = new Date();
            updatedCount++;
        }
    }
    
    if (updatedCount > 0) {
        await env.API_GATEWAY_STORAGE.put('unified-paths:list', JSON.stringify(configs));
    }
}
```

**效果**：
- 每次生成快照时，自动修复持久化配置
- 确保所有路径（包括低流量路径）都能获得正确的 method

### 修复 2: 保留原值而非设置 undefined

**代码位置**：`apps/api/src/lib/kv-snapshot.ts:443-464`

**修复逻辑**：
```typescript
// 步骤 3: 更新快照数据（优先级：traffic_events > 统一配置 > 保留原值）
for (const snapshot of snapshots) {
    const trafficMethod = pathMethodMap.get(snapshot.path);
    const configMethod = configMethodMap.get(snapshot.path);

    if (trafficMethod) {
        snapshot.method = trafficMethod;
        fromTrafficEvents++;
    } else if (configMethod) {
        snapshot.method = configMethod;
        fromConfig++;
    } else {
        // 保留快照中已有的 method（如果有的话），否则不设置
        // 这样可以让管理员在 UI 中手动设置新路径的 method
        kept++;
        // snapshot.method 保持原值
    }
}
```

**效果**：
- 新路径可以在 UI 中手动配置 method
- 不影响已配置的路径

## 批量修复历史数据

### API 端点

**POST** `/api/admin/paths/backfill-methods`

**功能**：
1. 读取 `unified-paths:list` 中的所有配置
2. 从 `traffic_events` 查询实际使用的 method（最近 60 天）
3. 批量更新错误的 method 值
4. 写回 KV 存储

**使用示例**：
```bash
curl -X POST 'https://api-proxy.bugacard.com/api/admin/paths/backfill-methods' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json'
```

**响应示例**：
```json
{
  "success": true,
  "message": "成功修复 45 个路径的 method 字段",
  "data": {
    "totalPaths": 150,
    "queriedPaths": 120,
    "updatedPaths": 45,
    "samples": [
      {
        "path": "/api/user/profile",
        "oldMethod": "GET",
        "newMethod": "POST"
      },
      ...
    ]
  }
}
```

### 一键修复脚本

**位置**：`apps/api/scripts/fix-methods-bug.sh`

**使用方法**：
```bash
# 测试环境
cd apps/api
./scripts/fix-methods-bug.sh test

# 开发环境
./scripts/fix-methods-bug.sh dev

# 生产环境（需要确认）
./scripts/fix-methods-bug.sh prod
```

**脚本功能**：
1. 自动登录获取 Token
2. 调用 `/api/admin/paths/backfill-methods` 批量修复
3. 调用 `/api/admin/paths/snapshot/refresh` 刷新快照
4. 显示修复摘要和建议操作

**输出示例**：
```
====================================
🔧 Method 字段 Bug 一键修复
====================================
环境: prod
URL: https://api-proxy.bugacard.com

🔐 正在登录...
✅ 登录成功

====================================
📝 步骤 1/2: 批量修复持久化配置
====================================
✅ 步骤 1 完成：修复了 45 个路径的 method

====================================
📸 步骤 2/2: 刷新 KV 快照
====================================
✅ 步骤 2 完成：快照版本 15，包含 100 个路径

====================================
✅ 修复完成！
====================================

修复摘要：
  • 修复了 45 个路径的 method 字段
  • 快照版本: 15
  • 快照路径数: 100
```

## 部署流程

### 1. 本地测试

```bash
cd apps/api

# 运行本地开发服务器
npm run dev

# 在另一个终端测试
./scripts/fix-methods-bug.sh test
```

### 2. 部署到生产

```bash
# 部署 API
cd apps/api
npm run deploy -- --env production

# 等待部署完成（约 30 秒）

# 执行修复
./scripts/fix-methods-bug.sh prod
```

### 3. 验证修复

```bash
# 1. 检查路径列表 API
curl 'https://api-proxy.bugacard.com/api/admin/paths?page=1&limit=10' \
  -H 'Authorization: Bearer YOUR_TOKEN' | jq '.data[].method'

# 应该看到 GET, POST, PUT, DELETE 等多种 method，而不是全部 GET

# 2. 检查具体路径
curl 'https://api-proxy.bugacard.com/api/admin/paths/%2Fapi%2Fuser%2Fprofile' \
  -H 'Authorization: Bearer YOUR_TOKEN' | jq '.data.method'

# 应该返回正确的 method（如 POST）
```

## 技术细节

### Method 查询优先级

1. **traffic_events 表**：实际使用的 HTTP method（最近 30-60 天）
2. **统一配置**：手动设置或之前保存的 method
3. **保留原值**：如果都查询不到，保持原有值

### 更新策略

只更新以下情况的 method：
- 没有 method（`undefined`）
- method 是 "GET"（可能是旧的错误默认值）
- 从 traffic_events 发现了不同的 method

### 快照刷新时机

自动刷新：
- 快照年龄超过 10 分钟时触发异步刷新
- Cron trigger 定时刷新（如果配置）

手动刷新：
- POST `/api/admin/paths/snapshot/refresh`
- 使用一键修复脚本

## FAQ

### Q1: 为什么不在首次查询时就写回配置？

A: 性能考虑。快照生成是定时任务，在后台批量处理更高效。如果在每次 API 查询时都写回，会增加响应时间。

### Q2: 修复后新部署会不会又出现 GET 默认值？

A: 不会。修复后的逻辑不再设置 GET 默认值，而是：
1. 优先从 traffic_events 查询
2. 其次从统一配置读取
3. 最后保留原值（不设默认值）

### Q3: 如果路径的 method 确实是 GET 怎么办？

A: 没问题。修复逻辑会：
1. 从 traffic_events 查询到 "GET"
2. 写回配置
3. 以后每次查询都能正确返回 "GET"

### Q4: 低流量路径（不在 Top 100）会不会丢失 method？

A: 不会。虽然快照只包含 Top 100，但 `unified-paths:list` 包含所有路径。API 会合并两者的数据。

### Q5: 需要多久修复一次？

A: 一次性修复即可。修复后：
- 新流量自动更新 method
- 定时快照自动维护数据
- 无需人工干预

## 相关代码

- `apps/api/src/lib/kv-snapshot.ts` - 快照生成逻辑
- `apps/api/src/lib/paths-api-v2.ts` - 路径列表 API
- `apps/api/src/routes/admin/paths.ts` - 管理端点
- `apps/api/scripts/fix-methods-bug.sh` - 一键修复脚本

## 参考链接

- [API_REFERENCE.md](../../API_REFERENCE.md) - API 文档
- [kv-snapshot.ts](../src/lib/kv-snapshot.ts) - 快照实现
- [paths-api-v2.ts](../src/lib/paths-api-v2.ts) - 路径 API

