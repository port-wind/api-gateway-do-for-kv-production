# Dashboard 实时数据升级实施计划

## 现状分析

### 当前 Dashboard 组件（全部使用 Mock 数据）

- **apps/web/src/features/dashboard/index.tsx**: 4个统计卡片（Total Revenue, Subscriptions, Sales, Active Now）
- **apps/web/src/features/dashboard/components/overview.tsx**: 随机生成的月度柱状图
- **apps/web/src/features/dashboard/components/recent-sales.tsx**: 静态用户列表

### 已有实时数据源（后端）

✅ **Path Stats**: `snapshot:latest` (KV) + `path_stats_hourly` (D1)

✅ **Cache Stats**: `/api/admin/cache/stats` (已实现)

✅ **Traffic Monitor DO**: `/api/admin/traffic/stats` (已实现)

✅ **Paths Health**: `/api/admin/paths/health` (已实现)

✅ **Rate Limiter DO**: `getStats()` 方法存在但无独立 API

✅ **IP Monitor**: 已上线（Phase 1-6 实施完成，可提供封禁/限流、IP 统计能力）

### 缺失的 API

❌ 聚合 Dashboard 指标端点（一次性返回所有关键指标）

❌ Rate Limiter 全局统计端点

❌ 时间序列数据端点（用于趋势图表）

❌ Top Paths 简化端点（Dashboard 专用，轻量级）

---

## 实施阶段

### Phase 1: 后端 - 创建 Dashboard 聚合 API

#### 1.1 创建 Dashboard 专用路由

**文件**: `apps/api/src/routes/admin/dashboard.ts`

创建以下端点：

**GET /api/admin/dashboard/overview**

- 聚合返回仪表盘所需的核心指标
- 数据源：
  - Path stats (D1 + KV snapshot): 总请求数、Top 路径、错误率
  - Cache stats: 缓存命中率、命中次数、未命中次数
  - Traffic Monitor DO: 当前 RPM、峰值 RPM
  - Paths health: 路径总数、已配置路径数
- 返回结构：
```typescript
{
  traffic: {
    totalRequests24h: number,
    currentRpm: number,
    peakRpm: number,
    activeIPs24h: number,
    trendVsPrevDay: number // 相比前一天的百分比变化
  },
  reliability: {
    cacheHitRate: number,
    errorRate: number,
    avgResponseTime: number,
    p95ResponseTime: number
  },
  configuration: {
    totalPaths: number,
    pathsWithCache: number,
    pathsWithRateLimit: number,
    pathsWithGeo: number
  },
  topPaths: Array<{ 
    path: string, 
    requests: number, 
    errors: number,         // ✅ 已验证：snapshot 包含此字段
    errorRate: number       // ✅ 已验证：snapshot 包含此字段
  }>
}
```


**GET /api/admin/dashboard/timeseries**

- 查询参数：`range=24h|7d`, `metric=requests|cache_hit|errors`
  - ⚠️ **数据保留限制**：`path_stats_hourly` 仅保留 7 天，最大范围只能是 7d
  - **优雅降级策略**：
    - 如请求超过 7 天（如 `range=30d`），自动回退到 7d，返回 `actualRange: '7d'` 字段
    - 在响应中添加 `warning` 字段提示用户数据范围限制
    - 前端展示 Toast 提示："历史数据仅保留 7 天，已自动调整查询范围"
    - **避免**直接返回 400 错误导致前端调用失败
- 从 D1 `path_stats_hourly` 聚合按小时/按日统计
- 返回时间序列数据用于图表展示
```typescript
{
  dataPoints: Array<{
    timestamp: string,
    value: number,
    label: string // 显示用标签
  }>,
  summary: {
    total: number,
    avg: number,
    max: number,
    min: number
  }
}
```


**GET /api/admin/dashboard/rate-limit/stats**

- **Phase 1 简化版本**：返回配置统计而非实时拦截数据
- 原因：RateLimiter DO 按 IP 分散，无中央索引，无法高效聚合
- 数据源：从 unified paths 统计配置信息
```typescript
{
  pathsWithRateLimit: number,     // 启用限流的路径数
  globalRulesCount: number,        // 全局限流规则数（来自 ip_access_rules 表）
  placeholder: {
    note: "实时拦截统计需要 IP Monitor Pipeline 支持",
    estimatedCompletion: "IP Monitor Phase 3 完成后升级"
  }
}
```
- **TODO（Phase 2 自动升级触发条件）**：
  - ✅ 前置条件：IP Monitor 已上线（`ip_traffic_daily`, `ip_access_rules` 表可用）
  - 🔄 待补充：扩展 `traffic_events` 表添加 `is_rate_limited` 字段，或新增 `rate_limit_events` 表
  - 🔄 升级步骤：
    1. 检测数据可用性：查询 `ip_access_rules` 表是否有记录
    2. 如有数据，切换到真实统计：从 D1 聚合拦截事件
    3. 更新接口响应，移除 `placeholder` 字段
  - ⏰ 预计时间：2-3 小时（数据表扩展 + 接口修改）


#### 1.2 优化数据查询性能

**关键实施要点**：

**KV 缓存策略**：
```typescript
// dashboard/overview 缓存 1 分钟
const cacheKey = 'dashboard:overview:v1';
const cached = await env.API_GATEWAY_STORAGE.get(cacheKey, 'json');
if (cached && Date.now() - cached.timestamp < 60000) {
  return cached.data;
}
```

**D1 查询优化**：
- ✅ 强制使用索引：`WHERE hour_bucket >= ?` 而非 `WHERE timestamp > ?`
- ✅ 限制查询范围：最多查询最近 7 天数据
- ✅ 使用聚合表：优先从 `path_stats_hourly` 而非 `traffic_events`
- ⚠️ 避免全表扫描：所有查询必须包含时间范围过滤

**并行查询实现**：
```typescript
const [pathStats, cacheStats, trafficStats, pathsHealth] = await Promise.allSettled([
  queryPathStats(env),      // D1
  getCacheStats(env),        // KV
  getTrafficMonitorStats(env), // DO
  getPathsHealth(env)        // KV + D1
]);

// 降级处理：单个失败不影响其他指标
const overview = {
  traffic: pathStats.status === 'fulfilled' ? pathStats.value : getDefaultTrafficStats(),
  reliability: cacheStats.status === 'fulfilled' ? cacheStats.value : getDefaultReliabilityStats(),
  // ...
};
```

**降级策略**：
- 单个数据源失败时，使用默认值或上一次缓存值
- 在响应中添加 `degraded: true` 字段和 `errors` 数组记录失败信息
- 前端展示降级提示，但不阻塞 UI 渲染

#### 1.3 集成到主路由

**文件**: `apps/api/src/index.ts`

```typescript
import dashboardRoutes from './routes/admin/dashboard';
app.route('/api/admin/dashboard', dashboardRoutes);
```

---

### Phase 2: 前端 - 创建数据获取 Hooks

#### 2.1 创建 Dashboard API Hook

**文件**: `apps/web/src/hooks/use-dashboard-api.ts`

使用 SWR 或 React Query 封装 API 调用：

```typescript
export function useDashboardOverview() {
  return useSWR('/api/admin/dashboard/overview', fetcher, {
    refreshInterval: 60000, // 1分钟刷新
    revalidateOnFocus: true
  });
}

export function useDashboardTimeseries(range: string, metric: string) {
  return useSWR(
    `/api/admin/dashboard/timeseries?range=${range}&metric=${metric}`,
    fetcher,
    { refreshInterval: 300000 } // 5分钟刷新
  );
}

export function useRateLimitStats() {
  return useSWR('/api/admin/dashboard/rate-limit/stats', fetcher, {
    refreshInterval: 120000 // 2分钟刷新
  });
}
```

#### 2.2 添加 TypeScript 类型定义

**文件**: `apps/web/src/types/dashboard.ts`

定义 API 响应类型，与后端接口保持一致。

---

### Phase 3: 前端 - 改造 Dashboard 组件

#### 3.1 替换统计卡片数据

**文件**: `apps/web/src/features/dashboard/index.tsx`

- **卡片 1 - 总请求数（24h）**：替换 "Total Revenue"
  - 数据源：`dashboardOverview.traffic.totalRequests24h`
  - 趋势：`trendVsPrevDay`（显示 ▲/▼）

- **卡片 2 - 缓存命中率**：替换 "Subscriptions"
  - 数据源：`dashboardOverview.reliability.cacheHitRate`
  - 显示百分比，带颜色标识（>80% 绿色，60-80% 黄色，<60% 红色）

- **卡片 3 - 当前 RPM**：替换 "Sales"
  - 数据源：`dashboardOverview.traffic.currentRpm`
  - 副标题显示峰值 RPM

- **卡片 4 - 活跃路径数**：替换 "Active Now"
  - 数据源：`dashboardOverview.configuration.totalPaths`
  - 副标题显示启用缓存/限流的路径数

添加加载状态（Skeleton）和错误处理。

#### 3.2 改造 Overview 图表

**文件**: `apps/web/src/features/dashboard/components/overview.tsx`

- 使用 `useDashboardTimeseries('24h', 'requests')` 获取实时数据
- 保留 Recharts 柱状图，替换数据源
- 添加时间范围选择器（24h / 7d）
  - ⚠️ 移除 30d 选项（数据仅保留 7 天）
- Y 轴格式化为数字（移除 $ 符号）
- 添加工具提示（Tooltip）显示具体数值

#### 3.3 改造 Recent Sales 组件

**文件**: `apps/web/src/features/dashboard/components/recent-sales.tsx` → 重命名为 `top-paths.tsx`

- 标题改为 "Top Paths"
- 使用 `dashboardOverview.topPaths` 数据
- 显示：路径、请求数、错误数、错误率
  - ✅ **数据可用性已验证**：
    - `snapshot:latest` 包含 `errors` 和 `error_rate` 字段
    - Queue Consumer 在 `aggregateEvents()` 中统计 `status >= 400` 的请求
    - D1 `path_stats_hourly.errors` 列正常填充
- 移除头像，改用路径图标（如 `<Activity />` 或 `<TrendingUp />`）
- 点击路径跳转到路径管理页面（可选）

---

### Phase 4: 视觉增强

#### 4.1 添加趋势指示器

创建通用的趋势徽章组件：

**文件**: `apps/web/src/features/dashboard/components/trend-badge.tsx`

```tsx
<TrendBadge value={5.2} direction="up" />
// 显示：▲ 5.2% (绿色)
```

#### 4.2 分组布局

将指标分为 3 个 Section（使用分隔符或卡片组）：

- **流量指标（Traffic）**: 总请求、RPM、活跃 IP
- **可靠性指标（Reliability）**: 缓存命中率、错误率、响应时间
- **安全指标（Security）**: 限流拦截数、封禁 IP 数（暂用占位符，待 IP Monitor 实现）

#### 4.3 添加时间选择器

在 Dashboard 顶部添加时间范围选择器（24h / 7d），影响图表和部分指标。

⚠️ **限制说明**：不支持 30d 范围，因为 `path_stats_hourly` 仅保留 7 天数据。如需更长历史数据，需依赖 R2 归档或数据仓库方案（Future Roadmap）。

#### 4.4 微调样式

- 统一卡片阴影和边框
- 调整字体大小（大数字更突出）
- 添加图标（使用 lucide-react）

---

### Phase 5: 实时地图可视化（✨ 新增特性）

> **核心概念**：将入口流量原产地（用户所在国家/省份/IP）动态连接到实际承载请求的 Cloudflare 边缘站点（POP），通过飞线动画实时展示全球流量走向。

#### 5.1 整体架构与交付策略

**实施层级**：数据采集 → 聚合处理 → 前端渲染

**📦 第一期交付（MVP）**：
- **目标**：2D ECharts 飞线 + 五分钟定时更新，快速上线
- **范围**：
  - ✅ Top 10 来源国家 → Cloudflare POP 的飞线
  - ✅ 静态聚合（5 分钟刷新），返回最多 20 条飞线
  - ✅ 基础交互（Tooltip 显示请求数 + 点击跳转）
  - ✅ 成功/错误颜色区分（绿/红）
- **工作量**：14-19 小时
- **优势**：效果够炫、数据准确、易于交付

**🚀 后续迭代（Phase 5.2+）**：
- **Phase 5.2**：按路径/IP 下钻分析
- **Phase 5.3**：实时推送（WebSocket / Durable Object）
- **Phase 5.4**：3D 地球模式（echarts-gl）
- **Phase 5.5**：历史回放 + 更多视觉效果

#### 5.2 技术选型

**方案**: ECharts Geo + 飞线动画

**理由**：
- ✅ 免费开源，中文文档完善
- ✅ 内置飞线动画效果（`lines.effect`），开箱即用
- ✅ 有 `echarts-for-react` 封装，React 集成简单
- ✅ 性能优秀，支持大数据量渲染
- ✅ 支持 2D 世界地图和 3D 地球两种模式（可选升级）

**备选方案**：
- **deck.gl + Mapbox**：适合 3D 高级效果，但引入复杂度高
- **SVG/Canvas 手绘**：简单但地理精度有限

**依赖安装**：
```bash
cd apps/web
pnpm add echarts echarts-for-react
```

#### 5.3 数据采集与处理

**5.3.1 请求来源（Origin）数据增强**

**现状**：
- ✅ `traffic_events` / `ip_path_daily` 已有 `country`, `ip_hash` 字段
- ✅ Cloudflare Request 对象提供全部所需字段：
  - `cf.country` / `cf.region` / `cf.city`
  - `cf.latitude` / `cf.longitude`
  - `cf.colo` （边缘节点代码，如 `SJC`, `HKG`）

**MVP 采集方案**（仅必需字段）：
```typescript
// 在 path-collector.ts 中扩展事件采集
const event = {
  // ... 现有字段
  country: c.req.raw.cf?.country || 'Unknown',   // ✅ 必需：国家代码
  edgeColo: c.req.raw.cf?.colo || 'UNKNOWN',     // ✅ 必需：边缘节点代码
  timestamp: Date.now()
};
```

**可选增强**（Phase 5.2+ 精细化下钻）：
```typescript
// 未来支持省/市级别展示
region: c.req.raw.cf?.region || null,
city: c.req.raw.cf?.city || null,
latitude: c.req.raw.cf?.latitude || null,
longitude: c.req.raw.cf?.longitude || null,
```

**数据量增长评估**：
- MVP 只增加 2 列（`country`, `edge_colo`），每行增加约 10-20 字节
- `traffic_events` 保留 3 天，总增量 < 5%，可控

**5.3.2 扩展数据库 Schema**

**文件**: `apps/api/migrations/0005_add_edge_colo.sql`

```sql
-- MVP：仅添加边缘节点列（必需）
ALTER TABLE traffic_events ADD COLUMN edge_colo TEXT;

-- 添加索引（用于按边缘节点查询）
CREATE INDEX IF NOT EXISTS idx_traffic_events_edge_colo 
  ON traffic_events(edge_colo, timestamp DESC);

-- 可选（Phase 5.2+）：添加更精细的地理位置字段
-- ALTER TABLE traffic_events ADD COLUMN region TEXT;
-- ALTER TABLE traffic_events ADD COLUMN city TEXT;
```

**注**：
- MVP 只需 `edge_colo` 字段，配合已有的 `country` 即可
- `region` / `city` 字段暂时注释，未来精细化下钻时再启用

**5.3.3 落地边缘节点（Destination）数据**

**静态配置表**（JSON 或 SQL）：
- Cloudflare 提供 POP 列表：`colo` → 经纬度映射
- 预置表结构：`{ "SJC": { "lat": 37.3, "lng": -121.9, "name": "San Jose" } }`
- 支持多云部署：维护类似的 `edge_locations` 配置

**5.3.4 数据汇总策略**

| 场景 | 实现方案 | 刷新频率 | 适用范围 | MVP 状态 |
|------|---------|---------|---------|----------|
| 准实时（推荐） | 定时 job 汇总 D1 → KV | 5 分钟 | 生产环境 | ✅ **本期交付** |
| 实时 | DO / Worker 环形缓冲区 | 每分钟 | 演示/高要求场景 | ⏳ Phase 5.3 |
| 历史回放 | 每日归档到 R2 | 每天凌晨 | 长期趋势分析 | ⏳ Phase 5.5 |

**MVP 实施方案**（5 分钟定时汇总）：
```typescript
// 每 5 分钟定时任务（在 scheduled-handler.ts 中添加）
export async function aggregateGeoTraffic(env: Env) {
  const result = await env.D1.prepare(`
    SELECT 
      country,
      edge_colo,
      COUNT(*) as request_count,
      SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END) as error_count
    FROM traffic_events
    WHERE timestamp > ?
    GROUP BY country, edge_colo
    ORDER BY request_count DESC
    LIMIT 20  -- ✅ 限制返回 Top 20，避免前端渲染压力
  `).bind(Date.now() - 600000).all(); // 最近 10 分钟

  // 存入 KV 作为快照（5 分钟过期）
  await env.API_GATEWAY_STORAGE.put(
    'geo:traffic:latest',
    JSON.stringify({
      edges: result.results,
      timestamp: Date.now()
    }),
    { expirationTtl: 300 } // 5 分钟
  );
}
```

**去重/采样优势**：
- ✅ Top 20 限制：避免飞线过多，前端渲染流畅
- ✅ 按请求数排序：优先展示主要流量来源
- ✅ 小流量国家自动过滤：视觉更聚焦

#### 5.4 后端 - 实时数据接口

**文件**: `apps/api/src/routes/admin/dashboard.ts`

新增端点：

**GET /api/admin/dashboard/realtime/recent**

- **查询参数**：
  - `since`: 时间戳（毫秒），返回该时间后的请求（默认最近 5 分钟）
  - `limit`: 返回条数（默认 20，最大 50）⚠️ MVP 限制飞线数量
- **数据源**：
  - **优先**：KV `geo:traffic:latest` 快照（5 分钟缓存）
  - **降级**：D1 `traffic_events` 表实时查询
- **返回结构**：
```typescript
{
  success: true,
  events: Array<{
    path: string,
    clientCountry: string,      // 客户端国家（cf.country）
    clientCoords: [number, number], // 客户端国家中心坐标
    edgeColo: string,           // 处理请求的边缘节点（cf.colo）
    edgeCoords: [number, number],  // 边缘节点坐标
    timestamp: number,
    status: number,
    isError: boolean
  }>,
  edgeNodes: Array<{            // 活跃的边缘节点列表
    colo: string,
    coords: [number, number],
    requestCount: number
  }>,
  timestamp: number
}
```

**坐标映射表**：

创建 `apps/api/src/lib/geo-coords.ts`：

```typescript
/**
 * 国家代码 → 坐标映射
 */
export const COUNTRY_COORDS: Record<string, [number, number]> = {
  'CN': [104.1954, 35.8617],  // 中国
  'US': [-95.7129, 37.0902],  // 美国
  'JP': [138.2529, 36.2048],  // 日本
  'GB': [-3.4360, 55.3781],   // 英国
  'DE': [10.4515, 51.1657],   // 德国
  'FR': [2.2137, 46.2276],    // 法国
  'KR': [127.7669, 35.9078],  // 韩国
  'SG': [103.8198, 1.3521],   // 新加坡
  'AU': [133.7751, -25.2744], // 澳大利亚
  'CA': [-106.3468, 56.1304], // 加拿大
  'IN': [78.9629, 20.5937],   // 印度
  'BR': [-51.9253, -14.2350], // 巴西
  'RU': [105.3188, 61.5240],  // 俄罗斯
  'MX': [-102.5528, 23.6345], // 墨西哥
  'ID': [113.9213, -0.7893],  // 印度尼西亚
  'NL': [5.2913, 52.1326],    // 荷兰
  'IT': [12.5674, 41.8719],   // 意大利
  'ES': [-3.7492, 40.4637],   // 西班牙
  'TH': [100.9925, 15.8700],  // 泰国
  'PL': [19.1451, 51.9194],   // 波兰
  // 可根据实际访问国家扩展...
};

/**
 * Cloudflare 边缘节点（COLO）代码 → 坐标映射
 * 来源: https://www.cloudflarestatus.com/
 */
export const COLO_COORDS: Record<string, [number, number]> = {
  // 北美 - 美国
  'SJC': [-121.9, 37.3],   // San Jose, California
  'LAX': [-118.4, 33.9],   // Los Angeles, California
  'SEA': [-122.3, 47.4],   // Seattle, Washington
  'ORD': [-87.9, 41.9],    // Chicago, Illinois
  'DFW': [-97.0, 32.9],    // Dallas, Texas
  'IAD': [-77.4, 38.9],    // Washington DC
  'ATL': [-84.4, 33.6],    // Atlanta, Georgia
  'MIA': [-80.3, 25.8],    // Miami, Florida
  'EWR': [-74.2, 40.7],    // Newark, New Jersey
  'JFK': [-73.8, 40.6],    // New York, New York
  'DEN': [-104.7, 39.9],   // Denver, Colorado
  
  // 北美 - 加拿大
  'YUL': [-73.7, 45.5],    // Montreal
  'YYZ': [-79.6, 43.7],    // Toronto
  'YVR': [-123.2, 49.2],   // Vancouver
  
  // 欧洲 - 西欧
  'LHR': [-0.45, 51.5],    // London, UK
  'CDG': [2.55, 49.0],     // Paris, France
  'FRA': [8.57, 50.0],     // Frankfurt, Germany
  'AMS': [4.76, 52.3],     // Amsterdam, Netherlands
  'MAD': [-3.57, 40.5],    // Madrid, Spain
  'MXP': [8.72, 45.6],     // Milan, Italy
  'ZRH': [8.56, 47.5],     // Zurich, Switzerland
  
  // 欧洲 - 北欧
  'ARN': [17.9, 59.6],     // Stockholm, Sweden
  'CPH': [12.6, 55.6],     // Copenhagen, Denmark
  'HEL': [24.9, 60.3],     // Helsinki, Finland
  
  // 欧洲 - 东欧
  'WAW': [20.9, 52.2],     // Warsaw, Poland
  'PRG': [14.3, 50.1],     // Prague, Czech Republic
  'VIE': [16.6, 48.1],     // Vienna, Austria
  
  // 亚洲 - 东亚
  'NRT': [140.4, 35.8],    // Tokyo Narita, Japan
  'HND': [139.8, 35.5],    // Tokyo Haneda, Japan
  'KIX': [135.2, 34.4],    // Osaka, Japan
  'ICN': [126.4, 37.5],    // Seoul, South Korea
  'HKG': [113.9, 22.3],    // Hong Kong
  'TPE': [121.2, 25.1],    // Taipei, Taiwan
  
  // 亚洲 - 东南亚
  'SIN': [103.9, 1.35],    // Singapore
  'KUL': [101.7, 3.1],     // Kuala Lumpur, Malaysia
  'BKK': [100.7, 13.7],    // Bangkok, Thailand
  'CGK': [106.7, -6.1],    // Jakarta, Indonesia
  'MNL': [121.0, 14.5],    // Manila, Philippines
  
  // 亚洲 - 南亚
  'BOM': [72.9, 19.1],     // Mumbai, India
  'DEL': [77.1, 28.6],     // New Delhi, India
  'BLR': [77.7, 13.2],     // Bangalore, India
  
  // 中国（注意：Cloudflare 中国节点数据可能受限）
  'PEK': [116.4, 39.9],    // Beijing
  'PVG': [121.8, 31.1],    // Shanghai
  'CAN': [113.3, 23.4],    // Guangzhou
  'CTU': [104.0, 30.6],    // Chengdu
  
  // 大洋洲
  'SYD': [151.2, -33.9],   // Sydney, Australia
  'MEL': [144.8, -37.7],   // Melbourne, Australia
  'AKL': [174.8, -37.0],   // Auckland, New Zealand
  
  // 南美
  'GRU': [-46.6, -23.4],   // São Paulo, Brazil
  'GIG': [-43.2, -22.8],   // Rio de Janeiro, Brazil
  'EZE': [-58.5, -34.8],   // Buenos Aires, Argentina
  'SCL': [-70.8, -33.4],   // Santiago, Chile
  
  // 中东
  'DXB': [55.4, 25.3],     // Dubai, UAE
  'BAH': [50.6, 26.3],     // Bahrain
  'TLV': [34.9, 32.0],     // Tel Aviv, Israel
  
  // 非洲
  'JNB': [28.2, -26.1],    // Johannesburg, South Africa
  'CPT': [18.6, -33.9],    // Cape Town, South Africa
  'CAI': [31.4, 30.1],     // Cairo, Egypt
};

export function getCountryCoords(countryCode: string | null): [number, number] {
  if (!countryCode) return [0, 0];
  return COUNTRY_COORDS[countryCode.toUpperCase()] || [0, 0];
}

export function getColoCoords(colo: string | null): [number, number] {
  if (!colo || colo === 'UNKNOWN') return [0, 0];
  return COLO_COORDS[colo.toUpperCase()] || [0, 0];
}
```

**MVP 接口实现**（优先使用 KV 快照）：

```typescript
import { getCountryCoords, getColoCoords } from '../../lib/geo-coords';

app.get('/realtime/recent', async (c) => {
  try {
    // ✅ 优先从 KV 快照读取（5 分钟缓存）
    const cached = await c.env.API_GATEWAY_STORAGE.get('geo:traffic:latest', 'json');
    if (cached && cached.timestamp && Date.now() - cached.timestamp < 300000) {
      // 快照有效，直接返回
      const edges = cached.edges.map((edge: any) => ({
        clientCountry: edge.country,
        clientCoords: getCountryCoords(edge.country),
        edgeColo: edge.edge_colo,
        edgeCoords: getColoCoords(edge.edge_colo),
        requestCount: edge.request_count,
        errorCount: edge.error_count,
        isError: edge.error_count > 0
      }));

      // 统计活跃边缘节点
      const edgeNodes = Array.from(
        new Set(edges.map((e: any) => e.edgeColo).filter((c: string) => c !== 'UNKNOWN'))
      ).map((colo: string) => ({
        colo,
        coords: getColoCoords(colo),
        requestCount: edges
          .filter((e: any) => e.edgeColo === colo)
          .reduce((sum: number, e: any) => sum + e.requestCount, 0)
      }));

      return c.json({
        success: true,
        events: edges.slice(0, 20), // ✅ Top 20 限制
        edgeNodes,
        timestamp: cached.timestamp,
        dataSource: 'cache' // 标记数据来源
      });
    }

    // ⚠️ 降级：KV 快照不可用，从 D1 实时查询
    const since = Date.now() - 600000; // 最近 10 分钟
    const limit = 20;

    const result = await c.env.D1.prepare(`
      SELECT 
        country,
        edge_colo,
        COUNT(*) as request_count,
        SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END) as error_count
      FROM traffic_events
      WHERE timestamp > ?
      GROUP BY country, edge_colo
      ORDER BY request_count DESC
      LIMIT ?
    `).bind(since, limit).all();

    const events = result.results.map(row => ({
      clientCountry: row.country as string || 'Unknown',
      clientCoords: getCountryCoords(row.country as string),
      edgeColo: row.edge_colo as string || 'UNKNOWN',
      edgeCoords: getColoCoords(row.edge_colo as string),
      requestCount: row.request_count as number,
      errorCount: row.error_count as number,
      isError: (row.error_count as number) > 0
    }));

    const edgeNodes = Array.from(
      new Set(events.map(e => e.edgeColo).filter(c => c !== 'UNKNOWN'))
    ).map(colo => ({
      colo,
      coords: getColoCoords(colo),
      requestCount: events
        .filter(e => e.edgeColo === colo)
        .reduce((sum, e) => sum + e.requestCount, 0)
    }));

    return c.json({
      success: true,
      events,
      edgeNodes,
      timestamp: Date.now(),
      dataSource: 'realtime' // 标记降级查询
    });
  } catch (error) {
    console.error('Failed to fetch realtime events:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch realtime events',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});
```

**优化要点**：
- ✅ KV 优先：减少 D1 查询压力，响应更快
- ✅ Top 20 限制：前端渲染流畅，视觉聚焦
- ✅ 降级机制：KV 失效时自动切换 D1
- ✅ 数据来源标记：便于监控和调试

#### 5.5 前端渲染方案

**5.5.1 基底选择**

| 方案 | 适用场景 | 优势 | 劣势 |
|------|---------|------|------|
| **ECharts Geo**（推荐）| 2D 世界地图 | 简单、免费、中文文档 | 3D 效果有限 |
| **deck.gl + Mapbox** | 3D 高级效果 | 炫酷、强大 | 复杂度高、可能收费 |
| **SVG/Canvas 手绘** | 简化地图 | 轻量 | 地理精度差、交互弱 |

**5.5.2 实现要点**

**飞线数据结构**：
```typescript
interface FlyingLine {
  sourcePosition: [lng, lat];     // 客户端坐标
  targetPosition: [lng, lat];     // 边缘节点坐标
  weight: number;                 // 请求量
  color: string;                  // 成功绿色 / 错误红色
}
```

**可视化配置**：
- **线宽/颜色**：映射到请求量或错误率
- **动画效果**：沿线流动（ECharts `effect.show: true`）
- **交互**：
  - Hover 提示：请求数、Top Path
  - 点击跳转：IP 监控或路径详情

**性能优化**：
- ✅ **MVP 策略**：Top 20 飞线，后端聚合自动过滤小流量
- ✅ 更新频率：5 分钟刷新（与后端定时任务同步）
- ⏳ Phase 5.3：实时推送（WebSocket/SSE，1 秒级更新）

#### 5.6 前端 - 实时地图组件实现

**文件**: `apps/web/src/features/dashboard/components/realtime-map.tsx`

```tsx
import { useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface RealtimeEvent {
  clientCountry: string;
  clientCoords: [number, number];
  edgeColo: string;
  edgeCoords: [number, number];
  timestamp: number;
  isError: boolean;
}

interface EdgeNode {
  colo: string;
  coords: [number, number];
  requestCount: number;
}

export function RealtimeMap() {
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [edgeNodes, setEdgeNodes] = useState<EdgeNode[]>([]);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());

  // MVP：5 分钟轮询（与后端定时任务同步）
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await fetch(`/api/admin/dashboard/realtime/recent?limit=20`);
        const data = await res.json();
        
        if (data.success) {
          setEvents(data.events || []);      // ✅ 直接替换，不累加
          setEdgeNodes(data.edgeNodes || []);
          setLastUpdate(Date.now());
        }
      } catch (error) {
        console.error('Failed to fetch realtime events:', error);
      }
    };

    fetchEvents();
    const interval = setInterval(fetchEvents, 300000); // ✅ 每 5 分钟刷新
    return () => clearInterval(interval);
  }, []);

  // 生成飞线数据（从客户端国家 → 边缘节点）
  const flyingLines = events
    .filter(event => event.edgeColo !== 'UNKNOWN') // 过滤无效节点
    .slice(0, 20) // ✅ MVP 限制：最多 20 条飞线
    .map(event => ({
      coords: [event.clientCoords, event.edgeCoords],
      lineStyle: {
        color: event.isError ? '#ef4444' : '#00ff88', // 错误红色，成功绿色
        opacity: 0.6,
        width: Math.min(event.requestCount / 100, 3) // 根据请求量调整线宽
      }
    }));

  // 客户端来源热力点（按国家聚合）
  const clientScatterData = events.reduce((acc, event) => {
    const key = event.clientCountry;
    const existing = acc.find(item => item.name === key);
    if (existing) {
      existing.value[2]++;
    } else {
      acc.push({
        name: key,
        value: [...event.clientCoords, 1]
      });
    }
    return acc;
  }, [] as Array<{ name: string; value: [number, number, number] }>);

  // 边缘节点数据（带涟漪效果，显示请求量）
  const edgeScatterData = edgeNodes.map(node => ({
    name: node.colo,
    value: [...node.coords, node.requestCount]
  }));

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        if (params.seriesType === 'scatter') {
          return `${params.name}<br/>请求数: ${params.value[2]}`;
        }
        if (params.seriesType === 'effectScatter') {
          return `边缘节点: ${params.name}<br/>处理请求: ${params.value[2]}`;
        }
        return params.name;
      }
    },
    geo: {
      map: 'world',
      roam: true,
      itemStyle: {
        areaColor: '#1e293b',
        borderColor: '#334155',
        borderWidth: 0.5
      },
      emphasis: {
        itemStyle: {
          areaColor: '#2e3b4e'
        }
      }
    },
    series: [
      // 飞线（客户端 → 边缘节点）
      {
        type: 'lines',
        coordinateSystem: 'geo',
        data: flyingLines,
        effect: {
          show: true,
          period: 4,
          trailLength: 0.02,
          symbol: 'arrow',
          symbolSize: 5
        },
        lineStyle: {
          width: 1,
          curveness: 0.3
        },
        zlevel: 1
      },
      // 客户端来源热力点
      {
        type: 'scatter',
        coordinateSystem: 'geo',
        data: clientScatterData,
        symbolSize: (val: number[]) => Math.min(val[2] * 2 + 5, 20),
        itemStyle: {
          color: '#fbbf24',
          shadowBlur: 10,
          shadowColor: '#fbbf24'
        },
        zlevel: 2
      },
      // 边缘节点标记（带涟漪效果）
      {
        type: 'effectScatter',
        coordinateSystem: 'geo',
        data: edgeScatterData,
        symbolSize: (val: number[]) => Math.min(val[2] * 1.5 + 8, 25),
        rippleEffect: {
          brushType: 'stroke',
          period: 4,
          scale: 3
        },
        itemStyle: {
          color: '#3b82f6', // 蓝色代表边缘节点
          shadowBlur: 20,
          shadowColor: '#3b82f6'
        },
        label: {
          show: true,
          formatter: '{b}',
          position: 'right',
          color: '#fff',
          fontSize: 10
        },
        zlevel: 3
      }
    ]
  };

  const errorCount = events.filter(e => e.isError).length;
  const successCount = events.length - errorCount;
  const activeEdgeCount = edgeNodes.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            🌍 实时请求地图 - Cloudflare 边缘计算
          </CardTitle>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-blue-500 border-blue-500">
              📡 {activeEdgeCount} 个边缘节点
            </Badge>
            <Badge variant="outline" className="text-green-500 border-green-500">
              ✓ {successCount}
            </Badge>
            {errorCount > 0 && (
              <Badge variant="destructive">
                ✗ {errorCount}
              </Badge>
            )}
            <span className="text-sm text-muted-foreground">
              最近 {events.length} 个请求
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-2 text-sm text-muted-foreground">
          <p>飞线展示：客户端位置 → 处理请求的边缘节点</p>
          <p className="mt-1">
            <span className="inline-block w-3 h-3 bg-blue-500 rounded-full mr-1"></span>
            蓝色标记：活跃的 Cloudflare 边缘节点
          </p>
        </div>
        <ReactECharts 
          option={option} 
          style={{ height: '500px' }} 
          notMerge={true}
        />
      </CardContent>
    </Card>
  );
}
```

#### 5.7 集成到 Dashboard

**文件**: `apps/web/src/features/dashboard/index.tsx`

```tsx
import { RealtimeMap } from './components/realtime-map';

export function Dashboard() {
  return (
    <Main>
      {/* 统计卡片 */}
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {/* ... 现有的 4 个卡片 ... */}
      </div>

      {/* 实时地图 - 全宽显示 */}
      <div className="w-full">
        <RealtimeMap />
      </div>

      {/* Overview 图表和 Top Paths */}
      <div className='grid grid-cols-1 gap-4 lg:grid-cols-7'>
        {/* ... Overview 和 Top Paths ... */}
      </div>
    </Main>
  );
}
```

#### 5.8 安全、降级与性能

**5.8.1 缓存策略**
```typescript
// API 结果缓存 1-5 分钟
const cacheKey = 'realtime:map:v1';
const cached = await env.API_GATEWAY_STORAGE.get(cacheKey, 'json');
if (cached && Date.now() - cached.timestamp < 60000) {
  return c.json(cached.data);
}
```

**5.8.2 隐私保护**
- ✅ 仅展示国家/地区聚合，不显示具体 IP
- ✅ 坐标使用国家中心点（`COUNTRY_COORDS`），非真实用户位置
- ✅ `ip_hash` 脱敏存储

**5.8.3 采样与限流**
```typescript
// 高频流量采样（5% ~ 10%）
const shouldSample = Math.random() < 0.05;
if (!shouldSample && event.path !== '/critical') {
  return; // 跳过非关键路径的低频采样
}
```

**5.8.4 容错降级**
- Geo 数据缺失时 → 显示纯 POP 聚合（不显示客户端来源）
- D1 查询超时 → 返回上一次 KV 缓存
- 边缘节点坐标缺失 → 标记为 `UNKNOWN`，不渲染飞线

#### 5.9 进阶功能规划（Phase 5.2+ 后续迭代）

> ⚠️ 以下功能不在 MVP 范围内，视业务需求和用户反馈逐步实施

**5.9.1 服务器推送事件（SSE）替代轮询**（Phase 5.3 实时推送）

更实时的数据推送方案：

**后端**（`apps/api/src/routes/admin/dashboard.ts`）：
```typescript
import { streamSSE } from 'hono/streaming';

app.get('/realtime/stream', async (c) => {
  return streamSSE(c, async (stream) => {
    let lastTimestamp = Date.now();
    
    const interval = setInterval(async () => {
      const events = await getRecentEvents(c.env, lastTimestamp);
      if (events.length > 0) {
        await stream.writeSSE({
          data: JSON.stringify(events),
          event: 'request'
        });
        lastTimestamp = Date.now();
      }
    }, 2000); // 每 2 秒检查新事件

    stream.onAbort(() => clearInterval(interval));
  });
});
```

**前端**：
```typescript
useEffect(() => {
  const eventSource = new EventSource('/api/admin/dashboard/realtime/stream');
  
  eventSource.addEventListener('request', (e) => {
    const newEvents = JSON.parse(e.data);
    setEvents(prev => [...newEvents, ...prev].slice(0, 100));
  });

  return () => eventSource.close();
}, []);
```

**5.9.2 3D 地球模式**（Phase 5.4 视觉升级）

升级为 3D 可视化：

```bash
pnpm add echarts-gl
```

```tsx
import 'echarts-gl';

const option = {
  globe: {
    baseTexture: '/textures/earth.jpg', // 地球贴图
    heightTexture: '/textures/bathymetry.jpg', // 高度贴图
    environment: '#000',
    viewControl: {
      autoRotate: true,
      autoRotateSpeed: 5
    },
    light: {
      ambient: { intensity: 0.4 },
      main: { intensity: 1.5 }
    }
  },
  series: [{
    type: 'lines3D',
    coordinateSystem: 'globe',
    // ... 飞线配置
  }]
};
```

**5.9.3 按错误率或边缘负载着色**（Phase 5.4 视觉升级）

根据边缘节点负载或错误率给区域着色：

```typescript
// 方案 1: 按边缘节点负载着色
const edgeLoadData = edgeNodes.map(node => ({
  name: node.colo,
  value: node.requestCount
}));

// 方案 2: 按国家错误率着色
const countryStats = events.reduce((acc, event) => {
  if (!acc[event.clientCountry]) {
    acc[event.clientCountry] = { total: 0, errors: 0 };
  }
  acc[event.clientCountry].total++;
  if (event.isError) acc[event.clientCountry].errors++;
  return acc;
}, {} as Record<string, { total: number; errors: number }>);

// 添加到 option
const visualMap = {
  type: 'piecewise',
  pieces: [
    { min: 0.5, color: '#ef4444', label: '>50% 错误率' },
    { min: 0.2, max: 0.5, color: '#f59e0b', label: '20-50%' },
    { max: 0.2, color: '#10b981', label: '<20%' }
  ],
  right: 10,
  bottom: 20
};
```

**5.9.4 显示缓存命中 vs 回源**（Phase 5.4 视觉升级）

如果想区分边缘缓存命中和回源请求：

```typescript
// 需要在 traffic_events 添加 cache_status 字段
const lines = events.map(event => {
  if (event.cacheHit) {
    // 绿色飞线：边缘缓存命中
    return {
      coords: [event.clientCoords, event.edgeCoords],
      lineStyle: { color: '#10b981', width: 1.5 }
    };
  } else {
    // 橙色飞线：需要回源
    return {
      coords: [event.clientCoords, event.edgeCoords],
      lineStyle: { color: '#f59e0b', width: 1 }
    };
  }
});
```

#### 5.10 MVP 实施里程碑（第一期交付）

| 阶段 | 任务 | 工作量 | 交付物 | 依赖 |
|------|------|--------|--------|------|
| **5.1 数据层** | 扩展 `traffic_events` 表，更新 `path-collector.ts` 采集 `edge_colo` | 2-3 小时 | `0005_add_edge_colo.sql` | 数据库迁移权限 |
| **5.2 定时任务** | 实现 5 分钟聚合 Top 20 流量到 KV | 1-2 小时 | `aggregateGeoTraffic()` | `scheduled-handler.ts` |
| **5.3 坐标映射** | 创建 60+ Cloudflare POP 坐标表 | 1-2 小时 | `geo-coords.ts` | Cloudflare POP 列表 |
| **5.4 API** | 实现 `/realtime/recent` 接口（KV 优先 + D1 降级） | 2-3 小时 | Dashboard API 端点 | 坐标映射表 |
| **5.5 前端** | 实现 `RealtimeMap` 组件，集成 ECharts | 4-5 小时 | `realtime-map.tsx` | `echarts-for-react` |
| **5.6 集成** | Dashboard 页面集成，Tab 懒加载 | 2-3 小时 | 更新 `dashboard/index.tsx` | Phase 1-4 完成 |
| **5.7 测试** | 数据验证、性能测试、边界情况 | 2-3 小时 | 测试报告 | 测试环境 |

**MVP 总计**：14-21 小时

**前置依赖**：
- ✅ D1 `traffic_events` 表已存在
- ✅ 中间件已采集 `cf.country`
- 🔄 需添加：`cf.colo` 字段采集
- 🔄 需创建：坐标映射表（`geo-coords.ts`）

**MVP 验收标准**：
- [ ] 地图显示 Top 10-20 来源国家 → Cloudflare POP 的飞线
- [ ] 飞线颜色区分成功（绿）和错误（红）
- [ ] 正确标记活跃的 Cloudflare 边缘节点（蓝色涟漪效果）
- [ ] 支持 Hover 显示：国家名、POP 代码、请求数
- [ ] 点击飞线跳转到 IP 监控或路径详情
- [ ] 每 5 分钟自动刷新，无明显卡顿
- [ ] 边缘节点数量和请求统计与 D1 原始数据一致
- [ ] 数据降级正常：KV 失效时自动切换 D1 查询

#### 5.11 风险评估与缓解

| 风险 | 影响 | MVP 缓解方案 | 后续优化 |
|------|------|-------------|----------|
| **Cloudflare 中国节点数据有限** | 部分国内用户显示 `UNKNOWN` POP | 添加"亚太区域"聚合节点 | Phase 5.2 支持自定义 POP 映射 |
| **地图 GeoJSON 较大（~2MB）** | 首次加载慢 | Tab 懒加载 + CDN 缓存 | Phase 5.4 使用轻量 TopoJSON |
| **D1 查询压力** | 降级查询影响性能 | KV 优先 + Top 20 限制 | Phase 5.3 使用 DO 环形缓冲区 |
| **数据延迟 5 分钟** | 不够"实时" | 明确标注"准实时（5 分钟刷新）" | Phase 5.3 升级 SSE/WebSocket |

**MVP 优势**：
- ✅ 效果够炫：飞线动画 + 边缘节点涟漪
- ✅ 数据准确：直接从 D1 聚合，与现有系统一致
- ✅ 性能可控：Top 20 限制 + KV 缓存
- ✅ 易于交付：14-21 小时工作量，无复杂依赖

---

### Phase 6: 其他增强功能（Nice-to-Have）

#### 6.1 后台预计算快照

创建定时任务（Cron Trigger）每 10 分钟生成 Dashboard 快照：

**文件**: `apps/api/src/scheduled-handler.ts`

```typescript
// 每 10 分钟执行
export async function handleDashboardSnapshot(env: Env) {
  const overview = await generateDashboardOverview(env);
  await env.API_GATEWAY_STORAGE.put(
    'dashboard:snapshot:latest',
    JSON.stringify(overview),
    { expirationTtl: 600 } // 10分钟过期
  );
}
```

Dashboard API 优先读取快照，降级到实时计算。

#### 6.2 导出功能

添加"导出 CSV"和"导出 PNG"按钮：

- CSV：使用 papaparse 库导出表格数据
- PNG：使用 html2canvas 截图图表

#### 6.3 警报徽章

在 Dashboard 顶部显示活跃警报：

- 流量超过阈值
- 错误率过高
- 缓存命中率下降
- 复用现有 `/api/admin/traffic/alerts` 端点

---

## 关键文件清单

### 后端新增

- `apps/api/src/routes/admin/dashboard.ts` (新建)
- `apps/api/src/lib/dashboard-aggregator.ts` (新建，聚合逻辑)
- `apps/api/src/lib/geo-coords.ts` (新建，坐标映射表)
- `apps/api/src/scheduled-handler.ts` (修改，添加快照任务)
- `apps/api/migrations/0005_add_edge_colo.sql` (新建，扩展数据库)
- `apps/api/src/index.ts` (修改，注册路由)

### 前端修改

- `apps/web/src/hooks/use-dashboard-api.ts` (新建)
- `apps/web/src/types/dashboard.ts` (新建)
- `apps/web/src/features/dashboard/index.tsx` (修改，集成实时地图)
- `apps/web/src/features/dashboard/components/overview.tsx` (修改)
- `apps/web/src/features/dashboard/components/top-paths.tsx` (重命名+修改)
- `apps/web/src/features/dashboard/components/trend-badge.tsx` (新建)
- `apps/web/src/features/dashboard/components/realtime-map.tsx` (新建，实时地图)

---

## 数据映射表

| 原 Mock Widget | 新实时数据 | 数据源 |

|---------------|-----------|-------|

| Total Revenue | 24h 总请求数 | D1 path_stats_hourly |

| Subscriptions | 缓存命中率 | Cache KV |

| Sales | 当前 RPM | Traffic Monitor DO |

| Active Now | 活跃路径数 | Paths Health |

| Overview Chart | 请求时间序列 | D1 path_stats_hourly |

| Recent Sales | Top Paths | KV snapshot:latest |

---

## 时间估算

- Phase 1（后端 API）: 6-8 小时
- Phase 2（前端 Hooks）: 2-3 小时
- Phase 3（组件改造）: 6-8 小时
- Phase 4（视觉增强）: 4-5 小时
- Phase 5（实时地图可视化 MVP）: 14-21 小时
- Phase 6（可选增强）: 5-7 小时

**核心功能总计**（Phase 1-4）: 约 18-24 小时

**含实时地图 MVP**（Phase 1-5）: 约 32-45 小时

**含所有功能**（Phase 1-6）: 约 37-52 小时

---

## 风险与注意事项

1. **性能影响**：Dashboard API 需要聚合多个数据源，需优化并行查询
2. **数据一致性**：不同数据源的时间戳可能不完全同步（容忍度 ±5 分钟）
3. **降级策略**：单个指标失败不应阻塞整个 Dashboard 渲染
4. **缓存策略**：合理设置 TTL，平衡实时性和性能
5. **数据保留限制**：
   - `path_stats_hourly` 仅保留 7 天，timeseries 最大范围为 7d
   - 如需更长历史趋势，需实现 R2 归档查询或数据仓库方案
6. **Rate Limiter 统计限制**（Phase 1）：
   - 暂时仅返回配置统计（启用限流的路径数）
   - 无中央索引，无法高效聚合所有 RateLimiter DO 的实时数据
   - **升级路径（Phase 2 自动触发）**：
     - ✅ IP Monitor 已上线，`ip_access_rules` 表提供全局规则数据
     - 🔄 待实现：从 D1 查询真实拦截事件计数（需扩展 `traffic_events` 表或新增 `rate_limit_events` 表）
     - 📋 实施检查点：IP Monitor Phase 3 完成后，回到此处更新接口逻辑
7. **IP Monitor 集成**：
   - ✅ IP Monitor 已上线（Phase 1-6 完成）
   - ✅ 可提供：封禁 IP 数（`ip_access_rules` 表）、Top IP 统计（`ip_traffic_daily` 表）
   - ⚠️ 需集成：Dashboard API 调用 IP Monitor 端点获取安全指标


---

## 附录：流量监控模块规划

> 目标：在 Dashboard 升级的同时，为后续“流量监控”视图预留规划，覆盖业务流量趋势、异常定位、下钻联动等能力。

### A. 功能模块概览

| 模块 | 核心内容 | 价值 |
| ---- | -------- | ---- |
| 全局概览 | 总请求量、峰值、平均耗时、错误率、缓存命中率，时间范围切换 | 快速判断系统整体健康 |
| 业务排行榜 | 按代理路由/路径统计请求量、错误量、增长率 TOP | 找到“哪条 API 异常/流量飙升” |
| 趋势分析 | 多路径/服务的请求与错误时序，对比上一周期 | 进行容量规划与异常定位 |
| 异常/告警面板 | 汇总实时告警（流量突增、错误率高等），支持跳转 | 统一响应入口 |
| 业务路径详情 | 单路径的曲线、状态码分布、Top IP/国家，关联配置 | 与路径管理联动形成治理闭环 |
| 地域/来源分布 | 请求按国家/区域/ISP 分布与变化 | 配合 IP 监控做安全分析 |
| 历史回放/审计（后续） | 与操作日志联动，回放故障时间线 | 故障复盘与问责依据 |

实施建议：先交付“概览 + 排行 + 趋势”作为 MVP，其余模块分批补齐。

### B. 数据依赖

**现有数据表**（已上线）：
- ✅ `path_stats_hourly`（D1，保留 7 天）——请求/错误趋势、排行榜
  - 索引：`idx_path_stats_hour_bucket`, `idx_path_stats_path`
- ✅ `snapshot:latest`（KV）——概览快速查询
- ✅ `ip_traffic_daily`（D1，保留 7 天）——Top IP、地域分布
  - 索引：`idx_ip_daily_requests`, `idx_ip_hash_lookup`
- ✅ `ip_path_daily`（D1，保留 7 天）——IP × 路径交叉分析
  - ⚠️ 注意：此表数据量大（IP × 路径组合），查询时需限制范围
- ✅ `ip_access_rules`（D1）——全局封禁/限流规则
- ✅ `traffic_events`（D1，保留 3 天）——明细事件，支持实时查询
  - 字段：`path`, `country`, `edge_colo`, `is_error`, `timestamp` 等

**Durable Objects**：
- ✅ `TrafficMonitor` DO——实时 RPM、峰值、异常告警

**待扩展**（可选）：
- 🔄 `rate_limit_events_hourly`（D1）——真实限流拦截统计
- 🔄 告警/阈值配置表——异常面板的规则来源
- 🔄 R2 归档——超过 7 天的历史数据（长期趋势分析）

> **数据保留策略说明**：
> - 明细事件（`traffic_events`）：3 天，用于下钻分析
> - 聚合统计（`*_hourly`, `*_daily`）：7 天，用于趋势分析
> - 超过 7 天的数据归档到 R2，需单独查询接口

### C. 技术要点

1. **API 设计**：
   - `/api/admin/traffic/overview`——全局概览（复用 Dashboard API）
   - `/api/admin/traffic/top`——排行榜（路径/代理/IP）
   - `/api/admin/traffic/trends`——时序数据（支持多路径对比）
   - `/api/admin/traffic/alerts`——异常告警列表
   - **共性要求**：支持 TTL 缓存（1-5 分钟）、降级策略、时间范围自动回退

2. **前端实现**：
   - 新增 `apps/web/src/features/traffic-monitor/`
   - 复用 Dashboard 的图表组件和 Hooks
   - 支持时间范围切换、指标筛选、路径/IP 联动跳转

3. **异步任务**（已在 `scheduled-handler.ts` 实现）：
   - ✅ 每 10 分钟生成 KV 快照（`snapshot:latest`）
   - ✅ 每日凌晨清理过期数据（7 天保留期）
   - 🔄 可选：每 5 分钟预计算 Top 排行榜（`traffic:top:cache`）

4. **联动功能**：
   - 异常路径 → 跳转到路径管理页（修改配置）
   - Top IP → 跳转到 IP 监控页（查看详情/封禁）
   - 错误趋势 → 下钻到明细事件（`traffic_events` 表）
   - 形成"发现问题 → 分析 → 治理"的完整闭环

### D. 风险提示与实施检查点

**数据完整性**：
- ⚠️ `ip_path_daily` 表数据量大（IP × 路径组合），查询时必须限制日期和行数
- ✅ 验证方法：上线前执行 `SELECT COUNT(*) FROM ip_path_daily WHERE date = '2025-10-18'` 确认数据正常写入
- ✅ 降级方案：如 `ip_path_daily` 数据异常，回退到 `ip_traffic_daily.top_paths` JSON 字段

**性能压力**：
- ⚠️ 高并发查询可能导致 D1 压力增大
- ✅ 缓解措施：
  - 所有查询强制使用索引（`EXPLAIN QUERY PLAN` 验证）
  - KV 缓存热点查询（TTL 1-5 分钟）
  - 使用 `Promise.allSettled` 避免单点失败影响整体
  - 预计算快照（`snapshot:latest`）作为降级路径

**权限与隐私**：
- ✅ IP 数据使用哈希存储（`ip_hash` 字段）
- ✅ 前端展示时脱敏（仅显示前后缀）
- ✅ 管理员查看完整 IP 需要二次确认

**升级兼容性**：
- ⚠️ RateLimiter 统计从"配置数"升级到"真实拦截数"时，需修改接口逻辑
- ✅ 实施检查：在 Phase 2 升级时，确保前端能正确处理新旧两种响应格式
- ✅ 版本标记：在响应中添加 `statsVersion: 'config' | 'realtime'` 字段区分数据来源

## 数据可用性验证结果

✅ **已验证（2025-10-17）**：
- `snapshot:latest` 包含完整的错误统计字段（`errors`, `error_rate`）
- Queue Consumer 正确聚合错误数据（`status >= 400`）
- D1 `path_stats_hourly.errors` 列正常工作
- Top Paths 可直接展示错误数和错误率，无需额外开发

---

## 验收标准

- [ ] Dashboard 不再显示任何 mock 数据
- [ ] 4 个统计卡片显示实时指标并正确更新
- [ ] 图表展示最近 24h 的真实请求趋势
- [ ] Top Paths 列表显示真实热门路径
- [ ] 加载状态和错误状态正确处理
- [ ] 与 Cache 页面的数据一致（缓存命中率等）
- [ ] 性能：Dashboard 初始加载 < 2 秒（含所有 API 调用）

---

## 后续优化（Future Roadmap）

### 短期优化（1-2 个月）
1. **RateLimiter 真实统计**：从 IP Monitor 数据源读取真实拦截事件（Phase 2 自动升级）
2. **IP Monitor 集成**：Dashboard 显示封禁 IP 数、可疑 IP 数等安全指标
3. **数据降级优化**：查询超过 7 天自动回退，前端友好提示
4. **预计算快照**：Top 排行榜、热门路径定时缓存（5 分钟刷新）

### 中期功能（3-6 个月）
5. **长期趋势分析**：R2 归档 + 数据仓库方案，支持 30d+ 历史查询
6. **流量监控视图**：完整实现附录规划的 7 个模块（概览、排行、趋势、异常等）
7. **实时地图进阶功能**：
   - ✅ **Phase 5.1 MVP**（已规划）：2D 飞线 + 5 分钟刷新 + Top 20 限制
   - 🔄 **Phase 5.2**：按路径/IP 下钻分析，点击飞线查看明细
   - 🔄 **Phase 5.3**：实时推送（SSE/WebSocket），1 秒级更新
   - 🔄 **Phase 5.4**：视觉升级（3D 地球、区域着色、缓存命中展示）
   - 🔄 **Phase 5.5**：历史回放（时间轴拖动）+ 大屏展示模式

### 长期优化（6-12 个月）
8. **Durable Object WebSocket 推送**：替代轮询/SSE，实现双向实时通信
9. **自定义 Dashboard**：允许用户拖拽配置自己的仪表盘布局
10. **更多图表类型**：饼图、热力图、漏斗图、桑基图等
11. **对比模式**：显示同比、环比数据，支持多时间段对比
12. **智能分析**：异常检测、趋势预测、容量规划建议
13. **导出报告**：生成 PDF/Excel 格式的周报/月报，支持定时推送
