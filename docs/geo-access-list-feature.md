# 地区访问列表功能方案

> **文档版本：** v1.1  
> **最后更新：** 2025-10-18  
> **状态：** 已 Review，待实施

---

## 📋 修订历史

### v1.1 (2025-10-18) - Review 修正

基于代码 review 反馈，修正以下关键问题：

#### ✅ 高优修复
1. **字段名修正**：所有 SQL 查询中的 `status_code` 已改为 `status`（实际表结构）
2. **错误判断优化**：使用 `is_error` 字段或 `status >= 400` 判断错误

#### ✅ 中优修复
3. **索引优化**：使用 `event_date` 字段代替 `date(timestamp/1000, 'unixepoch')`，保留索引使用
4. **geo_action NULL 处理**：使用 `COALESCE(geo_action, 'allowed')` 正确统计未应用规则的请求
5. **新增索引**：添加 `(event_date, country)` 等联合索引以提升查询性能

#### ✅ 低优完善
6. **Top 路径获取策略**：补充了两种方案（循环查询 vs CTE 聚合）的详细说明
7. **测试数据脚本**：修正了字段名和结构，与实际表定义一致

### v1.0 (2025-10-18) - 初始方案

初始设计，包含 API 设计、前端 UI、实现步骤等。

---

## 1. 功能概述

为地区访问控制功能添加**实时访问监控列表**，类似 IP 监控的 "IP 访问列表" 功能。用户可以：

- 查看各国家/地区的实时访问统计（请求数、封禁数、限流数、成功率等）
- 按日期筛选数据
- 搜索特定国家
- 查看单个国家的详细访问信息
- 从访问列表快速创建地区规则（一键封禁某国家）

### 与 IP 监控的对比

| 功能 | IP 监控 | 地区监控（本方案） |
|------|---------|-------------------|
| 数据源 | `ip_traffic_stats` | `geo_traffic_stats` |
| 主要维度 | IP 地址 | 国家代码 |
| 辅助维度 | 路径、User-Agent | 路径 |
| 操作入口 | 创建 IP 规则 | 创建地区规则 |
| 详情对话框 | IP 详情、路径列表 | 国家详情、路径列表 |

---

## 2. 数据来源分析

### 2.1 现有表结构

已有的 `geo_traffic_stats` 表（`0006_create_geo_access_control.sql`）：

```sql
CREATE TABLE geo_traffic_stats (
  id TEXT PRIMARY KEY,                    -- 主键：{date}-{country}[-{path}]
  date TEXT NOT NULL,                     -- 日期 YYYY-MM-DD
  country TEXT NOT NULL,                  -- 国家代码 'CN', 'US'
  path TEXT,                              -- 路径（NULL = 全局）
  
  total_requests INTEGER DEFAULT 0,
  blocked_requests INTEGER DEFAULT 0,
  throttled_requests INTEGER DEFAULT 0,
  allowed_requests INTEGER DEFAULT 0,
  
  error_4xx INTEGER DEFAULT 0,
  error_5xx INTEGER DEFAULT 0,
  
  avg_response_time REAL,
  p95_response_time REAL,
  
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### 2.2 数据聚合逻辑

**当前状态：**
- `traffic_events` 已有 `geo_action` 字段（可选值：`allowed`, `blocked`, `throttled`, `NULL`）
- `geo_traffic_stats` 表已创建
- **缺失**：从 `traffic_events` 聚合到 `geo_traffic_stats` 的定时任务

**需要补充：**
- Scheduled Handler（定时任务）每小时/每天聚合一次
- 或者在查询时动态从 `traffic_events` 聚合（适合 MVP，延迟更低）

### 2.3 方案选择

**方案 A：定时聚合（推荐生产环境）**
- 优点：查询性能高，数据预处理
- 缺点：需要开发 Scheduled Handler，数据有延迟（最多 1 小时）

**方案 B：实时查询聚合（推荐 MVP）**
- 优点：实现简单，数据实时
- 缺点：查询性能取决于 `traffic_events` 表大小

**建议：**
- MVP 阶段使用**方案 B**（实时聚合），快速验证功能
- 后续根据流量规模升级到**方案 A**（定时聚合）

---

## 3. API 设计

### 3.1 地区访问列表 API

**接口：** `GET /api/admin/geo/access-list`

**Query 参数：**
```typescript
interface GeoAccessListQuery {
  date?: string;           // 日期过滤（YYYY-MM-DD），默认今天
  startDate?: string;      // 开始日期（范围查询）
  endDate?: string;        // 结束日期（范围查询）
  country?: string;        // 国家代码过滤（支持模糊搜索）
  page?: number;           // 页码（默认 1）
  limit?: number;          // 每页条数（默认 50）
  sortBy?: 'total_requests' | 'blocked_requests' | 'success_rate';  // 排序字段
  sortOrder?: 'asc' | 'desc';  // 排序方向（默认 desc）
}
```

**响应：**
```typescript
interface GeoAccessListResponse {
  data: GeoAccessStat[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  summary: {
    totalCountries: number;
    totalRequests: number;
    totalBlocked: number;
    totalThrottled: number;
    avgBlockRate: number;
  };
}

interface GeoAccessStat {
  country: string;               // 国家代码 'CN'
  countryName: string;           // 国家名称 '中国'
  date: string;                  // 日期
  totalRequests: number;
  blockedRequests: number;
  throttledRequests: number;
  allowedRequests: number;
  successRate: number;           // 成功率 (1 - (4xx + 5xx) / total)
  blockRate: number;             // 封禁率 blocked / total
  error4xx: number;
  error5xx: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  uniquePaths: number;           // 访问的不同路径数
  topPaths: Array<{ path: string; count: number }>;  // Top 5 路径
}
```

**SQL 查询逻辑（实时聚合方案）：**
```sql
-- 从 traffic_events 实时聚合
-- 注意：使用 event_date 字段（已有索引）代替动态计算日期
SELECT 
  country,
  COUNT(*) as total_requests,
  SUM(CASE WHEN geo_action = 'blocked' THEN 1 ELSE 0 END) as blocked_requests,
  SUM(CASE WHEN geo_action = 'throttled' THEN 1 ELSE 0 END) as throttled_requests,
  -- ✅ 将 NULL 和 'allowed' 合并统计（未应用地区规则也算允许）
  SUM(CASE WHEN COALESCE(geo_action, 'allowed') = 'allowed' THEN 1 ELSE 0 END) as allowed_requests,
  -- ✅ 使用 is_error 字段或 status 字段判断错误（字段名是 status，不是 status_code）
  SUM(CASE WHEN is_error = 1 OR (status >= 400 AND status < 500) THEN 1 ELSE 0 END) as error_4xx,
  SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) as error_5xx,
  AVG(response_time) as avg_response_time,
  COUNT(DISTINCT path) as unique_paths
FROM traffic_events
WHERE event_date = ?  -- ✅ 使用已有的 event_date 字段和索引
  AND country IS NOT NULL
GROUP BY country
ORDER BY total_requests DESC
LIMIT ? OFFSET ?;

-- 性能优化：需要创建联合索引 (event_date, country) 以支持此查询
-- 参见后续"索引优化"章节
```

**Top 路径获取策略：**

由于主查询只聚合到 `country` 维度，`topPaths` 需要额外查询：

```sql
-- 方案 A：为每个国家单独查询 Top 路径（推荐 MVP）
-- 在代码中循环查询，适合少量国家（<100）
SELECT 
  path,
  COUNT(*) as count
FROM traffic_events
WHERE event_date = ? 
  AND country = ?
GROUP BY path
ORDER BY count DESC
LIMIT 5;

-- 方案 B：使用 CTE + JSON 聚合（适合 SQLite 3.38+）
-- 一次查询获取所有国家的 Top 路径
WITH country_paths AS (
  SELECT 
    country,
    path,
    COUNT(*) as count,
    ROW_NUMBER() OVER (PARTITION BY country ORDER BY COUNT(*) DESC) as rn
  FROM traffic_events
  WHERE event_date = ?
    AND country IS NOT NULL
  GROUP BY country, path
)
SELECT 
  country,
  json_group_array(
    json_object('path', path, 'count', count)
  ) as top_paths
FROM country_paths
WHERE rn <= 5
GROUP BY country;
```

**实现建议：**
- MVP 使用方案 A（简单直接，代码易维护）
- 对于前 50 个国家，额外查询开销可接受（50 * 10ms = 500ms）
- 后续可使用方案 B 或定时聚合优化

### 3.2 国家详情 API

**接口：** `GET /api/admin/geo/access-list/:country`

**响应：**
```typescript
interface GeoCountryDetail {
  country: string;
  countryName: string;
  stats: GeoAccessStat;
  pathBreakdown: Array<{
    path: string;
    totalRequests: number;
    blockedRequests: number;
    throttledRequests: number;
    successRate: number;
  }>;
  timeline: Array<{
    hour: string;  // HH:00
    requests: number;
    blocked: number;
    throttled: number;
  }>;
  existingRules: GeoAccessRule[];  // 关联的地区规则
}
```

### 3.3 国家路径列表 API

**接口：** `GET /api/admin/geo/access-list/:country/paths`

**Query 参数：**
```typescript
interface GeoCountryPathsQuery {
  date?: string;
  page?: number;
  limit?: number;
}
```

**响应：**
```typescript
interface GeoCountryPathsResponse {
  data: Array<{
    path: string;
    totalRequests: number;
    blockedRequests: number;
    throttledRequests: number;
    allowedRequests: number;
    successRate: number;
    avgResponseTime: number;
  }>;
  pagination: {
    page: number;
    limit: number;
    hasMore: boolean;
  };
}
```

---

## 4. 前端 UI 设计

### 4.1 整体布局（参考 IP 监控）

```
┌─────────────────────────────────────────────────────────┐
│  地区访问控制                              [刷新] [创建规则] │
├─────────────────────────────────────────────────────────┤
│  统计卡片区域                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ 访问国家 │ │ 总请求数 │ │ 封禁率   │ │ 限流率   │   │
│  │   45     │ │  12.5k   │ │  12.3%   │ │  3.2%    │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
├─────────────────────────────────────────────────────────┤
│  [Tab: 访问列表] [Tab: 规则管理]                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ [日期选择器]  [搜索国家...]                      │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ 国家    │ 总请求 │ 封禁 │ 限流 │ 成功率 │ 操作    │   │
│  │ 🇨🇳 中国 │ 5.2k   │ 120  │ 35   │ 97.8%  │[详情]...│   │
│  │ 🇺🇸 美国 │ 3.8k   │ 45   │ 12   │ 98.5%  │[详情]...│   │
│  │ 🇯🇵 日本 │ 1.2k   │ 8    │ 3    │ 99.1%  │[详情]...│   │
│  └──────────────────────────────────────────────────┘   │
│  [上一页] 1 / 5 [下一页]                                │
└─────────────────────────────────────────────────────────┘
```

### 4.2 核心组件

#### 4.2.1 GeoAccessListTable

**功能：**
- 显示各国家的访问统计
- 支持排序（按请求数、封禁数、成功率）
- 国旗 emoji 显示
- 操作菜单：查看详情、查看路径、创建规则、一键封禁

**Props：**
```typescript
interface GeoAccessListTableProps {
  data: GeoAccessStat[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  isLoading?: boolean;
  selectedDate: string;
  onPageChange: (page: number) => void;
  onCreateRule?: (country: string, mode: 'block' | 'allow') => void;
}
```

#### 4.2.2 GeoCountryDetailDialog

**功能：**
- 显示单个国家的详细统计
- 24 小时时间线图表
- 路径访问 Top 10
- 关联的地区规则列表
- 快速操作：创建规则、临时封禁

**Props：**
```typescript
interface GeoCountryDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  country: string;
  date: string;
}
```

#### 4.2.3 GeoCountryPathsDialog

**功能：**
- 显示特定国家访问的路径列表
- 分页（每页 20 条）
- 显示每个路径的请求数、封禁数、成功率

**Props：**
```typescript
interface GeoCountryPathsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  country: string;
  date: string;
}
```

### 4.3 国家名称映射

**问题：** `traffic_events.country` 字段存储的是国家代码（如 `CN`），需要映射为中文名称。

**方案：**
```typescript
// lib/country-names.ts
export const COUNTRY_NAMES: Record<string, string> = {
  'CN': '中国',
  'US': '美国',
  'JP': '日本',
  'KR': '韩国',
  'GB': '英国',
  'DE': '德国',
  'FR': '法国',
  'IN': '印度',
  'SG': '新加坡',
  'AU': '澳大利亚',
  'CA': '加拿大',
  'RU': '俄罗斯',
  'BR': '巴西',
  'MX': '墨西哥',
  'ES': '西班牙',
  'IT': '意大利',
  'NL': '荷兰',
  'SE': '瑞典',
  'PL': '波兰',
  'TR': '土耳其',
  // ... 更多国家
};

export const COUNTRY_FLAGS: Record<string, string> = {
  'CN': '🇨🇳',
  'US': '🇺🇸',
  'JP': '🇯🇵',
  // ...
};

export function getCountryDisplay(code: string): string {
  const name = COUNTRY_NAMES[code] || code;
  const flag = COUNTRY_FLAGS[code] || '🌍';
  return `${flag} ${name}`;
}
```

### 4.4 页面集成

修改 `apps/web/src/features/geo-rules/index.tsx`，添加 Tabs 切换：

```tsx
<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList>
    <TabsTrigger value="access-list">
      <Activity className="h-4 w-4 mr-2" />
      访问列表
    </TabsTrigger>
    <TabsTrigger value="rules">
      <Shield className="h-4 w-4 mr-2" />
      规则管理
    </TabsTrigger>
  </TabsList>

  <TabsContent value="access-list">
    <GeoAccessListTable
      data={accessList}
      pagination={accessPagination}
      isLoading={isLoadingAccessList}
      selectedDate={selectedDate}
      onPageChange={setPage}
      onCreateRule={handleCreateRuleFromCountry}
    />
  </TabsContent>

  <TabsContent value="rules">
    <GeoRulesTable data={rules} {...} />
  </TabsContent>
</Tabs>
```

---

## 5. React Query Hooks 设计

### 5.1 useGeoAccessList

```typescript
export function useGeoAccessList(params: {
  date?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  return useQuery({
    queryKey: ['geo-access-list', params],
    queryFn: async () => {
      const api = getCurrentApiClient();
      const response = await api.get('/api/admin/geo/access-list', {
        params,
      });
      return response.data;
    },
    staleTime: 30_000,  // 30 秒
    refetchInterval: 60_000,  // 自动刷新 1 分钟
  });
}
```

### 5.2 useGeoCountryDetail

```typescript
export function useGeoCountryDetail(country: string, date: string, enabled = true) {
  return useQuery({
    queryKey: ['geo-country-detail', country, date],
    queryFn: async () => {
      const api = getCurrentApiClient();
      const response = await api.get(`/api/admin/geo/access-list/${country}`, {
        params: { date },
      });
      return response.data;
    },
    enabled,
  });
}
```

### 5.3 useGeoCountryPaths

```typescript
export function useGeoCountryPaths(
  country: string,
  params: { date?: string; page?: number; limit?: number },
  enabled = true
) {
  return useQuery({
    queryKey: ['geo-country-paths', country, params],
    queryFn: async () => {
      const api = getCurrentApiClient();
      const response = await api.get(`/api/admin/geo/access-list/${country}/paths`, {
        params,
      });
      return response.data;
    },
    enabled,
  });
}
```

---

## 6. 实现步骤

### Phase 1: 后端 API（预计 1-2 小时）
1. ✅ 创建 `/api/admin/geo/access-list.ts` 路由文件
2. ✅ 实现 `GET /api/admin/geo/access-list` 接口
   - 从 `traffic_events` 实时聚合
   - 支持日期、分页、排序
3. ✅ 实现 `GET /api/admin/geo/access-list/:country` 详情接口
4. ✅ 实现 `GET /api/admin/geo/access-list/:country/paths` 路径列表
5. ✅ 在 `src/index.ts` 注册路由

### Phase 2: 前端 Hooks（预计 30 分钟）
1. ✅ 在 `use-geo-rules-api.ts` 添加 `useGeoAccessList` hook
2. ✅ 添加 `useGeoCountryDetail` hook
3. ✅ 添加 `useGeoCountryPaths` hook

### Phase 3: 前端组件（预计 2-3 小时）
1. ✅ 创建 `lib/country-names.ts` 国家名称映射
2. ✅ 创建 `components/geo-access-list-table.tsx`
3. ✅ 创建 `components/geo-country-detail-dialog.tsx`
4. ✅ 创建 `components/geo-country-paths-dialog.tsx`

### Phase 4: 页面集成（预计 30 分钟）
1. ✅ 修改 `features/geo-rules/index.tsx`
   - 添加 Tabs 切换
   - 集成 `GeoAccessListTable`
   - 添加统计卡片（访问国家数、总请求数、封禁率等）
2. ✅ 添加日期选择器和搜索功能

### Phase 5: 测试与优化（预计 1 小时）
1. ✅ 测试各个接口返回数据正确性
2. ✅ 测试分页、排序功能
3. ✅ 测试快速创建规则功能
4. ✅ 性能测试（大数据量下查询速度）

**总预计时间：5-7 小时**

---

## 7. 数据预填充

### 7.1 问题

如果 `traffic_events` 表中没有数据，或者 `geo_action` 字段全部为 `NULL`，访问列表将为空。

### 7.2 解决方案

#### 方案 A：等待真实流量
- 部署后等待真实流量产生
- 页面显示 "暂无数据" 提示

#### 方案 B：生成测试数据（推荐开发阶段）
创建脚本 `scripts/seed-geo-traffic.ts`：

```typescript
// 向 traffic_events 插入模拟数据
const countries = ['CN', 'US', 'JP', 'KR', 'GB', 'DE', 'FR', 'IN'];
const paths = ['/api/users', '/api/posts', '/api/products'];
const geoActions = ['allowed', 'blocked', 'throttled'];

for (let i = 0; i < 1000; i++) {
  const timestamp = Date.now() - Math.random() * 24 * 3600 * 1000;
  const status = Math.random() > 0.95 ? 403 : 200;
  
  await db.insert({
    id: `test-${i}-${Date.now()}`,
    timestamp,
    event_date: new Date(timestamp).toISOString().split('T')[0],
    country: countries[Math.floor(Math.random() * countries.length)],
    path: paths[Math.floor(Math.random() * paths.length)],
    method: 'GET',
    status,  // ✅ 使用 status 字段，不是 status_code
    is_error: status >= 400 ? 1 : 0,
    geo_action: Math.random() > 0.8 ? geoActions[Math.floor(Math.random() * 3)] : 'allowed',
    response_time: 50 + Math.random() * 200,
    client_ip_hash: `hash-${Math.floor(Math.random() * 100)}`,
  });
}
```

---

## 8. 数据库索引优化

### 8.1 必需索引

为支持高效的地区访问列表查询，需要创建以下索引：

```sql
-- Migration: 0007_add_geo_access_list_indexes.sql

-- 1. 联合索引：按日期和国家查询（访问列表主查询）
CREATE INDEX IF NOT EXISTS idx_traffic_events_date_country 
  ON traffic_events(event_date, country);

-- 2. 联合索引：按日期、国家和路径查询（路径详情查询）
CREATE INDEX IF NOT EXISTS idx_traffic_events_date_country_path 
  ON traffic_events(event_date, country, path);

-- 3. 联合索引：按国家和日期查询（国家详情时间线）
CREATE INDEX IF NOT EXISTS idx_traffic_events_country_date 
  ON traffic_events(country, event_date, timestamp);
```

### 8.2 索引使用分析

| 查询场景 | 使用的索引 | 性能提升 |
|----------|-----------|---------|
| 国家访问列表 | `idx_traffic_events_date_country` | 100x+ |
| 国家 Top 路径 | `idx_traffic_events_date_country_path` | 50x+ |
| 国家详情时间线 | `idx_traffic_events_country_date` | 100x+ |

### 8.3 索引维护成本

- 每个索引会占用约 5-10% 的表空间
- 插入性能影响：<5%（D1 批量插入已优化）
- 建议定期 VACUUM（通过 Scheduled Handler）

### 8.4 现有索引复用

以下索引已存在，可直接使用：
- `idx_traffic_events_event_date`：支持按日期过滤
- `idx_traffic_events_country_geo`：支持按国家 + geo_action 查询

---

## 9. 风险与注意事项

### 9.1 性能风险

**风险：** 实时聚合查询 `traffic_events` 可能很慢（如果表很大）

**缓解措施：**
- MVP 阶段限制查询范围（单日数据）
- 使用 `event_date` 字段配合索引 `idx_traffic_events_date_country`
- 后续升级为定时聚合方案

### 9.2 国家名称缺失

**风险：** Cloudflare 可能返回未映射的国家代码

**缓解措施：**
- 前端兜底显示国家代码本身
- 后续补充完整的 ISO 3166 国家列表

### 9.3 数据一致性

**风险：** `geo_action` 字段可能为 `NULL`（未启用地区规则时）

**处理：**
- 前端将 `NULL` 视为 "未应用规则"
- SQL 统计时使用 `COALESCE(geo_action, 'allowed')` 将 `NULL` 归类为 `allowed`
- 确保成功率计算准确

### 9.4 UI 适配

**风险：** 国家数量可能很多（100+ 国家），分页性能

**缓解措施：**
- 默认按请求数降序排列，Top 50 国家覆盖 99% 流量
- 提供搜索功能快速定位

---

## 10. 未来扩展

### 10.1 地区热力图

使用 ECharts Geo 组件，在世界地图上显示：
- 各国请求热度
- 封禁率热度图
- 点击国家查看详情

### 10.2 地区分组统计

支持按洲（Continent）聚合统计：
- 亚洲、欧洲、北美洲等
- 对应地区规则的洲级规则

### 10.3 告警集成

在 Dashboard 告警卡片中添加地区相关告警：
- "某国家流量激增"
- "某国家封禁率异常"

### 10.4 导出功能

支持导出地区访问数据为 CSV/Excel：
- 用于生成报表
- 用于外部分析工具

---

## 11. 总结

本方案在现有地区访问控制功能基础上，添加了**访问监控列表**，使用户能够：

✅ 实时查看各国家访问统计  
✅ 监控地区规则的执行效果（封禁数、限流数）  
✅ 从访问数据快速创建规则（数据驱动决策）  
✅ 与 IP 监控保持一致的用户体验  

**核心优势：**
- 复用现有 `geo_traffic_stats` 表结构
- 参考 IP 监控成熟的 UI/UX 设计
- MVP 采用实时聚合，快速验证价值
- 后续可平滑升级为定时聚合方案

**立即可以开始实施** ✅

