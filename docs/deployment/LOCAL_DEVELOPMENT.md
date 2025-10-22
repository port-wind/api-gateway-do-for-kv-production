# 本地开发部署指南

## 🎯 本地开发的三种方式

### 方式 1：交互式登录（推荐，最简单）⭐

**不需要配置 Token！** 使用 Wrangler 的交互式登录。

```bash
# 1. 登录 Cloudflare（只需要做一次）
wrangler login

# 2. 浏览器会自动打开，授权后自动完成登录
# 3. 验证登录状态
wrangler whoami

# 4. 部署（智能脚本自动识别账号）
cd apps/api
bash deploy.sh

# 或者直接部署
pnpm run deploy:api
```

**优点**：
- ✅ 最简单，无需配置
- ✅ 安全，Token 由 Wrangler 管理
- ✅ 自动识别当前登录的账号

**适用场景**：日常本地开发

### 方式 2：使用 .env 文件（推荐，灵活）⭐

适合需要频繁切换账号的情况。

#### 步骤 1：创建 .env 文件

在项目根目录创建 `.env` 文件：

```bash
# 测试环境
CLOUDFLARE_API_TOKEN=your-new-token-here
CLOUDFLARE_ACCOUNT_ID=625675bb221d602eccde58bb23facbfb

# 项目信息（可选）
ENVIRONMENT=test
```

#### 步骤 2：使用 .env

```bash
# 加载环境变量
source .env

# 验证
wrangler whoami

# 部署
cd apps/api
wrangler deploy
```

#### 步骤 3：切换账号（可选）

创建多个 env 文件：

**`.env.test`** (测试账号)
```bash
CLOUDFLARE_API_TOKEN=your-test-token
CLOUDFLARE_ACCOUNT_ID=625675bb221d602eccde58bb23facbfb
```

**`.env.prod`** (生产账号)
```bash
CLOUDFLARE_API_TOKEN=your-prod-token
CLOUDFLARE_ACCOUNT_ID=80e68ad465093681d7d893b6c122f9b8
```

**使用**：
```bash
# 使用测试账号
source .env.test
wrangler deploy

# 使用生产账号
source .env.prod
wrangler deploy --env production
```

#### ⚠️ 重要：确保 .env 不被提交

检查 `.gitignore` 文件：

```bash
# 查看是否已忽略 .env
grep ".env" .gitignore

# 应该包含：
# .env
# .env.*
# !.env.example
```

✅ 你的项目已经配置好了，`.env` 已在 `.gitignore` 中。

### 方式 3：直接使用环境变量

临时使用，不创建文件。

```bash
# 设置环境变量
export CLOUDFLARE_API_TOKEN="your-token-here"
export CLOUDFLARE_ACCOUNT_ID="625675bb221d602eccde58bb23facbfb"

# 验证
wrangler whoami

# 部署
cd apps/api
wrangler deploy

# 清除（关闭终端后自动清除）
unset CLOUDFLARE_API_TOKEN
unset CLOUDFLARE_ACCOUNT_ID
```

## 📁 文件位置参考

### 项目根目录

```
api-gateway-do-for-kv/
├── .env                    # ← 创建这个（本地测试 Token）
├── .env.test              # ← 可选（测试账号）
├── .env.prod              # ← 可选（生产账号）
├── .env.example           # ← 已有（参考示例）
├── .gitignore             # ← 已配置（忽略 .env）
└── apps/
    └── api/
        ├── wrangler.toml  # ← 已配置（账号配置）
        └── deploy.sh      # ← 智能部署脚本
```

### 创建 .env 文件

```bash
# 在项目根目录执行
cd /Users/leo/tk.com/api-gateway-do-for-kv

# 创建 .env 文件
cat > .env << 'EOF'
# Cloudflare 测试环境配置
CLOUDFLARE_API_TOKEN=your-new-token-here
CLOUDFLARE_ACCOUNT_ID=625675bb221d602eccde58bb23facbfb
ENVIRONMENT=test
EOF

# 设置权限（只有你能读）
chmod 600 .env

# 验证文件创建成功
ls -la .env
```

## 🚀 完整工作流程

### 场景 1：日常开发（推荐）

```bash
# 1. 登录一次（Wrangler 会记住）
wrangler login

# 2. 日常部署
cd apps/api
bash deploy.sh

# 脚本会自动检测你登录的账号：
# - portwind520@gmail.com → 部署到生产环境
# - 其他账号 → 部署到测试环境
```

### 场景 2：使用 .env（需要频繁切换）

```bash
# 1. 创建 .env 文件（见上面）

# 2. 每次部署前加载
source .env

# 3. 部署
cd apps/api
wrangler deploy

# 4. 完整部署（API + Web）
cd ..
pnpm run deploy
```

### 场景 3：临时测试不同账号

```bash
# 使用环境变量，不创建文件
export CLOUDFLARE_API_TOKEN="your-token"
cd apps/api
wrangler deploy
unset CLOUDFLARE_API_TOKEN
```

## 🔍 验证配置

### 检查当前登录状态

```bash
# 方式 1：使用 wrangler login
wrangler whoami

# 输出示例：
# You are logged in with an API Token, associated with the email 'test@example.com'.

# 方式 2：使用环境变量
echo $CLOUDFLARE_API_TOKEN  # 应该显示你的 Token（如果设置了）
echo $CLOUDFLARE_ACCOUNT_ID # 应该显示账号 ID
```

### 测试部署（Dry Run）

```bash
cd apps/api

# 测试部署，不实际发布
wrangler deploy --dry-run

# 如果成功，会显示将要部署的信息
```

## 🐛 常见问题

### 问题 1：本地已经登录，还需要 Token 吗？

**答案**：不需要！

```bash
# 如果已经 wrangler login
wrangler whoami  # ✅ 已登录

# 可以直接部署
bash apps/api/deploy.sh
```

### 问题 2：如何切换账号？

**方式 A**：重新登录（推荐）

```bash
# 登出
wrangler logout

# 重新登录（会打开浏览器选择账号）
wrangler login
```

**方式 B**：使用不同的 .env 文件

```bash
# 测试账号
source .env.test
wrangler deploy

# 生产账号
source .env.prod
wrangler deploy --env production
```

### 问题 3：.env 文件放哪里？

**答案**：项目根目录

```bash
# 正确位置
/Users/leo/tk.com/api-gateway-do-for-kv/.env

# 不是这里
/Users/leo/tk.com/api-gateway-do-for-kv/apps/api/.env  # ❌
```

### 问题 4：Token 过期了怎么办？

```bash
# 如果使用 wrangler login
wrangler login  # 重新登录即可

# 如果使用 .env
# 1. 创建新的 Token
# 2. 更新 .env 文件中的 CLOUDFLARE_API_TOKEN
# 3. source .env
```

### 问题 5：忘记 Token 了？

**答案**：重新创建即可

1. 访问：https://dash.cloudflare.com/profile/api-tokens
2. 删除旧的 Token（如果找得到）
3. 创建新的 Token
4. 更新 .env 或重新登录

## 📋 最佳实践

### 本地开发

1. ✅ **使用 wrangler login**（最简单）
2. ✅ 让智能部署脚本自动识别账号
3. ✅ `.env` 文件只用于需要频繁切换账号时
4. ✅ 定期运行 `wrangler whoami` 确认登录状态

### 安全建议

1. ⚠️ **永远不要提交 .env 到 Git**
2. ⚠️ 不要在日志中打印 Token
3. ⚠️ 不要在聊天中分享 Token
4. ✅ 使用 `chmod 600 .env` 限制文件权限
5. ✅ 定期更换 Token（建议 90 天一次）

### 团队协作

```bash
# 每个开发者维护自己的 .env
# 项目提供 .env.example 作为模板

# 复制模板
cp .env.example .env

# 填入自己的 Token
nano .env
```

## 🎓 总结

### 推荐配置

**日常开发**：
```bash
wrangler login      # 一次登录
bash deploy.sh      # 智能部署
```

**需要切换账号**：
```bash
# 创建 .env
echo "CLOUDFLARE_API_TOKEN=your-token" > .env
echo "CLOUDFLARE_ACCOUNT_ID=625675bb...fbfb" >> .env

# 使用
source .env
wrangler deploy
```

### 关键点

- ✅ `.env` 文件放在**项目根目录**
- ✅ Token 换新后更新 `.env` 文件
- ✅ 或者直接用 `wrangler login`（更简单）
- ✅ `.env` 已经在 `.gitignore` 中，不会被提交

---

**问题解答**：
- 本地放哪里？→ 项目根目录的 `.env` 文件
- 推荐方式？→ `wrangler login`（最简单）
- 需要切换？→ 使用 `.env.test` 和 `.env.prod`
