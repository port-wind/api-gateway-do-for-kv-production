# 设置快捷部署命令

## 🎯 目标

让你可以在项目目录中直接输入简短的命令来部署：
- `deploy` - 部署前后端到 r197
- 或使用 `pnpm run deploy`

## 📝 当前可用的命令

### 标准方式（推荐）

```bash
pnpm run deploy          # 部署前后端
pnpm run deploy:api      # 只部署 API
pnpm run deploy:web:197  # 只部署 Web
```

### 快捷脚本方式

```bash
./deploy-quick.sh        # 部署前后端
```

## 🚀 创建全局别名（可选）

如果你想在项目目录中直接输入 `deploy` 命令，可以添加别名到你的 shell 配置：

### 对于 Zsh（你当前使用的）

```bash
# 1. 编辑你的 ~/.zshrc 文件
nano ~/.zshrc

# 2. 在文件末尾添加以下内容
# API Gateway 部署别名
alias gw-deploy='pnpm run deploy'
alias gw-deploy-api='pnpm run deploy:api'
alias gw-deploy-web='pnpm run deploy:web:197'

# 3. 保存并重新加载配置
source ~/.zshrc
```

### 使用自动脚本添加（推荐）

运行以下命令自动添加别名：

```bash
cat >> ~/.zshrc << 'EOF'

# ========================================
# API Gateway 部署快捷命令
# ========================================
alias gw-deploy='pnpm run deploy'
alias gw-deploy-api='pnpm run deploy:api'  
alias gw-deploy-web='pnpm run deploy:web:197'
EOF

source ~/.zshrc
```

然后你就可以在项目目录中使用：

```bash
gw-deploy          # 部署前后端
gw-deploy-api      # 只部署 API
gw-deploy-web      # 只部署 Web
```

## ⚠️ 重要说明

### 为什么不能用 `pnpm deploy`？

`pnpm deploy` 是 pnpm 的内置命令，用于不同的用途（将工作区包部署到独立目录）。

我们使用的是 npm scripts，所以必须用 `pnpm run deploy`。

### 推荐的三种方式

1. **最简单**: `pnpm run deploy`
2. **更简短**: `./deploy-quick.sh` 
3. **最便捷**: 添加别名后使用 `gw-deploy`

选择你觉得最舒服的方式！

## 📚 完整命令列表

```bash
# 部署相关
pnpm run deploy              # 完整部署前后端到 r197
pnpm run deploy:197          # 同上
pnpm run deploy:api          # 只部署 API 到 Cloudflare
pnpm run deploy:web:197      # 只部署 Web 到 r197

# 开发相关  
pnpm dev                     # 启动开发服务器
pnpm run dev:api             # 只启动 API 开发服务器
pnpm run dev:web             # 只启动 Web 开发服务器

# 测试相关
pnpm test                    # 运行所有测试
pnpm run test:api            # 只运行 API 测试

# 构建相关
pnpm build                   # 构建所有项目
```
