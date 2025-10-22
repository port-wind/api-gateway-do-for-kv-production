# 🚀 快速部署指南

## 三个命令搞定一切

```bash
# 1️⃣ 部署前后端（推荐）
pnpm run deploy

# 2️⃣ 只部署 API
pnpm run deploy:api

# 3️⃣ 只部署 Web
pnpm run deploy:web
```

就这么简单！ 🎉

---

## 详细说明

### pnpm run deploy
- 同时部署 API 和 Web（并行模式）
- 最快，推荐日常使用
- 自动等待两个任务都完成

### pnpm run deploy:api
- 只部署 Cloudflare Worker API
- 用于只改了后端代码时

### pnpm run deploy:web
- 只部署 Web 前端到 r197
- 用于只改了前端代码时

---

## ⚠️ 重要提示

必须用 `pnpm run deploy`，不能用 `pnpm deploy`（会报错）

---

## 🎯 典型使用场景

```bash
# 改了前后端代码
pnpm run deploy

# 只改了 API
pnpm run deploy:api

# 只改了前端
pnpm run deploy:web
```

---

## 🔧 前置要求

### API 部署
- 已登录 Cloudflare 账号（`wrangler login`）
- 配置文件：`apps/api/wrangler.toml`

### Web 部署
- SSH 访问 r197 服务器（192.168.0.197）
- 用户名：portwin
- 目标目录：/srv/api-proxy-admin-web

---

## 📊 部署流程

执行 `pnpm run deploy` 时会：

**并行执行两个任务：**

**任务 1: API 部署**
1. 检查 Cloudflare 账号
2. 运行测试
3. 部署到 Cloudflare Workers
4. 验证部署

**任务 2: Web 部署**
1. 检查 SSH 连接
2. 检测并跳过已有依赖
3. 构建前端
4. 打包构建产物
5. 上传到 r197
6. 备份现有文件
7. 解压部署
8. 验证部署

---

## 🌐 访问地址

部署完成后：

- **API Gateway**: https://your-worker.workers.dev
- **Web Dashboard**: http://192.168.0.197

---

## 🐛 故障排查

### SSH 连接失败

```bash
# 测试 SSH 连接
ssh portwin@192.168.0.197 "echo 'SSH 连接成功'"

# 配置 SSH 密钥
ssh-copy-id portwin@192.168.0.197
```

### API 部署失败

```bash
# 检查 Cloudflare 登录状态
cd apps/api
wrangler whoami

# 重新登录
wrangler login
```

### 依赖安装卡住

脚本会自动检测已有依赖并跳过安装。如果还有问题：

```bash
# 清理依赖后重试
rm -rf node_modules apps/*/node_modules
pnpm run deploy
```

---

## 📚 更多文档

- **完整指南**: [deploy-guide.md](./deploy-guide.md)
- **性能优化**: [deploy-performance.md](./deploy-performance.md)
- **高级配置**: [advanced-setup.md](./advanced-setup.md)