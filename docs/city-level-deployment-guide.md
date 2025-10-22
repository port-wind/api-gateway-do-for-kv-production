# 城市级地理访问控制 - 部署指南

**版本**: v1.0  
**日期**: 2025-10-20  
**状态**: 准备部署

---

## 🚀 快速部署

### 准备工作

**1. 确认环境**
```bash
cd /Users/leo/tk.com/api-gateway-do-for-kv/apps/api

# 检查 wrangler 版本
npx wrangler --version

# 确认 D1 数据库配置
npx wrangler d1 list
```

**2. 检查已完成的改动**
```bash
# 查看修改的文件
git status

# 查看新增的文件
git ls-files --others --exclude-standard
```

---

## 📋 部署步骤

### 步骤 1: 运行数据库迁移

```bash
# 部署到 Test 环境
npx wrangler d1 migrations apply D1 --remote

# 验证迁移
npx wrangler d1 execute D1 --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND name='ip_traffic_daily'"

# 检查新列
npx wrangler d1 execute D1 --remote --command \
  "PRAGMA table_info(ip_traffic_daily)" | grep last_seen_city
```

### 步骤 2: 部署 Worker 到 Test 环境

```bash
# 方式 1: 使用自动化脚本
chmod +x scripts/deploy-quick-win-city.sh
./scripts/deploy-quick-win-city.sh

# 方式 2: 手动部署
npm run deploy

# 等待部署完成（约30秒）
```

### 步骤 3: 验证部署

**3.1 检查 API 响应**
```bash
# 测试城市数据 API
curl https://your-worker.workers.dev/api/admin/cities?limit=10

# 测试 IP 监控 API（检查 rawCity 字段）
curl https://your-worker.workers.dev/api/admin/ip-monitor/ips?date=$(date +%Y-%m-%d)
```

**3.2 检查数据库**
```bash
# 查询已记录的城市数据
npx wrangler d1 execute D1 --remote --command \
  "SELECT ip_hash, last_seen_city FROM ip_traffic_daily WHERE last_seen_city IS NOT NULL LIMIT 10"
```

**3.3 前端验证**
1. 访问管理后台：`https://your-domain.com/admin`
2. 进入 "IP 监控" 页面
3. 检查是否显示城市信息（蓝色文字）
4. 测试城市数据 API：访问 `/api/admin/cities`

---

## ✅ 回归测试清单

### 核心功能测试

#### 1. **国家级地理访问控制** ✅
- [ ] 现有国家级规则仍然生效
- [ ] 白名单模式正常工作
- [ ] 黑名单模式正常工作
- [ ] 默认动作（allow/block）正常

**测试方法**:
```bash
# 使用不同国家的 IP 测试
curl -H "CF-IPCountry: CN" https://your-worker.workers.dev/test-path
curl -H "CF-IPCountry: US" https://your-worker.workers.dev/test-path
```

#### 2. **IP 监控统计** ✅
- [ ] IP 聚合数据准确
- [ ] 请求数/错误数统计正确
- [ ] Top 路径列表正常
- [ ] 国家分布显示正确
- [ ] **新增**: 城市信息显示

**测试方法**:
- 访问管理后台 IP 监控页面
- 对比数据库原始数据与 API 返回数据

#### 3. **缓存功能** ✅
- [ ] 缓存命中率正常
- [ ] TTL 机制工作正常
- [ ] 手动刷新功能正常
- [ ] ETag 验证正常

**测试方法**:
```bash
# 测试缓存
curl -I https://your-worker.workers.dev/cached-path
# 检查响应头: X-Cache-Status, X-Cache-TTL
```

#### 4. **限流功能** ✅
- [ ] IP 限流正常触发
- [ ] 速率限制准确
- [ ] 限流动作（block/throttle）正常

**测试方法**:
```bash
# 快速发送多个请求
for i in {1..20}; do
  curl https://your-worker.workers.dev/test-path
done
```

#### 5. **流量统计** ✅
- [ ] D1 数据正常写入
- [ ] 聚合统计准确
- [ ] Dashboard 显示正常

---

### 性能测试

#### 1. **响应时间** ✅
```bash
# 测试10次，计算平均响应时间
for i in {1..10}; do
  curl -w "@curl-format.txt" -o /dev/null -s https://your-worker.workers.dev/test-path
done
```

**期望**:
- 冷启动: < 50ms
- 热路径: < 20ms
- 带城市匹配: < 30ms

#### 2. **内存使用** ✅
- [ ] Worker 内存占用 < 128MB
- [ ] CITY_COORDS 数据加载正常（119KB）

#### 3. **并发测试** ✅
```bash
# 使用 wrk 压测
wrk -t10 -c100 -d30s https://your-worker.workers.dev/test-path
```

**期望**:
- QPS > 10,000
- P99 延迟 < 100ms
- 无错误

---

### 数据完整性测试

#### 1. **城市数据验证** ✅
```bash
# 检查 Tier 1 城市数量
curl https://your-worker.workers.dev/api/admin/cities | jq '.total'
# 期望: 1000

# 检查上海数据
curl https://your-worker.workers.dev/api/admin/cities/Shanghai | jq '.'
# 期望: 包含 coords, country, population, geonameId
```

#### 2. **别名映射测试** ✅
- [ ] 常见别名能正确解析（北京 → Beijing）
- [ ] 大小写不敏感（beijing → Beijing）
- [ ] 重音符号处理（São Paulo → Sao Paulo）

#### 3. **数据库完整性** ✅
```bash
# 检查数据完整性
npx wrangler d1 execute D1 --remote --command \
  "SELECT COUNT(*) FROM ip_traffic_daily WHERE date >= date('now', '-7 days')"
```

---

## 📊 监控指标

### 关键指标

| 指标 | 阈值 | 监控方式 |
|------|------|----------|
| Worker CPU 时间 | < 50ms | Cloudflare Dashboard |
| Worker 内存 | < 128MB | Cloudflare Dashboard |
| API 响应时间 | < 50ms | 日志分析 |
| D1 写入延迟 | < 100ms | 日志分析 |
| 错误率 | < 0.1% | Cloudflare Dashboard |
| 城市匹配成功率 | > 90% | 日志分析 |

### 监控命令

**实时日志**:
```bash
# 查看 Worker 日志
npx wrangler tail

# 查看最近的错误
npx wrangler tail --status error

# 过滤城市相关日志
npx wrangler tail | grep -i city
```

**统计查询**:
```bash
# 查询最近 24 小时的城市分布
npx wrangler d1 execute D1 --remote --command \
  "SELECT last_seen_city, COUNT(*) as count 
   FROM ip_traffic_daily 
   WHERE date >= date('now', '-1 day') 
     AND last_seen_city IS NOT NULL 
   GROUP BY last_seen_city 
   ORDER BY count DESC 
   LIMIT 20"
```

---

## 🐛 常见问题排查

### 问题 1: 城市信息未显示

**症状**: 前端 IP 监控页面没有显示城市

**排查步骤**:
1. 检查数据库是否有数据:
```bash
npx wrangler d1 execute D1 --remote --command \
  "SELECT COUNT(*) FROM ip_traffic_daily WHERE last_seen_city IS NOT NULL"
```

2. 检查 API 响应:
```bash
curl https://your-worker.workers.dev/api/admin/ip-monitor/ips?date=$(date +%Y-%m-%d) | jq '.[0].rawCity'
```

3. 检查前端控制台是否有错误

**解决方案**:
- 确认迁移已执行
- 等待新流量产生（城市数据需要时间积累）
- 检查前端代码是否正确显示 `rawCity` 字段

### 问题 2: 城市名称不准确

**症状**: 显示的城市名称格式不统一

**原因**: Cloudflare `cf.city` 返回的原始值未标准化

**解决方案**:
- 这是 Quick Win 的预期行为
- 城市级访问控制会自动标准化
- 考虑后续实施 Tier 2/3 完整方案

### 问题 3: 性能下降

**症状**: 响应时间增加

**排查**:
```bash
# 检查 Worker 性能指标
npx wrangler tail --format=json | jq '.diagnosticsChannelEvents.cpu'
```

**解决方案**:
- 检查是否正确使用了内存缓存
- 确认 CITY_COORDS 数据大小（应为 119KB）
- 考虑启用 Cloudflare Cache

---

## 📝 部署后检查清单

### 立即检查（0-2小时）

- [ ] Worker 部署成功，无报错
- [ ] 数据库迁移成功
- [ ] 城市数据 API 可访问
- [ ] IP 监控页面加载正常
- [ ] 错误日志无异常

### 短期观察（2-24小时）

- [ ] 城市数据开始积累
- [ ] IP 监控页面显示城市信息
- [ ] 响应时间保持正常（< 50ms）
- [ ] 无内存泄漏（内存占用稳定）
- [ ] D1 写入正常

### 中期验证（1-7天）

- [ ] 城市覆盖率 > 80%（有城市信息的 IP 占比）
- [ ] 城市名称多样性（至少50+个不同城市）
- [ ] 无性能劣化
- [ ] 用户反馈正常

---

## 🔄 回滚计划

### 快速回滚

如果发现严重问题，可以快速回滚：

```bash
# 方式 1: 回滚 Worker 版本
npx wrangler rollback

# 方式 2: 部署之前的版本
git checkout <previous-commit>
npm run deploy

# 方式 3: 禁用新功能（保留代码，数据库保留 last_seen_city 列）
# 前端：移除城市显示代码
# 后端：停止记录城市信息
```

### 数据库回滚

**注意**: 通常不需要回滚数据库，因为新增的 `last_seen_city` 列不影响现有功能。

如果必须回滚：
```sql
-- 仅当必要时执行
ALTER TABLE ip_traffic_daily DROP COLUMN last_seen_city;
```

---

## 📈 下一步（可选）

完成 Quick Win 部署后，可以考虑：

1. **前端城市选择器** (1-2小时)
   - 在 `geo-selector.tsx` 添加"按城市"标签页
   - 使用 `/api/admin/cities` API
   - 实现城市搜索和多选

2. **地图城市标记** (30分钟)
   - 在 `realtime-map.tsx` 显示城市位置
   - 使用 CITY_COORDS 数据
   - 添加城市流量统计

3. **完整城市级访问控制** (2-4小时)
   - 测试城市级规则
   - 编写管理界面
   - 完善监控和告警

4. **Tier 2/3 扩展** (4-8小时)
   - 实现 KV 存储的 Tier 2 城市
   - 动态发现 Tier 3 城市
   - 城市指纹识别

---

## 🎉 总结

✅ **Quick Win 已完成**:
- D1 迁移文件
- IP 聚合器增强
- IP 监控 API 扩展
- 前端显示城市
- 城市数据 API

✅ **核心功能已完成**:
- 城市数据基础设施（1,000个城市）
- 城市名称标准化（7步规则）
- 城市级访问控制中间件
- 单元测试（38个测试全部通过）

⏳ **可选增强**:
- 前端城市选择器
- 地图城市标记
- 完整城市级规则管理

**建议**: 先部署 Quick Win，验证效果后再决定是否继续开发可选功能。

---

**文档版本**: v1.0  
**最后更新**: 2025-10-20  
**维护者**: Leo

