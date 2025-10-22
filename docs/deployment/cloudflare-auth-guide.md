# Cloudflare 账号登录和认证指南

## ❓ 问题说明

在 Jenkins 或 CI/CD 环境中，不能使用 `wrangler login` 进行交互式登录，需要使用 **API Token** 进行认证。

## ✅ 完整解决方案

### 方案 1：使用 API Token（推荐）

这是 Jenkins/CI 环境的**标准方案**。

#### 步骤 1：创建 Cloudflare API Token

**测试账号 Token:**

1. 登录测试账号的 Cloudflare Dashboard
2. 访问：https://dash.cloudflare.com/profile/api-tokens
3. 点击 "Create Token"
4. 选择 "Edit Cloudflare Workers" 模板
5. 配置权限：
   ```
   Account: 你的测试账号
   Zone Resources: All zones
   Permissions:
     • Workers Scripts: Edit
     • Account Settings: Read
   ```
6. 创建并**复制 Token**（只显示一次！）

**生产账号 Token:**

1. 登录 portwind520@gmail.com 账号
2. 重复上述步骤
3. 创建并复制生产环境的 Token

#### 步骤 2：在 Jenkins 中配置凭证

进入 Jenkins → Credentials → System → Global credentials

**添加测试环境 Token:**
```
Kind: Secret text
Scope: Global
Secret: <粘贴测试账号的 API Token>
ID: cloudflare-api-token-test
Description: Cloudflare API Token - Test Environment
```

**添加生产环境 Token:**
```
Kind: Secret text
Scope: Global
Secret: <粘贴生产账号的 API Token>
ID: cloudflare-api-token-prod
Description: Cloudflare API Token - Production Environment
```

#### 步骤 3：Wrangler 自动使用 Token

当你在 Jenkinsfile 中设置 `CLOUDFLARE_API_TOKEN` 环境变量时，Wrangler 会自动使用它，**无需手动登录**。

```groovy
environment {
    CLOUDFLARE_API_TOKEN = credentials('cloudflare-api-token-test')
}

stages {
    stage('Deploy') {
        steps {
            sh 'wrangler deploy'  // ← 自动认证，无需登录
        }
    }
}
```

### 方案 2：本地开发环境

#### 方案 2.1：交互式登录（本地推荐）

```bash
# 切换到测试账号
wrangler login

# 检查当前登录账号
wrangler whoami

# 部署（会使用当前登录的账号）
cd apps/api
bash deploy.sh
```

你现有的 `apps/api/deploy.sh` 脚本已经智能检测登录的账号：
- 如果是 `portwind520@gmail.com` → 自动部署到生产环境
- 如果是其他账号 → 自动部署到测试环境

#### 方案 2.2：使用环境变量（本地 + CI 通用）

**创建 `.env` 文件：**

```bash
# 测试环境
CLOUDFLARE_API_TOKEN=your-test-token
CLOUDFLARE_ACCOUNT_ID=625675bb221d602eccde58bb23facbfb
```

**使用：**

```bash
# 加载环境变量
source .env

# 部署
cd apps/api
wrangler deploy
```

**⚠️ 重要**: 将 `.env` 添加到 `.gitignore`，不要提交到 Git！

### 方案 3：使用 Wrangler 配置文件

#### 创建多个账号配置

**~/.wrangler/config/default.toml** (测试账号)
```toml
[env.test]
account_id = "625675bb221d602eccde58bb23facbfb"
```

**~/.wrangler/config/production.toml** (生产账号)
```toml
[env.production]
account_id = "80e68ad465093681d7d893b6c122f9b8"
```

## 🔐 API Token vs Global API Key

| 特性 | API Token (推荐) | Global API Key (不推荐) |
|-----|------------------|----------------------|
| 安全性 | ✅ 高 - 可限制权限 | ❌ 低 - 完全访问 |
| 细粒度控制 | ✅ 可以限制到特定资源 | ❌ 全局权限 |
| 过期时间 | ✅ 可设置 | ❌ 永不过期 |
| 撤销 | ✅ 随时撤销 | ❌ 需要重新生成 |
| CI/CD | ✅ 推荐 | ❌ 不安全 |

## 📋 完整示例：Jenkins Pipeline

### 测试环境部署

```groovy
pipeline {
    agent any
    
    environment {
        // 使用测试账号 Token
        CLOUDFLARE_API_TOKEN = credentials('cloudflare-api-token-test')
        CLOUDFLARE_ACCOUNT_ID = '625675bb221d602eccde58bb23facbfb'
    }
    
    stages {
        stage('Deploy to Test') {
            steps {
                sh '''
                    cd apps/api
                    # Wrangler 自动使用 CLOUDFLARE_API_TOKEN
                    wrangler deploy
                '''
            }
        }
    }
}
```

### 生产环境部署

```groovy
pipeline {
    agent any
    
    environment {
        // 使用生产账号 Token
        CLOUDFLARE_API_TOKEN = credentials('cloudflare-api-token-prod')
        CLOUDFLARE_ACCOUNT_ID = '80e68ad465093681d7d893b6c122f9b8'
    }
    
    stages {
        stage('Deploy to Production') {
            steps {
                sh '''
                    cd apps/api
                    wrangler deploy --env production
                '''
            }
        }
    }
}
```

### 动态选择（推荐）

使用 `Jenkinsfile.multi-account`：

```groovy
environment {
    // 根据参数动态选择 Token
    CLOUDFLARE_API_TOKEN = credentials(
        params.ENVIRONMENT == 'production' 
            ? 'cloudflare-api-token-prod' 
            : 'cloudflare-api-token-test'
    )
}
```

## 🛠️ 验证认证

### 验证 Token 是否有效

```bash
# 设置 Token
export CLOUDFLARE_API_TOKEN="your-token-here"

# 验证
wrangler whoami
```

**成功输出示例：**
```
You are logged in with an API Token, associated with the email 'your@email.com'.
```

### 验证账号和权限

```bash
# 查看账号信息
wrangler whoami

# 列出 Workers
wrangler deployments list

# 测试部署（dry-run）
wrangler deploy --dry-run
```

## 🐛 常见问题

### 问题 1: "Not authenticated"

**错误信息：**
```
Error: Not authenticated. Please run `wrangler login`.
```

**解决方案：**

✅ **Jenkins 环境：**
```groovy
environment {
    CLOUDFLARE_API_TOKEN = credentials('cloudflare-api-token-test')
}
```

✅ **本地环境：**
```bash
# 选项 1: 交互式登录
wrangler login

# 选项 2: 设置环境变量
export CLOUDFLARE_API_TOKEN="your-token"
```

### 问题 2: "You do not have permission"

**错误信息：**
```
Error: You do not have permission to access this resource.
```

**原因：**
- Token 权限不足
- Token 没有绑定到正确的账号

**解决方案：**

1. 重新创建 Token，确保选择了正确的账号
2. 验证 Token 权限：
   ```
   必需权限：
   • Workers Scripts: Edit
   • Account Settings: Read
   ```

### 问题 3: "Account ID mismatch"

**错误信息：**
```
Error: Worker not found for account.
```

**解决方案：**

确保 `CLOUDFLARE_ACCOUNT_ID` 与 Token 绑定的账号匹配：

```groovy
environment {
    // 测试环境
    CLOUDFLARE_API_TOKEN = credentials('cloudflare-api-token-test')
    CLOUDFLARE_ACCOUNT_ID = '625675bb221d602eccde58bb23facbfb'  // ← 必须匹配
}
```

### 问题 4: Token 泄露了怎么办？

**立即操作：**

1. 进入 Cloudflare Dashboard
2. 访问 API Tokens 页面
3. 找到泄露的 Token
4. 点击 "Roll" 或 "Delete"
5. 创建新的 Token
6. 更新 Jenkins 凭证

## 🔒 安全最佳实践

### 1. Token 权限最小化

创建 Token 时只授予必需的权限：

```
✅ 推荐：
• Workers Scripts: Edit
• Account Settings: Read

❌ 避免：
• Zone: Edit
• DNS: Write
• 不必要的全局权限
```

### 2. 使用不同的 Token

```
测试环境：test-deploy-token
生产环境：prod-deploy-token
开发环境：dev-token
```

每个环境使用独立的 Token，便于管理和撤销。

### 3. 定期轮换 Token

```bash
# 每 90 天轮换一次 Token
1. 创建新 Token
2. 更新 Jenkins 凭证
3. 测试新 Token
4. 删除旧 Token
```

### 4. 监控 Token 使用

在 Cloudflare Dashboard 中：
- 查看 Audit Logs
- 监控 API Token 使用情况
- 发现异常立即撤销

### 5. IP 白名单（可选）

创建 Token 时添加 IP 限制：
```
Client IP Address Filtering:
• Jenkins 服务器 IP
• 办公室 IP 段
```

## 📚 参考文档

- [Cloudflare API Token 文档](https://developers.cloudflare.com/api/tokens/)
- [Wrangler 认证文档](https://developers.cloudflare.com/workers/wrangler/authentication/)
- [Jenkins Credentials 插件](https://plugins.jenkins.io/credentials/)

## 🎯 快速检查清单

在 Jenkins 中部署前，确保：

- [ ] 已创建 Cloudflare API Token
- [ ] Token 权限包含 "Workers Scripts: Edit"
- [ ] 已在 Jenkins 中添加凭证
- [ ] 凭证 ID 正确（如 `cloudflare-api-token-test`）
- [ ] Jenkinsfile 中正确引用凭证
- [ ] `CLOUDFLARE_ACCOUNT_ID` 设置正确
- [ ] 测试过 `wrangler whoami`
- [ ] Token 没有过期

## 🎓 总结

### 本地开发
```bash
# 最简单：交互式登录
wrangler login
bash apps/api/deploy.sh

# 脚本会自动检测你登录的是哪个账号
```

### Jenkins/CI
```groovy
// 使用 API Token，无需登录
environment {
    CLOUDFLARE_API_TOKEN = credentials('cloudflare-api-token-test')
}

// Wrangler 自动认证
sh 'wrangler deploy'
```

### 两个账号切换
```groovy
// 在 Jenkins 中通过参数选择
CLOUDFLARE_API_TOKEN = credentials(
    params.ENVIRONMENT == 'production' 
        ? 'cloudflare-api-token-prod'   // ← 生产账号
        : 'cloudflare-api-token-test'   // ← 测试账号
)
```

---

**关键**: 不用每次手动登录，使用 API Token 一次配置，永久使用！🚀
