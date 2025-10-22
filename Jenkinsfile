#!/usr/bin/env groovy

/**
 * API Gateway Jenkins 部署流水线
 * 
 * 功能：
 * - 自动部署 API 和 Web 前端
 * - 支持并行部署
 * - 飞书通知集成
 * - 完整的错误处理
 */

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
            description: '跳过测试（不推荐）'
        )
    }
    
    environment {
        // Cloudflare 凭证（需要在 Jenkins 中配置）
        CLOUDFLARE_API_TOKEN = credentials('cloudflare-api-token')
        
        // 飞书 Webhook（可选）
        LARK_WEBHOOK_URL = credentials('lark-webhook-url')
        
        // 构建信息
        BUILD_USER = "${env.BUILD_USER_ID ?: 'jenkins'}"
        GIT_COMMIT_SHORT = sh(script: "git log -1 --pretty=format:'%h'", returnStdout: true).trim()
        GIT_COMMIT_MSG = sh(script: "git log -1 --pretty=format:'%s'", returnStdout: true).trim()
    }
    
    options {
        // 保留最近 10 次构建
        buildDiscarder(logRotator(numToKeepStr: '10'))
        
        // 超时 30 分钟
        timeout(time: 30, unit: 'MINUTES')
        
        // 禁止并发构建
        disableConcurrentBuilds()
        
        // 时间戳
        timestamps()
    }
    
    stages {
        stage('初始化') {
            steps {
                echo """
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                🚀 API Gateway 部署流水线
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                构建号:     #${env.BUILD_NUMBER}
                分支:       ${env.GIT_BRANCH}
                提交:       ${env.GIT_COMMIT_SHORT}
                提交信息:   ${env.GIT_COMMIT_MSG}
                部署目标:   ${params.DEPLOY_TARGET}
                触发者:     ${env.BUILD_USER}
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                """
            }
        }
        
        stage('检出代码') {
            steps {
                checkout scm
            }
        }
        
        stage('环境检查') {
            steps {
                sh '''
                    echo "📋 检查环境..."
                    
                    # 检查 Node.js
                    if ! command -v node &> /dev/null; then
                        echo "❌ Node.js 未安装"
                        exit 1
                    fi
                    echo "✅ Node.js: $(node --version)"
                    
                    # 检查/安装 pnpm
                    if ! command -v pnpm &> /dev/null; then
                        echo "⚙️ 安装 pnpm..."
                        npm install -g pnpm
                    fi
                    echo "✅ pnpm: $(pnpm --version)"
                    
                    # 检查/安装 wrangler
                    if ! command -v wrangler &> /dev/null; then
                        echo "⚙️ 安装 wrangler..."
                        npm install -g wrangler
                    fi
                    echo "✅ wrangler: $(wrangler --version)"
                '''
            }
        }
        
        stage('安装依赖') {
            steps {
                sh '''
                    echo "📦 安装项目依赖..."
                    pnpm install --frozen-lockfile --prefer-offline
                '''
            }
        }
        
        stage('运行测试') {
            when {
                expression { !params.SKIP_TESTS }
            }
            steps {
                sh '''
                    echo "🧪 运行单元测试..."
                    pnpm run test:api:unit || {
                        echo "❌ 测试失败"
                        exit 1
                    }
                '''
            }
        }
        
        stage('部署') {
            steps {
                script {
                    def deployCommand = ''
                    
                    switch(params.DEPLOY_TARGET) {
                        case 'all':
                            echo '🚀 部署 API + Web（并行模式）'
                            deployCommand = 'pnpm run deploy'
                            break
                        case 'api':
                            echo '🚀 只部署 API'
                            deployCommand = 'pnpm run deploy:api'
                            break
                        case 'web':
                            echo '🚀 只部署 Web'
                            deployCommand = 'pnpm run deploy:web'
                            break
                        default:
                            error "未知的部署目标: ${params.DEPLOY_TARGET}"
                    }
                    
                    sh deployCommand
                }
            }
        }
    }
    
    post {
        success {
            script {
                def message = """
                ✅ API Gateway 部署成功
                
                构建号: #${env.BUILD_NUMBER}
                分支: ${env.GIT_BRANCH}
                提交: ${env.GIT_COMMIT_SHORT}
                提交信息: ${env.GIT_COMMIT_MSG}
                部署目标: ${params.DEPLOY_TARGET}
                触发者: ${env.BUILD_USER}
                耗时: ${currentBuild.durationString.replace(' and counting', '')}
                """
                
                echo message
                
                // 发送飞书通知（如果配置了）
                if (env.LARK_WEBHOOK_URL) {
                    sh """
                        curl -X POST ${env.LARK_WEBHOOK_URL} \
                        -H 'Content-Type: application/json' \
                        -d '{
                            "msg_type": "text",
                            "content": {
                                "text": "${message.replaceAll('"', '\\\\"').replaceAll('\n', '\\\\n')}"
                            }
                        }'
                    """
                }
            }
        }
        
        failure {
            script {
                def message = """
                ❌ API Gateway 部署失败
                
                构建号: #${env.BUILD_NUMBER}
                分支: ${env.GIT_BRANCH}
                提交: ${env.GIT_COMMIT_SHORT}
                触发者: ${env.BUILD_USER}
                
                请查看构建日志排查问题：
                ${env.BUILD_URL}console
                """
                
                echo message
                
                // 发送飞书通知（如果配置了）
                if (env.LARK_WEBHOOK_URL) {
                    sh """
                        curl -X POST ${env.LARK_WEBHOOK_URL} \
                        -H 'Content-Type: application/json' \
                        -d '{
                            "msg_type": "text",
                            "content": {
                                "text": "${message.replaceAll('"', '\\\\"').replaceAll('\n', '\\\\n')}"
                            }
                        }'
                    """
                }
            }
        }
        
        always {
            echo '🧹 清理工作空间...'
            // 可选：清理工作空间
            // cleanWs()
        }
    }
}
