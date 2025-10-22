# KV Namespace 配置说明

## 📋 概述

每个 Cloudflare 账号都有自己独立的 KV Namespaces，ID 不能跨账号使用。

---

## 🗄️ 环境 KV Namespaces

### 测试环境
```toml
[[kv_namespaces]]
binding = "API_GATEWAY_STORAGE"
id = "2e834fa039d54991a92dc9208cb1775e"
```
- **账号**: 625675bb221d602eccde58bb23facbfb
- **标题**: API_GATEWAY_STORAGE

### 生产环境
```toml
[[env.production.kv_namespaces]]
binding = "API_GATEWAY_STORAGE"
id = "b91bfa214c174863b61931e77051e63a"
```
- **账号**: 80e68ad465093681d7d893b6c122f9b8
- **标题**: production-API_GATEWAY_STORAGE

---

## 🔧 创建新 KV Namespace

如果需要为其他环境创建 KV namespace：

```bash
# 测试环境（默认）
wrangler kv namespace create "API_GATEWAY_STORAGE"

# 生产环境
wrangler kv namespace create "API_GATEWAY_STORAGE" --env production

# 预发布环境
wrangler kv namespace create "API_GATEWAY_STORAGE" --env staging
```

---

## 📝 更新配置

创建后，将返回的 ID 添加到 `wrangler.toml`：

```toml
[env.YOUR_ENV]
[[env.YOUR_ENV.kv_namespaces]]
binding = "API_GATEWAY_STORAGE"
id = "your-new-kv-id-here"
```

---

## ⚠️ 常见问题

### 问题 1：KV namespace not found

**错误信息**：
```
KV namespace 'xxx' not found. [code: 10041]
```

**原因**：
- 使用了其他账号的 KV namespace ID
- KV namespace 已被删除

**解决**：
1. 检查当前登录账号
2. 列出当前账号的 KV namespaces
3. 使用正确的 ID 或创建新的 KV namespace

### 问题 2：列出 KV Namespaces

```bash
# 列出所有 KV namespaces
wrangler kv namespace list

# 查看 KV 内容
wrangler kv key list --namespace-id <your-kv-id>
```

---

## 💡 最佳实践

1. **环境隔离** - 每个环境使用独立的 KV namespace
2. **命名规范** - 使用 `{env}-{name}` 格式，如 `production-API_GATEWAY_STORAGE`
3. **文档记录** - 在配置中注释说明 KV 的用途
4. **备份数据** - 定期备份重要数据

---

## 🔗 相关文档

- [Cloudflare KV 文档](https://developers.cloudflare.com/kv/)
- [Wrangler KV 命令](https://developers.cloudflare.com/workers/wrangler/commands/#kv)

