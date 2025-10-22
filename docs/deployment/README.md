# 部署文档

本目录包含 API Gateway 的部署相关文档。

## 📚 文档索引

### 快速开始
- **[quick-start.md](./quick-start.md)** - 快速部署指南（推荐）
  - 三条命令搞定部署
  - 最常用的部署方式

### 详细指南
- **[deploy-guide.md](./deploy-guide.md)** - 完整部署参考手册
  - 所有部署命令详解
  - 前置要求和配置
  - 故障排查指南

### 性能优化
- **[deploy-performance.md](./deploy-performance.md)** - 部署性能分析
  - 并行 vs 串行部署对比
  - 性能优化技巧
  - 实际案例分析

### 高级配置
- **[advanced-setup.md](./advanced-setup.md)** - 高级部署配置
  - Shell 别名配置
  - 自定义部署脚本
  - 环境配置优化

### Jenkins 集成
- **[JENKINS_QUICK_START.md](./JENKINS_QUICK_START.md)** - Jenkins 5分钟快速开始
  - 为什么不难？
  - 3 步配置上手
  - 最简单的集成方案

- **[jenkins-integration.md](./jenkins-integration.md)** - Jenkins 完整集成指南
  - 详细配置步骤
  - Pipeline 示例
  - 故障排查

- **[multi-account-guide.md](./multi-account-guide.md)** - Cloudflare 多账号管理
  - 测试/生产环境分离
  - 多凭证配置
  - 安全最佳实践

### 认证和登录
- **[CLOUDFLARE_TOKEN_SETUP.md](./CLOUDFLARE_TOKEN_SETUP.md)** - API Token 快速设置（5分钟）
  - 创建 API Token 步骤
  - Jenkins 凭证配置
  - 验证和测试

- **[cloudflare-auth-guide.md](./cloudflare-auth-guide.md)** - 完整认证指南
  - API Token vs 交互式登录
  - 本地开发认证
  - CI/CD 自动认证
  - 常见问题解决

## 🚀 快速部署

```bash
# 部署前后端
pnpm run deploy

# 只部署 API
pnpm run deploy:api

# 只部署 Web
pnpm run deploy:web
```

详细信息请查看 [quick-start.md](./quick-start.md)

## 📋 部署架构

- **API**: Cloudflare Workers (边缘计算)
- **Web**: r197 服务器 (192.168.0.197)
- **部署方式**: 并行部署（默认）

## 🔧 脚本位置

- `scripts/deploy-all-to-197.sh` - 完整部署脚本
- `scripts/deploy-web-to-197.sh` - Web 部署脚本
- `apps/api/deploy.sh` - API 部署脚本

## 📞 支持

遇到问题？查看 [deploy-guide.md](./deploy-guide.md) 的故障排查章节。
