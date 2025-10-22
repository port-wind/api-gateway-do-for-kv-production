# 🚀 部署快速参考

## 📋 命令速查

| 命令 | 说明 | 交互 | 场景 |
|-----|-----|------|-----|
| `pnpm deploy` | 智能部署 | ✅ 需确认 | 日常开发 |
| `pnpm deploy:auto` | 自动部署 | ❌ 无需确认 | CI/CD |
| `pnpm deploy:direct` | 直接部署 | ❌ 无需确认 | 手动控制 |
| `./deploy.sh` | 智能部署 | ✅ 需确认 | 日常开发 |
| `./deploy.sh -y` | 自动部署 | ❌ 无需确认 | CI/CD |

---

## 📦 部署流程

```
./deploy.sh
    ↓
检测账号: portwind520@gmail.com
    ↓
显示部署信息
━━━━━━━━━━━━━━━━━━━━━━━
📦 即将部署到：
  环境: 🟢 生产环境
  账号: portwind520@gmail.com
  Account ID: 80e68ad4...
━━━━━━━━━━━━━━━━━━━━━━━
    ↓
❓ 确认部署？(y/N): y
    ↓
🚀 开始部署...
    ↓
✅ 部署完成！
```

---

## 🎯 环境映射

| 登录账号 | 部署环境 | Account ID | 配置位置 |
|---------|---------|-----------|---------|
| `portwind520@gmail.com` | 🟢 Production | `80e68ad4...` | `[env.production]` |
| 其他账号 | 🟡 Test | `625675b...` | 根配置 |

---

## ⚡ 快速示例

### 交互式部署（推荐）
```bash
cd apps/api
./deploy.sh
# 确认后部署
```

### CI/CD 自动部署
```bash
cd apps/api
./deploy.sh -y
# 或
pnpm deploy:auto
```

### 取消部署
```bash
cd apps/api
./deploy.sh
# 输入 n 或 N 取消
```

---

## 🔐 安全特性

✅ **部署前确认** - 防止误操作  
✅ **显示完整信息** - 清楚部署目标  
✅ **支持取消** - 随时中止  
✅ **CI/CD 模式** - 自动化友好  

---

## 📞 问题排查

### 未登录
```bash
❌ 错误：未登录 Cloudflare 账号

# 解决
wrangler login
```

### 部署到错误环境
```bash
# 检查当前账号
wrangler whoami

# 切换账号
wrangler logout
wrangler login
```

### 需要手动控制
```bash
# 绕过智能检测
wrangler deploy                   # 测试环境（默认）
wrangler deploy --env production  # 生产环境
```

---

**详细文档请查看: [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md)**

