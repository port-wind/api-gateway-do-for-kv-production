name: "API 网关三层级联架构重构"
description: |

## 目标
重构当前 API 网关的路径管理系统，实现三层级联架构：精确路径 → 代理路由 → 全局配置。确保精确路径必须关联到代理路由，实现清晰的层级管理和配置继承。

## 原因
- **业务价值**：提供清晰的路径管理层级，便于运维人员理解和管理 API 路由
- **技术优化**：明确路径归属关系，避免配置混乱，支持配置继承
- **用户体验**：自动发现的路径可自动归类到合适的代理路由，减少手动配置

## 内容
实现以下架构转变：

### 当前状态（问题）
- 精确路径和代理路由相互独立，没有关联关系
- `/admin/paths` 返回的路径包含通配符，与代理路由混淆
- 无法知道某个精确路径属于哪个上游服务

### 目标状态
```
全局配置
├── 默认限流: 60次/分钟
├── 默认缓存: 禁用
└── 默认地域: 无限制
    │
    ├── 代理路由: /api/* → backend-api.example.com
    │   ├── 路径: /api/users/login (限流: 10次/分钟)
    │   ├── 路径: /api/users/register (限流: 5次/分钟)
    │   └── 路径: /api/products/list (缓存: 启用)
    │
    └── 代理路由: /admin/* → admin.example.com
        ├── 路径: /admin/dashboard (限流: 100次/分钟)
        └── 路径: /admin/settings (地域: 仅限CN)
```

### 成功标准
- [ ] 精确路径只包含精确匹配，无通配符
- [ ] 代理路由只包含通配符模式
- [ ] 每个精确路径都有明确的代理路由归属
- [ ] 配置支持三层继承：路径 > 代理 > 全局
- [ ] 自动发现的路径可自动归类到匹配的代理路由
- [ ] 前端界面体现层级关系

## 所需全部上下文

### 文档与参考资料
```yaml
# 必读 - 将这些包含在你的上下文窗口中
- file: apps/api/src/types/config.ts
  why: 当前的类型定义，需要修改以支持路径与代理关联

- file: apps/api/src/routes/admin/paths.ts  
  why: 精确路径管理的后端实现，需要添加代理关联逻辑

- file: apps/api/src/routes/admin/proxy-routes.ts
  why: 代理路由管理的后端实现，需要支持查询关联路径
  
- file: apps/api/src/lib/path-collector.ts
  why: 自动路径发现逻辑，需要自动归类到代理路由

- file: apps/web/src/features/paths/index.tsx
  why: 路径管理前端组件，需要添加代理选择功能

- file: apps/web/src/features/proxy-routes/index.tsx  
  why: 代理路由前端组件，需要显示关联的精确路径

- file: CLAUDE.md
  why: 项目开发规范，必须遵循
```

### 当前代码库结构
```bash
api-gateway-do-for-kv/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   └── config.ts            # 类型定义
│   │   │   ├── routes/
│   │   │   │   └── admin/
│   │   │   │       ├── paths.ts         # 路径管理 API
│   │   │   │       └── proxy-routes.ts  # 代理路由 API
│   │   │   └── lib/
│   │   │       ├── path-collector.ts    # 路径收集器
│   │   │       └── proxy-routes.ts      # 代理路由工具
│   │   └── wrangler.toml
│   └── web/
│       └── src/
│           ├── features/
│           │   ├── paths/               # 路径管理 UI
│           │   └── proxy-routes/        # 代理路由 UI
│           └── types/
│               └── api.ts               # 前端类型定义
└── CLAUDE.md
```

### 目标代码库结构（需要修改的文件）
```bash
apps/api/src/
├── types/
│   └── config.ts                        # 添加 proxyId 到 UnifiedPathConfig
├── routes/admin/
│   ├── paths.ts                         # 添加代理关联逻辑
│   └── proxy-routes.ts                  # 添加获取关联路径的端点
└── lib/
    └── path-matcher.ts                  # 新增：路径与代理匹配工具

apps/web/src/
├── features/
│   ├── paths/
│   │   └── components/
│   │       └── add-path-dialog.tsx     # 添加代理选择下拉框
│   └── proxy-routes/
│       └── components/
│           └── proxy-route-card.tsx    # 新增：显示关联路径
└── hooks/
    └── use-path-proxy-link.ts          # 新增：管理路径与代理关联
```

### Known Gotchas
```typescript
// 重要：Cloudflare KV 限制
// - 每个键每秒只能写入一次，需要批量操作
// - 大对象需要分片存储（>25MB）

// 重要：路径匹配规则
// - 精确路径：/api/users/login (完全匹配)
// - 代理模式：/api/* (前缀匹配)
// - 优先级：精确路径 > 代理路由

// 重要：配置继承顺序
// 1. 精确路径配置（最高优先级）
// 2. 代理路由配置
// 3. 全局默认配置（最低优先级）

// 重要：自动发现路径归类
// - 基于最长前缀匹配原则
// - /api/users/login 匹配 /api/* 而不是 /*
```

## Implementation Blueprint

### Data models and structure

```typescript
// 1. 修改 UnifiedPathConfig 类型，添加代理关联
export interface UnifiedPathConfig {
  path: string;                 // 精确路径（无通配符）
  proxyId?: string;             // 关联的代理路由 ID
  proxyPattern?: string;        // 关联的代理路由模式（用于显示）
  
  // 配置覆盖（继承代理和全局配置）
  cache?: {
    enabled?: boolean;          // undefined 表示继承
    version?: number;
  };
  
  rateLimit?: {
    enabled?: boolean;          // undefined 表示继承
    limit?: number;            // undefined 表示继承代理配置
    window?: number;
  };
  
  geo?: {
    enabled?: boolean;
    mode?: 'whitelist' | 'blacklist';
    countries?: string[];
  };
  
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    source: 'auto' | 'manual';   // 移除 'proxy' 来源
    autoAssigned?: boolean;      // 是否自动分配到代理
  };
}

// 2. 扩展 ProxyRoute 类型
export interface ProxyRoute {
  id: string;
  pattern: string;              // 通配符模式 (如 /api/*)
  target: string;
  stripPrefix: boolean;
  enabled: boolean;
  priority: number;
  
  // 代理级别的默认配置
  defaultCache?: {
    enabled: boolean;
    version?: number;
  };
  
  defaultRateLimit?: {
    enabled: boolean;
    limit: number;
    window: number;
  };
  
  defaultGeo?: {
    enabled: boolean;
    mode: 'whitelist' | 'blacklist';
    countries: string[];
  };
  
  // 统计信息
  stats?: {
    pathCount: number;          // 关联的精确路径数量
    lastUpdated: Date;
  };
}
```

### 完成 PRP 所需任务列表（按完成顺序）

```yaml
任务 1: 修改数据模型
文件: apps/api/src/types/config.ts
操作:
  - 在 UnifiedPathConfig 接口添加 proxyId 和 proxyPattern 字段
  - 修改配置字段为可选（支持继承）
  - 在 ProxyRoute 接口添加默认配置字段和统计信息

任务 2: 创建路径匹配工具
创建: apps/api/src/lib/path-matcher.ts
功能:
  - findMatchingProxy(path, proxyRoutes): 根据路径找到最匹配的代理
  - getPathsByProxy(proxyId, paths): 获取代理下的所有路径
  - autoAssignProxyToPaths(paths, proxyRoutes): 自动归类路径到代理

任务 3: 更新路径管理 API
文件: apps/api/src/routes/admin/paths.ts
修改:
  - GET /admin/paths: 返回带有 proxyId 和 proxyPattern 的路径
  - POST /admin/paths: 创建路径时必须指定 proxyId
  - PUT /admin/paths/:path: 支持修改路径的代理归属
  - GET /admin/paths/auto-assign: 自动归类未分配的路径

任务 4: 更新代理路由 API
文件: apps/api/src/routes/admin/proxy-routes.ts  
修改:
  - GET /admin/proxy-routes: 返回包含 pathCount 统计
  - GET /admin/proxy-routes/:id/paths: 获取代理下的所有路径
  - PUT /admin/proxy-routes/:id: 更新代理时级联更新关联路径

任务 5: 修改自动发现逻辑
文件: apps/api/src/lib/path-collector.ts
修改:
  - 发现新路径时自动匹配到合适的代理路由
  - 记录自动分配信息到 metadata.autoAssigned

任务 6: 更新前端路径管理
文件: apps/web/src/features/paths/components/add-path-dialog.tsx
添加:
  - 代理路由选择下拉框（必选）
  - 显示每个路径的代理归属
  - 批量修改路径的代理归属功能

任务 7: 更新前端代理路由管理
文件: apps/web/src/features/proxy-routes/components/proxy-route-table.tsx
添加:
  - 显示每个代理路由下的路径数量
  - 点击展开查看关联的精确路径列表
  - 代理路由详情页显示所有关联路径

任务 8: 实现配置继承逻辑
文件: apps/api/src/lib/config-resolver.ts (新建)
功能:
  - resolvePathConfig(path, proxy, global): 解析最终配置
  - 实现三层继承：精确路径 > 代理路由 > 全局配置
  - 处理 undefined 值的继承逻辑

任务 9: 数据迁移脚本
文件: apps/api/scripts/migrate-paths.ts (新建)
功能:
  - 读取现有路径数据
  - 自动匹配路径到代理路由
  - 更新存储格式

任务 10: 更新测试和文档
文件: apps/api/tests/hierarchical-paths.test.ts (新建)
内容:
  - 测试路径与代理的关联
  - 测试配置继承逻辑
  - 测试自动归类功能
```

### 各任务伪代码

```typescript
// 任务 2: 路径匹配工具
export class PathMatcher {
  // 找到最匹配的代理路由
  static findMatchingProxy(path: string, proxyRoutes: ProxyRoute[]): ProxyRoute | null {
    // 按优先级排序
    const sorted = proxyRoutes.sort((a, b) => a.priority - b.priority);
    
    // 找到第一个匹配的代理
    for (const proxy of sorted) {
      const pattern = proxy.pattern.replace('*', '.*');
      if (new RegExp(`^${pattern}$`).test(path)) {
        return proxy;
      }
    }
    
    return null;
  }
  
  // 自动归类路径到代理
  static autoAssignProxyToPaths(
    paths: UnifiedPathConfig[], 
    proxyRoutes: ProxyRoute[]
  ): UnifiedPathConfig[] {
    return paths.map(path => {
      if (!path.proxyId) {
        const matchingProxy = this.findMatchingProxy(path.path, proxyRoutes);
        if (matchingProxy) {
          return {
            ...path,
            proxyId: matchingProxy.id,
            proxyPattern: matchingProxy.pattern,
            metadata: {
              ...path.metadata,
              autoAssigned: true
            }
          };
        }
      }
      return path;
    });
  }
}

// 任务 8: 配置继承解析
export class ConfigResolver {
  static resolvePathConfig(
    pathConfig: UnifiedPathConfig,
    proxyConfig: ProxyRoute,
    globalConfig: GlobalConfig
  ): ResolvedConfig {
    return {
      cache: {
        enabled: pathConfig.cache?.enabled 
          ?? proxyConfig.defaultCache?.enabled 
          ?? globalConfig.defaultCacheEnabled,
        version: pathConfig.cache?.version 
          ?? proxyConfig.defaultCache?.version 
          ?? globalConfig.defaultCacheVersion
      },
      rateLimit: {
        enabled: pathConfig.rateLimit?.enabled 
          ?? proxyConfig.defaultRateLimit?.enabled 
          ?? globalConfig.defaultRateLimitEnabled,
        limit: pathConfig.rateLimit?.limit 
          ?? proxyConfig.defaultRateLimit?.limit 
          ?? globalConfig.defaultRateLimit,
        window: pathConfig.rateLimit?.window 
          ?? proxyConfig.defaultRateLimit?.window 
          ?? globalConfig.defaultRateLimitWindow
      },
      // ... 类似处理 geo 配置
    };
  }
}
```

### 集成点
```yaml
KV存储结构变更:
  - paths:unified:list → 包含 proxyId
  - proxy-routes:list → 包含 stats.pathCount
  - paths:proxy-mapping:{proxyId} → 该代理下的路径列表

API端点变更:
  GET /admin/paths:
    - 返回增加 proxyId, proxyPattern
    - 支持 ?proxyId=xxx 过滤
  
  POST /admin/paths:
    - body 必须包含 proxyId
  
  GET /admin/proxy-routes/:id/paths:
    - 新增端点，返回该代理的所有路径
  
  POST /admin/paths/auto-assign:
    - 新增端点，自动归类未分配的路径

前端路由变更:
  /paths:
    - 表格增加"所属代理"列
    - 支持按代理过滤
  
  /proxy-routes:
    - 卡片显示路径数量
    - 支持展开查看路径列表
```

## 验证循环

### 第一层级：语法与样式
```bash
# 在 apps/api 目录
cd apps/api
npm run lint                    # 修复代码风格
npx tsc --noEmit                # TypeScript 类型检查

# 在 apps/web 目录  
cd ../web
npm run lint
npx tsc --noEmit

# 预期：无错误
```

### 第二层级：单元测试
```typescript
// apps/api/tests/path-matcher.test.ts
describe('PathMatcher', () => {
  it('应该匹配最合适的代理路由', () => {
    const proxyRoutes = [
      { id: '1', pattern: '/api/*', priority: 0 },
      { id: '2', pattern: '/api/users/*', priority: 1 },
      { id: '3', pattern: '/*', priority: 10 }
    ];
    
    const result = PathMatcher.findMatchingProxy('/api/users/login', proxyRoutes);
    expect(result?.id).toBe('2'); // 最具体的匹配
  });
  
  it('应该自动归类路径到代理', () => {
    const paths = [
      { path: '/api/users/login', proxyId: null },
      { path: '/admin/dashboard', proxyId: null }
    ];
    
    const proxyRoutes = [
      { id: '1', pattern: '/api/*' },
      { id: '2', pattern: '/admin/*' }
    ];
    
    const result = PathMatcher.autoAssignProxyToPaths(paths, proxyRoutes);
    expect(result[0].proxyId).toBe('1');
    expect(result[1].proxyId).toBe('2');
  });
});

// apps/api/tests/config-resolver.test.ts  
describe('ConfigResolver', () => {
  it('应该正确继承配置', () => {
    const pathConfig = {
      cache: { enabled: true }  // 只覆盖缓存
    };
    
    const proxyConfig = {
      defaultCache: { enabled: false, version: 1 },
      defaultRateLimit: { enabled: true, limit: 100 }
    };
    
    const globalConfig = {
      defaultRateLimit: 60,
      defaultRateLimitWindow: 60
    };
    
    const resolved = ConfigResolver.resolvePathConfig(
      pathConfig, 
      proxyConfig, 
      globalConfig
    );
    
    expect(resolved.cache.enabled).toBe(true);        // 路径覆盖
    expect(resolved.cache.version).toBe(1);           // 继承代理
    expect(resolved.rateLimit.limit).toBe(100);       // 继承代理
    expect(resolved.rateLimit.window).toBe(60);       // 继承全局
  });
});
```

```bash
# 运行测试
cd apps/api
npm test -- path-matcher.test.ts
npm test -- config-resolver.test.ts
```

### 第三层级：集成测试
```bash
# 启动后端
cd apps/api
npm run dev

# 测试路径创建（必须指定代理）
curl -X POST http://localhost:8787/admin/paths \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/api/users/profile",
    "proxyId": "proxy-1",
    "cache": { "enabled": true }
  }'

# 测试获取代理下的路径
curl http://localhost:8787/admin/proxy-routes/proxy-1/paths

# 测试自动归类
curl -X POST http://localhost:8787/admin/paths/auto-assign

# 预期：返回正确的层级关系数据
```

### 第四层级：前端集成测试
```bash
# 启动前端
cd apps/web
npm run dev

# 手动测试：
# 1. 访问 /paths 页面
#    - 应该看到每个路径的"所属代理"列
#    - 添加新路径时必须选择代理
#
# 2. 访问 /proxy-routes 页面
#    - 应该看到每个代理的路径数量
#    - 点击可以展开查看关联路径
```

## 最终验证清单
- [ ] 数据模型包含路径与代理的关联字段
- [ ] 路径创建时必须指定代理路由
- [ ] 自动发现的路径能正确归类到代理
- [ ] 配置三层继承逻辑正确
- [ ] 前端显示路径的代理归属
- [ ] 前端显示代理的关联路径数量
- [ ] 单元测试覆盖核心逻辑
- [ ] 集成测试验证端到端流程
- [ ] 代码符合 CLAUDE.md 规范
- [ ] 所有注释使用中文

## 需避免的反模式
- ❌ 不要允许精确路径包含通配符
- ❌ 不要允许代理路由使用精确路径
- ❌ 不要创建没有代理归属的孤立路径
- ❌ 不要在配置继承时破坏优先级顺序
- ❌ 不要忽略自动归类的冲突情况
- ❌ 不要在前端直接修改关联关系而不通过后端验证
- ❌ 不要忘记处理代理删除时的级联操作
- ❌ 不要忽略 KV 写入限制（每秒一次）

---

## 实施风险与缓解措施

### 风险 1：数据迁移
- **风险**：现有数据格式变更可能导致服务中断
- **缓解**：实施灰度迁移，保留旧格式兼容性

### 风险 2：性能影响  
- **风险**：层级查询可能增加延迟
- **缓解**：使用缓存和批量查询优化

### 风险 3：配置复杂性
- **风险**：三层继承可能让用户困惑
- **缓解**：提供清晰的 UI 提示和配置预览

---

## 成功评分

**信心等级：8/10**

扣分原因：
- -1 分：需要处理大量现有数据的迁移
- -1 分：前端 UI 改动较大，可能需要迭代优化

加分因素：
- +1 分：架构设计清晰，层级关系明确
- +1 分：提供了完整的测试策略
- +1 分：考虑了配置继承和自动归类

此 PRP 提供了充足的上下文和实施细节，AI 代理应该能够按照步骤逐步实现功能。关键是要按顺序完成任务，每步都进行验证。