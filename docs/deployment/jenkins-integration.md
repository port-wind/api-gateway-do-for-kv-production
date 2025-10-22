# Jenkins 集成指南

## 📋 概述

当前的部署系统完全兼容 Jenkins，而且已经有现成的脚本支持。实际上，**不难集成**，只需要简单配置即可。

## ✅ 为什么容易集成？

### 1. 已有 Jenkins 脚本
项目中已经包含：
- `jenkins-deploy-web.sh` - Web 前端 Jenkins 部署脚本
- `scripts/jenkins-build-web.sh` - Web 构建脚本
- 内置飞书通知功能

### 2. 脚本设计友好
- 所有脚本支持非交互式执行
- 使用 `-y` 参数自动确认
- `set -e` 遇错立即退出
- 完善的日志输出

### 3. 环境兼容性好
- 标准 Bash 脚本
- 使用 pnpm 包管理
- 支持环境变量配置
- 自动检测依赖

## 🚀 快速集成

### 方案 1：使用现有的统一脚本（推荐）

#### Jenkinsfile (Pipeline)

```groovy
pipeline {
    agent any
    
    environment {
        // Cloudflare 凭证
        CLOUDFLARE_API_TOKEN = credentials('cloudflare-api-token')
        
        // SSH 凭证（如果需要）
        SSH_KEY = credentials('r197-ssh-key')
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        
        stage('Install Dependencies') {
            steps {
                sh '''
                    # 安装 pnpm（如果未安装）
                    npm install -g pnpm
                    
                    # 安装项目依赖
                    pnpm install --frozen-lockfile
                '''
            }
        }
        
        stage('Deploy') {
            steps {
                sh '''
                    # 使用并行部署（自动模式）
                    pnpm run deploy
                '''
            }
        }
    }
    
    post {
        success {
            echo '✅ 部署成功！'
        }
        failure {
            echo '❌ 部署失败！'
        }
    }
}
```

### 方案 2：分阶段部署

```groovy
pipeline {
    agent any
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        
        stage('Setup') {
            steps {
                sh 'pnpm install --frozen-lockfile'
            }
        }
        
        stage('Parallel Deploy') {
            parallel {
                stage('Deploy API') {
                    steps {
                        sh '''
                            cd apps/api
                            # Wrangler 会使用 CLOUDFLARE_API_TOKEN 环境变量
                            bash deploy.sh -y
                        '''
                    }
                }
                
                stage('Deploy Web') {
                    steps {
                        sh '''
                            # 使用现有的 Jenkins 脚本
                            bash jenkins-deploy-web.sh
                        '''
                    }
                }
            }
        }
    }
}
```

### 方案 3：使用现有 Jenkins 脚本（最简单）

```groovy
pipeline {
    agent any
    
    stages {
        stage('Deploy Web') {
            steps {
                sh 'bash jenkins-deploy-web.sh'
            }
        }
    }
}
```

## 🔧 Jenkins 环境配置

### 1. 安装必要工具

在 Jenkins 节点上安装：

```bash
# 安装 Node.js 和 pnpm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install -g pnpm

# 安装 Wrangler（用于 API 部署）
npm install -g wrangler
```

### 2. 配置凭证

在 Jenkins 中添加以下凭证：

#### Cloudflare API Token
- ID: `cloudflare-api-token`
- 类型: Secret text
- 内容: 你的 Cloudflare API Token

#### SSH 私钥（用于 r197）
- ID: `r197-ssh-key`  
- 类型: SSH Username with private key
- Username: `portwin`
- Private Key: 你的 SSH 私钥

### 3. 环境变量配置

在 Jenkins Pipeline 中设置：

```groovy
environment {
    CLOUDFLARE_API_TOKEN = credentials('cloudflare-api-token')
    CLOUDFLARE_ACCOUNT_ID = 'your-account-id'
    
    // 飞书通知（可选）
    LARK_WEBHOOK_URL = 'https://open.larksuite.com/open-apis/bot/v2/hook/...'
    
    // 构建信息
    BUILD_USER = "${env.BUILD_USER_ID}"
    BUILD_NUMBER = "${env.BUILD_NUMBER}"
}
```

## 📊 集成优势

### 与现有脚本的兼容性

| 特性 | 本地部署 | Jenkins 部署 | 说明 |
|-----|---------|-------------|------|
| 并行部署 | ✅ | ✅ | 完全兼容 |
| 自动确认 | `-y` 参数 | `-y` 参数 | 支持非交互 |
| 飞书通知 | ✅ | ✅ | 自动发送 |
| 依赖检测 | ✅ | ✅ | 智能跳过 |
| 错误处理 | ✅ | ✅ | 自动退出 |

### Jenkins 特有优势

1. **自动触发**
   - Git Push 自动部署
   - 定时部署
   - 手动触发

2. **构建历史**
   - 完整的部署记录
   - 日志保存
   - 版本追溯

3. **权限控制**
   - 角色权限管理
   - 审批流程
   - 操作审计

4. **多环境支持**
   - Dev/Staging/Production
   - 参数化构建
   - 环境隔离

## 🎯 推荐配置

### 最佳实践 Jenkinsfile

```groovy
pipeline {
    agent any
    
    parameters {
        choice(
            name: 'DEPLOY_TARGET',
            choices: ['all', 'api', 'web'],
            description: '选择部署目标'
        )
        booleanParam(
            name: 'SKIP_TESTS',
            defaultValue: false,
            description: '跳过测试'
        )
    }
    
    environment {
        CLOUDFLARE_API_TOKEN = credentials('cloudflare-api-token')
        LARK_WEBHOOK_URL = credentials('lark-webhook')
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.GIT_COMMIT_SHORT = sh(
                        script: "git log -1 --pretty=format:'%h'",
                        returnStdout: true
                    ).trim()
                }
            }
        }
        
        stage('Install Dependencies') {
            steps {
                sh '''
                    pnpm install --frozen-lockfile --prefer-offline
                '''
            }
        }
        
        stage('Test') {
            when {
                expression { !params.SKIP_TESTS }
            }
            steps {
                sh 'pnpm run test:api'
            }
        }
        
        stage('Deploy') {
            steps {
                script {
                    switch(params.DEPLOY_TARGET) {
                        case 'all':
                            sh 'pnpm run deploy'
                            break
                        case 'api':
                            sh 'pnpm run deploy:api'
                            break
                        case 'web':
                            sh 'pnpm run deploy:web'
                            break
                    }
                }
            }
        }
    }
    
    post {
        success {
            echo """
            ✅ 部署成功！
            Commit: ${env.GIT_COMMIT_SHORT}
            Target: ${params.DEPLOY_TARGET}
            Build: #${env.BUILD_NUMBER}
            """
        }
        failure {
            echo """
            ❌ 部署失败！
            Build: #${env.BUILD_NUMBER}
            请查看日志排查问题
            """
        }
        always {
            cleanWs()
        }
    }
}
```

## 🔍 故障排查

### 常见问题

#### 1. Wrangler 认证失败

**问题**: `Error: Not authenticated`

**解决**:
```groovy
environment {
    CLOUDFLARE_API_TOKEN = credentials('cloudflare-api-token')
}
```

#### 2. SSH 连接失败

**问题**: `Permission denied (publickey)`

**解决**:
```groovy
steps {
    sshagent(['r197-ssh-key']) {
        sh 'pnpm run deploy:web'
    }
}
```

#### 3. 依赖安装慢

**解决**: 使用 Jenkins 缓存或 Docker

```groovy
stage('Install Dependencies') {
    steps {
        // 使用缓存目录
        sh '''
            export PNPM_HOME="/var/jenkins_home/.pnpm"
            pnpm install --frozen-lockfile --prefer-offline
        '''
    }
}
```

#### 4. 并行部署冲突

**解决**: 使用 Jenkins 的 `lock` 功能

```groovy
stage('Deploy') {
    options {
        lock resource: 'deploy-lock'
    }
    steps {
        sh 'pnpm run deploy'
    }
}
```

## 📈 性能优化

### 1. 使用 Docker Agent

```groovy
pipeline {
    agent {
        docker {
            image 'node:18-alpine'
            args '-v pnpm-cache:/root/.pnpm-store'
        }
    }
    // ... 其他配置
}
```

### 2. 缓存依赖

```groovy
stage('Install Dependencies') {
    steps {
        cache(maxCacheSize: 1000, caches: [
            arbitraryFileCache(
                path: 'node_modules',
                cacheValidityDecidingFile: 'pnpm-lock.yaml'
            )
        ]) {
            sh 'pnpm install --frozen-lockfile'
        }
    }
}
```

### 3. 条件部署

```groovy
stage('Deploy') {
    when {
        branch 'main'
    }
    steps {
        sh 'pnpm run deploy'
    }
}
```

## 🎓 总结

### 集成难度评估

| 方面 | 难度 | 说明 |
|-----|------|------|
| 脚本适配 | ⭐☆☆☆☆ | 已完全支持 |
| 环境配置 | ⭐⭐☆☆☆ | 标准 Node.js 环境 |
| 凭证管理 | ⭐⭐☆☆☆ | Jenkins 标准功能 |
| 调试排错 | ⭐⭐⭐☆☆ | 有完善的日志 |

**总体难度**: ⭐⭐☆☆☆ (简单)

### 推荐步骤

1. **快速开始** (5分钟)
   ```bash
   # 使用现有脚本
   bash jenkins-deploy-web.sh
   ```

2. **完整集成** (30分钟)
   - 创建 Jenkinsfile
   - 配置凭证
   - 测试运行

3. **优化调整** (按需)
   - 添加缓存
   - 配置通知
   - 多环境支持

---

**结论**: 你们的部署系统非常容易集成到 Jenkins，因为：
- ✅ 已有 Jenkins 专用脚本
- ✅ 支持非交互式执行
- ✅ 完善的错误处理
- ✅ 内置飞书通知

**建议**: 直接使用方案 1 的统一脚本，最简单高效！
