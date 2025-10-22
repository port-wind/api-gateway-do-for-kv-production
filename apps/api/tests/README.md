# API Gateway Testing Framework

本项目使用 **Vitest** 作为测试框架，为 Cloudflare Workers API 网关提供完整的集成测试和单元测试。

## 测试结构

```
tests/
├── integration/          # 集成测试
│   ├── basic.test.ts     # 基础功能测试
│   ├── proxy.test.ts     # 代理路由测试
│   ├── middleware.test.ts # 中间件栈测试
│   └── admin-api.test.ts # 管理API测试
├── unit/                 # 单元测试
│   ├── constants.test.ts # 常量和配置测试
│   ├── path-config-update.test.ts # 🛡️ 路径配置回归测试（18个测试）
│   ├── config-serialization.test.ts # 🔴 配置序列化测试（9个测试，Critical）
│   └── README_REGRESSION_TESTS.md # 回归测试详细文档
├── fixtures/             # 测试数据
│   └── test-data.ts      # 测试常量和配置
└── helpers/              # 测试工具
    └── test-utils.ts     # 测试辅助函数
```

## 运行测试

### 基本命令

```bash
# 运行所有测试
npm run test

# 运行测试（一次性）
npm run test:run

# 带 UI 界面运行测试
npm run test:ui

# 运行测试并生成覆盖率报告
npm run test:coverage

# 监视模式运行测试
npm run test:watch
```

### 运行特定测试

```bash
# 运行单元测试
npm run test:unit

# 运行集成测试
npm run test:integration

# 🛡️ 运行回归测试（重要！）
npx vitest run tests/unit/path-config-update.test.ts

# 运行基础集成测试
npx vitest run tests/integration/basic.test.ts

# 运行常量测试
npx vitest run tests/unit/constants.test.ts
```

## 🛡️ 回归测试（Regression Tests）

### 重要性

我们有两个关键的回归测试套件：

1. **`path-config-update.test.ts`** - 18个回归测试，防止配置逻辑回归
2. **`config-serialization.test.ts`** - 9个序列化测试，防止持久化问题（🔴 Critical）

### 测试覆盖的历史问题

#### 配置逻辑问题
1. **PUT请求丢失策略配置** - TTL更新看似不生效
2. **Toggle操作覆盖策略** - 开关缓存后配置丢失
3. **Flush创建不完整配置** - 新路径缺少策略字段

#### 持久化问题（Critical）
4. **JSON.stringify 丢弃 undefined 字段** - 配置存储到KV后字段消失
5. **测试未覆盖序列化流程** - 给了假阳性的安全感

### 快速运行

```bash
# 运行所有单元测试（包含回归测试）
npm run test:unit

# 🛡️ 单独运行配置逻辑回归测试
npx vitest run tests/unit/path-config-update.test.ts

# 🔴 单独运行序列化测试（Critical）
npx vitest run tests/unit/config-serialization.test.ts
```

### 预期输出

```
✓ tests/unit/path-config-update.test.ts (18 tests)
  ✓ 【核心场景1】PUT请求完整保存配置 (4)
  ✓ 【核心场景2】Toggle操作保留配置 (2)
  ✓ 【核心场景3】Flush操作配置完整性 (2)
  ✓ 【核心场景4】策略切换场景 (2)
  ✓ 【核心场景5】边界情况测试 (3)
  ✓ 【核心场景6】中间件读取行为 (2)
  ✓ 【回归保护】历史Bug验证 (3)

✓ tests/unit/config-serialization.test.ts (9 tests) 🔴 Critical
  ✓ 【关键测试】JSON.stringify 行为验证 (2)
  ✓ 【回归测试】完整配置的序列化往返 (3)
  ✓ 【边界测试】CacheConfig 完整往返 (1)
  ✓ 【回归保护】历史Bug验证（带序列化） (2)
  ✓ 【性能测试】序列化性能 (1)
```

### 必须运行时机

⚠️ **修改以下文件后必须运行回归测试**：
- `apps/api/src/routes/admin/paths.ts` - 路径配置API
- `apps/api/src/routes/admin/cache.ts` - 缓存管理API
- `apps/api/src/middleware/cache.ts` - 缓存中间件
- `apps/api/src/types/config.ts` - 配置类型定义

🔴 **修改以下文件后必须运行序列化测试（Critical）**：
- `apps/api/src/lib/config.ts` - 配置持久化逻辑（updateConfig/getConfig）
- `apps/api/src/types/config.ts` - 任何涉及持久化的类型定义
- 任何使用 `JSON.stringify/JSON.parse` 处理配置的代码

详细文档请参考：
- [tests/unit/README_REGRESSION_TESTS.md](./unit/README_REGRESSION_TESTS.md)
- [docs/CRITICAL_FIX_JSON_STRINGIFY.md](../../docs/CRITICAL_FIX_JSON_STRINGIFY.md)

---

## 测试环境限制

⚠️ **注意**: 某些集成测试需要 Cloudflare Workers 环境，在标准 Node.js 环境中会失败：

- `proxy.test.ts` - 需要 Hono 应用实例
- `middleware.test.ts` - 需要中间件栈
- `admin-api.test.ts` - 需要管理 API 端点

这些测试在实际的 Cloudflare Workers 环境中运行时会正常工作。

✅ **回归测试可以在任何Node.js环境中运行**，无需Cloudflare Workers环境。

## Git Hooks

### Pre-commit Hook

项目配置了 pre-commit hook (`.git/hooks/pre-commit`)，在每次提交前自动运行：

1. **TypeScript 类型检查**: `npm run lint`
2. **单元测试**: 运行所有可在 Node.js 环境中运行的测试
3. **覆盖率报告**: 自动生成（如果安装了 c8）

### 跳过 Hook

如果需要跳过 pre-commit 检查：

```bash
git commit --no-verify -m "commit message"
```

## 测试工具

### 测试辅助函数 (`tests/helpers/test-utils.ts`)

- `makeRequest()` - 发送 HTTP 请求并解析响应
- `makeMultipleRequests()` - 发送多个请求（用于限流测试）
- `expectValidProxyHeaders()` - 验证代理头信息
- `expectValidRateLimitHeaders()` - 验证限流头信息
- `expectValidCacheHeaders()` - 验证缓存头信息

### 测试数据 (`tests/fixtures/test-data.ts`)

- 路由配置常量
- 管理 API 端点定义
- 默认配置对象
- 测试用的 IP 地址和国家代码

## 最佳实践

### 1. 测试命名

```typescript
describe('Component Name', () => {
  describe('Feature Group', () => {
    it('should do something specific', () => {
      // 测试代码
    });
  });
});
```

### 2. 异步测试

```typescript
it('should handle async operations', async () => {
  const result = await makeRequest(app, '/test');
  expect(result.status).toBe(200);
});
```

### 3. 错误测试

```typescript
it('should handle invalid input', async () => {
  const response = await makeRequest(app, '/invalid');
  expect(response.status).toBe(400);
  expect(response.body).toHaveProperty('error');
});
```

### 4. 测试隔离

每个测试应该是独立的，不依赖其他测试的状态。

## 覆盖率报告

运行覆盖率测试后，报告将生成在：
- `coverage/` - HTML 报告
- 终端输出 - 文本格式摘要

## 自动化集成

测试框架已配置为：
- 在 pre-commit hook 中运行
- 支持本地开发环境集成
- 生成机器可读的测试报告
- 与 Wrangler 部署流程整合

## 故障排除

### 常见问题

1. **"Cannot find package 'cloudflare:workers'"**
   - 这是正常的，某些集成测试需要 Cloudflare Workers 环境
   - 在 `wrangler dev` 或部署环境中运行测试

2. **TypeScript 错误**
   - 运行 `npm run lint` 检查类型错误
   - 确保所有类型定义正确

3. **测试超时**
   - 增加 `vitest.config.ts` 中的 `testTimeout` 值
   - 检查异步操作是否正确 await

### 调试测试

```bash
# 详细输出
npx vitest run --reporter=verbose

# 只运行失败的测试
npx vitest run --retry=0 --reporter=verbose
```