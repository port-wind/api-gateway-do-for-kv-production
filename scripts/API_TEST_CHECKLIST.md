# API 测试清单

本文档列出了所有前端调用的后端 API，用于全面测试和验证。

## 🚀 快速测试

```bash
# 使用自动化脚本测试所有 API
./scripts/test-all-apis.sh https://api-proxy.pwtk.cc "your-auth-token"

# 或者使用本地开发环境
./scripts/test-all-apis.sh http://localhost:8787 "your-auth-token"
```

## 📋 API 完整清单

### 1. 认证 API (`/api/auth/*`)

| 方法 | 路径 | 描述 | 需要认证 | 前端调用位置 |
|------|------|------|---------|------------|
| POST | `/api/auth/login` | 用户登录 | ❌ | `use-auth-api.ts` |
| POST | `/api/auth/refresh` | 刷新 token | ❌ | `api.ts` |
| POST | `/api/auth/logout` | 登出 | ✅ | `use-auth-api.ts` |
| GET | `/api/auth/me` | 获取当前用户 | ✅ | `use-auth-api.ts` |
| POST | `/api/auth/change-password` | 修改密码 | ✅ | `use-auth-api.ts` |
| POST | `/api/auth/init` | 初始化管理员 | ❌ | `use-auth-api.ts` |

### 2. Dashboard API (`/api/admin/dashboard/*`)

| 方法 | 路径 | 描述 | 状态 | 前端调用位置 |
|------|------|------|------|------------|
| GET | `/api/admin/dashboard/overview` | 获取 Dashboard 概览 | ✅ | `use-dashboard-api.ts` |
| GET | `/api/admin/dashboard/timeseries` | 时间序列数据 | ✅ | `use-dashboard-api.ts` |
| GET | `/api/admin/dashboard/rate-limit/stats` | 限流统计 | ✅ | `use-dashboard-api.ts` |
| GET | `/api/admin/dashboard/realtime/recent` | 实时地图数据 | ✅ | `use-dashboard-api.ts` |
| GET | `/api/admin/dashboard/alerts` | Dashboard 告警 | ✅ | `use-dashboard-api.ts` |

**测试命令:**
```bash
TOKEN="your-token"
BASE="https://api-proxy.pwtk.cc"

# Dashboard 概览
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/dashboard/overview"

# 时间序列
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/dashboard/timeseries?range=24h&metric=requests"

# 限流统计
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/dashboard/rate-limit/stats"

# 实时地图
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/dashboard/realtime/recent?limit=20"

# 告警
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/dashboard/alerts"
```

### 3. 路径管理 API (`/api/admin/paths/*`)

| 方法 | 路径 | 描述 | 状态 | 前端调用位置 |
|------|------|------|------|------------|
| GET | `/api/admin/paths` | 获取路径列表 | ✅ | `api.ts` → `use-path-api.ts` |
| GET | `/api/admin/paths/:path` | 获取单个路径配置 | ✅ | `api.ts` → `use-path-api.ts` |
| PUT | `/api/admin/paths/:path` | 更新路径配置 | ✅ | `api.ts` → `use-path-api.ts` |
| POST | `/api/admin/paths/batch` | 批量操作路径 | ✅ | `api.ts` → `use-path-api.ts` |
| GET | `/api/admin/paths/health` | 路径健康状态 | ✅ | `api.ts` → `use-path-api.ts` |
| GET | `/api/admin/paths/:path/cache-entries` | 获取路径缓存条目 | ✅ | `api.ts` → `use-cache-entries.ts` |

**批量操作类型:**
- `toggle-cache`: 切换缓存状态
- `toggle-rate-limit`: 切换限流状态
- `toggle-geo`: 切换地理位置规则状态
- `delete`: 删除路径配置

**测试命令:**
```bash
# 获取路径列表
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/paths?page=1&limit=50"

# 获取路径健康状态
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/paths/health"

# 获取路径缓存条目
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/paths/%2Fapi%2Ftest/cache-entries?limit=50"

# 批量操作 - Toggle 缓存
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"operations":[{"type":"toggle-cache","path":"/test"}]}' \
  "$BASE/api/admin/paths/batch"
```

### 4. 缓存管理 API (`/api/admin/cache/*`)

| 方法 | 路径 | 描述 | 状态 | 前端调用位置 |
|------|------|------|------|------------|
| GET | `/api/admin/cache/config` | 获取缓存配置 | ✅ | 各个 hooks |
| PUT | `/api/admin/cache/config` | 更新缓存配置 | ✅ | 各个 hooks |
| POST | `/api/admin/cache/invalidate` | 清除缓存 | ✅ | 各个 hooks |
| GET | `/api/admin/cache/stats` | 缓存统计 | ✅ | 各个 hooks |
| GET | `/api/admin/cache/health` | 缓存健康状态 | ✅ | 各个 hooks |
| GET | `/api/admin/cache/paths` | 获取缓存路径列表 | ✅ | 各个 hooks |
| POST | `/api/admin/cache/flush` | 刷新所有缓存 | ✅ | 各个 hooks |
| DELETE | `/api/admin/cache/:cacheKey` | 删除缓存条目 | ✅ | `api.ts` → `use-cache-entries.ts` |
| POST | `/api/admin/cache/refresh` | 刷新指定路径缓存 | ✅ | `api.ts` → `use-cache-entries.ts` |

**测试命令:**
```bash
# 获取缓存配置
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/cache/config"

# 缓存统计
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/cache/stats"

# 缓存健康
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/cache/health"

# 获取缓存路径列表
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/cache/paths?page=1&limit=50"

# 刷新缓存
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"path":"/api/test"}' \
  "$BASE/api/admin/cache/refresh"
```

### 5. IP 监控 API (`/api/admin/ip-monitor/*`)

| 方法 | 路径 | 描述 | 状态 | 前端调用位置 |
|------|------|------|------|------------|
| GET | `/api/admin/ip-monitor/ips` | 获取 IP 列表 | ✅ | `api.ts` → `use-ip-monitor-api.ts` |
| GET | `/api/admin/ip-monitor/ips/:ipHash` | 获取 IP 详情 | ✅ | `api.ts` → `use-ip-monitor-api.ts` |
| GET | `/api/admin/ip-monitor/ips/:ipHash/paths` | 获取 IP 访问路径 | ✅ | `api.ts` → `use-ip-monitor-api.ts` |
| GET | `/api/admin/ip-monitor/rules` | 获取 IP 规则 | ✅ | `api.ts` → `use-ip-monitor-api.ts` |
| POST | `/api/admin/ip-monitor/rules` | 创建 IP 规则 | ✅ | `api.ts` → `use-ip-monitor-api.ts` |
| DELETE | `/api/admin/ip-monitor/rules/:ipHash` | 删除 IP 规则 | ✅ | `api.ts` → `use-ip-monitor-api.ts` |
| GET | `/api/admin/ip-monitor/config` | 获取监控配置 | ✅ | `api.ts` → `use-ip-monitor-api.ts` |
| PUT | `/api/admin/ip-monitor/config` | 更新监控配置 | ✅ | `api.ts` → `use-ip-monitor-api.ts` |

**测试命令:**
```bash
# 获取 IP 列表
DATE=$(date +%Y-%m-%d)
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/admin/ip-monitor/ips?date=$DATE&page=1&limit=50&sortBy=requests&sortOrder=desc"

# 获取 IP 规则
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/ip-monitor/rules?page=1&limit=50"

# 获取监控配置
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/ip-monitor/config"
```

### 6. 代理路由 API (`/api/admin/proxy-routes`)

| 方法 | 路径 | 描述 | 状态 | 前端调用位置 |
|------|------|------|------|------------|
| GET | `/api/admin/proxy-routes` | 获取代理路由列表 | ✅ | `api.ts` → `use-proxy-route-api.ts` |
| GET | `/api/admin/proxy-routes/stats` | 代理路由统计 | ✅ | `api.ts` → `use-proxy-route-api.ts` |
| POST | `/api/admin/proxy-routes` | 创建代理路由 | ✅ | `api.ts` → `use-proxy-route-api.ts` |
| PUT | `/api/admin/proxy-routes/:id` | 更新代理路由 | ✅ | `api.ts` → `use-proxy-route-api.ts` |
| DELETE | `/api/admin/proxy-routes/:id` | 删除代理路由 | ✅ | `api.ts` → `use-proxy-route-api.ts` |
| POST | `/api/admin/proxy-routes/batch` | 批量操作 | ✅ | `api.ts` → `use-proxy-route-api.ts` |
| POST | `/api/admin/proxy-routes/reorder` | 重新排序 | ✅ | `api.ts` → `use-proxy-route-api.ts` |

**测试命令:**
```bash
# 获取代理路由列表
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/proxy-routes?page=1&limit=50"

# 代理路由统计
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/proxy-routes/stats"
```

### 7. 限流 API (`/api/admin/rate-limit/*`)

| 方法 | 路径 | 描述 | 状态 | 前端调用位置 |
|------|------|------|------|------------|
| GET | `/api/admin/rate-limit/config` | 获取限流配置 | ✅ | `api.ts` → `use-rate-limit-api.ts` |
| PUT | `/api/admin/rate-limit/config` | 更新限流配置 | ✅ | `api.ts` → `use-rate-limit-api.ts` |
| GET | `/api/admin/rate-limit/health` | 限流健康状态 | ✅ | `api.ts` → `use-rate-limit-api.ts` |
| GET | `/api/admin/rate-limit/status/:ip` | 获取 IP 限流状态 | ✅ | `api.ts` → `use-rate-limit-api.ts` |
| POST | `/api/admin/rate-limit/reset/:ip` | 重置 IP 限流 | ✅ | `api.ts` → `use-rate-limit-api.ts` |

**测试命令:**
```bash
# 获取限流配置
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/rate-limit/config"

# 限流健康状态
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/rate-limit/health"
```

### 8. 地理位置规则 API (`/api/admin/geo/*`)

| 方法 | 路径 | 描述 | 状态 | 前端调用位置 |
|------|------|------|------|------------|
| GET | `/api/admin/geo/rules` | 获取地理位置规则 | ✅ | `use-geo-rules-api.ts` |
| POST | `/api/admin/geo/rules` | 创建地理位置规则 | ✅ | `use-geo-rules-api.ts` |
| PUT | `/api/admin/geo/rules/:id` | 更新地理位置规则 | ✅ | `use-geo-rules-api.ts` |
| DELETE | `/api/admin/geo/rules/:id` | 删除地理位置规则 | ✅ | `use-geo-rules-api.ts` |
| GET | `/api/admin/geo/preset-groups` | 获取预设地理位置组 | ✅ | `use-geo-rules-api.ts` |
| GET | `/api/admin/geo/access-list` | 获取地理访问列表 | ✅ | `use-geo-rules-api.ts` |
| GET | `/api/admin/geo/access-list/:country` | 获取国家详情 | ✅ | `use-geo-rules-api.ts` |
| GET | `/api/admin/geo/access-list/:country/paths` | 获取国家路径统计 | ✅ | `use-geo-rules-api.ts` |

**测试命令:**
```bash
# 获取地理位置规则
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/geo/rules?page=1&limit=50"

# 获取预设地理位置组
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/geo/preset-groups"

# 获取地理访问列表
DATE=$(date +%Y-%m-%d)
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/geo/access-list?date=$DATE&page=1&limit=50"
```

## 🔍 易错路径检查清单

根据之前的 404 错误，重点检查以下路径：

### ✅ 已修复的路径

- [ ] `/api/admin/paths/:path/cache-entries` (原: `/api/admin/cache/paths/:path/entries`)
- [ ] `/api/admin/cache/:cacheKey` (原: `/api/admin/cache/entries/:key`)
- [ ] `/api/admin/cache/refresh` (原: `/api/admin/cache/paths/:path/refresh`)
- [ ] `/api/admin/paths/batch` (原: 分散的 PUT/DELETE 路径配置接口)
- [ ] `/api/admin/proxy-routes` (原: `/api/admin/proxy/routes`)

### ⚠️ 需要特别关注的 API

- [ ] IP 监控相关 (`/api/admin/ip-monitor/*`) - 曾出现 500 错误
- [ ] Dashboard API (`/api/admin/dashboard/*`) - 需要确保数据格式正确
- [ ] 批量操作 API (`/api/admin/paths/batch`, `/api/admin/proxy-routes/batch`)

## 📊 测试覆盖率

### 按模块统计

- 认证 API: 6 个端点
- Dashboard API: 5 个端点
- 路径管理 API: 6 个端点
- 缓存管理 API: 9 个端点
- IP 监控 API: 8 个端点
- 代理路由 API: 7 个端点
- 限流 API: 5 个端点
- 地理位置规则 API: 8 个端点

**总计: 54 个 API 端点**

## 🚨 常见错误码和解决方案

### 401 Unauthorized
- **原因**: Token 过期或无效
- **解决**: 重新登录获取新 token

### 404 Not Found
- **原因**: API 路径错误
- **解决**: 检查前端调用路径与后端路由定义是否一致

### 500 Internal Server Error
- **原因**: 后端代码错误、数据库查询失败等
- **解决**: 
  1. 检查后端日志
  2. 确认数据库迁移已运行
  3. 检查认证中间件是否正确

### 403 Forbidden
- **原因**: 权限不足
- **解决**: 确认用户角色是否为 admin

## 📝 测试流程建议

1. **本地测试**
   ```bash
   # 启动本地开发环境
   npm run dev
   
   # 运行 API 测试
   ./scripts/test-all-apis.sh http://localhost:8787 "test-token"
   ```

2. **测试环境测试**
   ```bash
   ./scripts/test-all-apis.sh https://test-api-proxy.pwtk.cc "test-token"
   ```

3. **生产环境测试**
   ```bash
   # 使用真实 token
   ./scripts/test-all-apis.sh https://api-proxy.pwtk.cc "prod-token"
   ```

4. **浏览器 DevTools 测试**
   - 打开浏览器 DevTools → Network
   - 操作前端各个功能
   - 观察 XHR/Fetch 请求
   - 检查是否有 404/500 错误

## 🔄 持续集成建议

将 API 测试集成到 CI/CD 流程：

```yaml
# .github/workflows/api-test.yml
name: API Integration Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Test APIs
        run: |
          chmod +x scripts/test-all-apis.sh
          ./scripts/test-all-apis.sh ${{ secrets.API_BASE_URL }} ${{ secrets.TEST_TOKEN }}
```

