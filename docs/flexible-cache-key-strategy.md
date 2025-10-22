# 灵活缓存键策略 - 功能设计与实施文档

**分支名称**: `feature/flexible-cache-key-strategy`  
**创建日期**: 2025-10-02  
**状态**: 🚧 开发中

## 📋 目录

- [背景与问题](#背景与问题)
- [解决方案](#解决方案)
- [技术设计](#技术设计)
- [实施计划](#实施计划)
- [测试计划](#测试计划)
- [迁移指南](#迁移指南)
- [回滚方案](#回滚方案)

---

## 背景与问题

### 当前架构的局限性

现有的缓存系统使用固定的缓存键生成策略：`cache:v{version}:{path}:{paramsHash}`

这种策略存在以下问题：

1. **用户隔离不足**
   - 示例：`/biz-client/biz/user/self` 返回当前用户信息
   - 问题：不同用户访问同一路径，需要根据 `Authorization` header 中的 token 生成不同缓存
   - 当前行为：所有用户共享同一个缓存 ❌

2. **POST 请求缓存不灵活**
   - 示例：`/biz-client/biz/issueReplayVideo/list` (POST)
   - 问题：相同参数应返回相同内容，需要根据 request body 参数缓存
   - 当前行为：只能根据 URL 缓存，无法区分不同的 POST 参数 ❌

3. **缺乏精细控制**
   - 问题：无法为不同路径配置不同的缓存键生成策略
   - 当前行为：一刀切的策略，缺乏灵活性 ❌

### 业务需求

每个路径都需要极大的自由度，能够选择：

- **仅 Headers**：根据指定的 header（如 token、cid）生成缓存键的 hash
- **仅参数**：根据全部或部分请求参数生成缓存键的 hash
- **Headers + 参数**：组合使用，适应复杂场景

同时，需要在管理界面中：
- 展示每个路径使用的缓存策略
- 查看每个路径下所有缓存条目（按 hash 区分）
- 显示每个缓存条目的请求次数、大小、过期时间等

---

## 解决方案

### 核心思路

引入**可配置的缓存键策略系统**，支持 4 种策略：

| 策略 | 说明 | 适用场景 | 示例 |
|-----|------|---------|------|
| `path-only` | 仅根据路径缓存 | 静态内容、公共数据 | `/api/config` |
| `path-params` | 路径 + 请求参数 | 分页列表、搜索结果 | `/api/articles?page=1&size=10` |
| `path-headers` | 路径 + 指定 headers | 用户相关数据 | `/api/user/self` (基于 token) |
| `path-params-headers` | 路径 + 参数 + headers | 复杂业务场景 | `/api/orders?status=pending` (基于 token) |

### 功能特性

✅ **路径级别配置**：每个路径独立配置缓存策略  
✅ **Header 选择**：自定义哪些 header 参与缓存键生成  
✅ **参数选择**：支持"全部参数"或"指定参数"  
✅ **缓存条目管理**：查看、统计、删除每个路径下的所有缓存条目  
✅ **向后兼容**：默认策略保持现有行为  
✅ **渐进式迁移**：不影响现有配置，逐步迁移

---

## 技术设计

### 1. 数据模型

#### 缓存键策略枚举

```typescript
export type CacheKeyStrategy = 
  | 'path-only'              // 仅路径
  | 'path-params'            // 路径 + 全部参数
  | 'path-headers'           // 路径 + 指定 headers
  | 'path-params-headers';   // 路径 + 参数 + headers
```

#### 路径缓存配置扩展

```typescript
export interface PathCacheConfig {
  enabled: boolean;
  version: number;
  ttl?: number;
  
  // 新增字段
  keyStrategy?: CacheKeyStrategy;       // 缓存键生成策略
  keyHeaders?: string[];                // 参与缓存键的 header 名称列表
  keyParams?: 'all' | string[];         // 'all' 或指定参数名列表
}
```

#### 缓存条目元数据

```typescript
export interface CacheEntryMetadata {
  cacheKey: string;          // 完整的缓存键
  hash: string;              // hash 值（用于显示）
  path: string;              // 路径
  requestCount: number;      // 该缓存条目的请求次数
  size: number;              // 缓存大小（字节）
  createdAt: number;         // 创建时间
  lastAccessed: number;      // 最后访问时间
  ttl?: number;              // TTL配置
  expiresAt?: number;        // 过期时间
}
```

### 2. 核心算法

#### 缓存键生成算法

```typescript
/**
 * 生成缓存键（支持多种策略）
 * 
 * @param path - 请求路径
 * @param options - 配置选项
 * @returns 缓存键字符串
 * 
 * 缓存键格式: cache:v{version}:{path}:{hash}
 * 其中 hash 由以下部分组成（根据策略）：
 * - path-only: SHA256(path)
 * - path-params: SHA256(path + JSON.stringify(params))
 * - path-headers: SHA256(path + JSON.stringify(selectedHeaders))
 * - path-params-headers: SHA256(path + 'params:' + JSON.stringify(params) + 'headers:' + JSON.stringify(headers))
 */
export async function getCacheKey(
  path: string,
  options: {
    version: number;
    strategy?: CacheKeyStrategy;
    params?: any;
    headers?: Record<string, string>;
    keyHeaders?: string[];
    keyParams?: 'all' | string[];
  }
): Promise<string>
```

**算法流程**：

1. 初始化 hash 输入数组：`[path]`
2. 根据策略添加组件：
   - `path-params`: 添加参数的 JSON 字符串
   - `path-headers`: 添加选定 headers 的 JSON 字符串
   - `path-params-headers`: 同时添加参数和 headers
3. 拼接所有组件：`hashInput = parts.join('|')`
4. 计算 SHA-256 哈希值
5. 返回完整缓存键：`cache:v{version}:{path}:{hash}`

### 3. API 设计

#### 后端 API

**获取路径缓存条目列表**

```http
GET /api/admin/paths/:path/cache-entries
```

响应：
```json
{
  "success": true,
  "data": {
    "path": "/biz-client/biz/user/self",
    "entries": [
      {
        "cacheKey": "cache:v1:/biz-client/biz/user/self:abc123...",
        "hash": "abc123...",
        "requestCount": 156,
        "size": 2048,
        "createdAt": 1696234567890,
        "lastAccessed": 1696234987654,
        "ttl": 300,
        "expiresAt": 1696234867890
      }
    ],
    "total": 3
  },
  "timestamp": "2025-10-02T10:30:00Z"
}
```

**更新路径配置**（扩展现有接口）

```http
PUT /api/admin/paths
```

请求体：
```json
{
  "path": "/biz-client/biz/user/self",
  "config": {
    "cache": {
      "enabled": true,
      "version": 1,
      "ttl": 300,
      "keyStrategy": "path-headers",
      "keyHeaders": ["authorization", "x-user-id"]
    }
  }
}
```

### 4. 前端界面设计

#### 路径管理表格（新增列）

| 路径 | 方法 | 缓存 | **缓存策略** | **缓存条目** | 限流 | 地域 | 操作 |
|-----|------|------|------------|------------|------|------|------|
| /api/user/self | GET | ✅ | **路径+Header**<br/><small>authorization</small> | **[3 条]** | ✅ | ❌ | ⚙️ |
| /api/articles | GET | ✅ | **路径+参数** | **[12 条]** | ✅ | ❌ | ⚙️ |

#### 配置对话框（缓存策略选择）

```
┌─────────────────────────────────────────────┐
│ 缓存配置                                      │
├─────────────────────────────────────────────┤
│ ☑ 启用缓存                                   │
│                                              │
│ 版本号: [1]        TTL: [300] 秒             │
│                                              │
│ 缓存键策略:                                   │
│ ┌─────────────────────────────────────┐     │
│ │ 路径 + Headers              ▼       │     │
│ └─────────────────────────────────────┘     │
│                                              │
│ 包含的 Headers:                              │
│ ┌─────────────────────────────────────┐     │
│ │ authorization, x-user-id            │     │
│ │ [+ 添加]                             │     │
│ └─────────────────────────────────────┘     │
│                                              │
│ ℹ️  当前配置：根据 authorization 和 x-user-id  │
│    header 为不同用户生成独立缓存               │
└─────────────────────────────────────────────┘
```

#### 缓存条目子表格（新组件）

点击"缓存条目"列的数字，弹出对话框：

```
┌───────────────────────────────────────────────────────────┐
│ 缓存条目详情 - /biz-client/biz/user/self                   │
├───────────────────────────────────────────────────────────┤
│ 共 3 个缓存条目                              [🔄 刷新]      │
│                                                            │
│ Hash              │ 大小   │ 创建时间    │ 过期  │ 请求  │  │
│ ──────────────────│────────│────────────│──────│──────│  │
│ abc123...         │ 2.0 KB │ 2分钟前     │ 3分钟 │ 156  │🗑│
│ def456...         │ 1.8 KB │ 5分钟前     │ 5秒   │ 89   │🗑│
│ ghi789...         │ 2.1 KB │ 10分钟前    │ 已过期│ 234  │🗑│
└───────────────────────────────────────────────────────────┘
```

---

## 实施计划

### Phase 1: 后端基础架构（2-3天）

**文件变更**：
- `apps/api/src/types/config.ts` - 类型定义
- `apps/api/src/lib/cache-manager.ts` - 缓存键生成逻辑

**任务清单**：
- [ ] 定义 `CacheKeyStrategy` 枚举
- [ ] 扩展 `PathCacheConfig` 接口
- [ ] 定义 `CacheEntryMetadata` 接口
- [ ] 重构 `getCacheKey()` 函数，支持多种策略
- [ ] 实现 `getPathCacheEntries()` 函数
- [ ] 编写单元测试

**验收标准**：
- ✅ 所有 4 种策略都能正确生成缓存键
- ✅ 相同输入生成相同 hash
- ✅ 不同输入生成不同 hash
- ✅ 单元测试覆盖率 > 90%

### Phase 2: 后端 API 层（1-2天）

**文件变更**：
- `apps/api/src/middleware/cache.ts` - 缓存中间件
- `apps/api/src/routes/admin/paths.ts` - 路径管理 API

**任务清单**：
- [ ] 修改缓存中间件，读取并应用策略配置
- [ ] 处理 POST 请求的 body 参数
- [ ] 添加 `/paths/:path/cache-entries` 端点
- [ ] 更新现有配置 API，支持新字段
- [ ] 编写集成测试

**验收标准**：
- ✅ 中间件正确应用不同策略
- ✅ POST 请求能基于 body 缓存
- ✅ API 能返回缓存条目列表
- ✅ 集成测试通过

### Phase 3: 前端基础组件（2-3天）

**文件变更**：
- `apps/web/src/types/api.ts` - 类型定义
- `apps/web/src/components/ui/multi-input.tsx` - 新组件
- `apps/web/src/features/paths/components/cache-entries-table.tsx` - 新组件

**任务清单**：
- [ ] 同步后端类型到前端
- [ ] 创建 `MultiInput` 组件（支持输入多个值）
- [ ] 创建 `CacheEntriesTable` 组件（缓存条目子表格）
- [ ] 添加工具函数（`formatBytes`, `formatDistance`）
- [ ] 组件单元测试

**验收标准**：
- ✅ TypeScript 类型无错误
- ✅ `MultiInput` 组件功能正常
- ✅ `CacheEntriesTable` 能正确展示数据
- ✅ 组件渲染测试通过

### Phase 4: 前端界面集成（2-3天）

**文件变更**：
- `apps/web/src/features/paths/components/unified-path-table.tsx` - 表格
- `apps/web/src/features/paths/components/path-config-dialog.tsx` - 配置对话框
- `apps/web/src/hooks/use-path-api.ts` - API hooks

**任务清单**：
- [ ] 在路径表格中添加"缓存策略"和"缓存条目"列
- [ ] 在配置对话框中添加策略选择表单
- [ ] 集成 `CacheEntriesTable` 子表格
- [ ] 添加 API hook：`useCacheEntries`
- [ ] 端到端测试

**验收标准**：
- ✅ 表格正确显示策略信息
- ✅ 配置对话框能保存策略配置
- ✅ 点击"缓存条目"能打开子表格
- ✅ 端到端流程顺畅

### Phase 5: 测试与优化（2-3天）

**任务清单**：
- [ ] 性能测试（不同策略的缓存命中率）
- [ ] 压力测试（大量缓存条目的查询性能）
- [ ] 边界测试（异常情况处理）
- [ ] 向后兼容性测试
- [ ] 文档完善
- [ ] 部署到测试环境

**验收标准**：
- ✅ 缓存键生成时间 < 5ms
- ✅ 查询 1000 个缓存条目 < 500ms
- ✅ 现有配置无需修改即可继续使用
- ✅ 所有测试用例通过

---

## 测试计划

### 单元测试

**缓存键生成测试** (`cache-manager.test.ts`)

```typescript
describe('getCacheKey', () => {
  it('path-only 策略应只基于路径生成缓存键', async () => {
    const key1 = await getCacheKey('/api/test', { 
      version: 1, 
      strategy: 'path-only',
      params: { a: 1 }
    });
    const key2 = await getCacheKey('/api/test', { 
      version: 1, 
      strategy: 'path-only',
      params: { a: 2 }
    });
    expect(key1).toBe(key2); // 参数不同但缓存键相同
  });

  it('path-params 策略应基于路径和参数生成不同缓存键', async () => {
    const key1 = await getCacheKey('/api/test', { 
      version: 1, 
      strategy: 'path-params',
      params: { a: 1 }
    });
    const key2 = await getCacheKey('/api/test', { 
      version: 1, 
      strategy: 'path-params',
      params: { a: 2 }
    });
    expect(key1).not.toBe(key2); // 参数不同，缓存键也不同
  });

  it('path-headers 策略应基于指定 header 生成缓存键', async () => {
    const key1 = await getCacheKey('/api/user', {
      version: 1,
      strategy: 'path-headers',
      headers: { authorization: 'token1', 'x-other': 'value' },
      keyHeaders: ['authorization']
    });
    const key2 = await getCacheKey('/api/user', {
      version: 1,
      strategy: 'path-headers',
      headers: { authorization: 'token2', 'x-other': 'value' },
      keyHeaders: ['authorization']
    });
    expect(key1).not.toBe(key2); // token 不同，缓存键不同
  });

  it('应忽略未指定的 headers', async () => {
    const key1 = await getCacheKey('/api/user', {
      version: 1,
      strategy: 'path-headers',
      headers: { authorization: 'token1', 'x-other': 'value1' },
      keyHeaders: ['authorization']
    });
    const key2 = await getCacheKey('/api/user', {
      version: 1,
      strategy: 'path-headers',
      headers: { authorization: 'token1', 'x-other': 'value2' },
      keyHeaders: ['authorization']
    });
    expect(key1).toBe(key2); // x-other 未指定，不影响缓存键
  });
});
```

### 集成测试

**缓存中间件测试** (`cache-middleware.test.ts`)

```typescript
describe('Cache Middleware with flexible strategies', () => {
  it('应根据配置的策略生成缓存键', async () => {
    // 配置路径使用 path-headers 策略
    await updatePathConfig(env, '/api/user/self', {
      enabled: true,
      version: 1,
      keyStrategy: 'path-headers',
      keyHeaders: ['authorization']
    });

    // 第一个用户请求
    const res1 = await app.request('/api/user/self', {
      headers: { authorization: 'token1' }
    });
    expect(res1.status).toBe(200);
    const data1 = await res1.json();

    // 第二个用户请求
    const res2 = await app.request('/api/user/self', {
      headers: { authorization: 'token2' }
    });
    expect(res2.status).toBe(200);
    const data2 = await res2.json();

    // 应该返回不同的数据（不同用户）
    expect(data1).not.toEqual(data2);
  });

  it('POST 请求应能基于 body 参数缓存', async () => {
    await updatePathConfig(env, '/api/videos/list', {
      enabled: true,
      version: 1,
      keyStrategy: 'path-params',
      keyParams: 'all'
    });

    // 第一次请求
    const res1 = await app.request('/api/videos/list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ page: 1, size: 10 })
    });
    
    // 第二次相同参数请求（应命中缓存）
    const res2 = await app.request('/api/videos/list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ page: 1, size: 10 })
    });
    
    expect(res2.headers.get('x-cache')).toBe('HIT');
  });
});
```

### 端到端测试

**前端界面测试**

1. **配置缓存策略**
   - 打开路径配置对话框
   - 选择"路径 + Headers"策略
   - 添加 `authorization` header
   - 保存配置
   - 验证：表格显示正确的策略标签

2. **查看缓存条目**
   - 点击"缓存条目"列的数字
   - 弹出缓存条目子表格
   - 验证：显示所有缓存条目及其元数据

3. **删除缓存条目**
   - 在缓存条目子表格中点击删除按钮
   - 确认删除
   - 验证：条目从列表中消失

---

## 迁移指南

### 现有系统迁移

**默认行为**：
- 未配置策略的路径自动使用 `path-params` 策略
- 与旧版行为保持一致，确保向后兼容

**推荐迁移步骤**：

1. **识别需要迁移的路径**
   ```bash
   # 找出返回用户相关数据的路径
   /api/user/self
   /api/user/profile
   /api/user/settings
   ```

2. **为这些路径配置 `path-headers` 策略**
   - 在管理界面中打开路径配置
   - 选择"路径 + Headers"
   - 添加 `authorization` header
   - 保存配置

3. **刷新旧缓存**
   - 点击"刷新缓存"按钮
   - 或等待旧缓存自然过期（根据 TTL）

4. **验证新策略**
   - 使用不同用户 token 请求同一路径
   - 验证返回不同的数据
   - 检查缓存条目列表，应有多个条目

### 配置示例

**示例 1：用户个人信息接口**

```json
{
  "path": "/biz-client/biz/user/self",
  "cache": {
    "enabled": true,
    "version": 1,
    "ttl": 300,
    "keyStrategy": "path-headers",
    "keyHeaders": ["authorization"]
  }
}
```

**示例 2：带分页的列表接口（根据用户）**

```json
{
  "path": "/biz-client/biz/issueReplayVideo/list",
  "cache": {
    "enabled": true,
    "version": 1,
    "ttl": 600,
    "keyStrategy": "path-params-headers",
    "keyHeaders": ["authorization"],
    "keyParams": "all"
  }
}
```

**示例 3：公共配置接口**

```json
{
  "path": "/api/config",
  "cache": {
    "enabled": true,
    "version": 1,
    "ttl": 3600,
    "keyStrategy": "path-only"
  }
}
```

---

## 回滚方案

### 紧急回滚

如果新功能出现严重问题，可以快速回滚：

```bash
# 1. 切换回 main 分支
git checkout main

# 2. 重新部署
npm run deploy

# 3. 验证服务正常
curl https://your-api.com/health
```

### 降级方案

如果只是部分功能有问题，可以降级：

1. **禁用新策略，使用默认行为**
   - 在配置中移除 `keyStrategy` 字段
   - 系统自动回退到 `path-params` 策略

2. **隐藏前端新功能**
   - 通过 feature flag 隐藏策略选择器
   - 保留核心缓存功能

### 数据兼容性

- ✅ 旧的缓存键格式继续有效
- ✅ 新旧缓存键可以共存
- ✅ 配置不包含新字段时使用默认策略

---

## 附录

### A. 配置字段完整说明

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|-----|------|------|--------|------|
| `keyStrategy` | `CacheKeyStrategy` | 否 | `path-params` | 缓存键生成策略 |
| `keyHeaders` | `string[]` | 否 | `[]` | 参与缓存键的 header 名称列表（小写） |
| `keyParams` | `'all' \| string[]` | 否 | `'all'` | `'all'` 表示所有参数，或指定参数名列表 |

### B. 性能基准

| 操作 | 目标性能 | 实测性能 |
|-----|---------|---------|
| 生成缓存键（path-only） | < 1ms | TBD |
| 生成缓存键（path-params） | < 3ms | TBD |
| 生成缓存键（path-headers） | < 3ms | TBD |
| 生成缓存键（path-params-headers） | < 5ms | TBD |
| 查询 100 个缓存条目 | < 100ms | TBD |
| 查询 1000 个缓存条目 | < 500ms | TBD |

### C. 相关文档

- [API 参考文档](../API_REFERENCE.md)
- [缓存系统设计](../API代理缓存优化技术方案.md)
- [架构指南](../CLAUDE.md)

---

## 变更日志

| 日期 | 版本 | 变更内容 | 作者 |
|-----|------|---------|------|
| 2025-10-02 | 0.1.0 | 初始文档创建 | Claude |

---

**分支状态**: 🚧 开发中  
**预计完成时间**: 2-3 周  
**负责人**: 开发团队  
**审核人**: TBD

