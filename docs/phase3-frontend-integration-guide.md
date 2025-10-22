# Phase 3 前端联调指南

**版本**: v1.0  
**日期**: 2025-10-16  
**状态**: 📋 **待联调**

---

## 📋 联调概述

Phase 3 后端已完成路径统计架构迁移，从 `PathCollector DO` 全量切换到 `Queue + D1 + KV` 架构。前端需要适配新的 API 结构，移除对废弃端点的依赖。

---

## 🎯 核心变更

### 1. **主要 API 保持兼容**

✅ **无需修改**的 API（行为不变）：

| 端点 | 方法 | 说明 | 状态 |
|------|------|------|------|
| `/admin/paths` | GET | 获取路径列表（分页、搜索、过滤） | ✅ 兼容 |
| `/admin/paths/:encodedPath` | GET | 获取单个路径详情 | ✅ 兼容 |
| `/admin/paths` | POST | 创建路径配置 | ✅ 兼容 |
| `/admin/paths/:encodedPath` | PUT | 更新路径配置 | ✅ 兼容 |
| `/admin/paths/:encodedPath` | DELETE | 删除路径配置 | ✅ 兼容 |
| `/admin/paths/health` | GET | 路径系统健康检查 | ✅ 兼容（数据源变更为 D1） |

**重要变化**：
- `GET /admin/paths` 的响应现在包含 `metadata.dataSource` 字段
  - `"kv-snapshot"`: 数据来自 KV 快照（< 50ms）
  - `"d1-fallback"`: KV 失败，降级到 D1 查询（< 200ms）

---

### 2. **废弃的端点（需要移除调用）**

❌ **必须移除**的 API（返回 `410 Gone`）：

#### 数据对比相关
```
GET /admin/paths/compare              # 数据源对比（DO vs D1）
GET /admin/paths/migration-config     # 灰度配置查询
PUT /admin/paths/migration-config     # 灰度配置更新
```

#### DO 管理相关
```
GET  /admin/paths/discovered          # 自动发现路径
GET  /admin/paths/do/system-stats     # DO 系统统计
GET  /admin/paths/do/ip/:ip           # IP 路径统计
POST /admin/paths/do/batch-cleanup    # 批量清理 DO
GET  /admin/paths/do/export           # 导出 DO 数据
```

#### DO 健康检查相关
```
GET  /admin/health/do-overview        # DO 系统总览
GET  /admin/health/do-detailed        # 详细 DO 健康检查
POST /admin/health/auto-maintenance   # 自动维护操作
GET  /admin/health/comparison         # 架构对比
```

**错误响应示例**：
```json
{
  "success": false,
  "error": "DEPRECATED_ENDPOINT",
  "message": "PathCollector DO 已下线。请使用 GET /paths API 查询路径统计（基于 D1 数据）。"
}
```

---

## 🔧 前端适配步骤

### Step 1: 识别废弃 API 调用

搜索前端代码中对废弃端点的调用：

```bash
# 搜索 DO 相关端点
grep -r "/admin/paths/do/" apps/web/src
grep -r "/admin/paths/compare" apps/web/src
grep -r "/admin/paths/migration-config" apps/web/src
grep -r "/admin/health/do-" apps/web/src
grep -r "/admin/paths/discovered" apps/web/src
```

---

### Step 2: 移除废弃功能

#### 2.1 移除数据对比功能

如果前端有"数据对比"或"迁移配置"相关 UI，需要：
- ✅ 删除相关组件和页面
- ✅ 移除路由配置
- ✅ 删除对应的 API 调用

**示例代码（需删除）**：
```typescript
// ❌ 删除这类代码
async function compareDataSources() {
  const response = await fetch('/admin/paths/compare?hours=24');
  // ...
}

async function updateMigrationConfig(config) {
  const response = await fetch('/admin/paths/migration-config', {
    method: 'PUT',
    body: JSON.stringify(config)
  });
  // ...
}
```

---

#### 2.2 移除 DO 管理功能

如果前端有 DO 管理相关 UI（如批量清理、导出等），需要：
- ✅ 删除"DO 管理"菜单项
- ✅ 删除相关页面组件
- ✅ 移除 API 调用

---

#### 2.3 更新健康检查页面

如果使用了 `/admin/health/*` 端点：
- ✅ 改用 `/admin/paths/health`（已支持 D1 数据源）
- ✅ 移除 DO 特定的健康指标展示

**修改前**：
```typescript
// ❌ 旧代码
const [doHealth, setDoHealth] = useState(null);
const [systemHealth, setSystemHealth] = useState(null);

useEffect(() => {
  fetch('/admin/health/do-overview').then(r => r.json()).then(setDoHealth);
  fetch('/admin/paths/health').then(r => r.json()).then(setSystemHealth);
}, []);
```

**修改后**：
```typescript
// ✅ 新代码
const [systemHealth, setSystemHealth] = useState(null);

useEffect(() => {
  fetch('/admin/paths/health').then(r => r.json()).then(setSystemHealth);
}, []);
```

---

### Step 3: 适配新的响应结构

#### 3.1 处理新的 `metadata` 字段

`GET /admin/paths` 响应现在包含数据源信息：

```typescript
interface PathsResponse {
  success: true;
  data: PathConfig[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  metadata?: {
    dataSource: 'kv-snapshot' | 'd1-fallback';  // 新增
    timestamp: string;
  };
  timestamp: string;
}
```

**可选功能**：显示数据源标识
```tsx
// ✅ 可选：展示数据来源
{response.metadata?.dataSource === 'kv-snapshot' && (
  <Badge variant="success">快照模式（< 50ms）</Badge>
)}
{response.metadata?.dataSource === 'd1-fallback' && (
  <Badge variant="warning">降级模式（< 200ms）</Badge>
)}
```

---

#### 3.2 处理 `/admin/paths/health` 响应变化

**新增字段**：
```typescript
interface PathHealthResponse {
  status: 'healthy' | 'unhealthy';
  summary: {
    totalUniquePaths: number;
    manualPaths: number;
    autoPaths: number;
    pathsWithCache: number;
    pathsWithRateLimit: number;
    pathsWithGeo: number;
    pathsWithMethod: number;
    pathsWithRequestCount: number;
  };
  stats: {
    totalRequests: number;
    totalPaths: number;
    totalActiveIPs: number;
  };
  dataSource: 'd1';  // 新增：数据来源标识
  timestamp: string;
}
```

**UI 展示示例**：
```tsx
<Card>
  <CardHeader>
    <h3>路径统计总览</h3>
    <Badge variant="info">数据来源: D1</Badge>
  </CardHeader>
  <CardContent>
    <Stat label="总请求数" value={health.stats.totalRequests} />
    <Stat label="唯一路径数" value={health.stats.totalPaths} />
    <Stat label="活跃 IP 数" value={health.stats.totalActiveIPs} />
  </CardContent>
</Card>
```

---

### Step 4: 错误处理优化

#### 4.1 优雅处理 410 错误

如果前端不小心调用了废弃端点，需要友好提示：

```typescript
async function fetchPaths() {
  try {
    const response = await fetch('/admin/paths');
    
    if (response.status === 410) {
      // 410 Gone: 端点已废弃
      console.warn('API endpoint is deprecated:', response.url);
      // 显示提示信息
      toast.warning('此功能已不再支持，请刷新页面使用新版本');
      return null;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch paths:', error);
    // 错误处理
  }
}
```

---

#### 4.2 添加全局 410 拦截器

在 API 客户端中统一处理：

```typescript
// api-client.ts
export async function apiRequest(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  
  // 统一处理废弃端点
  if (response.status === 410) {
    const data = await response.json();
    console.warn('Deprecated API:', { url, message: data.message });
    throw new DeprecatedAPIError(data.message);
  }
  
  // 其他错误处理...
  return response;
}

class DeprecatedAPIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeprecatedAPIError';
  }
}
```

---

## 📊 联调测试清单

### 环境准备

| 检查项 | 状态 | 备注 |
|--------|------|------|
| dev 环境后端已部署 Phase 3 | ⏳ | `npm run deploy:dev` |
| 前端连接到 dev 环境 | ⏳ | 更新 `.env.development` |
| 浏览器开发者工具已打开 | ⏳ | 监控网络请求 |

---

### 核心功能测试

#### ✅ 路径列表功能

| 测试场景 | 预期结果 | 实际结果 | 状态 |
|---------|---------|---------|------|
| **基础列表** | | | |
| 加载路径列表 | 返回路径数据，响应时间 < 200ms | | ⏳ |
| 显示请求数、错误数 | 数据正确显示 | | ⏳ |
| 显示数据来源标识 | 显示 "KV 快照" 或 "D1 降级" | | ⏳ |
| **搜索功能** | | | |
| 按路径名搜索 | 返回匹配的路径 | | ⏳ |
| 按代理 ID 过滤 | 返回对应代理的路径 | | ⏳ |
| **分页功能** | | | |
| 切换页码 | 正确加载不同页的数据 | | ⏳ |
| 修改每页数量 | 正确更新列表 | | ⏳ |
| **排序功能** | | | |
| 按请求数排序 | 高请求量路径在前 | | ⏳ |

---

#### ✅ 路径详情功能

| 测试场景 | 预期结果 | 实际结果 | 状态 |
|---------|---------|---------|------|
| 查看单个路径详情 | 显示完整配置信息 | | ⏳ |
| 编辑路径配置 | 保存成功，数据更新 | | ⏳ |
| 删除路径 | 删除成功，列表更新 | | ⏳ |

---

#### ✅ 健康检查功能

| 测试场景 | 预期结果 | 实际结果 | 状态 |
|---------|---------|---------|------|
| 查看系统健康状态 | 显示 D1 数据源统计 | | ⏳ |
| 总请求数显示 | 与实际请求一致 | | ⏳ |
| 唯一路径数显示 | 与路径列表一致 | | ⏳ |

---

#### ❌ 废弃功能移除验证

| 检查项 | 预期结果 | 实际结果 | 状态 |
|--------|---------|---------|------|
| 无调用 `/admin/paths/compare` | 控制台无 410 错误 | | ⏳ |
| 无调用 `/admin/paths/do/*` | 控制台无 410 错误 | | ⏳ |
| 无调用 `/admin/health/do-*` | 控制台无 410 错误 | | ⏳ |
| 无调用 `/admin/paths/discovered` | 控制台无 410 错误 | | ⏳ |
| 无调用 `/admin/paths/migration-config` | 控制台无 410 错误 | | ⏳ |

---

### 性能测试

| 指标 | 目标 | 实际 | 状态 |
|------|------|------|------|
| `/admin/paths` p99 延迟 | < 200ms | | ⏳ |
| `/admin/paths` KV hit 率 | > 90% | | ⏳ |
| 首屏加载时间 | < 1s | | ⏳ |
| 搜索响应时间 | < 300ms | | ⏳ |

---

### 边界情况测试

| 场景 | 预期行为 | 实际结果 | 状态 |
|------|---------|---------|------|
| **空数据** | | | |
| 无路径数据时 | 显示空状态提示 | | ⏳ |
| 搜索无结果时 | 显示"未找到匹配路径" | | ⏳ |
| **错误处理** | | | |
| 后端 500 错误 | 显示友好错误提示 | | ⏳ |
| 网络超时 | 显示超时提示，允许重试 | | ⏳ |
| 410 错误（废弃端点）| 显示"功能已升级"提示 | | ⏳ |
| **大数据量** | | | |
| 1000+ 路径 | 分页正常工作 | | ⏳ |
| 长路径名 | UI 不溢出，正确换行 | | ⏳ |

---

## 🐛 常见问题

### Q1: 前端调用废弃端点，返回 410 错误

**原因**: 前端代码仍在调用已废弃的 DO 相关端点。

**解决方案**:
1. 使用浏览器开发者工具查看网络请求
2. 定位到调用废弃端点的代码
3. 参考本文档"前端适配步骤"进行修改
4. 如果功能确实需要，使用 `GET /admin/paths` 替代

---

### Q2: 数据显示不一致（前端显示 vs 后端数据）

**原因**: 
- KV 快照可能有最多 10 分钟的延迟
- 或者是 D1 fallback 查询的实时数据

**解决方案**:
1. 检查响应的 `metadata.dataSource` 字段
2. 如果是 `kv-snapshot`，数据可能有 5-10 分钟延迟（正常）
3. 如果需要实时数据，等待下一次快照刷新（自动进行）

---

### Q3: 性能比之前慢

**症状**: 页面加载时间 > 1 秒

**可能原因**:
1. KV 快照未命中，降级到 D1 查询
2. 网络延迟
3. 前端渲染性能问题

**排查步骤**:
```bash
# 1. 检查后端响应时间
curl -w "\nTime: %{time_total}s\n" https://dev.example.com/admin/paths

# 2. 检查数据来源
curl https://dev.example.com/admin/paths | jq '.metadata.dataSource'

# 3. 如果是 d1-fallback，检查 KV 快照是否正常
curl https://dev.example.com/admin/paths/health | jq '.dataSource'
```

---

### Q4: 唯一 IP 数比实际少

**原因**: 使用水库采样（最多 1000 个 IP 哈希），是下界估计。

**说明**:
- `unique_ips_seen` 是真实值的**下界估计**（≤ 真实值）
- 对于 IP 数 > 1000 的路径，计数会偏低
- 这是已知限制，文档中已说明

**解决方案**:
- 在 UI 中标注"≈"或"至少"字样
- 示例：`约 1,250+ 个唯一 IP`

---

## 📚 相关文档

- [Phase 3 完成报告](./phase3-completion-report.md) - 详细的实施总结
- [DO 清理指南](./phase3-do-cleanup-guide.md) - 运维清理步骤
- [技术方案](./path-stats-refactor.md) - 整体架构设计
- [API 参考](../API_REFERENCE.md) - 完整的 API 文档

---

## 🤝 联调协作

### 后端联系人
- 负责人：Backend Team
- Slack: #api-gateway

### 前端联系人
- 负责人：Frontend Team
- Slack: #frontend

### 联调时间安排
- **准备阶段**: 2025-10-16 ~ 2025-10-18（后端部署 + 前端适配）
- **联调阶段**: 2025-10-19 ~ 2025-10-21（功能测试 + Bug 修复）
- **验收阶段**: 2025-10-22（最终验收）

---

## ✅ 验收标准

联调完成需满足以下条件：

- [ ] ✅ 所有核心功能正常（路径列表、详情、编辑、删除）
- [ ] ✅ 无调用废弃端点（控制台无 410 错误）
- [ ] ✅ 性能达标（p99 < 200ms）
- [ ] ✅ 所有测试用例通过
- [ ] ✅ 错误处理完善（友好提示）
- [ ] ✅ UI/UX 无明显问题
- [ ] ✅ 代码 review 通过
- [ ] ✅ 文档更新完成

---

**报告生成日期**: 2025-10-16  
**报告版本**: v1.0  
**状态**: 📋 待联调

