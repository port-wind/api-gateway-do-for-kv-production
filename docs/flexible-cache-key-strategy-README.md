# 灵活缓存键策略 - 快速导航

## 🎯 项目概述

为 API Gateway 引入可配置的缓存键策略系统，支持基于 headers、参数或两者组合的灵活缓存策略。

**开发分支**: `feature/flexible-cache-key-strategy`

## 📚 文档导航

### 核心文档

| 文档 | 描述 | 阅读对象 |
|-----|------|---------|
| [功能设计文档](./flexible-cache-key-strategy.md) | 完整的技术设计、实施方案、测试计划 | 开发人员 |
| [开发日志](./DEVELOPMENT_LOG.md) | 开发进度追踪、决策记录 | 全体成员 |
| [CHANGELOG](../CHANGELOG.md) | 功能变更预告 | 全体成员 |

### 相关文档

- [API 参考文档](../API_REFERENCE.md) - API 端点详细说明
- [缓存技术方案](../API代理缓存优化技术方案.md) - 缓存系统整体设计
- [开发规范](../CLAUDE.md) - 项目开发规范和最佳实践

## 🚀 快速开始

### 1. 切换到开发分支

```bash
git checkout feature/flexible-cache-key-strategy
```

### 2. 了解核心概念

**4 种缓存键策略**：

```typescript
// 1. path-only: 所有用户共享缓存
cache:v1:/api/config:{hash_of_path}

// 2. path-params: 根据参数区分缓存
cache:v1:/api/articles:{hash_of_path_and_params}

// 3. path-headers: 根据指定 header 区分缓存（用户隔离）
cache:v1:/api/user/self:{hash_of_path_and_selected_headers}

// 4. path-params-headers: 组合策略
cache:v1:/api/orders:{hash_of_path_params_and_headers}
```

### 3. 配置示例

**用户个人信息接口**（基于 token 缓存）：

```json
{
  "path": "/biz-client/biz/user/self",
  "cache": {
    "enabled": true,
    "version": 1,
    "ttl": 300,
    "keyStrategy": "path-headers",
    "keyHeaders": ["authorization"]
  }
}
```

**带参数的列表接口**（基于 token 和参数缓存）：

```json
{
  "path": "/biz-client/biz/issueReplayVideo/list",
  "cache": {
    "enabled": true,
    "version": 1,
    "ttl": 600,
    "keyStrategy": "path-params-headers",
    "keyHeaders": ["authorization"],
    "keyParams": "all"
  }
}
```

## 📋 开发任务追踪

### Phase 1: 后端基础架构 (2-3天)
- [ ] 类型定义和接口设计
- [ ] 缓存键生成算法实现
- [ ] 单元测试

### Phase 2: 后端 API 层 (1-2天)
- [ ] 缓存中间件更新
- [ ] 新增 API 端点
- [ ] 集成测试

### Phase 3: 前端基础组件 (2-3天)
- [ ] 类型同步
- [ ] 基础组件开发
- [ ] 组件测试

### Phase 4: 前端界面集成 (2-3天)
- [ ] 表格界面更新
- [ ] 配置对话框增强
- [ ] 端到端测试

### Phase 5: 测试与优化 (2-3天)
- [ ] 性能测试
- [ ] 向后兼容性测试
- [ ] 文档完善

## 🔍 关键文件清单

### 后端核心文件

```
apps/api/src/
├── types/
│   └── config.ts                    # ⚡ 类型定义（新增策略枚举）
├── lib/
│   └── cache-manager.ts             # ⚡ 缓存管理（重构 getCacheKey）
├── middleware/
│   └── cache.ts                     # ⚡ 缓存中间件（应用策略）
└── routes/admin/
    └── paths.ts                     # ⚡ 路径管理 API（新增端点）
```

### 前端核心文件

```
apps/web/src/
├── types/
│   └── api.ts                       # ⚡ 类型定义（同步后端）
├── components/ui/
│   └── multi-input.tsx              # ✨ 新组件（输入多个值）
└── features/paths/components/
    ├── unified-path-table.tsx       # ⚡ 路径表格（新增列）
    ├── path-config-dialog.tsx       # ⚡ 配置对话框（策略选择）
    └── cache-entries-table.tsx      # ✨ 新组件（缓存条目子表格）
```

**图例**: ⚡ 需要修改 | ✨ 新建文件

## 🧪 测试指南

### 运行测试

```bash
# 后端单元测试
cd apps/api
npm test

# 后端集成测试
npm run test:integration

# 前端组件测试
cd apps/web
npm test

# 端到端测试
npm run test:e2e
```

### 手动测试场景

1. **用户隔离测试**
   - 配置 `/api/user/self` 使用 `path-headers` 策略
   - 使用不同 token 请求
   - 验证返回不同数据

2. **POST 参数缓存测试**
   - 配置 `/api/videos/list` 使用 `path-params` 策略
   - 发送相同参数的 POST 请求
   - 验证第二次请求命中缓存

3. **缓存条目查看测试**
   - 生成多个不同的缓存条目
   - 打开缓存条目子表格
   - 验证显示所有条目及元数据

## 📊 性能基准

| 操作 | 目标 | 当前 | 状态 |
|-----|------|------|------|
| 生成缓存键 (path-only) | < 1ms | TBD | 🔄 |
| 生成缓存键 (path-params) | < 3ms | TBD | 🔄 |
| 生成缓存键 (path-headers) | < 3ms | TBD | 🔄 |
| 生成缓存键 (path-params-headers) | < 5ms | TBD | 🔄 |
| 查询 100 个缓存条目 | < 100ms | TBD | 🔄 |
| 查询 1000 个缓存条目 | < 500ms | TBD | 🔄 |

## 🆘 常见问题

### Q1: 如何选择合适的缓存策略？

**答**: 根据接口特性选择：

| 接口类型 | 推荐策略 | 示例 |
|---------|---------|------|
| 公共配置 | `path-only` | `/api/config` |
| 列表查询 | `path-params` | `/api/articles?page=1` |
| 用户数据 | `path-headers` | `/api/user/profile` |
| 用户查询 | `path-params-headers` | `/api/orders?status=pending` |

### Q2: 修改策略后需要清理旧缓存吗？

**答**: 建议清理，有两种方式：
1. 手动刷新缓存（配置对话框中点击"刷新缓存"）
2. 等待旧缓存自然过期（根据 TTL）

### Q3: 缓存键中的 header 区分大小写吗？

**答**: 不区分。系统会自动将所有 header 名称转为小写处理。

### Q4: 可以指定部分参数参与缓存键吗？

**答**: 可以。`keyParams` 支持两种模式：
- `"all"`: 所有参数
- `["param1", "param2"]`: 指定参数列表

### Q5: 旧配置需要迁移吗？

**答**: 不需要。未配置策略的路径自动使用默认策略（`path-params`），与旧行为一致。

## 🔗 相关资源

### 内部资源
- [项目看板](https://github.com/your-org/api-gateway/projects)
- [团队文档](https://wiki.your-company.com/api-gateway)

### 外部参考
- [Cloudflare Workers Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- [HTTP Caching Best Practices](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
- [Cache Key Design Patterns](https://aws.amazon.com/caching/best-practices/)

## 👥 团队协作

### 负责人
- **后端开发**: TBD
- **前端开发**: TBD
- **测试**: TBD
- **文档**: TBD

### 沟通渠道
- **技术讨论**: Slack #api-gateway-dev
- **Bug 报告**: GitHub Issues
- **代码审查**: Pull Requests

### 会议安排
- **每日站会**: 9:30 AM (15分钟)
- **周报**: 每周五 3:00 PM
- **Code Review**: 提交 PR 后 24 小时内

## 📝 更新日志

| 日期 | 内容 | 作者 |
|-----|------|------|
| 2025-10-02 | 创建初始文档 | Claude |

---

**当前状态**: 🚧 开发准备中  
**下一步**: 开始 Phase 1 开发  
**更新时间**: 2025-10-02

