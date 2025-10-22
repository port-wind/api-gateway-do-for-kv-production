# API Gateway 部署指南

本文档介绍如何使用自动化部署脚本部署 API Gateway 到 Cloudflare Workers。

## 快速开始

### 1. 基本部署

```bash
# 部署到 staging 环境（默认）
./deploy.sh

# 部署到 production 环境
./deploy.sh -e production

# 启用通知并部署
./deploy.sh -n -e production
```

### 2. 部署命令选项

```bash
./deploy.sh [选项]

选项:
  -e, --env ENV                 部署环境 (staging|production) [默认: staging]
  -s, --skip-tests             跳过测试
  -n, --notifications          启用通知 (飞书/Telegram)
  -p, --package-manager PM     包管理器 (npm|pnpm|yarn) [默认: pnpm]
  -h, --help                   显示帮助信息
```

### 3. 使用示例

```bash
# 部署到 staging 环境
./deploy.sh

# 部署到 production 环境，跳过测试，启用通知
./deploy.sh -e production -s -n

# 使用 npm 作为包管理器部署
./deploy.sh -p npm -e staging

# 快速部署（跳过测试）
./deploy.sh -s
```

## 环境配置

### Staging 环境
- **Worker 名称**: `api-gateway-staging`
- **配置文件**: `wrangler.staging.toml`
- **限流配置**: 较宽松（120 req/min）
- **URL**: `https://api-gateway-staging.your-subdomain.workers.dev`

### Production 环境
- **Worker 名称**: `api-gateway-production`
- **配置文件**: `wrangler.production.toml`
- **限流配置**: 严格（60 req/min）
- **URL**: `https://api-gateway-production.your-subdomain.workers.dev`

## 通知配置

### 飞书 (Lark) 通知

1. 创建 `.lark-config` 文件：
```bash
cp .lark-config.example .lark-config
```

2. 编辑配置：
```bash
# 飞书群组 Webhook URL
LARK_WEBHOOK_URL="https://open.larksuite.com/open-apis/bot/v2/hook/your-webhook-id"

# 机器人名称（可选）
LARK_BOT_NAME="API Gateway Deploy Bot"

# 是否 @所有人（可选）
LARK_MENTION_ALL="false"
```

### Telegram 通知

1. 创建 `.telegram-config` 文件：
```bash
cp .telegram-config.example .telegram-config
```

2. 获取 Bot Token 和 Chat ID：
   - 联系 @BotFather 创建机器人
   - 获取 Bot Token
   - 将机器人添加到群组或与机器人对话
   - 获取 Chat ID

3. 编辑配置：
```bash
TELEGRAM_BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
TELEGRAM_CHAT_ID="-1001234567890"
```

### 启用通知

```bash
# 启用通知部署
./deploy.sh -n

# 或设置环境变量
export SKIP_NOTIFICATIONS=false
./deploy.sh
```

## 部署流程

部署脚本自动执行以下步骤：

1. **初始化** (0%)
   - 检查必要工具 (pnpm, wrangler)
   - 验证 Wrangler 登录状态
   - 创建部署日志

2. **代码更新** (20%)
   - 拉取最新代码（如果是 Git 仓库）
   - 检查未提交的更改

3. **依赖安装** (40%)
   - 运行 `pnpm install`

4. **测试验证** (60%)
   - 运行测试套件（可跳过）
   - 确保代码质量

5. **项目构建** (75%)
   - 运行 `pnpm run build`

6. **Worker 部署** (85%)
   - 执行 `wrangler deploy --config wrangler.[environment].toml`

7. **健康检查** (95%)
   - 自动检测部署 URL
   - 验证 `/health` 端点
   - 最多重试 3 次

8. **完成通知** (100%)
   - 发送成功通知
   - 提供部署日志

## 健康检查

部署脚本会自动执行健康检查：

1. **自动 URL 检测**: 从 wrangler 输出中解析部署 URL
2. **重试机制**: 最多重试 3 次，每次间隔 5 秒
3. **状态验证**: 检查 HTTP 200 响应
4. **详细日志**: 记录所有健康检查尝试

健康检查端点：
- Staging: `https://api-gateway-staging.workers.dev/health`
- Production: `https://api-gateway-production.workers.dev/health`

## 日志管理

- **日志位置**: `/tmp/api_gateway_deploy_YYYYMMDD_HHMMSS.log`
- **日志保留**: 自动保留最近 5 个部署日志
- **日志内容**: 包含完整的部署过程、错误信息、性能统计
- **自动上传**: 部署完成后自动发送到 Telegram（如果配置）

## 错误处理

部署脚本具有完善的错误处理机制：

1. **严格模式**: 使用 `set -euo pipefail` 确保任何错误都会停止脚本
2. **错误通知**: 失败时自动发送通知，包含错误位置和详细信息
3. **日志上传**: 失败日志自动上传到 Telegram
4. **回滚提示**: 提供回滚建议和手动修复步骤

## 常见问题

### 1. Wrangler 未登录
```bash
# 登录到 Cloudflare
wrangler login
```

### 2. 账户 ID 不匹配
检查并更新 `wrangler.toml` 中的 `account_id`：
```bash
wrangler whoami
```

### 3. KV 命名空间不存在
```bash
# 创建新的 KV 命名空间
wrangler kv:namespace create "API_GATEWAY_STORAGE"
```

### 4. 健康检查失败
- 检查 Worker 是否正常部署
- 验证 `/health` 端点是否存在
- 手动访问 Worker URL 确认状态

### 5. 通知不工作
- 检查配置文件是否存在且格式正确
- 验证 Webhook URL 或 Bot Token 是否有效
- 确保启用了通知（`-n` 参数或环境变量）

## 环境变量

可以通过环境变量覆盖默认配置：

```bash
export PROJECT_NAME="my-api-gateway"
export ENVIRONMENT="production"
export SKIP_TESTS="true"
export SKIP_NOTIFICATIONS="false"
export PACKAGE_MANAGER="npm"

./deploy.sh
```

## 安全注意事项

1. **配置文件安全**:
   - `.lark-config` 和 `.telegram-config` 已添加到 `.gitignore`
   - 不要将敏感配置提交到版本控制

2. **Webhook 安全**:
   - 定期轮换 Webhook URL
   - 使用群组而非个人 Chat ID

3. **生产环境部署**:
   - 确认配置文件中的账户 ID 正确
   - 使用独立的 KV 命名空间
   - 定期备份 KV 存储数据

## 性能优化

1. **并发部署**: 脚本支持同时运行多个环境的部署
2. **缓存利用**: 保持 `node_modules` 缓存以加速依赖安装
3. **增量构建**: Wrangler 自动使用增量构建优化
4. **日志清理**: 自动清理旧日志文件以节省空间

## 监控和观测

部署完成后，可以通过以下方式监控服务：

1. **Cloudflare Dashboard**: 查看实时指标和日志
2. **Worker Analytics**: 监控请求量、错误率、延迟
3. **健康检查端点**: 定期检查服务状态
4. **部署通知**: 及时收到部署状态更新

## 贡献

如需改进部署脚本：

1. Fork 项目
2. 创建特性分支
3. 提交更改
4. 创建 Pull Request

部署脚本遵循项目的代码规范和最佳实践。