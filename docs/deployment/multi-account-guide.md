# Cloudflare 多账号部署指南

## 📋 问题说明

你有两个 Cloudflare 账号：
- **测试账号**: 625675bb221d602eccde58bb23facbfb
- **生产账号**: 80e68ad465093681d7d893b6c122f9b8 (portwind520@gmail.com)

## ✅ 解决方案

### 方案 1：使用环境参数（推荐）

#### 1.1 在 Jenkins 中配置两个凭证

进入 Jenkins → Credentials → Add Credentials

**测试环境凭证:**
- ID: `cloudflare-api-token-test`
- Kind: Secret text
- Secret: 测试账号的 API Token

**生产环境凭证:**
- ID: `cloudflare-api-token-prod`
- Kind: Secret text  
- Secret: 生产账号的 API Token

#### 1.2 更新 Jenkinsfile

```groovy
pipeline {
    agent any
    
    parameters {
        choice(
            name: 'ENVIRONMENT',
            choices: ['test', 'production'],
            description: '选择部署环境'
        )
        choice(
            name: 'DEPLOY_TARGET',
            choices: ['all', 'api', 'web'],
            description: '选择部署目标'
        )
    }
    
    environment {
        // 根据环境参数选择凭证
        CLOUDFLARE_API_TOKEN = credentials(
            params.ENVIRONMENT == 'production' 
                ? 'cloudflare-api-token-prod' 
                : 'cloudflare-api-token-test'
        )
        
        // 设置账号 ID
        CLOUDFLARE_ACCOUNT_ID = params.ENVIRONMENT == 'production' 
            ? '80e68ad465093681d7d893b6c122f9b8'
            : '625675bb221d602eccde58bb23facbfb'
    }
    
    stages {
        stage('环境信息') {
            steps {
                script {
                    def envIcon = params.ENVIRONMENT == 'production' ? '🟢' : '🟡'
                    def envName = params.ENVIRONMENT == 'production' ? '生产环境' : '测试环境'
                    
                    echo """
                    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    ${envIcon} 部署到: ${envName}
                    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    Account ID: ${env.CLOUDFLARE_ACCOUNT_ID}
                    部署目标: ${params.DEPLOY_TARGET}
                    """
                }
            }
        }
        
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        
        stage('Install') {
            steps {
                sh 'pnpm install --frozen-lockfile'
            }
        }
        
        stage('Deploy') {
            steps {
                script {
                    def deployCmd = ''
                    def envFlag = params.ENVIRONMENT == 'production' ? '--env production' : ''
                    
                    switch(params.DEPLOY_TARGET) {
                        case 'all':
                            sh "pnpm run deploy"
                            break
                        case 'api':
                            sh """
                                cd apps/api
                                wrangler deploy ${envFlag}
                            """
                            break
                        case 'web':
                            sh "pnpm run deploy:web"
                            break
                    }
                }
            }
        }
    }
    
    post {
        success {
            echo "✅ 部署到 ${params.ENVIRONMENT} 环境成功！"
        }
        failure {
            echo "❌ 部署到 ${params.ENVIRONMENT} 环境失败！"
        }
    }
}
```

### 方案 2：使用自动检测（兼容本地脚本）

创建一个智能部署脚本，在 Jenkins 中使用：

```bash
#!/bin/bash
# scripts/deploy-api-jenkins.sh

set -e

# 从环境变量获取配置
ENVIRONMENT=${ENVIRONMENT:-test}
CLOUDFLARE_ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID}
CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN}

if [ "$ENVIRONMENT" = "production" ]; then
    ENV_NAME="🟢 生产环境"
    ENV_FLAG="--env production"
    EXPECTED_ACCOUNT="80e68ad465093681d7d893b6c122f9b8"
else
    ENV_NAME="🟡 测试环境"
    ENV_FLAG=""
    EXPECTED_ACCOUNT="625675bb221d602eccde58bb23facbfb"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  📦 即将部署到: $ENV_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Account ID: $EXPECTED_ACCOUNT"
echo "  环境标志:   $ENV_FLAG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 验证账号 ID
if [ "$CLOUDFLARE_ACCOUNT_ID" != "$EXPECTED_ACCOUNT" ]; then
    echo "⚠️  警告: 账号 ID 不匹配"
    echo "   期望: $EXPECTED_ACCOUNT"
    echo "   实际: $CLOUDFLARE_ACCOUNT_ID"
fi

# 执行部署
cd apps/api
wrangler deploy $ENV_FLAG

echo "✅ 部署完成！"
```

然后在 Jenkinsfile 中使用：

```groovy
stage('Deploy API') {
    steps {
        sh 'bash scripts/deploy-api-jenkins.sh'
    }
}
```

### 方案 3：使用 Wrangler 配置文件（最灵活）

创建多个 wrangler 配置文件：

**wrangler.test.toml** (测试环境)
```toml
name = "api-gateway-test"
account_id = "625675bb221d602eccde58bb23facbfb"
# ... 其他配置
```

**wrangler.prod.toml** (生产环境)
```toml
name = "api-gateway-prod"  
account_id = "80e68ad465093681d7d893b6c122f9b8"
# ... 其他配置
```

在 Jenkins 中使用：

```groovy
stage('Deploy') {
    steps {
        script {
            def configFile = params.ENVIRONMENT == 'production' 
                ? 'wrangler.prod.toml' 
                : 'wrangler.test.toml'
            
            sh """
                cd apps/api
                wrangler deploy --config ${configFile}
            """
        }
    }
}
```

## 🎯 推荐配置（完整示例）

### 1. 在 Jenkins 中配置凭证

| 凭证 ID | 类型 | 用途 |
|--------|------|------|
| `cf-token-test` | Secret text | 测试账号 Token |
| `cf-token-prod` | Secret text | 生产账号 Token |

### 2. 使用完整的 Jenkinsfile

```groovy
pipeline {
    agent any
    
    parameters {
        choice(
            name: 'ENV',
            choices: ['test', 'prod'],
            description: '部署环境'
        )
    }
    
    environment {
        // 动态选择凭证
        CF_API_TOKEN = credentials("cf-token-${params.ENV}")
        
        // 设置账号信息
        CF_ACCOUNT_ID = params.ENV == 'prod' 
            ? '80e68ad465093681d7d893b6c122f9b8'
            : '625675bb221d602eccde58bb23facbfb'
            
        // Wrangler 会自动使用这些环境变量
        CLOUDFLARE_API_TOKEN = "${CF_API_TOKEN}"
        CLOUDFLARE_ACCOUNT_ID = "${CF_ACCOUNT_ID}"
    }
    
    stages {
        stage('Info') {
            steps {
                script {
                    def envName = params.ENV == 'prod' ? '🟢 生产' : '🟡 测试'
                    echo """
                    环境: ${envName}
                    Account: ${env.CF_ACCOUNT_ID}
                    """
                }
            }
        }
        
        stage('Checkout') {
            steps { checkout scm }
        }
        
        stage('Install') {
            steps { sh 'pnpm install --frozen-lockfile' }
        }
        
        stage('Deploy') {
            steps {
                script {
                    def envFlag = params.ENV == 'prod' ? '--env production' : ''
                    sh """
                        cd apps/api
                        wrangler deploy ${envFlag}
                    """
                }
            }
        }
    }
}
```

## 🔒 安全最佳实践

### 1. API Token 权限设置

为每个环境创建专门的 API Token：

**测试环境 Token 权限:**
- Workers Scripts: Edit
- Account Settings: Read
- 只限于测试账号

**生产环境 Token 权限:**
- Workers Scripts: Edit
- Account Settings: Read  
- 只限于生产账号
- 考虑添加 IP 白名单

### 2. 权限隔离

```groovy
// 生产环境需要审批
stage('Deploy to Production') {
    when {
        expression { params.ENV == 'prod' }
    }
    input {
        message "确认部署到生产环境？"
        ok "确认部署"
    }
    steps {
        sh 'wrangler deploy --env production'
    }
}
```

## 📊 账号信息参考

| 环境 | Account ID | 邮箱 | 用途 |
|-----|-----------|------|------|
| 测试 | 625675bb...facbfb | (测试账号) | 开发测试 |
| 生产 | 80e68ad...f9b8 | portwind520@gmail.com | 正式环境 |

## 🐛 故障排查

### 问题 1: Token 权限不足

**错误信息:**
```
Error: You do not have permission to access this resource
```

**解决:**
1. 检查 Token 是否有 Workers Scripts Edit 权限
2. 确认 Token 绑定的是正确的账号

### 问题 2: Account ID 不匹配

**错误信息:**
```
Error: Could not find worker with name 'api-gateway'
```

**解决:**
```groovy
environment {
    CLOUDFLARE_ACCOUNT_ID = params.ENV == 'prod' 
        ? '80e68ad465093681d7d893b6c122f9b8'  // 确保是正确的 ID
        : '625675bb221d602eccde58bb23facbfb'
}
```

### 问题 3: 凭证未找到

**错误信息:**
```
Error: credentials() could not find credentials with ID 'cf-token-prod'
```

**解决:**
1. 进入 Jenkins → Credentials
2. 确认凭证 ID 完全匹配
3. 检查凭证的作用域（Global/Folder）

## 🎓 总结

### 最简单的方案

使用**方案 1**，只需要：

1. **配置两个凭证**（5 分钟）
2. **添加环境参数**（复制 Jenkinsfile）
3. **选择环境部署**（点击构建，选择环境）

### 实际操作

```bash
# 在 Jenkins 中：
1. 添加凭证: cf-token-test, cf-token-prod
2. 创建 Pipeline
3. 构建时选择:
   - Environment: test 或 prod
   - Deploy Target: all/api/web
4. 点击 Build
```

**就这么简单！** 多账号问题完全可以解决。

---

**需要帮助？** 查看：
- 完整 Jenkinsfile: `Jenkinsfile`
- Jenkins 集成指南: `jenkins-integration.md`
