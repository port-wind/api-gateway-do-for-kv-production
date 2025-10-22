# 缓存策略：支持全部 Headers

## 概述

本次更新为缓存键策略添加了对"全部 Headers"的支持，使 `keyHeaders` 配置与 `keyParams` 保持一致的能力。

## 变更内容

### 1. 类型定义更新

#### 后端 (`apps/api/src/types/config.ts`)

```typescript
export interface PathCacheConfig {
  // ...
  keyHeaders?: 'all' | string[] | null;  // 新增：支持 'all'
  keyParams?: 'all' | string[] | null;   // 保持不变
}
```

#### 前端 (`apps/web/src/types/api.ts`)

```typescript
export interface PathCacheConfig {
  // ...
  keyHeaders?: 'all' | string[];  // 新增：支持 'all'
  keyParams?: 'all' | string[];   // 保持不变
}
```

### 2. 缓存键生成逻辑更新

**文件**: `apps/api/src/lib/cache-manager.ts`

`processHeaders` 函数现在支持 `'all'` 参数：

```typescript
function processHeaders(
  headers: Record<string, string>, 
  keyHeaders: 'all' | string[] | undefined
): string {
  if (!headers || !keyHeaders) {
    return '';
  }

  const normalizedHeaders = /* 标准化 header 键名 */;

  let headerValues: Record<string, string>;

  if (keyHeaders === 'all') {
    // 使用所有 headers
    headerValues = normalizedHeaders;
  } else if (Array.isArray(keyHeaders)) {
    // 提取指定的 headers
    headerValues = /* 提取逻辑 */;
  }

  // 排序后序列化
  return JSON.stringify(sortObjectKeys(headerValues));
}
```

### 3. 前端 UI 更新

**文件**: `apps/web/src/features/paths/components/path-config-dialog.tsx`

添加了 Headers 范围选择器：

- **单选按钮组**：
  - "全部 Headers"：使用所有请求 headers 生成缓存键
  - "指定 Headers"：仅使用选定的 headers

- **条件显示**：
  - 选择"全部 Headers"时，显示紫色提示框说明影响
  - 选择"指定 Headers"时，显示常用 headers 快速选择和自定义输入

- **警告提示**：
  - 全部 Headers 模式会显示警告，说明可能导致缓存命中率降低

### 4. 表格显示更新

**文件**: `apps/web/src/features/paths/components/unified-path-table.tsx`

更新了缓存策略的 Tooltip 显示：

```typescript
Headers: {pathConfig.cache.keyHeaders === 'all' 
  ? '所有 Headers' 
  : pathConfig.cache.keyHeaders.join(', ')}
```

### 5. 单元测试

**文件**: `apps/api/tests/unit/cache-key-strategy.test.ts`

新增测试用例：

1. **path-headers 策略**：
   - `keyHeaders 为 all 时应该包含所有 headers`
   - `keyHeaders 为 all 时相同 headers 应生成相同缓存键`

2. **path-params-headers 策略**：
   - `应该支持 keyHeaders 为 all 和 keyParams 为 all`
   - `keyHeaders 为 all 但 keyParams 指定特定参数`

所有 32 个测试均通过 ✅

## 使用场景

### 适用场景

- **极高安全性要求**：需要完全隔离不同请求的场景
- **完全个性化内容**：每个请求的任何 header 差异都会影响响应内容
- **调试和开发**：临时启用以观察所有 header 的影响

### 不适用场景

- **高缓存命中率要求**：会导致缓存条目数量激增
- **性能敏感场景**：大量细粒度缓存条目会降低性能
- **常规用户隔离**：通常指定特定 headers（如 `authorization`）即可

## 配置示例

### 示例 1：使用全部 Headers

```typescript
{
  "cache": {
    "enabled": true,
    "version": 1,
    "keyStrategy": "path-headers",
    "keyHeaders": "all"  // 使用所有 headers
  }
}
```

### 示例 2：指定特定 Headers

```typescript
{
  "cache": {
    "enabled": true,
    "version": 1,
    "keyStrategy": "path-headers",
    "keyHeaders": ["authorization", "x-user-id"]  // 仅使用这两个
  }
}
```

### 示例 3：混合使用

```typescript
{
  "cache": {
    "enabled": true,
    "version": 1,
    "keyStrategy": "path-params-headers",
    "keyHeaders": "all",           // 所有 headers
    "keyParams": ["page", "size"]  // 指定参数
  }
}
```

## UI 截图说明

### Headers 范围选择

1. **全部 Headers**
   - 显示警告：可能导致缓存命中率降低
   - 隐藏常用 headers 快速选择和自定义输入
   - 显示紫色提示框说明影响

2. **指定 Headers**（默认）
   - 显示常用 headers 快速选择按钮
   - 显示自定义 headers 输入框
   - 显示当前已选 headers 的蓝色信息框

## 向后兼容性

✅ **完全向后兼容**

- 现有配置（`keyHeaders: string[]`）继续正常工作
- 未配置 `keyHeaders` 时默认行为不变
- 所有现有测试保持通过

## 注意事项

⚠️ **使用"全部 Headers"模式时请注意**：

1. **缓存命中率**：任何 header 的差异都会产生新的缓存条目
2. **存储空间**：可能快速消耗 KV 存储空间
3. **性能影响**：大量缓存条目可能影响查询性能
4. **调试难度**：增加了缓存行为的复杂度

## 相关文件

- `/apps/api/src/types/config.ts` - 后端类型定义
- `/apps/api/src/lib/cache-manager.ts` - 缓存键生成逻辑
- `/apps/web/src/types/api.ts` - 前端类型定义
- `/apps/web/src/features/paths/components/path-config-dialog.tsx` - 配置对话框
- `/apps/web/src/features/paths/components/unified-path-table.tsx` - 表格显示
- `/apps/api/tests/unit/cache-key-strategy.test.ts` - 单元测试

## 更新日期

2025-10-08
