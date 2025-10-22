# Cloudflare API Token 快速设置（5 分钟）

## 🎯 目标

让 Jenkins 能够自动部署，无需手动登录 Cloudflare 账号。

## 📝 操作步骤

### 测试账号 Token

#### 1. 登录并创建 Token（3 分钟）

1. **登录测试账号** 的 Cloudflare Dashboard
2. **访问**: https://dash.cloudflare.com/profile/api-tokens
3. **点击**: "Create Token"
4. **选择模板**: "Edit Cloudflare Workers"
5. **配置权限**:
   ```
   Account: <选择你的测试账号>
   
   Permissions:
   ✓ Workers Scripts - Edit
   ✓ Account Settings - Read
   
   Account Resources:
   ✓ Include - All accounts
   ```
6. **点击**: "Continue to summary"
7. **点击**: "Create Token"
8. **复制 Token** (⚠️ 只显示一次！)

#### 2. 在 Jenkins 中添加凭证（2 分钟）

1. 进入 Jenkins: `http://your-jenkins/credentials/`
2. 点击 "System" → "Global credentials" → "Add Credentials"
3. 配置:
   ```
   Kind: Secret text
   Scope: Global
   Secret: <粘贴刚才复制的 Token>
   ID: cloudflare-api-token-test
   Description: Cloudflare API Token - Test Account (625675bb...fbfb)
   ```
4. 点击 "OK"

### 生产账号 Token

#### 1. 创建 Token

1. **登录生产账号**: portwind520@gmail.com
2. **重复上述步骤**
3. **复制 Token**

#### 2. 添加到 Jenkins

```
Kind: Secret text
Scope: Global
Secret: <粘贴生产账号的 Token>
ID: cloudflare-api-token-prod
Description: Cloudflare API Token - Production (portwind520@gmail.com)
```

## ✅ 验证配置

### 在 Jenkins 中测试

创建一个测试 Pipeline：

```groovy
pipeline {
    agent any
    
    environment {
        CLOUDFLARE_API_TOKEN = credentials('cloudflare-api-token-test')
    }
    
    stages {
        stage('Test Auth') {
            steps {
                sh '''
                    # 验证 Token
                    wrangler whoami
                '''
            }
        }
    }
}
```

**成功输出**:
```
You are logged in with an API Token, associated with the email 'your@email.com'.
```

## 🎯 完成！

现在 Jenkins 可以自动部署了，无需手动登录：

```groovy
// Jenkinsfile 中会自动使用 Token
environment {
    CLOUDFLARE_API_TOKEN = credentials(
        params.ENVIRONMENT == 'production' 
            ? 'cloudflare-api-token-prod' 
            : 'cloudflare-api-token-test'
    )
}

// 直接部署，无需登录
sh 'wrangler deploy'
```

## 📋 检查清单

- [ ] 测试账号 Token 已创建
- [ ] 生产账号 Token 已创建
- [ ] 两个 Token 都已添加到 Jenkins
- [ ] Token ID 正确:
  - `cloudflare-api-token-test`
  - `cloudflare-api-token-prod`
- [ ] 测试 Pipeline 运行成功

## 🐛 遇到问题？

### "Not authenticated"
→ 检查 Token 是否正确添加到 Jenkins
→ 检查凭证 ID 是否匹配

### "You do not have permission"
→ 重新创建 Token，确保权限包含:
  - Workers Scripts: Edit
  - Account Settings: Read

### Token 忘记保存了？
→ 没关系，重新创建一个新的即可

## 🔗 相关文档

- 详细认证指南: [cloudflare-auth-guide.md](./cloudflare-auth-guide.md)
- 多账号管理: [multi-account-guide.md](./multi-account-guide.md)
- Jenkins 集成: [jenkins-integration.md](./jenkins-integration.md)
