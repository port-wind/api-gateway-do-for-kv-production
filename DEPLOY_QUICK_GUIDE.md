# 快速部署指南

## 🚀 推荐的部署方式

### 方式 1：首次部署或完整部署（慢但完整）

```bash
# 安装依赖 + 构建 + 部署（需要 3-5 分钟）
pnpm run deploy
```

### 方式 2：快速部署（推荐，仅需 10-30 秒）⚡

```bash
# 第一步：本地构建前端（一次性，约 1-2 分钟）
pnpm --filter @gateway/web build

# 第二步：快速部署（跳过构建，约 10-30 秒）
pnpm run deploy:web:fast
```

### 方式 3：仅重新部署前端（已构建过）

```bash
# 如果 dist 目录已存在，直接部署（约 10-30 秒）
pnpm run deploy:web:skip-build
```

## 📦 可用的部署命令

### 完整部署

| 命令 | 说明 | 耗时 |
|------|------|------|
| `pnpm run deploy` | API + Web 并行部署（完整流程） | ~3-5 分钟 |
| `pnpm run deploy:api` | 仅部署 API (Cloudflare Worker) | ~30-60 秒 |
| `pnpm run deploy:web` | 仅部署 Web（包含构建） | ~2-3 分钟 |

### 快速部署（跳过构建）⚡

| 命令 | 说明 | 耗时 |
|------|------|------|
| `pnpm run deploy:web:fast` | 快速部署 Web（跳过安装和构建） | ~10-30 秒 |
| `pnpm run deploy:web:skip-build` | 部署 Web（跳过构建） | ~30-60 秒 |

### 本地构建和运行

| 命令 | 说明 |
|------|------|
| `pnpm run build:197` | 构建并在本地 8197 端口运行 |
| `pnpm run build:serve` | 构建并在本地 14289 端口运行 |

## 🔍 常见问题

### Q: 为什么 `pnpm run deploy` 会报 "index.html 不存在"？

**A:** 这是因为前端还没有构建。解决方案：

```bash
# 方案 1：先构建再部署
pnpm --filter @gateway/web build
pnpm run deploy:web:fast

# 方案 2：使用完整部署命令（会自动构建）
pnpm run deploy:web
```

### Q: 如何加速部署？

**A:** 使用快速部署模式：

1. **本地先构建**（开发时只需构建一次）：
   ```bash
   pnpm --filter @gateway/web build
   ```

2. **每次部署用快速模式**：
   ```bash
   pnpm run deploy:web:fast
   ```

### Q: Jenkins 部署失败怎么办？

**A:** 确保 Jenkinsfile 中使用了正确的部署命令：

```groovy
// 推荐：完整部署
sh 'bash scripts/deploy-web-to-197.sh'

// 或者：快速部署（如果构建已经完成）
sh 'bash scripts/deploy-web-to-197.sh --skip-build'
```

### Q: 如何验证部署是否成功？

**A:** 检查以下内容：

1. **查看部署日志**：
   ```bash
   # SSH 登录服务器
   ssh portwin@192.168.0.197
   
   # 查看服务日志
   pm2 logs api-gateway-web
   ```

2. **访问前端**：
   ```
   http://192.168.0.197:14289
   ```

3. **检查文件**：
   ```bash
   ls -la /srv/api-proxy-admin-web/
   # 应该看到 index.html 和 assets 目录
   ```

## 💡 最佳实践

### 开发阶段

```bash
# 1. 修改代码后，本地测试
pnpm run dev:web

# 2. 测试通过后，构建
pnpm --filter @gateway/web build

# 3. 快速部署到测试服务器
pnpm run deploy:web:fast
```

### 生产部署

```bash
# 使用完整部署流程，确保所有依赖都是最新的
pnpm run deploy
```

### CI/CD (Jenkins)

```groovy
stage('Build') {
  steps {
    sh 'pnpm install --frozen-lockfile'
    sh 'pnpm --filter @gateway/web build'
  }
}

stage('Deploy') {
  steps {
    // 使用 --skip-build 因为前面已经构建过
    sh 'bash scripts/deploy-web-to-197.sh --skip-build'
  }
}
```

## 📊 部署时间对比

| 方式 | 第一次 | 后续 | 说明 |
|------|--------|------|------|
| 完整部署 | ~5 分钟 | ~3 分钟 | 安装依赖 + 构建 + 部署 |
| 跳过安装 | ~3 分钟 | ~2 分钟 | 构建 + 部署 |
| 跳过构建 | ~1 分钟 | ~30 秒 | 仅部署 |
| **快速模式** | **~30 秒** | **~10 秒** | **仅打包和上传** ⚡ |

## 🎯 推荐工作流

```bash
# 开发时（只需要构建一次）
pnpm --filter @gateway/web build

# 每次修改代码后
# 1. 本地测试
pnpm run dev:web

# 2. 确认无误后，重新构建
pnpm --filter @gateway/web build

# 3. 快速部署
pnpm run deploy:web:fast  # 只需 10-30 秒！
```

## 🔧 脚本参数说明

### deploy-web-to-197.sh

```bash
# 完整部署（默认）
bash scripts/deploy-web-to-197.sh

# 跳过依赖安装
bash scripts/deploy-web-to-197.sh --skip-install

# 跳过构建
bash scripts/deploy-web-to-197.sh --skip-build

# 快速模式（跳过安装和构建）
bash scripts/deploy-web-to-197.sh --fast
```

## 📝 更新日期

2025-10-08
