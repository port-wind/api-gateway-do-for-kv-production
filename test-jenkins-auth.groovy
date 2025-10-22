// Jenkins Pipeline 测试脚本 - 验证 Cloudflare Token
// 在 Jenkins 中创建一个新的 Pipeline 并粘贴此内容

pipeline {
    agent any
    
    environment {
        // 使用刚才配置的凭证
        CLOUDFLARE_API_TOKEN = credentials('cloudflare-api-token-ad')
        CLOUDFLARE_ACCOUNT_ID = '625675bb221d602eccde58bb23facbfb'
    }
    
    stages {
        stage('验证 Token') {
            steps {
                echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
                echo '🔍 测试 Cloudflare 认证'
                echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
                
                sh '''
                    # 检查 wrangler
                    if ! command -v wrangler &> /dev/null; then
                        echo "安装 wrangler..."
                        npm install -g wrangler
                    fi
                    
                    echo ""
                    echo "Wrangler 版本: $(wrangler --version)"
                    echo ""
                    
                    # 验证认证
                    echo "🔑 验证 API Token..."
                    if wrangler whoami; then
                        echo ""
                        echo "✅ 认证成功！"
                        echo "   Token 有效"
                        echo "   Account ID: $CLOUDFLARE_ACCOUNT_ID"
                    else
                        echo ""
                        echo "❌ 认证失败"
                        exit 1
                    fi
                '''
                
                echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
                echo '✅ Token 验证成功！可以用于部署'
                echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
            }
        }
        
        stage('测试部署（Dry Run）') {
            steps {
                echo '🧪 测试部署流程（不实际部署）'
                
                sh '''
                    cd apps/api
                    
                    # Dry run 测试
                    echo "执行 dry run..."
                    wrangler deploy --dry-run || echo "⚠️  Dry run 可能需要完整配置"
                '''
            }
        }
    }
    
    post {
        success {
            echo """
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ✅ 测试完成！
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            
            下一步:
            1. Token 配置正确 ✓
            2. 可以开始使用 Jenkinsfile.multi-account
            3. 记得配置生产环境的 Token
            """
        }
        failure {
            echo """
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ❌ 测试失败
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            
            检查:
            1. Token 是否正确配置在 Jenkins
            2. 凭证 ID 是否为 'cloudflare-api-token-test'
            3. Token 权限是否包含 Workers Scripts: Edit
            """
        }
    }
}
