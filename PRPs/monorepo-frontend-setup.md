# Monorepo 架构：API 网关与管理后台

## 目标

将现有的单体 Cloudflare Workers API 网关项目转换为 monorepo 结构，包含两个应用：
1. **apps/api**: 现有的 Cloudflare Workers API 网关（Hono + Workers）
2. **apps/web**: 新的 React 管理后台（Vite + shadcn-admin），实现 PRPs/admin-frontend.md 中定义的前端功能

Monorepo 应支持单命令开发（`pnpm dev` 同时运行两个应用）、共享依赖和协调部署，同时保持独立的构建流程。

## 原因

- **开发体验**：单一仓库、统一命令、共享工具链
- **类型安全**：前后端共享 TypeScript 类型定义
- **高效开发**：一个命令运行所有应用，支持热重载
- **更好的组织**：apps/api 和 apps/web 职责分离清晰
- **依赖管理**：pnpm workspace 高效管理包依赖

## 内容

一个 pnpm workspace monorepo，包含：
- 现有 API 网关迁移到 apps/api（功能不变）
- 使用 shadcn-admin 模板的新管理后台在 apps/web
- 根目录级别的协调开发脚本
- 共享配置和类型（未来增强）

### 成功标准
- [ ] `pnpm dev` 同时启动 API（端口 8787）和 web（端口 5173）
- [ ] API 网关在 localhost:8787 继续正常工作，所有现有路由可用
- [ ] 管理后台在 localhost:5173 加载 shadcn-admin UI
- [ ] 两个应用可以独立构建
- [ ] API 仍可部署到 Cloudflare Workers
- [ ] 两个项目的 TypeScript 编译正常工作
- [ ] 迁移后所有现有 API 测试通过

## 所需全部上下文

### 文档与参考
```yaml
# pnpm workspace 文档
- url: https://pnpm.io/workspaces
  why: pnpm workspace 官方配置和命令文档
  
- url: https://pnpm.io/pnpm-workspace_yaml
  why: Workspace YAML 文件结构和模式

# shadcn-admin 模板
- url: https://github.com/satnaing/shadcn-admin
  why: 管理后台源模板，基于 Vite + shadcn/ui 构建
  
- url: https://ui.shadcn.com/docs
  why: shadcn/ui 组件库文档，用于自定义

# 现有 PRP 文档
- file: PRPs/admin-frontend.md
  why: 定义所有前端功能实现（缓存、限流、地域、流量监控 UI）
  
- file: PRPs/api-gateway.md
  why: API 端点文档，用于前端集成

# 需要保留的关键 API 文件
- file: src/index.ts
  why: 主应用入口，展示路由注册模式
  
- file: src/routes/admin/traffic.ts
  why: 管理路由实现示例，供前端调用
  
- file: wrangler.toml
  why: Cloudflare Workers 配置，必须保持功能

# 配置文件
- file: CLAUDE.md
  why: 项目约定和开发命令，需要保留
```

### 当前代码库结构
```bash
api-gateway-do-for-kv/
├── src/
│   ├── index.ts                 # 主要 Hono 应用
│   ├── durable-objects/         # 持久对象：限流器、流量监控器
│   ├── lib/                     # 工具和辅助函数
│   ├── middleware/              # 中间件：缓存、代理、限流、地域封锁
│   ├── routes/
│   │   ├── admin/              # 管理 API 端点
│   │   ├── proxy.ts            # 代理路由
│   │   ├── counter.ts          # 示例路由
│   │   └── health.ts           # 健康检查
│   ├── schemas/                # Zod 验证模式
│   └── types/                  # TypeScript 类型定义
├── scripts/
│   └── generate-route.js       # 路由生成脚本
├── tests/                      # 测试文件
├── package.json               # 依赖和脚本
├── pnpm-lock.yaml            # 锁定文件
├── wrangler.toml             # Cloudflare 配置
├── tsconfig.json             # TypeScript 配置
└── vitest.config.ts          # 测试配置
```

### 期望的代码库结构
```bash
api-gateway-do-for-kv/              # 根 monorepo
├── pnpm-workspace.yaml             # Workspace 配置
├── package.json                    # 根脚本和开发依赖
├── apps/
│   ├── api/                       # 后端 API（从根目录迁移）
│   │   ├── src/                   # 所有现有 src 文件
│   │   ├── scripts/               # API 专用脚本
│   │   ├── tests/                 # API 测试
│   │   ├── package.json           # @gateway/api 包
│   │   ├── wrangler.toml          # Cloudflare 配置
│   │   ├── tsconfig.json          # API TypeScript 配置
│   │   └── vitest.config.ts       # API 测试配置
│   └── web/                       # 前端仪表板（新建）
│       ├── src/
│       │   ├── App.tsx            # 主应用组件
│       │   ├── main.tsx           # 入口点
│       │   ├── components/        # UI 组件
│       │   ├── pages/             # 仪表板页面
│       │   ├── hooks/             # React hooks
│       │   ├── lib/               # 工具函数
│       │   └── types/             # TypeScript 类型
│       ├── public/                # 静态资源
│       ├── package.json           # @gateway/web 包
│       ├── vite.config.ts         # Vite 配置
│       ├── tsconfig.json          # Web TypeScript 配置
│       └── tailwind.config.js     # Tailwind 配置
└── PRPs/                          # 保留在根目录供参考
```

### 已知陷阱和库特性
```typescript
// 关键：Cloudflare Workers 路径必须保持不变
// wrangler.toml 需要在移动后引用正确的相对路径

// 陷阱：pnpm workspace 内部依赖协议
// 使用 "workspace:*" 链接包之间的依赖

// 关键：API URL 的环境变量
// 开发环境: VITE_API_URL=http://localhost:8787
// 生产环境: VITE_API_URL=https://your-worker.workers.dev

// 陷阱：本地开发需要 CORS 头
// API 必须在开发模式下允许 localhost:5173

// 关键：保留 apps/api/src/index.ts 中所有 Durable Object 导出
// export { Counter } from './lib/counter';
// export { RateLimiter } from './durable-objects/RateLimiter';
// export { TrafficMonitor } from './durable-objects/TrafficMonitor';
```

## 实施蓝图

### 任务清单

```yaml
任务 1：创建 monorepo 结构
创建 pnpm-workspace.yaml：
  - 定义 workspace 包路径
  - 包含 apps/* 模式

创建根目录 package.json：
  - 名称：@gateway/monorepo
  - 私有：true
  - 运行两个应用的脚本
  - 公共开发依赖（如需要）

创建 apps/ 目录结构：
  - mkdir apps
  - 为 api 和 web 子目录做准备

任务 2：将 API 迁移到 apps/api
移动所有 API 文件：
  - mv src apps/api/src
  - mv scripts apps/api/scripts
  - mv tests apps/api/tests
  - mv wrangler.toml apps/api/
  - mv tsconfig.json apps/api/
  - mv vitest.config.ts apps/api/

更新 apps/api/package.json：
  - 更改名称为 @gateway/api
  - 保持所有现有依赖
  - 如需要则更新脚本路径

更新 apps/api/wrangler.toml：
  - 如需要则调整主入口路径
  - 确保 compatibility_date 是当前版本

任务 3：安装 shadcn-admin 模板
执行 degit 命令：
  - cd apps
  - npx degit satnaing/shadcn-admin web
  - cd web && pnpm install

更新 apps/web/package.json：
  - 更改名称为 @gateway/web
  - 为 API 添加代理配置

创建 apps/web/.env.development：
  - VITE_API_URL=http://localhost:8787

任务 4：配置根 workspace
更新根目录 package.json 脚本：
  - "dev": "pnpm --parallel dev"
  - "dev:api": "pnpm --filter @gateway/api dev"
  - "dev:web": "pnpm --filter @gateway/web dev"
  - "build": "pnpm -r build"
  - "test": "pnpm -r test"
  - "deploy:api": "pnpm --filter @gateway/api deploy"

安装依赖：
  - 从根目录执行 pnpm install
  - 验证 workspace 链接

任务 5：为开发环境添加 CORS 到 API
修改 apps/api/src/index.ts：
  - 添加开发环境的 CORS 中间件
  - 允许 localhost:5173 来源
  - 包含凭据支持

任务 6：在前端创建 API 客户端
创建 apps/web/src/lib/api.ts：
  - Axios 或 fetch 包装器
  - 从环境变量获取基础 URL
  - 请求/响应拦截器
  - API 响应的类型定义

任务 7：实现管理页面结构
创建 apps/web/src/pages/：
  - Dashboard.tsx - 概览页面
  - CacheManagement.tsx - 缓存配置 UI
  - RateLimiting.tsx - 限流设置
  - GeoBlocking.tsx - 地理限制
  - TrafficMonitoring.tsx - 实时流量统计

任务 8：设置路由
配置 React Router：
  - 为每个管理页面定义路由
  - 添加导航菜单
  - 实现布局包装器

任务 9：测试 monorepo 设置
验证开发环境：
  - 从根目录运行 pnpm dev
  - 检查 API 在 localhost:8787
  - 检查 web 在 localhost:5173
  - 测试前端的 API 调用
  - 验证两个应用的热重载

任务 10：更新文档
更新 README.md：
  - 新项目结构
  - 开发命令
  - 部署指令
  - 环境变量
```

### 每个任务的伪代码

```typescript
// 任务 1：pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'  // 为未来的共享包预留

// 任务 1：根目录 package.json
{
  "name": "@gateway/monorepo",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "pnpm --parallel dev",
    "dev:api": "pnpm --filter @gateway/api dev",
    "dev:web": "pnpm --filter @gateway/web dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "deploy:api": "pnpm --filter @gateway/api deploy",
    "deploy:api:staging": "pnpm --filter @gateway/api deploy:staging",
    "deploy:api:production": "pnpm --filter @gateway/api deploy:production"
  },
  "devDependencies": {
    "prettier": "^3.0.0",
    "typescript": "^5.0.0"
  }
}

// 任务 5：API 的 CORS 中间件
// apps/api/src/index.ts - 在导入后添加
import { cors } from 'hono/cors';

// 在路由前添加
if (process.env.NODE_ENV === 'development') {
  app.use('*', cors({
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization']
  }));
}

// 任务 6：API 客户端结构
// apps/web/src/lib/api.ts
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 缓存管理 API
export const cacheAPI = {
  getConfig: () => apiClient.get('/admin/cache/config'),
  updateConfig: (config: CacheConfig) => 
    apiClient.put('/admin/cache/config', config),
  invalidate: (pattern?: string) => 
    apiClient.post('/admin/cache/invalidate', { pattern }),
  getStats: () => apiClient.get('/admin/cache/stats')
};

// 类似的限流、地域、流量 API...
```

### 集成点
```yaml
环境变量:
  apps/web/.env.development:
    - VITE_API_URL=http://localhost:8787
  
  apps/web/.env.production:
    - VITE_API_URL=https://your-worker.workers.dev

端口:
  - API: 8787 (Wrangler 默认)
  - Web: 5173 (Vite 默认)
  
脚本:
  根目录级别:
    - pnpm dev - 运行所有应用
    - pnpm build - 构建所有应用
    - pnpm test - 测试所有应用
  
  API 专用:
    - pnpm --filter @gateway/api dev
    - pnpm --filter @gateway/api deploy
  
  Web 专用:
    - pnpm --filter @gateway/web dev
    - pnpm --filter @gateway/web build
```

## 验证循环

### 第一层：结构和依赖
```bash
# 创建 workspace 结构后
ls -la apps/api apps/web
cat pnpm-workspace.yaml

# 安装并链接 workspace
pnpm install

# 验证 workspace 包
pnpm ls -r --depth 0
# 预期：显示 @gateway/api 和 @gateway/web 包
```

### 第二层：API 迁移
```bash
# 测试移动后 API 仍正常工作
cd apps/api
pnpm dev

# 在另一个终端中
curl http://localhost:8787/health
# 预期：{"status":"ok","timestamp":"..."}

curl http://localhost:8787/admin/cache/config
# 预期：缓存配置 JSON

# 运行现有测试
pnpm test:run
# 预期：所有测试通过
```

### 第三层：前端设置
```bash
# 测试前端运行
cd apps/web
pnpm dev

# 在浏览器中检查
open http://localhost:5173
# 预期：shadcn-admin 仪表板加载

# 检查构建
pnpm build
# 预期：构建成功，创建 dist 文件夹
```

### 第四层：Monorepo 集成
```bash
# 从根目录运行所有应用
pnpm dev

# 测试 API
curl http://localhost:8787/health
# 预期：{"status":"ok"}

# 测试前端
curl http://localhost:5173
# 预期：HTML 响应

# 测试 CORS
curl -I http://localhost:8787/admin/cache/config \
  -H "Origin: http://localhost:5173"
# 预期：存在 Access-Control-Allow-Origin 头

# 构建所有应用
pnpm build
# 预期：所有应用构建成功

# 测试所有应用
pnpm test
# 预期：所有应用的测试都通过
```

### 第五层：前端-API 集成
```bash
# 运行所有应用时（从根目录 pnpm dev）
# 在 http://localhost:5173 打开浏览器控制台

# 测试前端的 API 调用
fetch('http://localhost:8787/admin/cache/config')
  .then(r => r.json())
  .then(console.log)
# 预期：控制台显示缓存配置数据

# 测试管理页面加载
# 导航到 /cache、/rate-limit、/geo、/traffic 页面
# 预期：所有页面都能正常渲染，无错误
```

## 最终验证清单
- [ ] 使用 pnpm-workspace.yaml 创建 Monorepo 结构
- [ ] API 迁移到 apps/api 并仍正常运行
- [ ] 前端使用 shadcn-admin 安装到 apps/web
- [ ] `pnpm dev` 同时启动两个应用
- [ ] API 可在 localhost:8787 访问
- [ ] 前端可在 localhost:5173 访问
- [ ] 为本地开发配置了 CORS
- [ ] 所有现有 API 测试通过
- [ ] 前端可以调用 API 端点
- [ ] 两个应用可以独立构建
- [ ] API 的部署命令正常工作
- [ ] 两个应用的 TypeScript 编译成功
- [ ] 两个应用的热重载都正常工作

## 需要避免的反模式
- ❌ 不要在迁移过程中修改 API 业务逻辑
- ❌ 不要更改 API 路由路径或响应
- ❌ 不要忘记更新配置中的相对路径
- ❌ 不要在前端硬编码 API URL
- ❌ 不要混合应用间的依赖
- ❌ 不要忘记为本地开发配置 CORS
- ❌ 不要更改 wrangler.toml 兼容性设置
- ❌ 不要删除 index.ts 中的 Durable Object 导出

## 信心评分：9/10

该 PRP 为 monorepo 设置提供了全面的指导：
- **清晰结构**：逐步迁移，保持所有功能
- **最小风险**：API 代码原样移动，无逻辑更改
- **验证模式**：标准的 pnpm workspace 配置
- **验证循环**：每个阶段的渐进式测试
- **完整上下文**：所有必要的文档和参考资料

高信心来自：
- API 迁移的简单文件移动
- 使用成熟工具（pnpm workspace、degit）
- 清晰的验证检查点
- 保持所有现有功能

小复杂度在于：
- 确保所有相对路径正确更新
- 开发环境的 CORS 配置
- 初始的前端-API 集成

AI 代理应该能够使用提供的上下文和验证循环成功完成此实现。