# API代理缓存优化技术方案

## 用户需求原文

> 我们先回顾一下需求， 我们是一个 api proxy ， 来一个请求， 非 get 请求和 get请求逻辑不一样，区别是 get 请求我们会有一个缓存的选项， 非get 请求不能缓存，缓存按钮是禁用的。 
> 
> 回到 get 请求， 设置缓存会额外存储3个字段， 1. 缓存的时间 2. 缓存的版本，数据更新自动 + 1， 数据的有效期， ttl
> 
> 我们更新机制是, 1. /api/flush' \
--header 'Content-Type: application/json' \
--data '{
    "keys": ["api/list"]
}' 接口方式手动更新，页面有一个按钮，可以点击更新，也可以点击查看当前缓存的内容， 包括内容，和这三个字段
> 
> 2. ttl 到期之后，会尝试重新调用代理网站并缓存数据，更新三个字段。 但是要注意高峰流量击穿问题，和大量请求影响问题
> 
> 3. 我还没想好
> 
> 我们所有转发到代理的请求要转发所有内容， header  等等
> 
> 我们来写方案文档， 写文档钱需要了解前后端现在的代码，以及计划怎么改， 文档不需要写具体代码实现

## 一、现状分析

### 1.1 系统架构概述
- **技术栈**: Cloudflare Worker + Hono.js框架 + TypeScript
- **前端**: React + TanStack Router + TypeScript
- **存储**: Cloudflare KV (API_GATEWAY_STORAGE)
- **中间件栈**: rate-limit → geo-block → cache → proxy

### 1.2 现有缓存实现现状

#### 后端缓存机制
- **位置**: `apps/api/src/middleware/cache.ts` 和 `apps/api/src/lib/cache-manager.ts`
- **存储结构**: 
  ```typescript
  interface CacheEntry {
    data: any;
    version: number;
    createdAt: number;
    path: string;
    headers: Record<string, string>;
  }
  ```
- **现有功能**:
  - 版本控制机制（version字段）
  - 路径级缓存开关
  - 缓存键生成（带参数哈希）
  - 数据压缩（>10KB）
  - 缓存统计和索引

#### 前端缓存管理
- **位置**: `apps/web/src/features/paths/` 目录
- **现有界面**:
  - 统一路径管理表格
  - 缓存开关控制
  - 版本号显示
  - 路径配置对话框

#### 代理转发机制
- **位置**: `apps/api/src/middleware/proxy.ts`
- **现有功能**:
  - 完整headers转发
  - 请求体转发
  - 重试机制
  - 性能监控
  - 结构化日志

### 1.3 缺失功能分析

#### 后端缺失
1. **TTL机制**: 没有过期时间控制
2. **flush API**: 缺少 `/api/admin/cache/flush` 端点
3. **预览API**: 无法查看缓存内容
4. **自动刷新**: TTL过期后无自动更新
5. **缓存击穿保护**: 无并发控制机制

#### 前端缺失
1. **TTL配置**: 无TTL设置界面
2. **手动刷新**: 无刷新缓存按钮
3. **内容预览**: 无法查看缓存内容
4. **批量操作**: 无批量刷新功能

## 二、技术方案设计

### 2.1 数据结构扩展

#### 扩展CacheEntry类型
```typescript
interface CacheEntry {
  data: any;
  version: number;
  createdAt: number;
  path: string;
  headers: Record<string, string>;
  
  // 新增TTL相关字段
  ttl?: number;           // TTL秒数，undefined表示永不过期
  expiresAt?: number;     // 过期时间戳
  etag?: string;          // ETag标识
  lastModified?: string;  // 最后修改时间
}
```

#### 扩展路径配置
```typescript
interface PathCacheConfig {
  enabled: boolean;
  version: number;
  ttl?: number;  // 新增TTL配置
}
```

### 2.2 后端API设计

#### A. 缓存刷新API
**端点**: `POST /api/admin/cache/flush`

**请求体**:
```json
{
  "keys": ["api/list", "api/users"],     // 可选：指定路径
  "pattern": "/api/*",                   // 可选：模式匹配
  "version": 2                           // 可选：版本号过滤
}
```

**响应**:
```json
{
  "success": true,
  "message": "缓存刷新完成",
  "result": {
    "flushedCount": 5,
    "failedKeys": [],
    "totalTime": 120
  }
}
```

#### B. 缓存预览API
**端点**: `GET /api/admin/cache/preview/{path}`

**查询参数**:
- `version`: 指定版本号
- `includeContent`: 是否包含内容

**响应**:
```json
{
  "success": true,
  "data": {
    "path": "/api/list",
    "version": 1,
    "createdAt": 1640995200000,
    "expiresAt": 1640998800000,
    "ttl": 3600,
    "size": 2048,
    "compressed": true,
    "headers": {...},
    "content": "..." // 可选
  }
}
```

#### C. 批量缓存操作API
**端点**: `POST /api/admin/cache/batch`

**请求体**:
```json
{
  "operation": "flush|preview|stats",
  "paths": ["/api/list", "/api/users"],
  "options": {
    "includeContent": false,
    "version": 1
  }
}
```

### 2.3 缓存更新策略

#### A. 手动更新流程
1. **前端触发**: 用户点击"刷新缓存"按钮
2. **API调用**: 调用 `/api/admin/cache/flush`
3. **缓存清理**: 删除指定路径的缓存条目
4. **版本递增**: version自动+1
5. **下次请求**: 重新获取并缓存数据

#### B. TTL自动更新机制
1. **请求检查**: 中间件检查缓存是否过期
2. **Stale-While-Revalidate策略**:
   - 如果未过期: 直接返回缓存
   - 如果已过期: 立即返回过期缓存，异步更新
   - 如果无缓存: 同步获取数据

#### C. 版本更新机制
1. **配置变更**: 修改路径配置时version+1
2. **全局失效**: 所有旧版本缓存立即失效
3. **渐进更新**: 新请求逐步建立新版本缓存

### 2.4 高并发优化方案

#### A. 缓存击穿防护（单飞模式）
```typescript
// 请求合并Map（内存中，Worker级别）
const pendingRequests = new Map<string, Promise<Response>>();

async function getWithSingleFlight(key: string, fetcher: () => Promise<Response>) {
  // 如果已有相同请求在处理，等待结果
  if (pendingRequests.has(key)) {
    return await pendingRequests.get(key);
  }
  
  // 创建新的请求Promise
  const promise = fetcher();
  pendingRequests.set(key, promise);
  
  try {
    const result = await promise;
    return result;
  } finally {
    pendingRequests.delete(key);
  }
}
```

#### B. 缓存雪崩防护
- **TTL随机化**: 设置TTL时增加±10%随机偏移
- **分层过期**: 不同类型数据设置不同TTL
- **熔断机制**: 上游异常时延长缓存有效期

#### C. 性能优化
- **预热机制**: 系统启动时预加载热点数据
- **压缩优化**: 响应数据自动压缩
- **索引优化**: 按路径分组管理缓存键

### 2.5 前端界面设计

#### A. 路径配置对话框增强
在现有 `PathConfigDialog` 中添加：
1. **TTL配置区块**:
   - 启用/禁用TTL
   - TTL数值输入（秒）
   - 过期时间预览
   
2. **缓存操作区块**:
   - "查看缓存"按钮
   - "刷新缓存"按钮
   - 缓存状态指示器

3. **缓存信息展示**:
   - 缓存大小
   - 创建时间
   - 过期时间
   - 命中次数

#### B. 缓存预览对话框
新增 `CachePreviewDialog` 组件：
1. **元数据展示**:
   - 路径、版本、TTL
   - 创建/过期时间
   - 压缩状态、大小
   
2. **内容预览**:
   - JSON格式化显示
   - 可折叠的Headers
   - 响应体预览（限制大小）
   
3. **操作按钮**:
   - 复制内容
   - 下载内容
   - 刷新缓存

#### C. 批量操作工具栏
增强现有批量操作：
1. **批量刷新**: 选中路径批量刷新缓存
2. **批量设置TTL**: 批量修改TTL配置
3. **批量查看**: 批量预览缓存状态

### 2.6 监控和统计

#### A. 缓存性能指标
- **命中率**: cache hit ratio
- **平均响应时间**: average response time
- **上游请求数**: upstream request count
- **缓存大小**: total cache size
- **过期清理次数**: expired cleanup count

#### B. 告警机制
- **命中率过低**: <50%时告警
- **响应时间过长**: >2s时告警
- **上游错误率高**: >5%时告警
- **缓存空间不足**: >80%时告警

## 三、实施方案

### 3.1 开发阶段规划

#### 第一阶段：核心TTL功能（2-3天）
1. **后端扩展**:
   - 扩展CacheEntry数据结构
   - 实现TTL检查逻辑
   - 修改cache-manager.ts保存/读取逻辑
   
2. **API开发**:
   - 实现flush API
   - 实现preview API
   - 更新现有cache配置API

3. **前端基础**:
   - 添加TTL配置界面
   - 实现手动刷新按钮

#### 第二阶段：界面和体验优化（2-3天）
1. **缓存预览功能**:
   - 开发预览对话框
   - 实现内容格式化
   - 添加操作按钮
   
2. **批量操作**:
   - 批量刷新功能
   - 批量TTL设置
   - 操作结果反馈

3. **用户体验**:
   - 加载状态提示
   - 错误处理优化
   - 操作确认对话框

#### 第三阶段：高级特性（2-3天）
1. **性能优化**:
   - 实现单飞模式
   - 添加缓存击穿保护
   - 实现stale-while-revalidate

2. **监控统计**:
   - 添加性能指标收集
   - 实现告警机制
   - 缓存分析报告

3. **稳定性优化**:
   - 错误恢复机制
   - 降级方案
   - 兜底策略

#### 第四阶段：测试和部署（1-2天）
1. **测试验证**:
   - 单元测试补充
   - 集成测试
   - 压力测试
   
2. **文档完善**:
   - API文档更新
   - 用户使用指南
   - 运维手册

3. **上线部署**:
   - 灰度发布
   - 监控观察
   - 问题修复

### 3.2 风险控制

#### A. 技术风险
1. **Cloudflare限制**:
   - KV读写频率限制
   - Worker执行时间限制
   - 内存使用限制
   
   **解决方案**: 使用waitUntil()异步操作，批量处理，内存优化

2. **缓存一致性**:
   - 多实例间缓存同步
   - 版本冲突处理
   
   **解决方案**: 基于版本号的强一致性，冲突检测机制

#### B. 性能风险
1. **缓存击穿**:
   - 热点数据同时过期
   - 大量请求打到上游
   
   **解决方案**: 单飞模式，TTL随机化，熔断保护

2. **存储压力**:
   - KV存储空间限制
   - 读写性能下降
   
   **解决方案**: 自动清理，LRU淘汰，数据压缩

### 3.3 兼容性保证

#### A. 向后兼容
1. **现有API不变**: 保持现有接口签名
2. **数据结构兼容**: 新字段使用可选类型
3. **渐进式启用**: 新功能默认关闭

#### B. 降级方案
1. **TTL功能异常**: 回退到版本控制模式
2. **flush API异常**: 使用版本递增替代
3. **预览功能异常**: 仅显示基础信息

## 四、预期效果

### 4.1 功能完善
- ✅ 完整的TTL机制
- ✅ 手动和自动缓存刷新
- ✅ 可视化缓存管理
- ✅ 高并发优化

### 4.2 性能提升
- **响应速度**: 缓存命中率提升至80%+
- **上游压力**: 减少70%的上游请求
- **并发能力**: 支持更高并发访问
- **稳定性**: 避免缓存击穿和雪崩

### 4.3 运维效率
- **可观测性**: 完整的缓存监控
- **可控制性**: 灵活的缓存管理
- **可维护性**: 清晰的操作界面
- **可扩展性**: 易于添加新功能

这个方案在保持现有架构稳定的基础上，完善了缓存系统的各项功能，提供了完整的TTL机制和用户友好的管理界面，同时考虑了高并发场景下的性能优化和稳定性保障。

## 五、实施进度跟踪

### 5.1 已完成功能 ✅

#### 第一阶段：核心TTL功能
1. **数据结构扩展** ✅
   - CacheEntry添加TTL相关字段（ttl, expiresAt, etag, lastModified）
   - PathCacheConfig添加TTL配置字段
   
2. **TTL检查逻辑** ✅
   - isCacheExpired() - 检查缓存是否过期
   - isCacheEntryValid() - 检查缓存是否有效（版本+TTL）
   - getCacheRemainingTTL() - 获取剩余TTL
   
3. **缓存管理API** ✅
   - POST /api/admin/cache/flush - 缓存刷新API
   - GET /api/admin/cache/preview/{path} - 缓存预览API
   - POST /api/admin/cache/batch - 批量缓存操作API
   
4. **前端TTL配置** ✅
   - 路径配置对话框中添加TTL输入框（1-86400秒）
   - 缓存操作按钮（查看、刷新、删除）
   - TTL配置信息和状态显示

### 5.2 待实现功能（TODO）

#### 🔴 高优先级（核心功能）

1. **Stale-While-Revalidate策略** ⏳
   - 状态：未开始
   - 描述：TTL过期后返回旧数据，异步更新缓存
   - 文件：`apps/api/src/middleware/cache.ts`
   - 要点：
     - 过期缓存先返回，后台异步更新
     - 添加更新中标记避免重复请求
     - 使用ctx.waitUntil()异步执行
   
2. **缓存击穿保护（单飞模式）** ⏳
   - 状态：未开始
   - 描述：同一时刻只允许一个请求到达上游
   - 文件：`apps/api/src/lib/cache-manager.ts`
   - 要点：
     - 实现pendingRequests Map管理
     - 相同请求等待第一个完成
     - 请求完成后清理Map
   
3. **缓存预览对话框优化** ⏳
   - 状态：未开始（当前使用alert）
   - 描述：专门的缓存内容预览组件
   - 文件：新建 `apps/web/src/features/paths/components/cache-preview-dialog.tsx`
   - 要点：
     - JSON格式化展示
     - Headers折叠显示
     - 内容复制/下载功能
     - 响应体大小限制

#### 🟡 中优先级（性能优化）

4. **TTL随机化防雪崩** ⏳
   - 状态：未开始
   - 描述：TTL设置时添加±10%随机偏移
   - 文件：`apps/api/src/lib/cache-manager.ts`
   - 要点：防止大量缓存同时过期
   
5. **批量操作功能** ⏳
   - 状态：未开始
   - 描述：支持批量刷新、批量设置TTL
   - 文件：`apps/web/src/features/paths/components/unified-path-table.tsx`
   - 要点：
     - 表格多选功能
     - 批量操作工具栏
     - 批量API调用优化
   
6. **监控统计面板** ⏳
   - 状态：未开始
   - 描述：缓存性能指标可视化
   - 文件：新建 `apps/web/src/features/cache/`目录
   - 指标：
     - 缓存命中率
     - 平均响应时间
     - 缓存空间使用
     - 过期清理次数

#### 🟢 低优先级（增强功能）

7. **熔断降级机制** ⏳
   - 状态：未开始
   - 描述：上游异常时延长缓存有效期
   - 文件：`apps/api/src/middleware/cache.ts`
   
8. **缓存预热功能** ⏳
   - 状态：未开始
   - 描述：系统启动时预加载热点数据
   - 文件：`apps/api/src/index.ts`
   
9. **LRU自动清理** ⏳
   - 状态：未开始
   - 描述：存储空间不足时自动淘汰
   - 文件：`apps/api/src/lib/cache-manager.ts`

### 5.3 已知问题

1. **测试环境问题** 🐛
   - Admin API路由在测试环境返回404
   - Durable Objects存储隔离问题
   
2. **用户体验问题** 🎨
   - 缓存预览使用简单alert（待优化为对话框）
   - 缺少操作loading状态提示
   - 错误处理反馈不够友好

### 5.4 实施建议

**第一步：完成高优先级任务（1-3）**
- 这些是保证系统稳定性的核心功能
- 预计工期：2-3天
- 重点解决缓存击穿和用户体验问题

**第二步：完成中优先级任务（4-6）**
- 提升性能和运维效率
- 预计工期：2-3天
- 提供可视化监控能力

**第三步：完成低优先级任务（7-9）**
- 增强系统容错和自动化能力
- 预计工期：1-2天
- 作为系统完善的补充功能