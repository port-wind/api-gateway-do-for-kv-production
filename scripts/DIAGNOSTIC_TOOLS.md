# 代理服务诊断工具使用指南

当用户反映服务有问题时，使用以下工具快速验证是否是代理服务的问题。

## 🚀 快速开始

### 1. 针对特定问题的快速测试

如果用户提供了具体的 curl 命令，使用这个脚本进行快速验证：

```bash
./scripts/test-specific-issue.sh
```

**优点**：
- ✅ 使用用户提供的完整请求信息
- ✅ 自动分析常见问题
- ✅ 给出明确的诊断结论
- ✅ 提供具体的修复建议

### 2. 通用代理诊断工具

对于更复杂的问题诊断：

```bash
# 快速诊断模式
./scripts/diagnose-proxy.sh --quick

# 完整诊断模式（推荐）
./scripts/diagnose-proxy.sh --full --token "用户token"

# 与后端对比诊断
./scripts/diagnose-proxy.sh --full --backend https://backend-api.com --token "用户token"
```

## 📋 诊断流程

### 步骤1: 快速验证
```bash
# 针对用户报告的具体问题
./scripts/test-specific-issue.sh
```

如果结果显示 ✅，则问题不在代理服务。
如果结果显示 ❌，继续进行深度诊断。

### 步骤2: 深度诊断
```bash
# 完整诊断，包含配置检查
./scripts/diagnose-proxy.sh --full --token "用户的实际token"
```

### 步骤3: 对比测试（可选）
如果知道后端服务地址，可以进行对比测试：
```bash
./scripts/diagnose-proxy.sh --full --backend https://real-backend.com --token "token"
```

## 🔍 结果解读

### ✅ 代理服务正常的标志
- HTTP 200 状态码
- 响应时间合理（< 2秒）
- 响应包含预期的数据结构
- 健康检查通过

### ❌ 代理服务异常的标志
- 连接超时或拒绝连接
- HTTP 5xx 错误码
- 异常的响应时间（> 10秒）
- 健康检查失败

### ⚠️ 需要进一步调查的情况
- HTTP 4xx 错误码（可能是配置或权限问题）
- 空响应或格式异常
- 间歇性失败

## 📊 常见问题及解决方案

### 1. HTTP 404 - 路径未找到
**可能原因**：
- 代理路由配置错误
- 路径匹配规则问题

**排查步骤**：
1. 检查代理路由配置：`curl https://api-proxy.pwtk.cc/api/admin/proxy-routes`
2. 验证路径匹配规则
3. 检查后端服务地址是否正确

### 2. HTTP 429 - 请求过于频繁
**可能原因**：
- 限流配置过于严格
- 用户请求频率过高

**排查步骤**：
1. 检查限流配置：`curl https://api-proxy.pwtk.cc/api/admin/rate-limit/config`
2. 查看路径级别的限流设置
3. 确认用户的实际请求频率

### 3. HTTP 502/503 - 后端服务问题
**可能原因**：
- 后端服务宕机
- 后端服务响应超时
- 网络连接问题

**排查步骤**：
1. 使用对比测试直接访问后端
2. 检查后端服务健康状态
3. 验证网络连通性

### 4. HTTP 403 - 请求被拒绝
**可能原因**：
- 地域限制
- IP 封禁
- 权限问题

**排查步骤**：
1. 检查地域限制配置
2. 确认用户的IP地址和地理位置
3. 验证token权限

## 📁 日志文件位置

诊断工具会在以下位置生成详细日志：

```
./logs/diagnose/
├── proxy_diagnosis_YYYYMMDD_HHMMSS.log      # 完整诊断日志
├── diagnosis_report_YYYYMMDD_HHMMSS.md      # 诊断报告
├── proxy_response_YYYYMMDD_HHMMSS.txt       # 代理响应详情
├── backend_response_YYYYMMDD_HHMMSS.txt     # 后端响应详情（如果有）
└── specific_test_YYYYMMDD_HHMMSS.log        # 特定问题测试日志
```

## 🛠️ 自定义配置

### 修改默认配置
编辑脚本中的配置变量：

```bash
# diagnose-proxy.sh 中的配置
PROXY_URL="https://api-proxy.pwtk.cc"        # 代理服务地址
TEST_PATH="/biz-client/biz/search/topic/query" # 测试路径

# test-specific-issue.sh 中的配置
TOKEN="your-default-token"                    # 默认测试token
```

### 添加自定义检查
在脚本中添加特定于你们业务的检查逻辑：

```bash
# 示例：检查特定的业务指标
check_business_metrics() {
    print_step "检查业务指标..."
    # 添加你的检查逻辑
}
```

## ⚡ 快捷命令

在项目根目录创建快捷方式：

```bash
# 添加到 package.json scripts 中
{
  "scripts": {
    "diagnose": "./scripts/test-specific-issue.sh",
    "diagnose:full": "./scripts/diagnose-proxy.sh --full",
    "diagnose:backend": "./scripts/diagnose-proxy.sh --full --backend"
  }
}
```

使用方式：
```bash
npm run diagnose                    # 快速诊断
npm run diagnose:full               # 完整诊断
```

## 📞 紧急情况处理

如果诊断结果显示代理服务有严重问题：

1. **立即检查服务状态**
   ```bash
   curl https://api-proxy.pwtk.cc/health
   ```

2. **查看实时日志**（如果有权限）
   ```bash
   wrangler tail
   ```

3. **检查服务指标**
   - CPU 使用率
   - 内存使用率
   - 网络连接数
   - 错误率

4. **联系运维团队**
   - 提供诊断日志
   - 说明影响范围
   - 给出初步分析结果

## 🔧 故障排除

### 脚本执行权限问题
```bash
chmod +x ./scripts/*.sh
```

### 缺少依赖工具
```bash
# macOS
brew install curl jq

# Ubuntu/Debian
sudo apt-get install curl jq

# CentOS/RHEL
sudo yum install curl jq
```

### 网络连接问题
```bash
# 检查DNS解析
nslookup api-proxy.pwtk.cc

# 检查端口连通性
telnet api-proxy.pwtk.cc 443
```

---

💡 **提示**：定期使用诊断工具进行健康检查，可以提前发现潜在问题。建议将诊断脚本集成到监控系统中。