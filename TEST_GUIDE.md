# Method Bug 修复 - 测试指南

## 📋 测试清单

### 1. 本地开发环境测试

#### 1.1 启动本地服务

```bash
# 终端 1: 启动 API
cd apps/api
npm run dev

# 终端 2: 启动前端
cd apps/web
npm run dev
```

#### 1.2 测试登录界面环境选择器

1. 打开浏览器：http://localhost:5173
2. 查看登录界面，应该看到**环境选择器**
3. 尝试切换不同环境：
   - 本地（默认）
   - 测试
   - 开发
   - 生产
4. ✅ 验证：环境切换后显示对应的 URL

#### 1.3 测试 Backfill API（本地）

```bash
# 获取管理员 Token
curl -X POST 'http://localhost:8787/api/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'

# 保存返回的 accessToken
export TOKEN="your_access_token_here"

# 测试 Backfill API
curl -X POST 'http://localhost:8787/api/admin/paths/backfill-methods' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json'
```

**预期输出**:
```json
{
  "success": true,
  "message": "成功修复 X 个路径的 method 字段",
  "data": {
    "totalPaths": 150,
    "queriedPaths": 120,
    "updatedPaths": 45,
    "samples": [...]
  }
}
```

---

### 2. 测试环境部署测试

#### 2.1 部署到测试环境

```bash
cd apps/api
npm run deploy  # 默认部署到 Test 环境
```

等待部署完成（约 30 秒）。

#### 2.2 执行一键修复脚本

```bash
cd apps/api
chmod +x scripts/fix-methods-bug.sh  # 确保脚本有执行权限
./scripts/fix-methods-bug.sh test
```

**交互过程**:
1. 输入管理员用户名（默认 admin）
2. 输入密码
3. 脚本自动执行两个步骤：
   - 步骤 1: 批量修复 unified-paths:list
   - 步骤 2: 刷新 KV 快照

**预期输出**:
```
====================================
🔧 Method 字段 Bug 一键修复
====================================
环境: test
URL: https://api-proxy.pwtk.cc

🔐 正在登录...
✅ 登录成功

📝 步骤 1/2: 批量修复持久化配置
====================================
📊 开始分块查询: 总路径数=1200, 块大小=500
✅ 分块 1/3: 查询了 500 个路径
✅ 分块 2/3: 查询了 500 个路径
✅ 分块 3/3: 查询了 200 个路径
✅ 步骤 1 完成：修复了 1110 个路径的 method

📸 步骤 2/2: 刷新 KV 快照
====================================
✅ 步骤 2 完成：快照版本 15，包含 100 个路径

✅ 修复完成！
```

#### 2.3 验证修复效果

```bash
# 检查路径列表 API（前 10 个路径）
curl 'https://api-proxy.pwtk.cc/api/admin/paths?page=1&limit=10' \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data[].method'
```

**预期结果**:
- ✅ 应该看到 `GET`, `POST`, `PUT`, `DELETE` 等多种 method
- ❌ **不应该**全部显示 `GET`

```bash
# 检查具体路径的 method
curl 'https://api-proxy.pwtk.cc/api/admin/paths/%2Fapi%2Fuser%2Fprofile' \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data.method'
```

---

### 3. 大规模环境测试（>900 路径）

#### 3.1 模拟大规模数据

如果测试环境路径不足 900 个，可以在本地测试分块查询：

```bash
# 查看当前路径数量
curl 'https://api-proxy.pwtk.cc/api/admin/paths?page=1&limit=1' \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.pagination.total'
```

#### 3.2 测试分块查询日志

执行 backfill 时，观察日志输出：

```bash
./scripts/fix-methods-bug.sh test
```

**关键验证点**:
- ✅ 看到 "开始分块查询" 日志
- ✅ 看到多个 "分块 X/Y" 日志
- ✅ **不会**出现 "too many SQL variables" 错误

---

### 4. 生产环境部署（谨慎）

⚠️ **生产环境部署前必须完成测试环境验证**

#### 4.1 部署到生产

```bash
cd apps/api
npm run deploy -- --env production
```

#### 4.2 执行生产修复

```bash
./scripts/fix-methods-bug.sh prod
```

脚本会要求确认：
```
⚠️  环境：生产环境（请谨慎操作）
确认要在生产环境执行？(yes/no): yes
```

#### 4.3 生产验证

```bash
# 1. 检查路径列表
curl 'https://api-proxy.bugacard.com/api/admin/paths?page=1&limit=10' \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data[] | {path: .path, method: .method}'

# 2. 检查高流量路径
curl 'https://api-proxy.bugacard.com/api/admin/paths?page=1&limit=50' \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data[] | select(.requestCount > 1000) | {path: .path, method: .method, count: .requestCount}'

# 3. 检查低流量路径（验证持久化修复）
curl 'https://api-proxy.bugacard.com/api/admin/paths?page=5&limit=50' \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data[] | select(.requestCount < 100) | {path: .path, method: .method}'
```

---

## 🔍 问题排查

### 问题 1: 登录失败

**症状**: 一键修复脚本登录失败

**排查**:
```bash
# 手动测试登录
curl -X POST 'https://api-proxy.pwtk.cc/api/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' \
  | jq '.'
```

**解决**:
- 确认用户名和密码正确
- 检查环境 URL 是否正确

### 问题 2: 仍然显示 GET

**症状**: 修复后路径仍然显示 `GET`

**原因**: 可能是快照未刷新或路径没有真实流量

**排查**:
```bash
# 1. 检查快照状态
curl 'https://api-proxy.pwtk.cc/api/admin/paths/snapshot/status' \
  -H "Authorization: Bearer $TOKEN"

# 2. 手动刷新快照
curl -X POST 'https://api-proxy.pwtk.cc/api/admin/paths/snapshot/refresh' \
  -H "Authorization: Bearer $TOKEN"

# 3. 检查 traffic_events 表是否有数据
# （通过 wrangler d1 execute）
```

### 问题 3: 分块查询未生效

**症状**: 仍然出现 "too many SQL variables" 错误

**排查**:
- 检查代码是否正确部署
- 查看日志确认是否使用分块查询

**解决**:
```bash
# 重新部署
npm run deploy -- --env test

# 检查部署版本
curl 'https://api-proxy.pwtk.cc/api/tk-check' | jq '.'
```

---

## ✅ 验收标准

### 必须通过的测试

- [ ] **本地测试**
  - [ ] 登录界面显示环境选择器
  - [ ] Backfill API 返回成功
  - [ ] 路径列表显示多种 method

- [ ] **测试环境**
  - [ ] 部署成功
  - [ ] 一键修复脚本执行成功
  - [ ] 路径列表不全是 GET
  - [ ] 低流量路径也显示正确 method

- [ ] **大规模测试**
  - [ ] 支持 >900 个路径
  - [ ] 看到分块查询日志
  - [ ] 无 SQL 错误

- [ ] **生产环境**
  - [ ] 部署成功
  - [ ] 修复成功
  - [ ] 数据正确
  - [ ] 无错误日志

---

## 📊 测试报告模板

```markdown
## Method Bug 修复测试报告

### 测试环境
- 环境：[test/dev/prod]
- 时间：2025-10-20
- 路径数量：1200

### 测试结果

#### 1. 登录界面 ✅
- 环境选择器正常显示
- 可以切换环境

#### 2. Backfill API ✅
- 总路径数：1200
- 查询到 method：1150
- 更新路径数：1100

#### 3. 路径列表验证 ✅
- GET: 800
- POST: 200
- PUT: 80
- DELETE: 20

#### 4. 分块查询 ✅
- 分块 1/3: 500 路径
- 分块 2/3: 500 路径
- 分块 3/3: 200 路径
- 无 SQL 错误

### 问题
- 无

### 结论
✅ 所有测试通过，可以部署到生产环境
```

---

## 🚀 快速测试命令

```bash
# 完整测试流程（测试环境）
cd apps/api

# 1. 部署
npm run deploy

# 2. 等待 30 秒
sleep 30

# 3. 执行修复
./scripts/fix-methods-bug.sh test

# 4. 验证
curl 'https://api-proxy.pwtk.cc/api/admin/paths?page=1&limit=10' \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq '.data[].method' | sort | uniq -c
```

预期输出（示例）：
```
  80 "DELETE"
 200 "POST"
 120 "PUT"
 600 "GET"
```

---

## 📝 注意事项

1. **备份数据**：生产环境修复前，建议备份 KV 数据
2. **错峰执行**：生产环境建议在低峰期执行
3. **监控日志**：执行后监控错误日志
4. **回滚准备**：准备回滚方案（KV 有版本历史）

祝测试顺利！🎉

