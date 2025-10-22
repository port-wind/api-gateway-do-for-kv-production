# 🚀 智能部署指南

## 📋 概述

智能部署脚本会自动检测当前登录的 Cloudflare 账号，并选择对应的部署环境。

**核心优势**：
- ✅ 配置完全在 `wrangler.toml` 中管理
- ✅ 脚本零硬编码，只负责选择环境
- ✅ 易于维护和扩展

---

## 📁 配置文件结构

### `wrangler.toml` 环境配置

```toml
# 测试环境（默认）
account_id = "625675bb221d602eccde58bb23facbfb"

# 生产环境（需要完整配置所有绑定）
[env.production]
account_id = "80e68ad465093681d7d893b6c122f9b8"

# 生产环境的 KV、DO、vars 等配置（注意：KV ID 与测试环境不同）
[[env.production.kv_namespaces]]
binding = "API_GATEWAY_STORAGE"
id = "b91bfa214c174863b61931e77051e63a"  # 生产环境独立的 KV

[env.production.durable_objects]
bindings = [...]

[env.production.vars]
DEFAULT_RATE_LIMIT = "60"
...
```

**注意**：环境配置不会继承顶层配置，需要显式声明所有绑定。

### `deploy.sh` 环境映射规则

```bash
portwind520@gmail.com  →  --env production  →  [env.production] (生产环境)
其他账号              →  默认               →  根配置 (测试环境)
```

---

## 🚀 使用方式

### 方式一：智能部署（推荐）

```bash
cd apps/api

# 交互式部署（需要手动确认）
./deploy.sh

# 或使用 pnpm
pnpm deploy

# 自动确认部署（用于 CI/CD）
./deploy.sh -y
./deploy.sh --yes
```

### 方式二：手动指定环境

```bash
# 部署到测试环境
wrangler deploy --env test

# 部署到生产环境
wrangler deploy
```

### 方式三：直接使用 wrangler

```bash
pnpm deploy:direct
```

---

## 📊 工作流程

```
开始部署
    ↓
检查当前登录账号
    ↓
  ┌──────────────────┬──────────────────┐
  │  portwind520@    │    其他账号      │
  │  gmail.com       │                  │
  └──────────────────┴──────────────────┘
         ↓                    ↓
  wrangler deploy      wrangler deploy
     --env test           (默认环境)
         ↓                    ↓
    使用 [env.test]      使用根配置
    Account ID:          Account ID:
    80e68ad4...          625675b...
         ↓                    ↓
       完成                 完成
```

---

## 🎨 执行示例

### 生产环境部署（交互式）

```bash
$ ./deploy.sh

🔍 检查当前登录账号...
📧 当前登录账号: portwind520@gmail.com

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📦 即将部署到：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  环境:       🟢 生产环境 (Production)
  账号:       portwind520@gmail.com
  Account ID: 80e68ad465093681d7d893b6c122f9b8
  配置来源:   wrangler.toml [env.production]
  部署命令:   wrangler deploy --env production
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❓ 确认部署到此环境吗？(y/N): y

🚀 开始部署...

[wrangler 部署输出...]

✅ 部署完成！
```

### 生产环境部署（自动确认）

```bash
$ ./deploy.sh -y

🔍 检查当前登录账号...
📧 当前登录账号: portwind520@gmail.com

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📦 即将部署到：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  环境:       🟢 生产环境 (Production)
  账号:       portwind520@gmail.com
  Account ID: 80e68ad465093681d7d893b6c122f9b8
  配置来源:   wrangler.toml [env.production]
  部署命令:   wrangler deploy --env production
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ 自动确认模式，跳过确认步骤

🚀 开始部署...

[wrangler 部署输出...]

✅ 部署完成！
```

### 测试环境部署

```bash
$ ./deploy.sh

🔍 检查当前登录账号...
📧 当前登录账号: test@example.com

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📦 即将部署到：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  环境:       🟡 测试环境 (Test)
  账号:       test@example.com
  Account ID: 625675bb221d602eccde58bb23facbfb
  配置来源:   wrangler.toml (根配置)
  部署命令:   wrangler deploy
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❓ 确认部署到此环境吗？(y/N): y

🚀 开始部署...

[wrangler 部署输出...]

✅ 部署完成！
```

### 取消部署

```bash
$ ./deploy.sh

🔍 检查当前登录账号...
📧 当前登录账号: test@example.com

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📦 即将部署到：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  环境:       🟡 测试环境 (Test)
  账号:       test@example.com
  Account ID: 625675bb221d602eccde58bb23facbfb
  配置来源:   wrangler.toml (根配置)
  部署命令:   wrangler deploy
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❓ 确认部署到此环境吗？(y/N): n

❌ 部署已取消
```

---

## ⚙️ 配置管理

### 添加新环境

编辑 `wrangler.toml`：

```toml
# 添加预发布环境
[env.staging]
account_id = "your-staging-account-id"
```

编辑 `deploy.sh`，添加账号映射：

```bash
elif [ "$CURRENT_EMAIL" = "staging@example.com" ]; then
    ENV_NAME="🟠 预发布环境 (Staging)"
    ENV_FLAG="--env staging"
    CONFIG_SOURCE="wrangler.toml [env.staging]"
    ACCOUNT_ID="your-staging-account-id"
```

### 修改账号映射

只需修改 `deploy.sh` 中的邮箱判断逻辑，无需修改配置。

---

## 📦 环境配置说明

| 环境 | 配置位置 | Account ID | 触发账号 |
|------|---------|-----------|---------|
| 🟢 **Production** | `[env.production]` | `80e68ad4...` | `portwind520@gmail.com` |
| 🟡 **Test** | 根配置 | `625675bb...` | 除生产账号外的所有账号 |

---

## 🔧 故障排除

### 问题：未检测到登录账号

**错误信息**:
```
❌ 错误：未登录 Cloudflare 账号
请先运行: wrangler login
```

**解决方案**:
```bash
wrangler login
```

### 问题：部署到错误的环境

**检查步骤**:
1. 确认当前登录账号：
   ```bash
   wrangler whoami
   ```
2. 查看脚本输出的环境信息
3. 检查 `deploy.sh` 中的账号映射规则

### 问题：需要手动指定环境

**解决方案**:
```bash
# 绕过智能检测，手动指定环境
wrangler deploy --env test
```

---

## 💡 最佳实践

### 1. 账号管理
- 为不同环境使用不同的 Cloudflare 账号
- 在 `deploy.sh` 中配置账号到环境的映射

### 2. 配置管理
- 所有环境配置集中在 `wrangler.toml`
- 脚本只负责选择，不包含配置细节
- 便于审查和版本控制

### 3. 切换环境
```bash
# 切换到测试环境
wrangler logout
wrangler login  # 使用测试账号登录

# 切换到生产环境
wrangler logout
wrangler login  # 使用生产账号登录
```

### 4. 自动确认部署（CI/CD 场景）
```bash
# 使用 -y 或 --yes 跳过确认步骤
./deploy.sh -y
./deploy.sh --yes

# 在 CI/CD 中使用
pnpm deploy -- -y
```

### 5. 传递额外参数
```bash
# 传递 wrangler 参数
./deploy.sh --dry-run
./deploy.sh -y --dry-run

# 查看帮助
wrangler deploy --help
```

---

## 🎯 与旧方案对比

| 方面 | 旧方案（硬编码） | 新方案（配置化） |
|-----|----------------|----------------|
| 配置位置 | 脚本中硬编码 | `wrangler.toml` 集中管理 |
| 维护性 | 需修改脚本代码 | 只需修改配置文件 |
| 扩展性 | 添加环境需改代码 | 添加环境只需加配置 |
| 可读性 | 分散在脚本中 | 配置一目了然 |
| 部署过程 | 临时修改+恢复 | 直接使用环境参数 |
| Git 友好 | 需要恢复机制 | 原生支持，无需恢复 |

---

## 📚 相关文件

- `deploy.sh` - 智能部署脚本（负责选择环境）
- `wrangler.toml` - 环境配置（包含所有配置）
- `package.json` - npm 脚本配置

---

## 🔗 Wrangler 环境文档

更多关于环境配置的信息，请查阅：
https://developers.cloudflare.com/workers/wrangler/configuration/#environments

---

**Happy Deploying! 🎉**
