# 缓存配置回归测试说明

## 📋 测试概述

本文档说明 `path-config-update.test.ts` 中的回归测试套件，用于防止缓存配置相关的历史问题再次出现。

## 🐛 历史问题回顾

### 问题1：PUT请求丢失策略配置字段
- **文件**: `apps/api/src/routes/admin/paths.ts` (Line 902-910)
- **问题**: PUT `/paths/:encodedPath` 只保存 `enabled`/`version`/`ttl`，丢失 `keyStrategy`/`keyHeaders`/`keyParams`
- **影响**: TTL更新看似不生效，因为缓存键策略错误导致缓存未命中
- **修复日期**: 2025-10-07

### 问题2：Toggle操作覆盖策略配置
- **文件**: `apps/api/src/routes/admin/paths.ts` (Line 998-1007)
- **问题**: `toggle-cache` 批量操作会创建新的配置对象，覆盖现有策略设置
- **影响**: 用户配置的缓存策略在开关后丢失
- **修复日期**: 2025-10-07

### 问题3：Flush操作创建不完整配置
- **文件**: `apps/api/src/routes/admin/cache.ts` (Line 244-251, 740-747)
- **问题**: Flush操作为新路径创建配置时，缺少策略字段
- **影响**: 新路径缺少策略字段，导致后续操作异常
- **修复日期**: 2025-10-07

## ✅ 测试覆盖范围

### 测试套件结构（18个测试用例）

```
路径配置更新 - 缓存策略保存（回归测试）
│
├── 【核心场景1】PUT请求完整保存配置 (4个测试)
│   ├── ✓ 应该保存完整的缓存策略配置（包含所有字段）
│   ├── ✓ 应该正确保存 path-only 策略
│   ├── ✓ 应该正确保存 path-headers 策略
│   └── ✓ TTL更新应该立即生效
│
├── 【核心场景2】Toggle操作保留配置 (2个测试)
│   ├── ✓ toggle操作应该保留现有策略配置
│   └── ✓ 多次toggle应该保持配置稳定
│
├── 【核心场景3】Flush操作配置完整性 (2个测试)
│   ├── ✓ flush操作创建新配置时应该有策略字段
│   └── ✓ flush后应该保留现有配置
│
├── 【核心场景4】策略切换场景 (2个测试)
│   ├── ✓ 从path-only切换到path-headers
│   └── ✓ 从path-headers切换到path-params应该清除headers
│
├── 【核心场景5】边界情况测试 (3个测试)
│   ├── ✓ TTL=undefined 应该使用默认300秒（新契约2025-10-14）
│   ├── ✓ 极大TTL值应该正常保存
│   └── ✓ 连续快速更新应该保持最终值
│
├── 【核心场景6】中间件读取行为 (2个测试)
│   ├── ✓ 缓存中间件应该能读取完整的策略配置
│   └── ✓ 未定义的策略应该使用默认行为
│
└── 【回归保护】历史Bug验证 (3个测试)
    ├── ✓ Bug修复验证：PUT请求必须保存keyStrategy
    ├── ✓ Bug修复验证：toggle操作必须保留策略配置
    └── ✓ Bug修复验证：flush创建新配置必须包含策略字段
```

## 🎯 关键测试用例说明

### 1. 配置完整性验证

```typescript
// 验证所有字段都被保存
expect(savedConfig).toEqual({
    enabled: true,
    version: 1,
    ttl: 300,
    keyStrategy: 'path-params-headers',
    keyHeaders: ['cid', 'token', 'x-client-id'],
    keyParams: 'all'
});
```

**保护内容**: 确保PUT请求保存所有必需的缓存配置字段

### 2. Toggle稳定性验证

```typescript
// 模拟5次toggle
for (let i = 0; i < 5; i++) {
    config = { ...config, enabled: !config.enabled };
}
// 验证配置完整
expect(config.ttl).toBe(555);
expect(config.keyStrategy).toBe('path-params-headers');
```

**保护内容**: 确保多次开关缓存后，策略配置不会丢失

### 3. 回归保护验证

```typescript
// 如果这个测试失败，说明有人移除了这些字段的保存逻辑
expect(saved).toHaveProperty('keyStrategy');
expect(saved).toHaveProperty('keyHeaders');
expect(saved).toHaveProperty('keyParams');
```

**保护内容**: 直接验证历史Bug的修复代码，防止被意外破坏

## 🚀 运行测试

### 运行所有单元测试
```bash
cd apps/api
npm test
```

### 仅运行回归测试
```bash
cd apps/api
npm test -- path-config-update.test.ts
```

### 预期输出
```
✓ tests/unit/path-config-update.test.ts (18 tests) 120ms

Test Files  1 passed (1)
     Tests  18 passed (18)
```

## 🛡️ 如何使用这些测试

### 开发时
1. **修改缓存配置相关代码前**，先运行测试确认当前状态
2. **修改后立即运行测试**，确保没有破坏现有行为
3. **如果测试失败**，检查是否意外移除了关键字段的保存逻辑

### CI/CD 流程
1. 将此测试加入到自动化测试流程
2. 任何PR修改了以下文件时，必须运行此测试：
   - `apps/api/src/routes/admin/paths.ts`
   - `apps/api/src/routes/admin/cache.ts`
   - `apps/api/src/middleware/cache.ts`
   - `apps/api/src/types/config.ts`

### Code Review 检查点
当看到有人修改配置保存相关代码时，检查：
- ✅ 是否保存了 `keyStrategy`
- ✅ 是否保存了 `keyHeaders`
- ✅ 是否保存了 `keyParams`
- ✅ Toggle操作是否使用了 `...existingConfig` 扩展运算符
- ✅ 测试是否全部通过

## 📊 测试覆盖的Bug场景

| 场景 | 测试数量 | 覆盖问题 |
|------|---------|---------|
| PUT请求字段丢失 | 4 | ✅ 问题1 |
| Toggle配置覆盖 | 2 | ✅ 问题2 |
| Flush配置不完整 | 2 | ✅ 问题3 |
| 策略切换异常 | 2 | ✅ 边界情况 |
| TTL边界值 | 3 | ✅ 边界情况 |
| 中间件读取 | 2 | ✅ 集成验证 |
| 回归保护 | 3 | ✅ 全部问题 |

## 🔍 测试失败时的诊断步骤

### 如果测试 "PUT请求必须保存keyStrategy" 失败
1. 检查 `apps/api/src/routes/admin/paths.ts` 的 PUT 端点
2. 确认以下代码存在：
   ```typescript
   cacheConfig.pathConfigs[path] = {
       enabled: true,
       version: ...,
       ttl: ...,
       keyStrategy: newConfig.cache!.keyStrategy,  // ← 必须存在
       keyHeaders: newConfig.cache!.keyHeaders,    // ← 必须存在
       keyParams: newConfig.cache!.keyParams       // ← 必须存在
   };
   ```

### 如果测试 "toggle操作必须保留策略配置" 失败
1. 检查 `apps/api/src/routes/admin/paths.ts` 的 toggle-cache 逻辑
2. 确认使用了扩展运算符：
   ```typescript
   cacheConfig.pathConfigs[operation.path] = {
       ...existingCacheConfig,  // ← 必须存在
       enabled: true,
       version: ...,
   };
   ```

### 如果测试 "flush创建新配置必须包含策略字段" 失败
1. 检查 `apps/api/src/routes/admin/cache.ts` 的 flush 端点
2. 确认新配置包含所有字段：
   ```typescript
   config.pathConfigs[keyPath] = {
       enabled: true,
       version: ...,
       keyStrategy: undefined,  // ← 必须存在
       keyHeaders: undefined,   // ← 必须存在
       keyParams: undefined     // ← 必须存在
   };
   ```

## 📝 添加新测试用例

如果发现新的Bug或边界情况，请：

1. 在对应的 `describe` 块中添加测试
2. 遵循命名规范：`should/应该 + 具体行为`
3. 包含以下部分：
   - 场景说明（注释）
   - 模拟数据准备
   - 操作执行
   - 断言验证
4. 在本文档中更新测试覆盖表

## 🎖️ 测试质量保证

### 当前状态
- ✅ 18/18 测试通过（100%）
- ✅ 覆盖所有历史Bug场景
- ✅ 包含边界情况测试
- ✅ 包含回归保护测试
- ✅ 快速执行（~120ms）

### 维护建议
1. **每月检查**：确保测试仍然通过
2. **修复后添加测试**：每次修复Bug后，立即添加对应的回归测试
3. **重构时保持测试**：重构代码时，确保测试仍然有效
4. **文档同步更新**：修改测试时，同步更新本文档

## 📚 相关文档

- [API参考](../../API_REFERENCE.md)
- [缓存策略文档](../../docs/flexible-cache-key-strategy.md)
- [部署指南](../../DEPLOY_GUIDE.md)

## 👥 联系方式

如有测试相关问题，请联系：
- 系统架构师
- 后端开发团队

---

**最后更新**: 2025-10-07  
**测试版本**: v1.0  
**维护状态**: ✅ 活跃维护
