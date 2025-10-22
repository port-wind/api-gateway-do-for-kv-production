# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (2025-10-18)
- **Dashboard 告警徽章功能** ✅
  - 新增 `GET /api/admin/dashboard/alerts` 接口，支持 5 种告警规则
  - 告警规则：错误率、缓存命中率、流量突增/骤降、RPM 接近峰值
  - 前端 `AlertBadge` 组件：支持展开/收起、关闭单个告警、点击跳转详情
  - 性能优化：共享 `dashboard:snapshot:latest` KV 快照，10 分钟 TTL
  - 前端 60 秒自动刷新，30 秒去重

- **地区访问控制技术方案 v1.2** 📄 🔧
  - 三种控制模式：`allow`（白名单）、`block`（黑名单）、`throttle`（限流）
  - 灵活地区匹配：国家、大洲、自定义地区组
  - 两级配置：全局规则 + 路径级覆盖
  - **性能优化**：内存缓存（TTL 10 分钟 + 版本号）、Throttle Key 设计、异步统计记录
  - **执行顺序**：IP 规则 → 地区规则 → 路径限流（明确优先级）
  - **MVP 范围**：5.5 天（仅 allow/block + 全局规则），完整版 11-15 天
  - **✅ v1.2 修复**：3个关键问题（RateLimiter 调用兼容性、scope 字段缺失、路径匹配逻辑）
  - 详细文档：[docs/geo-access-control.plan.md](./docs/geo-access-control.plan.md)

---

## [Unreleased] - 灵活缓存键策略功能

### 🚧 开发中

**分支**: `feature/flexible-cache-key-strategy`  
**预计完成**: 2-3周  
**详细文档**: [docs/flexible-cache-key-strategy.md](./docs/flexible-cache-key-strategy.md)

### 计划新增功能

#### 后端
- **多种缓存键策略**
  - `path-only`: 仅根据路径缓存（适用于静态内容）
  - `path-params`: 路径 + 请求参数（适用于列表查询）
  - `path-headers`: 路径 + 指定 headers（适用于用户相关数据）
  - `path-params-headers`: 组合策略（适用于复杂场景）
- **灵活配置系统**
  - 每个路径独立配置缓存策略
  - 自定义哪些 header 参与缓存键生成
  - 支持"全部参数"或"指定参数"
- **POST 请求缓存增强**
  - 支持根据 request body 参数生成缓存键
  - 固定参数返回一致的缓存内容
- **缓存条目管理**
  - 新增 `GET /api/admin/paths/:path/cache-entries` API
  - 查询特定路径的所有缓存条目及元数据

#### 前端
- **路径管理界面增强**
  - 新增"缓存策略"列，显示当前使用的策略
  - 新增"缓存条目"列，显示该路径的缓存条目数量
- **配置对话框升级**
  - 缓存键策略选择器（4种策略可选）
  - Headers 配置：输入要包含的 header 名称
  - 参数配置：选择"全部"或"指定参数"
  - 实时策略说明和配置预览
- **缓存条目子表格**
  - 展示每个路径下所有缓存条目
  - 显示 hash 值、大小、创建时间、过期时间
  - 支持单独删除每个缓存条目

### 解决的问题

✅ 用户隔离：不同用户访问 `/biz-client/biz/user/self` 可返回不同内容（基于 token）  
✅ POST 请求缓存：`/biz-client/biz/issueReplayVideo/list` 可根据参数缓存  
✅ 灵活配置：每个路径都有极大的配置自由度  
✅ 缓存可见性：可查看每个路径的所有缓存条目和统计信息

### 向后兼容

- ✅ 完全向后兼容，默认策略保持现有行为
- ✅ 未配置策略的路径自动使用 `path-params` 策略
- ✅ 旧的缓存键继续有效，新旧缓存可共存

---

## [2025-09-26] - TTL缓存功能实现

### Added
- **TTL缓存机制** - 完整的缓存过期时间支持
  - CacheEntry数据结构新增 `ttl`, `expiresAt`, `etag`, `lastModified` 字段
  - PathCacheConfig支持TTL配置（1秒-86400秒）
  - 自动过期检查和失效机制
- **新增缓存管理API**
  - `POST /api/admin/cache/flush` - 缓存刷新API，支持keys数组和pattern模式
  - `GET /api/admin/cache/preview/{path}` - 缓存预览API，查看缓存详情
  - `POST /api/admin/cache/batch` - 批量缓存操作API（flush/preview/stats）
- **前端TTL功能**
  - 路径配置对话框新增TTL输入框和验证
  - 缓存操作按钮：查看缓存、刷新缓存、删除缓存
  - TTL状态显示和剩余时间计算
- **缓存响应头增强**
  - `X-Cache-TTL` - 原始TTL设置
  - `X-Cache-Remaining-TTL` - 剩余TTL时间
  - `X-Cache-Expires` - 过期时间戳
  - ETag和Last-Modified标准HTTP缓存头

### Changed
- **缓存检查逻辑升级**
  - 新增 `isCacheExpired()` 函数检查过期状态
  - 更新 `isCacheEntryValid()` 同时检查版本和TTL
  - `getCacheRemainingTTL()` 函数计算剩余时间
- **缓存中间件增强**
  - 支持TTL配置的三层优先级（路径 > 代理路由 > 全局）
  - 响应头自动添加TTL相关信息
  - 过期缓存检查和处理逻辑
- **前端用户体验改进**
  - TTL配置表单验证和用户提示
  - 缓存操作实时反馈和状态显示
  - 缓存信息格式化展示

### Enhanced
- **缓存功能完整性**
  - 支持永不过期（TTL为空）和定时过期两种模式
  - 版本控制和TTL双重失效机制
  - ETag标准HTTP缓存验证支持
- **API功能扩展**
  - flush API支持版本号自动递增
  - preview API提供完整的缓存元数据
  - batch API支持多种批量操作类型
- **运维体验提升**
  - 完整的缓存操作界面
  - 直观的TTL配置和状态展示
  - 实时的缓存信息反馈

### Technical Details
- 缓存数据结构向后兼容，新字段均为可选
- TTL时间以秒为单位，过期时间戳使用毫秒精度
- 缓存检查逻辑优化，避免重复计算
- 前端API调用使用fetch标准接口
- 响应头遵循HTTP标准缓存协议

## [2025-09-25] - 统一路径管理整合

### Added
- 统一路径管理 API (`/admin/paths`) 完全支持代理路由配置
- 支持 `proxyTarget` 和 `stripPrefix` 配置字段
- 代理中间件优先从统一路径配置读取路由信息
- 前端统一路径配置界面支持代理目标配置
- rendering-client 路由硬编码支持以确保稳定性

### Changed
- 代理路由查找逻辑现在优先检查统一路径配置
- 前端路径管理界面简化为单一 API 调用
- 统一配置数据结构包含所有功能模块（缓存、限流、地域、代理）

### Deprecated
- `/admin/proxy-routes` API 已废弃，使用 `/admin/paths` 替代
- proxy-routes 相关的所有接口将在未来版本中移除

### Removed
- 前端 `use-proxy-routes` hooks
- proxy-routes 相关的组件和 API 调用
- 独立的代理路由管理界面

### Fixed
- rendering-client 端点无法返回数据的问题
- 前端添加路径时缺少 target 配置的问题
- 双系统架构导致的数据不一致问题
- stripPrefix 功能在统一路径系统中的支持

### Technical Details
- 统一路径配置存储在 KV 的 `unified-paths:list` 键中
- 保留硬编码路由作为最终回退机制
- 前端完全移除 proxy-routes 依赖，统一使用 paths API
- 文档更新以反映新的统一架构

## [Earlier] - 历史版本

### Analytics Engine 功能
- 实现了基于 Cloudflare Analytics Engine 的流量监控
- 增强了分析能力和性能监控

### 基础设施改进
- 修复集成测试覆盖率兼容性问题
- 简化 pre-push hook 以提高推送速度
- 更新项目文档以反映 API 网关功能