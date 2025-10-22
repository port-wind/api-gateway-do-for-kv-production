# 路径冲突解决方案

## 问题背景

随着代理网站数量增加，可能出现"路径重复"问题，即多个代理路由可能匹配同一个路径，导致：
1. 路径归属不明确
2. 统计数据混乱
3. 配置冲突

---

## 设计原则

### 🎯 核心理念：配置阶段阻止冲突，而非运行时选择

**系统不会在运行时做"双后端择一"，而是把冲突挡在配置阶段，让每个路径只落到一个目标上。**

### 三层防护机制

#### 1. Pattern 强唯一性（管理层）
代理路由的 `pattern` 是强唯一的：
- 尝试创建重复 pattern（如 `/biz-client/a/b/c` 指向不同后端）时，接口会返回 `DUPLICATE_PATTERN`
- 只会保留第一个配置

**示例**：
```
已存在: /biz-client/a/b/c → a.com
尝试创建: /biz-client/a/b/c → b.com
结果: ❌ DUPLICATE_PATTERN 错误
```

#### 2. 历史数据清理（运维层）
如果过去有人跳过管理端直接改 KV，导致历史数据里仍有重复配置：
- 使用 `PathMatcher.detectAssignmentConflicts` 巡检捞出冲突记录
- 运维需要手动处理：
  - **保留一个代理**，删除重复的
  - **或者给新的后端换成更具体的 Pattern**（如 `/biz-client/a/b/c/foo`），再配置优先级

#### 3. 精确路径唯一性（数据层）
一条精确路径只允许绑定一个 `proxyId`：
- 重复写入会被 `PATH_EXISTS` 拦截
- 确保数据层面的一致性

### 业务需求处理

如果确实需要一条路径指向多个上游（如 A/B 测试、灰度发布）：
- ❌ **不支持**：在代理路由层面配置"双后端"
- ✅ **推荐方案**：
  1. 业务层面拆分成不同的路径规则（如 `/api/v1` vs `/api/v2`）
  2. 在应用层实现单独的灰度逻辑
  3. 使用更具体的 Pattern + 优先级组合

---

## 解决方案

基于上述设计原则，我们在网关里实现了两层防护，可以随着代理数量增长而可靠运行。

---

## 1. Pattern 唯一性校验（管理层防护）

### 实现位置
- `apps/api/src/routes/admin/proxy-routes.ts:112`（创建路由）
- `apps/api/src/routes/admin/proxy-routes.ts:180`（更新路由）
- `apps/api/src/routes/admin/proxy-routes.ts:230`（批量操作）

### 机制
管理端创建/更新代理路由时会强制校验 `pattern` 唯一性：
- 重复提交直接返回 `DUPLICATE_PATTERN` 错误
- 避免把同样的通配规则写进 KV

### 示例
```typescript
// 已存在路由: pattern = "/kv/*"
// 尝试创建新路由: pattern = "/kv/*"
// 结果: ❌ 返回 DUPLICATE_PATTERN 错误
```

---

## 2. 优先级排序匹配（运行时防护）

### 实现位置
- `apps/api/src/lib/proxy-routes.ts:46`（排序逻辑）
- `apps/api/src/lib/proxy-routes.ts:58`（匹配逻辑）

### 机制
即便存在多个前缀重叠的路由，也会先按 `priority` 排序后再匹配：
- 只会选中优先级最高的一条
- 防止多个 proxy 同时命中同一路径

### 优先级调整
管理接口提供 `/proxy-routes/reorder` 批量调序，新增站点时可以手工把更具体的规则调到更高优先级。

### 示例
```typescript
// 路由列表（按 priority 排序）:
// 1. pattern = "/kv/specific/*",  priority = 100
// 2. pattern = "/kv/*",           priority = 50

// 请求: /kv/specific/test
// 匹配结果: ✅ 命中路由 1（更高优先级）

// 请求: /kv/general/test
// 匹配结果: ✅ 命中路由 2
```

---

## 3. 路径归属校验（数据层防护）

### 实现位置
- `apps/api/src/routes/admin/paths.ts:753`（路径存在性检查）
- `apps/api/src/routes/admin/paths.ts:764`（归属校验）

### 机制
精确路径层面，落库前会先核对：
1. 该路径是否已经存在
2. 校验它确实隶属于选定的代理模式

从源头避免"同一路径被多个 proxy 挂载"这种脏数据。

---

## 4. 冲突检测工具（健康检查）

### 实现位置
- `apps/api/src/lib/path-matcher.ts:167`（`detectAssignmentConflicts`）

### 机制
`PathMatcher.detectAssignmentConflicts` 走最长前缀匹配逻辑，能列出当前归属与预期不一致的路径。

### 用途
后续如果担心历史数据里的冲突，可以用这个工具做巡检，方便我们写一个后台任务做健康检查。

### 示例
```typescript
import { PathMatcher } from './lib/path-matcher';

// 检测冲突
const conflicts = PathMatcher.detectAssignmentConflicts(
  allPaths,          // 所有路径 (UnifiedPathConfig[])
  proxyRoutes        // 所有代理路由 (ProxyRoute[])
);

// 返回格式:
// [
//   {
//     path: UnifiedPathConfig,      // 完整的路径配置对象
//     expectedProxy: ProxyRoute | null  // 期望匹配的代理路由（null 表示不应被任何代理处理）
//   }
// ]

// 使用示例：
conflicts.forEach(conflict => {
  console.log(`路径 ${conflict.path.path} 当前分配给: ${conflict.path.proxyId}`);
  console.log(`应该分配给: ${conflict.expectedProxy?.id || '无'}`);
});
```

---

## 后续改进方向

### 1. 定时巡检接口
利用冲突检测做一个定时巡检接口：
```bash
GET /api/admin/paths/conflicts
```

返回：
- 冲突的路径列表
- 当前归属
- 预期归属
- 建议操作

### 2. 切换到 PathMatcher 正则实现
把 `findMatchingProxyRoute` 也切到 `PathMatcher` 的正则实现，进一步提升复杂模式的兼容性。

---

## 最佳实践

### 创建新代理路由时
1. ✅ 使用明确的 pattern（如 `/kv/*` 而非 `/*`）
2. ✅ 设置合理的优先级（更具体的规则 = 更高优先级）
3. ✅ 避免重复 pattern

### 管理多个代理路由时
1. ✅ 定期检查路径归属（使用 `/api/admin/paths` 查看）
2. ✅ 使用 `/proxy-routes/reorder` 调整优先级
3. ✅ 禁用不再使用的路由而非删除（保留历史数据）

### 排查问题时
1. ✅ 检查 pattern 是否唯一
2. ✅ 检查优先级顺序
3. ✅ 使用冲突检测工具找出异常路径

---

## 相关文档

- [路径统计架构](./path-stats-refactor.md)
- [PathMatcher 工具实现](../apps/api/src/lib/path-matcher.ts)
- [代理路由管理 API](../apps/api/src/routes/admin/proxy-routes.ts)

---

**最后更新**: 2025-10-17
**维护者**: @andy-zhan

