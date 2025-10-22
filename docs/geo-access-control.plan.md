# 地区维度访问控制技术方案

## 📋 项目背景

### 现有能力
- ✅ **IP 列表管理**：支持单个 IP/IP 段的封禁、限流（IP Monitor）
- ✅ **路径级配置**：支持路径级的缓存、限流、地理限制（`UnifiedPathConfig.geo`）
- ✅ **地理数据采集**：`cf.country`、`cf.city`、`cf.region` 已在 `traffic_events` 中记录

### 缺失能力
- ❌ **地区维度批量控制**：无法按国家/地区批量封禁或限流
- ❌ **地区级访问策略**：无法设置"仅允许某些国家访问"或"阻止某些国家访问"
- ❌ **地区级流量监控**：缺乏地区级的流量统计和告警
- ❌ **灵活的地区策略**：无法根据业务需求动态调整地区访问策略

---

## 🎯 设计目标

### 核心目标
1. **批量地区控制**：支持按国家、大洲、自定义地区组进行访问控制
2. **灵活策略配置**：支持白名单、黑名单、限流三种模式
3. **路径级 & 全局级**：支持全局规则 + 路径级覆盖
4. **性能优先**：边缘计算环境下，决策延迟 < 5ms

### 非目标
- ❌ 不实现城市级精细控制（当前 Cloudflare 提供的 `cf.city` 可能不准确）
- ❌ 不实现用户级地区偏好设置（超出 API Gateway 范围）

---

## 🏗️ 架构设计

### 1. 数据模型

#### 1.1 地区规则配置（KV 存储）

**KV Key**: `geo-rule:global` 或 `geo-rule:path:{path}`

> ⚠️ 注意：路径级规则的 Key 格式为 `geo-rule:path:/api/users`（包含 `path:` 前缀），以便与全局规则 `geo-rule:global` 区分

```typescript
interface GeoAccessRule {
  id: string;                      // 规则唯一 ID
  name: string;                    // 规则名称（如 "禁止高风险地区"）
  enabled: boolean;                // 是否启用
  mode: 'allow' | 'block' | 'throttle'; // 模式：白名单/黑名单/限流
  priority: number;                // 优先级（数字越小越优先）
  
  // ✅ 修复：添加 scope 和 path 字段
  scope: 'global' | 'path';        // 作用域：全局或路径级
  path?: string;                   // 路径（scope='path' 时必需，支持通配符 /api/users/*）
  
  // 地区匹配配置
  geoMatch: {
    type: 'country' | 'continent' | 'custom'; // 匹配类型
    countries?: string[];          // 国家代码列表（如 ['CN', 'US', 'RU']）
    continents?: string[];         // 大洲代码（如 ['AS', 'EU']）
    customGroups?: string[];       // 自定义地区组（如 'high-risk-regions'）
  };
  
  // 限流配置（仅 mode='throttle' 时有效）
  throttleConfig?: {
    maxRequests: number;           // 最大请求数（改名自 maxRequests，与 RateLimiter DO 的 limit 参数对应）
    windowSeconds: number;         // 时间窗口（秒，与 RateLimiter DO 的 window 参数对应）
    action: 'delay' | 'reject';    // 超限后动作
  };
  
  // 响应配置
  response?: {
    statusCode: number;            // HTTP 状态码（默认 403）
    message: string;               // 错误消息
    headers?: Record<string, string>; // 自定义响应头
  };
  
  // 元数据
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    createdBy?: string;
    comment?: string;              // 规则说明
  };
}

/**
 * 地区规则集合
 * 支持多规则组合（类似防火墙规则链）
 */
interface GeoRuleSet {
  version: number;                 // 配置版本
  defaultAction: 'allow' | 'block'; // 默认动作（规则都不匹配时）
  rules: GeoAccessRule[];          // 规则列表（按 priority 排序）
  lastModified: number;            // 最后修改时间戳
}
```

#### 1.2 自定义地区组（KV 存储）

**KV Key**: `geo-group:{groupName}`

```typescript
interface CustomGeoGroup {
  name: string;                    // 组名（如 'high-risk-regions'）
  description: string;             // 描述
  countries: string[];             // 包含的国家代码列表
  createdAt: Date;
  updatedAt: Date;
}

// 预定义地区组示例
const PRESET_GROUPS = {
  'high-risk': ['AF', 'IQ', 'SY', 'KP', ...],       // 高风险地区
  'gdpr': ['AT', 'BE', 'BG', 'HR', 'CY', ...],      // GDPR 国家
  'asia-pacific': ['CN', 'JP', 'KR', 'SG', ...],    // 亚太地区
  'mainland-china': ['CN'],                          // 中国大陆
};
```

#### 1.3 地区流量统计（D1 存储）

**表名**: `geo_traffic_stats`

```sql
CREATE TABLE IF NOT EXISTS geo_traffic_stats (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,               -- 日期（YYYY-MM-DD）
  country TEXT NOT NULL,            -- 国家代码
  path TEXT,                        -- 路径（NULL 表示全局）
  
  -- 流量统计
  total_requests INTEGER DEFAULT 0,
  blocked_requests INTEGER DEFAULT 0,
  throttled_requests INTEGER DEFAULT 0,
  allowed_requests INTEGER DEFAULT 0,
  
  -- 错误统计
  error_4xx INTEGER DEFAULT 0,
  error_5xx INTEGER DEFAULT 0,
  
  -- 性能指标
  avg_response_time REAL,
  p95_response_time REAL,
  
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_geo_stats_date_country 
  ON geo_traffic_stats(date DESC, country);
  
CREATE INDEX idx_geo_stats_country_path 
  ON geo_traffic_stats(country, path);
```

---

### 2. 核心组件

#### 2.1 地区规则引擎（Middleware）

**性能优化策略**：
- ✅ **内存缓存**：规则加载后缓存 10 分钟（TTL + 版本号）
- ✅ **分层缓存**：全局规则缓存全局、路径级规则按需缓存
- ✅ **并发优化**：规则匹配在内存完成，避免重复 KV 读取

```typescript
/**
 * 地区访问控制中间件
 * 位置：apps/api/src/middleware/geo-access-control.ts
 */

// 内存缓存（类似 IP 规则缓存策略）
const geoRulesCache = new Map<string, { rules: GeoRuleSet; version: number; expireAt: number }>();
const CACHE_TTL = 600000; // 10 分钟

export function geoAccessControlMiddleware() {
  return async (c: Context, next: Next) => {
    const country = c.req.raw.cf?.country as string | undefined;
    const path = new URL(c.req.url).pathname;
    
    // 1. 加载规则（优先路径级，回退到全局级）
    // ✅ 修复：增加路径匹配/降级策略，支持通配符
    // 优先级：精确路径匹配 > 通配符匹配 > 全局规则
    const rules = await loadMatchingGeoRules(c.env, path);
    
    if (!rules || !country) {
      return next(); // 无规则或无地理信息，放行
    }
    
    // 2. 匹配规则（按 priority 排序）
    const matchedRule = findMatchingRule(rules, country);
    
    if (!matchedRule) {
      // 应用默认动作
      if (rules.defaultAction === 'block') {
        return blockResponse(c, 'Default block rule');
      }
      return next();
    }
    
    // 3. 执行动作
    switch (matchedRule.mode) {
      case 'block':
        recordGeoEvent(c.env, country, path, 'blocked');
        return blockResponse(c, matchedRule);
        
      case 'allow':
        recordGeoEvent(c.env, country, path, 'allowed');
        return next();
        
      case 'throttle':
        // ✅ 优化：throttle 检查异步执行，避免阻塞主流程
        const isThrottled = await checkThrottle(c.env, country, path, matchedRule);
        
        if (isThrottled) {
          // ⚠️ 注意：delay 模式会增加响应延迟，建议在低优先级规则中使用
          if (matchedRule.throttleConfig?.action === 'delay') {
            // 记录事件后延迟处理
            recordGeoEventAsync(c.env, country, path, 'throttled');
            await delay(1000); // 延迟 1 秒
            return next();
          } else {
            recordGeoEventAsync(c.env, country, path, 'throttled');
            return throttleResponse(c, matchedRule);
          }
        }
        
        recordGeoEventAsync(c.env, country, path, 'allowed');
        return next();
        
      default:
        return next();
    }
  };
}

/**
 * ✅ 修复：加载匹配的地区规则（支持通配符和降级策略）
 * 优先级：精确路径匹配 > 通配符匹配 > 全局规则
 */
async function loadMatchingGeoRules(
  env: Env,
  path: string
): Promise<GeoRuleSet | null> {
  // 1. 尝试精确路径匹配
  // ✅ 修复：使用完整的 KV Key 格式（geo-rule:path:/api/users）
  const exactMatch = await loadGeoRulesWithCache(env, `geo-rule:path:${path}`);
  if (exactMatch) {
    return exactMatch;
  }
  
  // 2. 尝试通配符匹配（类似现有 findMatchingProxyRoute 逻辑）
  // 从 KV 获取所有路径级规则（可以在规则创建时维护一个索引 KV key: `geo-rules:paths`）
  const allPathRules = await env.API_GATEWAY_STORAGE.get<string[]>('geo-rules:paths', 'json');
  if (allPathRules) {
    // ✅ 修复：按路径长度降序排序，确保更具体的路径模式先被检查
    // 示例：['/api/admin/*', '/api/*', '/'] 而不是 ['/api/*', '/api/admin/*']
    const sortedPaths = allPathRules.sort((a, b) => {
      // 去除通配符后比较长度
      const aLen = a.replace('*', '').length;
      const bLen = b.replace('*', '').length;
      return bLen - aLen; // 降序：更长的路径优先
    });
    
    for (const rulePath of sortedPaths) {
      // 支持通配符 /api/users/* 匹配 /api/users/123
      const pattern = rulePath.replace('*', '');
      if (path.startsWith(pattern)) {
        const wildcardMatch = await loadGeoRulesWithCache(env, `geo-rule:path:${rulePath}`);
        if (wildcardMatch) {
          return wildcardMatch;
        }
      }
    }
  }
  
  // 3. 回退到全局规则
  return await loadGeoRulesWithCache(env, 'geo-rule:global');
}

/**
 * 查找匹配的规则
 */
function findMatchingRule(
  ruleSet: GeoRuleSet, 
  country: string
): GeoAccessRule | null {
  const sortedRules = ruleSet.rules
    .filter(r => r.enabled)
    .sort((a, b) => a.priority - b.priority);
    
  for (const rule of sortedRules) {
    if (isCountryMatch(rule.geoMatch, country)) {
      return rule;
    }
  }
  
  return null;
}

/**
 * 判断国家是否匹配规则
 */
function isCountryMatch(geoMatch: GeoMatch, country: string): boolean {
  // 1. 检查国家列表
  if (geoMatch.countries?.includes(country)) {
    return true;
  }
  
  // 2. 检查大洲（通过国家到大洲的映射表）
  if (geoMatch.continents) {
    const continent = getContinent(country);
    if (geoMatch.continents.includes(continent)) {
      return true;
    }
  }
  
  // 3. 检查自定义组
  if (geoMatch.customGroups) {
    for (const groupName of geoMatch.customGroups) {
      const group = await loadGeoGroup(env, groupName);
      if (group?.countries.includes(country)) {
        return true;
      }
    }
  }
  
  return false;
}
```

#### 2.2 限流器（基于 RateLimiter DO 扩展）

**Key 设计原则**：
- ✅ **唯一性**：`geo:{ruleId}:{country}[:path]`，避免不同规则互相干扰
- ✅ **粒度控制**：支持全局级（无 path）和路径级（有 path）
- ✅ **隔离性**：不同规则使用不同 DO 实例，互不影响
- ✅ **兼容性**：复用现有 RateLimiter DO 的 `ip/limit/window` 参数

```typescript
/**
 * ✅ 修复：地区级限流检查（兼容现有 RateLimiter DO）
 * 复用现有 RateLimiter DO，使用 ip/limit/window 参数
 */
async function checkThrottle(
  env: Env,
  country: string,
  path: string,
  rule: GeoAccessRule
): Promise<boolean> {
  const { maxRequests, windowSeconds } = rule.throttleConfig!;
  
  // ✅ Key 设计：geo:{ruleId}:{country}[:path]
  // 示例：geo:rule-001:CN 或 geo:rule-002:US:/api/users
  // ⚠️ 注意：这里的 "ip" 实际上是地区限流的标识符，RateLimiter DO 通用支持任意字符串作为 key
  const rateLimitKey = rule.scope === 'global' 
    ? `geo:${rule.id}:${country}`
    : `geo:${rule.id}:${country}:${path}`;
  
  // 调用 RateLimiter DO
  const id = env.RATE_LIMITER.idFromName(rateLimitKey);
  const rateLimiter = env.RATE_LIMITER.get(id);
  
  // ✅ 修复：使用现有 DO 期待的参数名（ip/limit/window）
  // 虽然参数名是 "ip"，但实际上可以传递任何标识符
  const checkUrl = new URL('http://dummy/check');
  checkUrl.searchParams.set('ip', rateLimitKey);        // ✅ 使用 'ip' 参数名
  checkUrl.searchParams.set('limit', maxRequests.toString());  // ✅ 使用 'limit' 参数名
  checkUrl.searchParams.set('window', windowSeconds.toString()); // ✅ 使用 'window' 参数名
  
  const response = await rateLimiter.fetch(checkUrl.toString());
  const result = await response.json<{ allowed: boolean }>();
  
  return !result.allowed; // 返回是否被限流
}

/**
 * ⚠️ 重要说明：
 * 
 * RateLimiter DO 当前使用 "ip" 作为参数名，但实际上它只是一个通用的限流键标识符。
 * 在地区限流场景中，我们传递 `geo:${ruleId}:${country}[:path]` 作为 "ip" 参数。
 * 
 * 未来可以考虑优化 RateLimiter DO，使其接受更通用的 "key" 参数名：
 * - checkUrl.searchParams.set('key', rateLimitKey);
 * 
 * 但在当前实现中，为了兼容性，我们继续使用 "ip" 参数名。
 */
```

#### 2.3 统计记录优化（避免每请求写 D1）

**问题**：每请求直接写 `geo_traffic_stats` 会导致 D1 压力过大。

**优化方案**：
1. **复用现有 `traffic_events` 表**：增加 `geo_action` 字段（allowed/blocked/throttled）
2. **异步批量写入**：通过 Queue 异步写入 `traffic_events`
3. **定时聚合**：每小时从 `traffic_events` 聚合到 `geo_traffic_stats`

```typescript
/**
 * 异步记录地区事件（不阻塞主流程）
 */
function recordGeoEventAsync(
  env: Env,
  country: string,
  path: string,
  action: 'allowed' | 'blocked' | 'throttled'
): void {
  // ✅ 方案 1：在现有 traffic_events 中增加 geo_action 字段
  // 通过 path-collector 的 Queue 异步写入，无需新增表
  
  // ⚠️ 注意：不使用 await，避免阻塞主流程
  // 事件会通过现有的 TRAFFIC_QUEUE 批量写入 D1
}

/**
 * 每小时聚合地区流量统计
 * 位置：apps/api/src/scheduled-handler.ts
 */
async function aggregateGeoTrafficStats(env: Env): Promise<void> {
  const since = Date.now() - 3600000; // 最近 1 小时
  const today = new Date().toISOString().slice(0, 10);
  
  // ✅ 从 traffic_events 聚合数据（复用现有表结构）
  const result = await env.D1.prepare(`
    SELECT 
      country,
      path,
      COUNT(*) as total_requests,
      SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END) as errors,
      AVG(response_time) as avg_response_time
    FROM traffic_events
    WHERE timestamp > ? AND country IS NOT NULL
    GROUP BY country, path
  `).bind(since).all();
  
  // 批量插入/更新统计表
  for (const row of result.results) {
    const id = `${today}:${row.country}:${row.path || 'global'}`;
    
    await env.D1.prepare(`
      INSERT INTO geo_traffic_stats (
        id, date, country, path, 
        total_requests, error_4xx, avg_response_time,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        total_requests = total_requests + excluded.total_requests,
        error_4xx = error_4xx + excluded.error_4xx,
        avg_response_time = (avg_response_time + excluded.avg_response_time) / 2,
        updated_at = excluded.updated_at
    `).bind(
      id, today, row.country, row.path,
      row.total_requests, row.errors, row.avg_response_time,
      Date.now(), Date.now()
    ).run();
  }
}
```

---

### 3. API 设计

#### 3.1 规则管理 API

```typescript
// 获取地区规则列表
GET /api/admin/geo/rules?scope=global|path&path=/api/users

// 创建地区规则
POST /api/admin/geo/rules
{
  "scope": "global" | "path",
  "path": "/api/users", // 仅 scope=path 时需要
  "rule": {
    "name": "阻止高风险地区",
    "mode": "block",
    "geoMatch": {
      "type": "custom",
      "customGroups": ["high-risk"]
    }
  }
}

// 更新地区规则
PUT /api/admin/geo/rules/:ruleId

// 删除地区规则
DELETE /api/admin/geo/rules/:ruleId

// 批量启用/禁用规则
PATCH /api/admin/geo/rules/bulk-toggle
{
  "ruleIds": ["rule-1", "rule-2"],
  "enabled": false
}
```

#### 3.2 地区组管理 API

```typescript
// 获取地区组列表
GET /api/admin/geo/groups

// 创建自定义地区组
POST /api/admin/geo/groups
{
  "name": "asia-gaming",
  "description": "亚洲游戏热门地区",
  "countries": ["CN", "JP", "KR", "TW", "HK"]
}

// 更新地区组
PUT /api/admin/geo/groups/:groupName

// 删除地区组
DELETE /api/admin/geo/groups/:groupName
```

#### 3.3 地区统计 API

```typescript
// 获取地区流量 Top N
GET /api/admin/geo/stats/top?range=7d&limit=20&metric=requests|blocked|throttled

// 获取特定地区的流量趋势
GET /api/admin/geo/stats/country/:countryCode?range=7d

// 获取地区级访问热力图数据
GET /api/admin/geo/stats/heatmap?range=24h
```

---

### 4. 前端 UI 设计

#### 4.1 地区规则管理页面

**路径**: `/geo-rules`

**功能模块**：
1. **规则列表**：
   - 展示所有规则（全局 + 路径级）
   - 支持按作用域、模式、状态筛选
   - 支持拖拽调整优先级
   - 支持批量启用/禁用

2. **规则创建/编辑表单**：
   - 作用域选择（全局/路径）
   - 模式选择（白名单/黑名单/限流）
   - 地区匹配配置：
     - 国家多选（支持搜索）
     - 大洲多选
     - 自定义组多选
   - 限流参数配置（仅限流模式）
   - 响应配置（状态码、消息）

3. **规则测试工具**：
   - 输入国家代码/路径，模拟匹配结果
   - 显示匹配到的规则和最终动作

#### 4.2 地区组管理页面

**路径**: `/geo-groups`

**功能**：
- 预定义组展示（只读）
- 自定义组 CRUD
- 地区组可视化（地图 + 国家列表）

#### 4.3 地区流量统计页面

**路径**: `/geo-stats`

**功能**：
- 地区流量 Top 20（请求量、封禁量、限流量）
- 地区热力图（ECharts Geo + 颜色深浅表示流量）
- 特定地区的流量趋势图
- 告警：异常地区流量突增

---

### 4.4 前端实现对比分析

#### ✅ 与 IP 监控界面的相似度（可复用 ~70% 代码）

| 功能模块 | IP 监控 | 地区控制 | 复用度 | 说明 |
|---------|---------|---------|--------|------|
| **页面布局** | Tabs（IP列表/规则） | Tabs（规则/地区组/统计） | 90% | 整体结构相同 |
| **统计卡片** | 总IP数/封禁数/限流数 | 总规则数/封禁次数/限流次数 | 95% | 仅统计维度不同 |
| **搜索/筛选** | IP搜索、日期筛选 | 规则搜索、作用域筛选 | 85% | 筛选条件不同 |
| **规则表格** | IP/模式/配置/操作 | 规则名/作用域/地区/模式/操作 | 75% | 列数增加 |
| **创建表单** | IP+模式+限流+原因 | 作用域+模式+地区选择+限流 | 70% | 核心差异在地区选择 |
| **操作按钮** | 删除/查看详情 | 删除/编辑/启用切换 | 80% | 增加启用切换 |

#### 🔄 核心差异（需新增约 30% 代码）

**1. 地区选择器（新增组件 ~200 行）**

```typescript
// apps/web/src/features/geo-rules/components/geo-selector.tsx
import { MultiSelect } from '@/components/ui/multi-select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface GeoSelectorProps {
  value: {
    type: 'country' | 'continent' | 'custom'
    countries?: string[]
    continents?: string[]
    customGroups?: string[]
  }
  onChange: (value: GeoMatch) => void
  customGroups?: Array<{ name: string; description: string }>
}

export function GeoSelector({ value, onChange, customGroups = [] }: GeoSelectorProps) {
  return (
    <Tabs value={value.type} onValueChange={(t) => onChange({ ...value, type: t })}>
      <TabsList>
        <TabsTrigger value="country">按国家</TabsTrigger>
        <TabsTrigger value="continent">按大洲</TabsTrigger>
        <TabsTrigger value="custom">自定义组</TabsTrigger>
      </TabsList>
      
      <TabsContent value="country">
        {/* 国家多选下拉框 + 搜索（使用项目已有的 MultiSelect） */}
        <MultiSelect
          options={COUNTRY_OPTIONS} // { value: 'CN', label: '🇨🇳 中国' }
          value={value.countries || []}
          onValueChange={(countries) => onChange({ ...value, countries })}
          placeholder="选择国家..."
          maxCount={5}
        />
      </TabsContent>
      
      <TabsContent value="continent">
        {/* 大洲多选（使用基础 Checkbox + 手动布局） */}
        <div className="space-y-3">
          {CONTINENT_OPTIONS.map((continent) => (
            <div key={continent.value} className="flex items-center space-x-2">
              <Checkbox
                id={`continent-${continent.value}`}
                checked={value.continents?.includes(continent.value)}
                onCheckedChange={(checked) => {
                  const newContinents = checked
                    ? [...(value.continents || []), continent.value]
                    : (value.continents || []).filter((c) => c !== continent.value)
                  onChange({ ...value, continents: newContinents })
                }}
              />
              <Label htmlFor={`continent-${continent.value}`} className="cursor-pointer">
                {continent.label}
              </Label>
            </div>
          ))}
        </div>
      </TabsContent>
      
      <TabsContent value="custom">
        {/* 自定义组多选（使用 MultiSelect） */}
        <MultiSelect
          options={customGroups.map(g => ({ value: g.name, label: g.name }))}
          value={value.customGroups || []}
          onValueChange={(groups) => onChange({ ...value, customGroups: groups })}
          placeholder="选择地区组..."
          maxCount={5}
        />
      </TabsContent>
    </Tabs>
  )
}

// 国家选项（示例）
const COUNTRY_OPTIONS = [
  { value: 'CN', label: '🇨🇳 中国' },
  { value: 'US', label: '🇺🇸 美国' },
  { value: 'JP', label: '🇯🇵 日本' },
  // ... 完整的国家列表
]

// 大洲选项
const CONTINENT_OPTIONS = [
  { value: 'AS', label: '🌏 亚洲 (Asia)' },
  { value: 'EU', label: '🇪🇺 欧洲 (Europe)' },
  { value: 'NA', label: '🌎 北美洲 (North America)' },
  { value: 'SA', label: '🌎 南美洲 (South America)' },
  { value: 'AF', label: '🌍 非洲 (Africa)' },
  { value: 'OC', label: '🌏 大洋洲 (Oceania)' },
]
```

**对比 IP 监控表单**：
- IP 监控：1 个文本输入框（`<Input type="text" />` ，支持 IP/CIDR）
- 地区控制：1 个复合组件（`<GeoSelector />`，包含 3 种模式切换）
- **新增工作量**：~200 行（含国家列表数据 + Checkbox 布局逻辑）

**⚠️ 实现说明**：
- **国家选择**：使用项目已有的 `MultiSelect` 组件（`@/components/ui/multi-select.tsx`），支持搜索和批量选择
- **大洲选择**：使用基础 `Checkbox` 组件（`@/components/ui/checkbox.tsx`）+ 手动布局，因为项目中没有 `CheckboxGroup` 封装
- **自定义组选择**：同样使用 `MultiSelect` 组件，确保一致性
- **注意**：Radix UI 的 `Select` 仅支持单选，不能使用 `multiple` 属性

---

**2. 作用域选择（新增字段 ~30 行）**

```typescript
// IP 监控：没有作用域概念
// 地区控制：需要选择 global/path

<Select value={scope} onValueChange={setScope}>
  <SelectItem value="global">
    <Globe className="h-4 w-4" />
    全局规则（影响所有路径）
  </SelectItem>
  <SelectItem value="path">
    <Route className="h-4 w-4" />
    路径级规则
  </SelectItem>
</Select>

{scope === 'path' && (
  <Input
    placeholder="/api/users 或 /api/users/*"
    value={path}
    onChange={(e) => setPath(e.target.value)}
  />
)}
```

**对比 IP 监控表单**：
- IP 监控：无此字段
- 地区控制：新增 2 个字段（作用域选择 + 路径输入）
- **新增工作量**：~30 行

---

**3. 优先级调整（新增功能 ~100 行）**

```typescript
// IP 监控：规则无优先级概念
// 地区控制：支持拖拽调整优先级（类似防火墙规则）

import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd'

function GeoRulesList({ rules, onReorder }: Props) {
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return
    
    const newRules = Array.from(rules)
    const [moved] = newRules.splice(result.source.index, 1)
    newRules.splice(result.destination.index, 0, moved)
    
    // 更新 priority
    const updated = newRules.map((r, i) => ({ ...r, priority: i + 1 }))
    onReorder(updated)
  }
  
  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="rules">
        {(provided) => (
          <div {...provided.droppableProps} ref={provided.innerRef}>
            {rules.map((rule, index) => (
              <Draggable key={rule.id} draggableId={rule.id} index={index}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.draggableProps}>
                    <GripVertical {...provided.dragHandleProps} />
                    {/* 规则内容 */}
                  </div>
                )}
              </Draggable>
            ))}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  )
}
```

**对比 IP 监控表格**：
- IP 监控：静态表格，按创建时间排序
- 地区控制：可拖拽表格，按 priority 排序
- **新增工作量**：~100 行（含拖拽库集成）

---

**4. 地区组管理页面（全新页面 ~300 行）**

```typescript
// apps/web/src/features/geo-groups/index.tsx

export default function GeoGroupManagement() {
  const { groups, createGroup, updateGroup, deleteGroup } = useGeoGroups()
  
  return (
    <div className="space-y-6">
      {/* 预定义组（只读卡片） */}
      <Card>
        <CardHeader>
          <CardTitle>预定义地区组</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {PRESET_GROUPS.map(group => (
              <PresetGroupCard key={group.name} group={group} />
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* 自定义组（可编辑表格） */}
      <Card>
        <CardHeader>
          <CardTitle>自定义地区组</CardTitle>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus /> 创建地区组
          </Button>
        </CardHeader>
        <CardContent>
          <GeoGroupsTable data={groups} onEdit={...} onDelete={...} />
        </CardContent>
      </Card>
      
      {/* 创建/编辑对话框 */}
      <CreateGeoGroupDialog ... />
    </div>
  )
}
```

**对比 IP 监控**：
- IP 监控：无此功能
- 地区控制：全新页面
- **新增工作量**：~300 行（含表格 + 表单 + 地图可视化）

---

**5. 地区统计页面（全新页面 ~400 行）**

```typescript
// apps/web/src/features/geo-stats/index.tsx

export default function GeoStatistics() {
  const { stats, topCountries, heatmapData } = useGeoStats({ range: '7d' })
  
  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="总请求" value={stats.totalRequests} />
        <StatCard title="封禁次数" value={stats.blocked} />
        <StatCard title="限流次数" value={stats.throttled} />
        <StatCard title="覆盖国家" value={stats.countries} />
      </div>
      
      {/* 地区流量 Top 20 */}
      <Card>
        <CardHeader>
          <CardTitle>地区流量 Top 20</CardTitle>
        </CardHeader>
        <CardContent>
          <CountryRankingTable data={topCountries} />
        </CardContent>
      </Card>
      
      {/* 地区热力图（ECharts） */}
      <Card>
        <CardHeader>
          <CardTitle>全球流量热力图</CardTitle>
        </CardHeader>
        <CardContent>
          <GeoHeatmap data={heatmapData} />
        </CardContent>
      </Card>
    </div>
  )
}
```

**对比 IP 监控**：
- IP 监控：有 IP 列表统计，但无地理维度
- 地区控制：全新页面，增加地图可视化
- **新增工作量**：~400 行（含 ECharts 集成）

---

#### 📊 前端工作量总结

| 模块 | 复用 IP 监控代码 | 新增代码 | 总工时 |
|------|-----------------|---------|--------|
| 规则列表页（基础） | 70% (~300 行) | 地区选择器 (~200 行) | 1 天 |
| 规则表单（基础） | 70% (~200 行) | 作用域选择 (~30 行) | 0.5 天 |
| 优先级拖拽 | 0% | 拖拽逻辑 (~100 行) | 0.5 天 |
| 地区组管理页 | 0% | 全新页面 (~300 行) | 1 天 |
| 地区统计页 | 30% (~100 行) | 地图热力图 (~400 行) | 1.5 天 |
| API Hooks | 80% | 地区专属 API (~100 行) | 0.5 天 |
| **总计** | **~600 行复用** | **~1130 行新增** | **5-6 天** |

---

#### 🎨 前端技术栈（与 IP 监控一致）

- **框架**: React 19.1.1 + TypeScript
- **路由**: TanStack Router
- **状态管理**: TanStack Query（React Query）
- **UI 组件**: Shadcn/ui（基于 Radix UI）
  - **已有组件**: MultiSelect（多选下拉）、Checkbox（复选框）、Tabs、Label 等
- **表单**: React Hook Form + Zod 验证
- **表格**: TanStack Table
- **拖拽**: @hello-pangea/dnd（React DnD 继承者）
- **图表**: ECharts（地图热力图）
- **图标**: Lucide React

---

#### 🚀 前端开发建议

**Phase 1：复用为主（2-3 天）**
1. 复制 `ip-monitor` 目录为 `geo-rules`
2. 修改数据模型和 API 调用
3. 替换 IP 输入框为地区选择器
4. 添加作用域选择字段

**Phase 2：增强功能（1-2 天）**
5. 实现优先级拖拽排序
6. 实现规则测试工具

**Phase 3：新增页面（2-3 天）**
7. 实现地区组管理页面
8. 实现地区统计页面（含热力图）

**总工时**：5-8 天（前端全职开发）

---

#### 🔍 关键差异点对比

| 维度 | IP 监控 | 地区访问控制 | 变化大小 |
|------|---------|-------------|---------|
| **标识符** | IP 地址/CIDR | 国家代码/大洲/地区组 | ⭐⭐⭐ |
| **选择器** | 文本输入 | 多选下拉 + 搜索 | ⭐⭐⭐⭐ |
| **作用域** | 全局 | 全局/路径级 | ⭐⭐⭐ |
| **优先级** | 无 | 可拖拽调整 | ⭐⭐⭐⭐ |
| **分组管理** | 无 | 预定义+自定义地区组 | ⭐⭐⭐⭐⭐ |
| **统计可视化** | 表格 | 表格 + 地图热力图 | ⭐⭐⭐⭐ |
| **测试工具** | 无 | 规则匹配模拟器 | ⭐⭐⭐ |

**变化评级**：⭐ = 轻微，⭐⭐⭐⭐⭐ = 重大

---

## 🔀 执行顺序与规则优先级

### 中间件执行顺序

**推荐顺序**（从上到下执行）：

```
1. 身份认证（Authentication）
2. IP 封禁/限流（IP Access Control） ⬅️ 先执行 IP 规则
3. 地区访问控制（Geo Access Control） ⬅️ 再执行地区规则
4. 路径级限流（Path Rate Limit）
5. 缓存中间件（Cache Middleware）
6. 业务逻辑（Application Handler）
```

**原因**：
- ✅ **IP 规则优先**：恶意 IP 直接封禁，无需检查地区
- ✅ **地区规则次之**：按地区批量控制，减少后续处理
- ✅ **路径限流最后**：细粒度控制，仅针对通过前置检查的请求

### 地区规则优先级说明

#### 规则匹配顺序
1. **路径级规则优先**：如果路径配置了地区规则，优先使用
2. **全局规则兜底**：路径无规则时，使用全局规则
3. **按 priority 排序**：数字越小越优先（0 > 1 > 2 > ...）
4. **短路执行**：匹配到第一条规则后立即执行，不再检查后续规则

#### 示例配置

**场景 1：默认封禁 + 白名单**
```json
{
  "defaultAction": "block",
  "rules": [
    {
      "id": "rule-001",
      "priority": 1,
      "mode": "allow",
      "geoMatch": { "countries": ["US", "GB", "JP"] }
    }
  ]
}
```
✅ 结果：仅允许美国、英国、日本访问，其他地区全部封禁。

**场景 2：默认放行 + 黑名单**
```json
{
  "defaultAction": "allow",
  "rules": [
    {
      "id": "rule-002",
      "priority": 1,
      "mode": "block",
      "geoMatch": { "customGroups": ["high-risk"] }
    }
  ]
}
```
✅ 结果：仅封禁高风险地区，其他地区全部放行。

**场景 3：多规则组合**
```json
{
  "defaultAction": "allow",
  "rules": [
    {
      "id": "rule-003",
      "priority": 1,
      "mode": "block",
      "geoMatch": { "countries": ["KP", "IQ"] }
    },
    {
      "id": "rule-004",
      "priority": 2,
      "mode": "throttle",
      "geoMatch": { "countries": ["CN", "IN"] },
      "throttleConfig": { "maxRequests": 100, "windowSeconds": 60 }
    }
  ]
}
```
✅ 结果：
- 朝鲜、伊拉克 → 直接封禁（优先级 1）
- 中国、印度 → 限流（优先级 2，100 req/min）
- 其他地区 → 放行（默认 allow）

⚠️ **注意事项**：
- **避免规则冲突**：同一地区不要在多条规则中出现
- **测试工具验证**：规则创建后使用测试工具模拟请求
- **灰度发布**：新规则先在测试环境验证，再发布生产

---

## 🚀 实施计划

### MVP 范围建议（5-7 天）

**核心功能**（优先实现）：
- ✅ **基础中间件**：地区规则匹配 + 内存缓存
- ✅ **两种模式**：`allow` 和 `block`（暂不实现 `throttle`）
- ✅ **两种匹配**：国家列表 + 预定义地区组（暂不支持自定义组）
- ✅ **全局规则**：仅支持全局级配置（暂不支持路径级）
- ✅ **规则管理 API**：CRUD 接口
- ✅ **前端 UI**：规则列表 + 创建/编辑表单
- ✅ **基础统计**：复用 `traffic_events` 表，增加 `geo_action` 字段

**延后功能**：
- ⏸️ `throttle` 模式（Phase 2）
- ⏸️ 自定义地区组（Phase 2）
- ⏸️ 路径级规则（Phase 2）
- ⏸️ 地区流量热力图（Phase 3）
- ⏸️ 地区级告警（Phase 3）

**MVP 时间表**：
| 任务 | 工时 | 备注 |
|------|------|------|
| 数据模型 + D1 表 | 0.5 天 | traffic_events 增加 geo_action |
| 中间件 + 规则引擎 | 1.5 天 | 仅 allow/block，全局规则 |
| 规则管理 API | 1 天 | CRUD + 验证 |
| 前端 UI（规则管理） | 2 天 | 列表 + 表单 |
| 测试 + 文档 | 0.5 天 | 单元测试 + 用户文档 |
| **总计** | **5.5 天** | - |

---

### 完整版实施计划（11-15 天）

### Phase 1: 基础架构（3-4 天）

**任务**：
1. 创建数据模型和 D1 表结构
2. 实现 `geo-access-control.ts` 中间件
3. 实现规则加载和匹配逻辑
4. 集成到现有 Hono 路由链

**交付物**：
- D1 migration: `0006_create_geo_access_control.sql`
- Middleware: `geo-access-control.ts`
- 单元测试覆盖规则匹配逻辑

### Phase 2: 规则管理 API（2-3 天）

**任务**：
1. 实现规则 CRUD API
2. 实现地区组管理 API
3. 实现规则验证和冲突检测

**交付物**：
- API 路由: `routes/admin/geo-rules.ts`
- API 路由: `routes/admin/geo-groups.ts`
- API 文档更新

### Phase 3: 统计与监控（2 天）

**任务**：
1. 实现地区流量统计聚合
2. 实现地区统计查询 API
3. 添加地区级告警规则

**交付物**：
- Scheduled task: `aggregateGeoTrafficStats`
- API 路由: `routes/admin/geo-stats.ts`
- Dashboard 告警集成

### Phase 4: 前端 UI（3-4 天）

**任务**：
1. 实现地区规则管理页面
2. 实现地区组管理页面
3. 实现地区统计页面（含热力图）
4. 集成到现有 Admin 界面

**交付物**：
- UI 组件: `features/geo-rules/`
- UI 组件: `features/geo-groups/`
- UI 组件: `features/geo-stats/`

### Phase 5: 测试与优化（1-2 天）

**任务**：
1. 端到端测试
2. 性能测试（规则匹配延迟）
3. 文档完善

**交付物**：
- 测试用例
- 性能报告
- 用户文档

**总计**: 11-15 天（约 2-3 周）

---

## ⚠️ 风险与挑战

### 技术风险

1. **规则匹配性能**
   - **风险**: 复杂规则集（>100 条）可能导致延迟增加
   - **缓解**: 
     - 使用内存缓存（10 分钟 TTL）
     - 规则按 priority 排序，匹配后立即返回
     - 预编译规则树（Trie 结构）

2. **KV 一致性**
   - **风险**: KV 最终一致性可能导致规则更新延迟
   - **缓解**:
     - 提示用户规则生效需要 1-2 分钟
     - 提供"强制刷新"按钮，清除缓存

3. **地理位置准确性**
   - **风险**: Cloudflare `cf.country` 可能不准确（VPN/代理）
   - **缓解**:
     - 仅用于辅助决策，不用于绝对安全
     - 结合 IP 封禁使用

### 业务风险

1. **误封风险**
   - **风险**: 规则配置错误导致正常用户无法访问
   - **缓解**:
     - 规则测试工具
     - 灰度发布（先在测试环境验证）
     - 紧急关闭开关

2. **合规风险**
   - **风险**: 地区限制可能违反某些地区的法律
   - **缓解**:
     - 明确告知用户地区限制的法律责任
     - 提供合规性建议（如 GDPR）

---

## 📊 性能目标

| 指标 | 目标 | 备注 |
|------|------|------|
| 规则匹配延迟 | < 5ms | P95 |
| KV 读取延迟 | < 10ms | P95 |
| 规则集大小上限 | 500 条 | 超过建议优化 |
| 地区组大小上限 | 100 个国家/组 | 无硬性限制 |

---

## 🔄 后续扩展

### 优先级 P1
- 地区级 A/B 测试（不同地区返回不同版本）
- 地区级 CDN 优化（按地区选择最近的上游）

### 优先级 P2
- 地区级定价策略
- 地区级内容审核

---

## 📝 附录

### A. 国家代码映射表

```typescript
// ISO 3166-1 alpha-2 国家代码到大洲的映射
const COUNTRY_TO_CONTINENT: Record<string, string> = {
  'CN': 'AS', // 亚洲
  'US': 'NA', // 北美洲
  'GB': 'EU', // 欧洲
  'JP': 'AS',
  'DE': 'EU',
  // ... 完整列表
};
```

### B. 预定义地区组

```typescript
const PRESET_GEO_GROUPS = {
  'high-risk': {
    name: '高风险地区',
    countries: ['AF', 'IQ', 'SY', 'KP', 'IR', 'LY'],
    description: '国际制裁或高安全风险地区'
  },
  'gdpr': {
    name: 'GDPR 适用国家',
    countries: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', ...],
    description: '欧盟 GDPR 适用国家'
  },
  'asia-pacific': {
    name: '亚太地区',
    countries: ['CN', 'JP', 'KR', 'SG', 'TH', 'VN', 'IN', ...],
    description: '亚洲和太平洋地区'
  }
};
```

### C. 示例配置

```json
{
  "version": 1,
  "defaultAction": "allow",
  "rules": [
    {
      "id": "rule-001",
      "name": "阻止高风险地区",
      "enabled": true,
      "mode": "block",
      "priority": 1,
      "geoMatch": {
        "type": "custom",
        "customGroups": ["high-risk"]
      },
      "response": {
        "statusCode": 403,
        "message": "Access denied from your region"
      }
    },
    {
      "id": "rule-002",
      "name": "中国大陆限流",
      "enabled": true,
      "mode": "throttle",
      "priority": 2,
      "geoMatch": {
        "type": "country",
        "countries": ["CN"]
      },
      "throttleConfig": {
        "maxRequests": 100,
        "windowSeconds": 60,
        "action": "reject"
      }
    }
  ]
}
```

---

## ✅ 验收标准

1. **功能完整性**：
   - ✅ 支持全局和路径级地区规则
   - ✅ 支持白名单、黑名单、限流三种模式
   - ✅ 支持国家、大洲、自定义组三种匹配方式
   - ✅ 前端完整的 CRUD 界面

2. **性能要求**：
   - ✅ 规则匹配延迟 P95 < 5ms
   - ✅ 支持 500 条规则不降级

3. **可用性**：
   - ✅ 规则更新后 2 分钟内生效
   - ✅ 误封率 < 0.1%（通过测试验证）

4. **文档完整**：
   - ✅ API 文档
   - ✅ 用户使用手册
   - ✅ 运维文档

---

## 🔧 关键问题修复（v1.3）

### ❗ 高优问题 1：KV Key 前缀不一致

**问题描述**：
- `loadMatchingGeoRules` 传入 `path:${path}` 给 `loadGeoRulesWithCache`
- 但数据模型定义 KV Key 为 `geo-rule:{path}`
- 导致拼接出错误的 key `geo-rule:path:/api/...`，所有路径级规则加载失败

**修复方案**：
```typescript
// ✅ 统一 KV Key 格式
// 数据模型：geo-rule:global 或 geo-rule:path:{path}
// 调用示例：
const exactMatch = await loadGeoRulesWithCache(env, `geo-rule:path:${path}`);
const globalMatch = await loadGeoRulesWithCache(env, `geo-rule:global`);
```

**实现位置**：
- 数据模型：`docs/geo-access-control.plan.md:38`
- 调用代码：`docs/geo-access-control.plan.md:247, 269, 278`

---

### ❗ 高优问题 2：通配符匹配排序错误

**问题描述**：
- 使用 `allPathRules.sort()` 没有比较函数，按字典序排序
- 导致 `/api/*` 排在 `/api/admin/*` 之前
- 更泛化的规则先命中，覆盖更具体的规则

**修复方案**：
```typescript
// ✅ 按路径长度降序排序（更具体的路径优先）
const sortedPaths = allPathRules.sort((a, b) => {
  const aLen = a.replace('*', '').length;
  const bLen = b.replace('*', '').length;
  return bLen - aLen; // 降序
});

// 示例结果：
// ['/api/admin/*', '/api/*', '/*']  ✅ 正确
// 而不是 ['/api/*', '/api/admin/*', '/*']  ❌ 错误
```

**实现位置**：`docs/geo-access-control.plan.md:258-263`

---

### ❗ 高优问题 3：RateLimiter DO 调用不兼容

**问题描述**：
- 方案中使用 `maxRequests/windowSeconds` 参数调用 RateLimiter DO
- 现有 RateLimiter DO 期待 `ip/limit/window` 参数
- 导致 DO 返回 400，地区限流完全失效

**修复方案**：
```typescript
// ❌ 错误写法
checkUrl.searchParams.set('maxRequests', maxRequests.toString());
checkUrl.searchParams.set('windowSeconds', windowSeconds.toString());

// ✅ 正确写法（兼容现有 RateLimiter DO）
checkUrl.searchParams.set('ip', rateLimitKey);      // 使用地区限流标识符作为 "ip"
checkUrl.searchParams.set('limit', maxRequests.toString());
checkUrl.searchParams.set('window', windowSeconds.toString());
```

**实现位置**：`docs/geo-access-control.plan.md:356-358`

---

### ❗ 高优问题 4：scope 字段缺失

**问题描述**：
- 速率键设计依赖 `rule.scope` 字段区分全局/路径级
- `GeoAccessRule` 数据模型中缺少 `scope` 字段
- 导致全局规则被误判为路径规则，计数器碎片化

**修复方案**：
```typescript
interface GeoAccessRule {
  // ... existing fields
  
  // ✅ 新增字段
  scope: 'global' | 'path';        // 作用域：全局或路径级
  path?: string;                   // 路径（scope='path' 时必需，支持通配符 /api/users/*）
  
  // ... rest of fields
}
```

**实现位置**：`docs/geo-access-control.plan.md:49-50`

---

**文档版本**: v1.4 🔧  
**创建日期**: 2025-10-18  
**最后更新**: 2025-10-18  
**作者**: Claude  
**状态**: 已修复 ✅  

**更新日志**：
- v1.4 (2025-10-18): 修复前端示例代码问题：
  - ✅ 修正地区选择器代码，使用项目已有的 `MultiSelect` 组件（支持搜索）
  - ✅ 修正大洲选择器，使用基础 `Checkbox` 组件而非不存在的 `CheckboxGroup`
  - ✅ 修正自定义组选择器，使用 `MultiSelect` 而非不支持 multiple 的 `Select`
  - ✅ 更新 React 版本信息为 19.1.1（与项目实际版本一致）
- v1.3 (2025-10-18): 修复2个关键问题：
  - ✅ 统一 KV Key 格式为 `geo-rule:path:{path}`，修复路径级规则加载失败问题
  - ✅ 通配符匹配按路径长度降序排序，确保更具体的规则优先匹配
  - ✅ 补充前端实现对比分析（vs IP 监控），明确 70% 代码复用度和 30% 新增功能
- v1.2 (2025-10-18): 修复3个关键问题：RateLimiter 调用兼容性、scope 字段缺失、路径匹配逻辑
- v1.1 (2025-10-18): 补充性能优化、执行顺序、MVP 范围等关键细节
- v1.0 (2025-10-18): 初始版本

