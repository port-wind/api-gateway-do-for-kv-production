# Jenkins 快速开始（5 分钟上手）

## ❓ 难吗？

**答案：不难！⭐⭐☆☆☆**

你们的部署系统**天然兼容** Jenkins，因为：

1. ✅ **已有 Jenkins 脚本** - `jenkins-deploy-web.sh` 和 `scripts/jenkins-build-web.sh`
2. ✅ **支持自动模式** - 所有脚本都支持 `-y` 参数
3. ✅ **完善的日志** - 每一步都有清晰的输出
4. ✅ **内置通知** - 自动发送飞书消息
5. ✅ **错误处理** - `set -e` 遇错立即退出

## 🚀 三步配置（5 分钟）

### 步骤 1：在 Jenkins 中添加凭证（2 分钟）

进入 Jenkins → Credentials → Add Credentials

**添加 Cloudflare Token:**
- ID: `cloudflare-api-token`
- Kind: Secret text
- Secret: 你的 Cloudflare API Token

**添加飞书 Webhook（可选）:**
- ID: `lark-webhook-url`
- Kind: Secret text
- Secret: 飞书 Webhook URL

### 步骤 2：创建 Pipeline Job（2 分钟）

1. New Item → Pipeline
2. 配置 Pipeline:
   - Definition: Pipeline script from SCM
   - SCM: Git
   - Repository URL: 你的 Git 仓库
   - Script Path: `Jenkinsfile.simple`

### 步骤 3：运行构建（1 分钟）

点击 "Build Now"，完成！

## 📝 最简单的 Jenkinsfile

项目根目录已经包含：
- **`Jenkinsfile.simple`** - 超简单版本（推荐新手）
- **`Jenkinsfile`** - 完整功能版本

### Jenkinsfile.simple 内容

```groovy
pipeline {
    agent any
    
    environment {
        CLOUDFLARE_API_TOKEN = credentials('cloudflare-api-token')
    }
    
    stages {
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
                sh 'pnpm run deploy'
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

**就这么简单！** 只需 20 行代码。

## 🎯 为什么容易？

### 对比其他项目

| 特性 | 其他项目 | 你们的项目 |
|-----|---------|-----------|
| Jenkins 脚本 | ❌ 需要自己写 | ✅ 已经有了 |
| 自动确认 | ❌ 需要改造 | ✅ 支持 `-y` |
| 错误处理 | ❌ 需要添加 | ✅ 内置完善 |
| 通知集成 | ❌ 需要配置 | ✅ 已集成飞书 |
| 并行部署 | ❌ 需要实现 | ✅ 已支持 |

### 关键优势

```bash
# 你们的脚本天生支持 Jenkins
pnpm run deploy  # ← 直接在 Jenkins 中运行，不需要任何修改！
```

## 🔧 完整功能版本

如果需要更多功能（参数化构建、测试、多环境等），使用 `Jenkinsfile`：

```groovy
pipeline {
    agent any
    
    parameters {
        choice(
            name: 'DEPLOY_TARGET',
            choices: ['all', 'api', 'web'],
            description: '选择部署目标'
        )
    }
    
    // ... 完整配置见 Jenkinsfile
}
```

## 📊 实际效果

### 控制台输出示例

```
🚀 API Gateway 部署流水线
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
构建号:     #42
分支:       main
提交:       a1b2c3d
部署目标:   all
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[INFO] 检查 SSH 连接...
[SUCCESS] SSH 连接正常
[INFO] 安装项目依赖...
[SUCCESS] 依赖安装成功
[INFO] 构建 Web 前端...
[SUCCESS] Web 构建成功
[PARALLEL] 启动并行部署...
[API] API 部署成功 (耗时: 10秒)
[WEB] Web 部署成功 (耗时: 15秒)

✅ 部署成功！
总耗时: 15秒
节省时间: 10秒 (40%)
```

## 🎓 进阶配置

### 1. 自动触发

```groovy
triggers {
    // Git Push 自动触发
    githubPush()
    
    // 或者定时触发（每天凌晨 2 点）
    cron('0 2 * * *')
}
```

### 2. 多环境部署

```groovy
parameters {
    choice(
        name: 'ENVIRONMENT',
        choices: ['dev', 'staging', 'production'],
        description: '选择环境'
    )
}
```

### 3. 钉钉通知

```groovy
post {
    success {
        dingtalk(
            robot: 'your-robot-id',
            type: 'MARKDOWN',
            title: '✅ 部署成功',
            text: [
                "### 部署成功",
                "- 构建号: #${env.BUILD_NUMBER}",
                "- 提交: ${env.GIT_COMMIT_SHORT}"
            ]
        )
    }
}
```

## 🐛 常见问题

### Q: pnpm 未安装？

**A:** 在 Jenkinsfile 中添加：

```groovy
stage('Setup') {
    steps {
        sh '''
            if ! command -v pnpm &> /dev/null; then
                npm install -g pnpm
            fi
        '''
    }
}
```

### Q: Wrangler 认证失败？

**A:** 确保添加了 `CLOUDFLARE_API_TOKEN` 凭证

### Q: SSH 连接失败？

**A:** 在 Jenkins 节点上配置 SSH 密钥：

```bash
ssh-copy-id portwin@192.168.0.197
```

## 📚 相关文档

- **详细集成指南**: [jenkins-integration.md](./jenkins-integration.md)
- **完整 Jenkinsfile**: [../../Jenkinsfile](../../Jenkinsfile)
- **简化 Jenkinsfile**: [../../Jenkinsfile.simple](../../Jenkinsfile.simple)

## 🎉 总结

### 集成难度：⭐⭐☆☆☆（简单）

**为什么简单？**
1. 已有现成的脚本
2. 支持非交互式执行
3. 完善的错误处理
4. 清晰的日志输出

**需要多久？**
- 快速开始：5 分钟
- 完整配置：30 分钟
- 深度定制：按需

**推荐步骤：**
1. 使用 `Jenkinsfile.simple` 快速开始
2. 验证可以正常部署
3. 根据需要升级到 `Jenkinsfile`

---

**现在就开始吧！** 创建一个 Pipeline，选择 `Jenkinsfile.simple`，点击构建！ 🚀
