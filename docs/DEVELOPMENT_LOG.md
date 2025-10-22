# 开发日志

## 2025-10-02 - 灵活缓存键策略功能开发启动

### 背景

当前缓存系统使用固定的缓存键生成策略，无法满足以下业务需求：

1. **用户隔离**：不同用户访问同一路径（如 `/biz-client/biz/user/self`）需要返回不同内容
2. **POST 请求缓存**：需要根据请求参数缓存 POST 请求（如 `/biz-client/biz/issueReplayVideo/list`）
3. **灵活配置**：每个路径需要独立配置缓存键生成策略

### 解决方案

引入**可配置的缓存键策略系统**，支持 4 种策略：
- `path-only`: 仅根据路径缓存
- `path-params`: 路径 + 请求参数
- `path-headers`: 路径 + 指定 headers
- `path-params-headers`: 路径 + 参数 + headers

### 开发计划

**分支**: `feature/flexible-cache-key-strategy`  
**预计工期**: 2-3 周  
**分 5 个阶段**：
1. Phase 1: 后端基础架构（2-3天）
2. Phase 2: 后端 API 层（1-2天）
3. Phase 3: 前端基础组件（2-3天）
4. Phase 4: 前端界面集成（2-3天）
5. Phase 5: 测试与优化（2-3天）

### 相关文档

- 📄 [功能设计文档](./flexible-cache-key-strategy.md) - 完整的技术设计和实施方案
- 🔀 开发分支: `feature/flexible-cache-key-strategy`

### 变更文件预览

**后端**：
- `apps/api/src/types/config.ts` - 新增类型定义
- `apps/api/src/lib/cache-manager.ts` - 重构缓存键生成逻辑
- `apps/api/src/middleware/cache.ts` - 更新缓存中间件
- `apps/api/src/routes/admin/paths.ts` - 新增 API 端点

**前端**：
- `apps/web/src/types/api.ts` - 同步类型定义
- `apps/web/src/components/ui/multi-input.tsx` - 新组件
- `apps/web/src/features/paths/components/cache-entries-table.tsx` - 新组件
- `apps/web/src/features/paths/components/unified-path-table.tsx` - 添加新列
- `apps/web/src/features/paths/components/path-config-dialog.tsx` - 添加策略选择

### 向后兼容性

✅ **完全向后兼容**
- 默认策略为 `path-params`，保持现有行为
- 未配置策略的路径自动使用默认策略
- 旧的缓存键继续有效

### 风险与缓解

| 风险 | 影响 | 缓解措施 |
|-----|------|---------|
| 缓存键生成性能下降 | 中 | 性能测试确保 < 5ms；优化算法 |
| 缓存条目查询慢 | 中 | 限制返回数量；添加分页 |
| 配置复杂度增加 | 低 | 提供清晰的 UI 和文档 |
| 向后兼容性问题 | 高 | 充分测试；提供回滚方案 |

### 回滚方案

如出现严重问题，可通过以下方式快速回滚：

```bash
# 切换回主分支
git checkout main

# 重新部署
npm run deploy
```

---

## 开发进度

### 当前状态：🚧 准备阶段

- [x] 创建开发分支 `feature/flexible-cache-key-strategy`
- [x] 编写完整的功能设计文档
- [x] 制定详细的实施计划
- [ ] Phase 1 开发...

### 下一步行动

1. 开始 Phase 1 开发：修改后端类型定义
2. 实现新的缓存键生成逻辑
3. 编写单元测试

---

## 团队沟通

### 需要讨论的问题

1. ❓ 缓存条目列表是否需要分页？（如果某个路径有数千个缓存条目）
2. ❓ 是否需要为缓存条目添加"访问次数"统计？
3. ❓ Header 名称是否区分大小写？（建议统一小写）

### 决策记录

| 日期 | 决策 | 原因 |
|-----|------|------|
| 2025-10-02 | Header 名称统一转小写处理 | HTTP header 本身不区分大小写，统一处理避免混淆 |
| 2025-10-02 | 默认策略为 `path-params` | 与现有行为一致，确保向后兼容 |

---

## 参考资料

- [RFC: Flexible Cache Key Strategy](./flexible-cache-key-strategy.md)
- [缓存系统技术方案](../API代理缓存优化技术方案.md)
- [API 参考文档](../API_REFERENCE.md)

