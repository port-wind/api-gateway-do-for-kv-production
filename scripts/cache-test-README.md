# 缓存测试套件

这是一套完整的 POST 请求缓存测试工具，用于验证 API 网关的缓存功能，包括：

- ✅ POST 请求缓存机制
- ⏱️ TTL (生存时间) 过期测试  
- 📊 缓存命中率统计
- 🎯 后端请求数量验证
- 📋 详细测试报告生成

## 🚀 快速开始

### 1. 启动 API 网关
```bash
cd apps/api
npm run dev
```

### 2. 配置测试环境
```bash
./scripts/setup-cache-test.sh setup
```

### 3. 执行缓存测试
```bash
./scripts/test-cache-post.sh
```

### 4. 生成详细报告
```bash
node scripts/cache-test-report.js
```

## 📁 文件说明

| 文件 | 功能 | 用途 |
|------|------|------|
| `mock-backend-server.js` | 后端模拟服务器 | 记录实际到达后端的请求数，验证缓存效果 |
| `test-cache-post.sh` | 缓存测试脚本 | 执行 100 个 POST 请求，测试缓存行为 |
| `cache-test-report.js` | 报告生成器 | 自动化测试流程，生成详细分析报告 |
| `setup-cache-test.sh` | 环境配置脚本 | 配置代理路由和缓存设置 |

## 🔧 详细使用说明

### 1. 后端模拟服务器

**启动服务器：**
```bash
node scripts/mock-backend-server.js
```

**服务端点：**
- `http://localhost:3001/api/test` - 测试接口
- `http://localhost:3001/stats` - 获取请求统计
- `http://localhost:3001/reset` - 重置统计数据

### 2. 环境配置脚本

**配置测试环境：**
```bash
./scripts/setup-cache-test.sh setup
```

**清理测试配置：**
```bash
./scripts/setup-cache-test.sh cleanup
```

**其他操作：**
```bash
./scripts/setup-cache-test.sh start-backend   # 启动后端服务器
./scripts/setup-cache-test.sh stop-backend    # 停止后端服务器
./scripts/setup-cache-test.sh verify          # 验证配置
./scripts/setup-cache-test.sh show            # 显示配置信息
```

### 3. 缓存测试脚本

**基本用法：**
```bash
./scripts/test-cache-post.sh [GATEWAY_URL]
```

**测试流程：**
1. 发送前 50 个请求（缓存建立 + 命中测试）
2. 等待 61 秒让缓存过期
3. 发送后 50 个请求（缓存重建 + 命中测试）
4. 统计和分析结果

**输出示例：**
```
=== POST 请求缓存测试 ===
🎯 测试目标:
  • 验证 POST 请求缓存功能
  • 测试 60 秒 TTL 过期机制
  • 统计 100 个请求的缓存效果

📊 请求统计:
  • 总请求数:     100
  • 缓存命中:     98 (98%)
  • 缓存未命中:   2
  • 平均响应时间: 25ms

🎯 后端统计:
  • 新增请求数:   2
  • 缓存有效性:   98%
```

### 4. 自动化报告生成器

**执行完整测试：**
```bash
node scripts/cache-test-report.js
```

**生成的报告：**
- `test-reports/cache-test-report-[timestamp].json` - JSON 格式详细报告
- `test-reports/cache-test-report-[timestamp].txt` - 文本格式可读报告

**报告内容包括：**
- 服务状态检查
- 详细请求统计
- 性能分析评级
- 优化建议

## 📊 测试结果解读

### 理想结果
- ✅ **后端请求数**: ≤ 3 个（仅在缓存建立时）
- ✅ **缓存命中率**: ≥ 95%
- ✅ **平均响应时间**: < 100ms
- ✅ **缓存有效性**: ≥ 95%

### 结果分析
| 指标 | 优秀 | 良好 | 一般 | 较差 |
|------|------|------|------|------|
| 缓存有效性 | >95% | >85% | >70% | ≤70% |
| 缓存命中率 | >95% | >80% | >60% | ≤60% |
| 响应时间 | <50ms | <100ms | <200ms | ≥200ms |

### 缓存状态说明
- **HIT**: 缓存命中，直接从缓存返回
- **MISS**: 缓存未命中，从后端获取并建立缓存
- **STALE**: 缓存过期，返回过期数据并后台更新

## 🔍 故障排除

### 网关连接失败
```bash
# 检查网关是否运行
curl http://localhost:8787/health

# 启动网关 (在 apps/api 目录下)
npm run dev
```

### 后端服务器启动失败
```bash
# 检查端口是否被占用
lsof -i :3001

# 手动启动后端服务器
node scripts/mock-backend-server.js
```

### 缓存配置不生效
```bash
# 重新配置测试环境
./scripts/setup-cache-test.sh cleanup
./scripts/setup-cache-test.sh setup

# 验证配置
./scripts/setup-cache-test.sh verify
```

### 测试结果异常
1. **后端请求数过多**: 检查缓存配置是否正确
2. **命中率过低**: 验证缓存中间件是否正常工作
3. **响应时间过长**: 检查网络延迟和网关性能

## 📝 测试场景扩展

### 修改缓存 TTL
编辑测试脚本中的 `CACHE_TTL` 变量：
```bash
# 在 test-cache-post.sh 中
CACHE_TTL=120  # 改为 120 秒
```

### 修改测试请求数
```bash
# 在 test-cache-post.sh 中  
TOTAL_REQUESTS=200  # 改为 200 个请求
```

### 自定义测试路径
```bash
# 在 setup-cache-test.sh 中
TEST_PATH="/api/custom-test"
```

## 🧪 高级用法

### 并发测试
```bash
# 启动多个测试进程（谨慎使用）
for i in {1..3}; do
  ./scripts/test-cache-post.sh &
done
wait
```

### 性能基准测试
```bash
# 运行多轮测试进行性能对比
for round in {1..5}; do
  echo "=== 第 $round 轮测试 ==="
  node scripts/cache-test-report.js
  sleep 10
done
```

### 监控后端请求
```bash
# 实时监控后端请求
while true; do
  curl -s http://localhost:3001/stats | jq '.totalRequests'
  sleep 1
done
```

## 💡 优化建议

1. **缓存策略优化**
   - 根据业务需求调整 TTL
   - 考虑使用 Stale-While-Revalidate 策略
   - 实现缓存预热机制

2. **性能监控**
   - 定期运行缓存测试
   - 监控缓存命中率趋势
   - 分析热点数据访问模式

3. **容错处理**
   - 实现缓存降级机制
   - 添加缓存击穿保护
   - 优化缓存更新策略

## 📞 技术支持

如需帮助或报告问题，请：
1. 检查测试日志输出
2. 查看生成的详细报告
3. 验证网关和后端服务状态
4. 提供相关错误信息

---

## 📜 许可证

本测试套件遵循项目的开源许可证。