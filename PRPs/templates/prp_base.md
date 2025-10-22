name: "基础 PRP 模板 v2 - 丰富上下文与验证循环（中文版）"
description: |

## 目标
为 AI 代理实现功能而优化的模板，提供充足的上下文和自我验证能力，通过迭代优化实现可工作的代码。

## 核心原则
1. **上下文为王**：包含所有必要的文档、示例和注意事项
2. **验证循环**：提供 AI 可运行和修复的可执行测试/检查
3. **信息密集**：使用代码库中的关键词和模式
4. **渐进成功**：从简单开始，验证后再增强
5. **全局规则**：确保遵循 CLAUDE.md 中的所有规则

---

## 目标
[需要构建的内容 - 具体说明最终状态和期望结果]

## 原因
- [业务价值和用户影响]
- [与现有功能的集成]
- [为谁解决了什么问题]

## 内容
[用户可见的行为和技术要求]

### 成功标准
- [ ] [具体的可衡量结果]

## 所需全部上下文

### 文档与参考资料（列出实现功能所需的所有上下文）
```yaml
# 必读 - 将这些包含在你的上下文窗口中
- url: [官方 API 文档 URL]
  why: [你需要的具体章节/方法]
  
- file: [apps/api/src/example.ts]  # Monorepo 路径
  why: [遵循的模式，避免的陷阱]
  
- doc: [库文档 URL] 
  section: [关于常见陷阱的具体章节]
  critical: [防止常见错误的关键见解]

- docfile: [PRPs/ai_docs/file.md]
  why: [用户粘贴到项目中的文档]

```

### 当前代码库结构（在项目根目录运行 `tree` 获取代码库概览）
```bash
api-gateway-do-for-kv/                    # 根 Monorepo
├── pnpm-workspace.yaml                   # Workspace 配置
├── package.json                          # 根脚本（@gateway/monorepo）
├── apps/
│   ├── api/                             # @gateway/api - API 网关
│   │   ├── src/
│   │   │   ├── index.ts                 # 主应用入口
│   │   │   ├── routes/                  # 路由目录
│   │   │   ├── middleware/              # 中间件目录
│   │   │   ├── durable-objects/         # Durable Objects
│   │   │   ├── lib/                     # 工具库
│   │   │   ├── schemas/                 # 验证模式
│   │   │   └── types/                   # 类型定义
│   │   ├── wrangler.toml                # Worker 配置
│   │   └── package.json                 # API 依赖
│   └── web/                             # @gateway/web - 管理后台
│       ├── src/                         # React 前端应用
│       ├── .env.development             # 开发环境变量
│       └── package.json                 # Web 依赖
├── PRPs/                                # 保留在根目录
│   └── templates/
└── CLAUDE.md                            # 项目指导
```

### 目标代码库结构（要添加的文件及文件职责）
```bash
apps/api/src/                            # API 网关应用
├── new-feature/                         # 新功能目录
│   ├── handler.ts                       # 请求处理器
│   ├── service.ts                       # 业务逻辑服务
│   └── types.ts                         # 特定类型定义
apps/web/src/                            # 前端应用
├── components/new-feature/              # 新功能组件
│   ├── NewFeatureComponent.tsx          # 主组件
│   └── index.ts                         # 导出文件
└── pages/new-feature.tsx                # 页面组件
```

### Known Gotchas of our codebase & Library Quirks
```typescript
// 重要：Cloudflare Workers 环境特殊性
// 示例：Workers 中无法使用 Node.js 特定 API，需使用 Web 标准 API
// 示例：KV 每个键每秒仅允许一次写入，需使用版本化键策略
// 示例：Durable Objects 需要唯一 ID 以保证隔离
// 示例：请求正文只能读取一次，需在读取前克隆请求
// 示例：我们使用 Zod v3 进行验证，所有新代码应遵循此版本
// 重要：所有注释必须使用中文，遵循 CLAUDE.md 规范
```

## Implementation Blueprint

### Data models and structure

创建核心数据模型，确保类型安全和一致性。
```typescript
示例：
 - TypeScript 接口定义
 - Zod 验证模式
 - Hono 上下文类型
 - Durable Object 状态类型

```

### 完成 PRP 所需任务列表（按完成顺序）

```yaml
任务 1：
修改 apps/api/src/existing_module.ts：
  - 查找模式："class OldImplementation"
  - 在包含 "constructor" 的行后插入
  - 保留现有方法签名

创建 apps/api/src/new_feature.ts：
  - 镜像模式来源：apps/api/src/similar_feature.ts
  - 修改类名和核心逻辑
  - 保持错误处理模式相同

...(...)

任务 N：
...

```


### 各任务伪代码（根据需要添加到每个任务）
```typescript

// 任务 1
// 包含关键细节的伪代码，不要写完整代码
async function newFeature(param: string, env: Env): Promise<Response> {
    // 模式：始终首先验证输入（参见 apps/api/src/schemas/common.ts）
    const validated = validateInput(param); // 抛出 ValidationError
    
    // 陷阱：KV 每个键每秒仅允许一次写入
    const cacheKey = `feature:v1:${validated.id}`; // 使用版本化键
    
    // 模式：使用现有错误处理装饰器
    try {
        // 重要：API 限制每秒 >10 请求返回 429
        await rateLimiter.check(env.RATE_LIMITER, clientIP);
        return await externalApi.call(validated);
    } catch (error) {
        // 模式：标准化响应格式（参见 apps/api/src/lib/responses.ts）
        return formatErrorResponse(error);
    }
}
```

### 集成点
```yaml
KV_NAMESPACE:
  - 添加到：wrangler.toml
  - 绑定："FEATURE_KV"
  - 用途："存储功能配置和缓存数据"
  
ENVIRONMENT:
  - 添加到：apps/api/wrangler.toml
  - 模式："FEATURE_TIMEOUT = '30'"
  - 变量："FEATURE_ENABLED = 'true'"
  
ROUTES:
  - 添加到：apps/api/src/index.ts  
  - 模式："app.route('/feature', featureRoutes)"
  
FRONTEND:
  - 添加到：apps/web/src/App.tsx
  - 路由："<Route path='/feature' component={FeaturePage} />"
```

## 验证循环

### 第一层级：语法与样式
```bash
# 首先运行这些 - 在继续之前修复任何错误
npm run lint                         # 自动修复可修复的问题
npx tsc --noEmit                     # TypeScript 类型检查

# 预期：无错误。如有错误，阅读错误信息并修复。
```

### 第二层级：单元测试（每个新功能/文件/函数使用现有测试模式）
```typescript
// 创建 test_new_feature.test.ts 包含以下测试用例：
import { describe, it, expect } from 'vitest';

describe('新功能', () => {
  it('基本功能正常工作', async () => {
    // 测试正常路径
    const result = await newFeature('valid_input', mockEnv);
    expect(result.status).toBe(200);
  });

  it('无效输入抛出验证错误', async () => {
    // 测试输入验证
    await expect(newFeature('', mockEnv))
      .rejects.toThrow('验证错误');
  });

  it('优雅处理外部 API 超时', async () => {
    // 测试错误处理
    const result = await newFeature('valid', mockEnvWithTimeout);
    expect(result.status).toBe(500);
    expect(result.body).toContain('超时');
  });
});
```

```bash
# 运行并迭代直到通过：
npm test -- test_new_feature.test.ts
# 如果失败：阅读错误，理解根本原因，修复代码，重新运行（永远不要通过模拟来通过测试）
```

### 第三层级：集成测试
```bash
# 启动服务
npm run dev:api

# 测试端点
curl -X POST http://localhost:8787/feature \
  -H "Content-Type: application/json" \
  -d '{"param": "test_value"}'

# 预期：{"status": "success", "data": {...}}
# 如有错误：检查控制台日志获取堆栈跟踪
```

## 最终验证清单
- [ ] 所有测试通过：`npm test`
- [ ] 无代码规范错误：`npm run lint`
- [ ] 无类型错误：`npx tsc --noEmit`
- [ ] 手动测试成功：[具体的 curl/命令]
- [ ] 错误情况得到优雅处理
- [ ] 日志信息丰富但不冗长
- [ ] 必要时更新文档
- [ ] 前端和后端集成正常（如适用）

---

## 需避免的反模式
- ❌ 当现有模式有效时不要创建新模式
- ❌ 不要因为“应该有效”而跳过验证
- ❌ 不要忽略失败的测试 - 修复它们
- ❌ 不要在异步上下文中使用同步函数
- ❌ 不要硬编码应该配置的值
- ❌ 不要捕获所有异常 - 要具体
- ❌ 不要忘记在代码中使用中文注释
- ❌ 不要忽略 Cloudflare Workers 的特殊限制