# 部署命令参考

## 快速部署

### 一键部署

```bash
pnpm run deploy
```

**同时部署** API (Cloudflare Worker) 和 Web 前端到 r197 服务器（并行模式，更快）。

> **提示**: 必须使用 `pnpm run deploy`（有 run），不能用 `pnpm deploy`

---

## 单独部署

### 只部署 API
```bash
pnpm run deploy:api
```
部署 Cloudflare Worker API 到云端。

### 只部署 Web
```bash
pnpm run deploy:web
```
部署 Web 前端到 r197 (192.168.0.197) 服务器。

---

## 部署说明

### 前置要求

1. **SSH 配置**
   - 确保已配置 SSH 密钥到 r197 服务器
   - 用户名: `portwin`
   - 服务器: `192.168.0.197`

2. **Cloudflare 配置**
   - API 部署需要配置 Cloudflare Workers 凭证
   - 确保 `apps/api/wrangler.toml` 配置正确

### 部署流程

#### 完整部署 (`pnpm run deploy:197`)
```
阶段 1: 部署 API
  ├─ 运行测试
  ├─ 部署到 Cloudflare Workers
  └─ 验证部署

阶段 2: 部署 Web
  ├─ 安装依赖
  ├─ 构建前端
  ├─ 打包构建产物
  ├─ 上传到 r197
  ├─ 备份现有文件
  ├─ 解压部署
  └─ 验证部署
```

### 部署目录

- **API**: Cloudflare Workers (云端)
- **Web**: `/srv/api-proxy-admin-web` (r197 服务器)

### 访问地址

- **API**: `https://your-worker.workers.dev`
- **Web**: `http://192.168.0.197`

---

## 故障排除

### SSH 连接失败
```bash
# 测试 SSH 连接
ssh portwin@192.168.0.197 "echo 'SSH 连接成功'"

# 如果需要配置 SSH 密钥
ssh-copy-id portwin@192.168.0.197
```

### Sudo 密码提示
如果部署时提示输入 sudo 密码，在 r197 上配置免密：
```bash
# 在 r197 上执行
echo "portwin ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/portwin
sudo chmod 0440 /etc/sudoers.d/portwin
```

### API 部署失败
检查 Cloudflare Workers 配置：
```bash
cd apps/api
cat wrangler.toml
wrangler whoami
```

### Web 构建失败
清理并重新安装依赖：
```bash
pnpm clean
pnpm install
```

---

## 其他有用的命令

```bash
# 开发模式
pnpm dev              # 同时启动 API 和 Web 开发服务器
pnpm run dev:api      # 只启动 API 开发服务器
pnpm run dev:web      # 只启动 Web 开发服务器

# 测试
pnpm test             # 运行所有测试
pnpm run test:api     # 只运行 API 测试

# 构建
pnpm build            # 构建所有项目

# 代码检查
pnpm lint             # 运行 linter
pnpm typecheck        # TypeScript 类型检查
```

---

## 常见问题

### 为什么不能使用 `pnpm deploy`？

`pnpm deploy` 是 pnpm 的内置命令，用于部署到特定的工作区。我们使用 `pnpm run deploy:197` 来避免命令冲突。

### 命令速查

```bash
pnpm run deploy        # 部署前后端（并行，快速）⚡
pnpm run deploy:api    # 只部署 API
pnpm run deploy:web    # 只部署 Web
```

> ⚠️ 注意：不能使用 `pnpm deploy`（会报错）
```

---

## 部署脚本位置

- **完整部署**: `scripts/deploy-all-to-197.sh`
- **Web 部署**: `scripts/deploy-web-to-197.sh`
- **API 部署**: `apps/api/deploy.sh`
