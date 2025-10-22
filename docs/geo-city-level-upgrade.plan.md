# 城市级地区访问控制改造方案

> 💡 **个人项目适配版本**：本方案已针对单人开发场景进行简化，移除了繁琐的审批流程和多方协作环节，但保留了核心技术决策和质量保障步骤。

## 🚀 快速开始（个人开发者）

### 🎁 Quick Win：IP 监控页面先显示城市（30 分钟，可选）

> 💡 **立即可做**：在正式实施城市级访问控制前，可以先用 30 分钟让 IP 监控页面显示 Cloudflare 原始城市数据，立即看到效果！

**背景**：
- 当前 IP 监控页面"主要来源"只显示国家
- Cloudflare 的 `cf.city` 数据已经在 `traffic_events.city` 中采集
- 但聚合层（`ip-aggregator.ts`）没有汇总城市信息

**快速方案**（工作量 30 分钟）：
```typescript
// 步骤 1: 在 ip_traffic_daily 聚合时保存最后一次的城市
// apps/api/src/lib/ip-aggregator.ts (新增字段)
{
  ip: '1.2.3.4',
  date: '2025-10-20',
  requests: 1234,
  primaryCountry: 'CN',
  lastSeenCity: 'Beijing',  // ← 新增：最后一次出现的城市
  // ...
}

// 步骤 2: 接口返回 rawCity 字段
// apps/api/src/routes/admin/ip-monitor.ts
{
  ip: '1.2.3.4',
  primaryCountry: { name: '中国', code: 'CN', count: 1234 },
  rawCity: 'Beijing',  // ← 新增：原始城市字符串
  // ...
}

// 步骤 3: 前端显示（替换或补充国家）
// apps/web/src/features/ip-monitor/components/ip-list-table.tsx:155
<div>
  {row.rawCity ? `${row.rawCity}, ${row.primaryCountry.name}` : row.primaryCountry.name}
</div>
```

**优点**：
- ✅ 30 分钟即可完成
- ✅ 立即看到 Cloudflare 返回的城市数据
- ✅ 验证城市数据质量（为 Phase 0 Spike 提供依据）
- ✅ 独立于城市级访问控制方案，可先做

**缺点**：
- ⚠️ 原始城市名称可能有大小写/语言不统一（"Beijing" vs "北京"）
- ⚠️ 未经过标准化处理

**建议**：
- 如果想立即看到城市信息 → 先做这个 Quick Win
- 之后实施完整的城市级方案 → 替换为标准化的城市聚合

详细实现见：[Quick Win 实施指南](#-quick-win-ip-监控显示原始城市30-分钟)

---

### 📋 正式方案（城市级访问控制）

**如果时间紧张，只看这 3 个章节**：

1. **[下一步行动](#-下一步行动个人项目版)**（第 3 步启动流程）
   - Step 1: 快速决策（30 分钟）
   - Step 2: Spike 验证（1-2 小时，必做）
   - Step 3: 连续开发 + 上线（2-3 天）

2. **[GeoNames 导入脚本规范](#-geonames-导入脚本规范)**（实现细节）
   - 脚本接口定义和使用示例
   - 5 步处理流程

3. **[上线验收清单](#-上线验收清单go-live-checklist)**（质量把控）
   - 极简版：7 项绝对不能跳过的检查
   - 完整版：74 项详细验收点（按需参考）

**推荐执行路径**：周末突击（3 天上线）
```
周六：Spike 验证（2h）+ 后端开发（4h）+ 前端开发（3h）
周日：Test 环境观察 24h
周一：生产上线
```

---

## 📋 项目概述

### 当前状态
- ✅ 已实现国家级地区访问控制（87 个国家）
- ✅ 支持国家、大洲、预定义组三种匹配方式
- ✅ Cloudflare 已提供 `cf.city`、`cf.country`、`cf.region` 数据
- ✅ `traffic_events` 表已记录城市信息

### 改造目标
将地区规则控制粒度从**国家级**扩展到**城市级**，支持：
- 按城市名称匹配访问规则
- 城市坐标可视化（地图显示）
- 城市级流量统计和分析

### 工作量评估
- **总工时**：11-17 小时
- **复杂度**：中等（小项目级别）
- **主要挑战**：城市数据源选择、名称标准化、数据量控制

---

## 🎯 技术方案

### 方案架构

```
┌─────────────────────────────────────────────────────────────┐
│                      城市级访问控制                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. 数据源层                                                  │
│     ├─ GeoNames 城市数据库（15,000 主要城市）                │
│     ├─ 城市名称标准化表（别名映射）                           │
│     └─ 城市坐标表（经纬度）                                   │
│                                                               │
│  2. 存储层                                                    │
│     ├─ KV: 规则配置（geoMatch.cities）                       │
│     ├─ 内存缓存: 城市映射表（Worker 启动时加载）              │
│     └─ D1: 城市级流量统计                                    │
│                                                               │
│  3. 业务层                                                    │
│     ├─ 中间件: 城市匹配逻辑                                   │
│     ├─ 管理 API: 城市规则 CRUD                               │
│     └─ 统计 API: 城市维度聚合                                │
│                                                               │
│  4. 前端层                                                    │
│     ├─ 城市选择器（搜索、联想、分组）                         │
│     ├─ 地图可视化（城市标记）                                 │
│     └─ 城市流量报表                                          │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔑 关键决策点

### 1. 城市数据源选择

#### 选项 A：GeoNames（推荐）
- **优点**：
  - 开源免费（CC BY 4.0 协议）
  - 全球覆盖 1100 万+地名，主要城市 15,000+
  - 提供多语言名称（中英文等）
  - 包含经纬度、国家代码、人口数据
  - 每日更新，可定期同步
- **缺点**：
  - 数据量大（完整版 1.5GB，需筛选）
  - 需要自建导入脚本
- **数据示例**：
  ```
  geonameid,name,asciiname,alternatenames,latitude,longitude,country_code,population
  1816670,Beijing,Beijing,北京|Peking|...,39.9075,116.39723,CN,21540000
  5128581,New York,New York,NYC|Nueva York|...,40.71427,-74.00597,US,8175133
  ```
- **数据源**：https://download.geonames.org/export/dump/

#### 选项 B：MaxMind GeoIP2 City
- **优点**：
  - IP 地址直接映射到城市，精度较高
  - 与 Cloudflare 数据源接近
  - 包含邮编、时区等额外信息
- **缺点**：
  - 商业许可（免费版有限制）
  - 需要定期购买更新
  - 数据格式复杂

#### 选项 C：自建城市库（主要城市）
- **优点**：
  - 数据量可控（100-500 城市）
  - 维护简单
  - 加载速度快
- **缺点**：
  - 覆盖不全，长尾城市无法支持
  - 需要手动维护更新

#### 🎯 推荐方案：GeoNames + 筛选策略
```
筛选条件：
- 人口 > 100,000 的城市（约 4,000 个）
- 或者：国家首都/省会（约 500 个）
- 或者：已出现在 traffic_events 的城市（动态扩展）

预计数据量：5,000-8,000 城市
压缩后体积：~500KB-1MB
```

#### ⚠️ 许可证合规（CC BY 4.0）

GeoNames 采用 **CC BY 4.0** 协议，使用前必须满足署名要求：

**强制要求**
- ✅ 在产品中明确标注数据来源
- ✅ 保留原始协议链接
- ✅ 不得暗示 GeoNames 为产品背书

**署名位置**（必须在产品发布前确定）
```
方案 1：README.md（推荐）
# 数据来源
本项目使用 [GeoNames](https://www.geonames.org/) 城市数据库
（CC BY 4.0 协议）提供地理位置服务。

方案 2：管理后台页脚
Footer: "城市数据由 GeoNames.org 提供 (CC BY 4.0)"

方案 3：API 响应头（可选）
X-Geo-Data-Source: GeoNames.org (CC BY 4.0)

方案 4：独立 LICENSE 文件
docs/THIRD_PARTY_LICENSES.md
```

**推荐实施**：同时在 README + 管理后台页脚标注，确保用户可见

**决策检查点**：
- [ ] 法务/产品确认署名方案
- [ ] 在代码中添加署名注释
- [ ] 部署前检查署名是否可见

---

### 2. 城市名称标准化策略

#### 问题分析
Cloudflare `cf.city` 返回格式不统一：
```
"Beijing" / "北京" / "BEIJING" / "beijing"
"New York" / "New York City" / "NYC"
"São Paulo" / "Sao Paulo"
```

#### 解决方案：别名映射表 + 确定性规范化

**2.1 标准化规则（Deterministic Normalization）**

为确保 Worker/前端/脚本一致处理，定义严格的规范化流程：

```typescript
/**
 * 城市名称规范化规则（必须按顺序执行）
 * 
 * 输入: "  são PAULO  "
 * 输出: "Sao Paulo"
 */
function normalizeCityName(input: string): string {
  return input
    .trim()                           // 1. 去除首尾空格
    .normalize('NFKD')                // 2. Unicode 规范化（分解重音符号）
    .replace(/[\u0300-\u036f]/g, '')  // 3. 移除重音符号（São → Sao）
    .toLowerCase()                     // 4. 全小写
    .split(' ')                        // 5. 按空格拆分
    .map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)  // 6. 每个单词首字母大写
    )
    .join(' ');                        // 7. 重新拼接
}

// 测试用例
normalizeCityName('  são PAULO  ');     // => "Sao Paulo"
normalizeCityName('new york city');      // => "New York City"
normalizeCityName('BEIJING');            // => "Beijing"
normalizeCityName('北京');               // => "北京" (中文保持不变)
```

**规范化规则的强制执行点**
- ✅ GeoNames 导入脚本（生成标准名称）
- ✅ Worker 中间件（匹配 `cf.city` 时）
- ✅ 前端搜索（用户输入时）
- ✅ 单元测试（验证一致性）

**2.2 别名映射表结构**
```typescript
// 主键：标准英文名（经过 normalizeCityName 处理）
// 别名：多语言名称、常用简称、历史名称

{
  "Beijing": {
    standard: "Beijing",
    country: "CN",
    aliases: ["北京", "Peking", "Běijīng"],  // 中文、历史名、拼音
    coordinates: [116.39723, 39.9075],
    population: 21540000,
    geonameId: 1816670
  },
  "New York": {
    standard: "New York",
    country: "US", 
    aliases: ["NYC", "New York City"],  // 简称、全称
    coordinates: [-74.00597, 40.71427],
    population: 8175133,
    geonameId: 5128581
  },
  "Sao Paulo": {  // 注意：标准名已去除重音
    standard: "Sao Paulo",
    country: "BR",
    aliases: ["São Paulo", "Sampa"],  // 原始拼写、俗称
    coordinates: [-46.63611, -23.5475],
    population: 12400000,
    geonameId: 3448439
  }
}
```

**2.2 匹配流程**
```
1. 接收 cf.city 原始值 → "beijing"
2. 转换为首字母大写 → "Beijing"
3. 在标准名中查找 → 命中
4. 未命中则在 aliases 中查找
5. 仍未命中则记录到日志（人工补充）
```

**2.3 数据生成方式**
- 从 GeoNames `alternatenames.txt` 提取
- 自动生成大小写变体
- 手动补充常见简称（NYC、LA 等）

---

### 3. 坐标表体积优化

#### 数据量分析

| 方案 | 城市数量 | 原始大小 | 压缩后 | Worker 内存占用 |
|------|---------|---------|--------|----------------|
| 全量 GeoNames | 15,000 | ~3MB | ~800KB | ~2MB |
| 筛选后（人口>10万） | 4,000 | ~800KB | ~200KB | ~500KB |
| 主要城市（1000+） | 1,000 | ~200KB | ~50KB | ~120KB |

#### 🎯 推荐策略：分层加载

**Tier 1：Worker 内存（热数据）**
- **筛选标准**（必须锁定）：
  - ✅ 人口 ≥ 500,000（约 800 个城市）
  - ✅ 或者：国家首都/直辖市（~200 个）
  - ✅ 预计总数：**1,000 城市**
- **体积**：~50KB 压缩后，~120KB 运行时
- **用途**：实时规则匹配、地图显示
- **加载时机**：Worker 启动时一次性加载到内存

**Tier 2：KV 存储（温数据）**
- **筛选标准**（必须锁定）：
  - ✅ 人口 ≥ 100,000（约 3,000 个城市）
  - ✅ 或者：省会/州府级城市（~500 个）
  - ✅ 预计总数：**3,500 城市**
- **体积**：~200KB
- **用途**：按需加载的规则匹配、统计查询
- **缓存策略**：本地缓存 10 分钟
- **KV Key 格式**：`city-tier2:{standard_name}`

**Tier 3：动态扩展（冷数据）**
- **来源**：从 `traffic_events` 中实际出现的城市
- **触发条件**：未在 Tier 1/2 中找到的城市
- **存储**：KV `city-unknown:{raw_city_name}`
- **审核流程**：每周人工审核，决定是否加入 Tier 2
- **KV Key 格式**：`city-dynamic:{standard_name}`

**内存占用预估（关键指标）**
```
CITY_COORDS (Tier 1):        ~120KB
CITY_ALIASES (Tier 1):        ~80KB
normalizeCityName 逻辑:        ~2KB
Tier 2 缓存（10 城市平均）:    ~5KB
────────────────────────────────────
总计:                        ~207KB

✅ 可接受（Worker 限制 128MB，占用 <0.2%）
```

**🔒 开发前必须锁定的 Cutoff 参数**
- [ ] Tier 1 人口阈值：**500,000**（确认）
- [ ] Tier 2 人口阈值：**100,000**（确认）
- [ ] Tier 1 最大城市数量上限：**1,000**（防止意外膨胀）
- [ ] Tier 2 最大城市数量上限：**5,000**
- [ ] 单个城市数据结构大小：**~200 bytes**

---

### 4. 前端选择器交互设计

#### 4.1 功能需求

**基础功能**
- ✅ 多选（支持选择多个城市）
- ✅ 搜索（支持中英文、拼音）
- ✅ 分组（按国家/大洲分组）
- ✅ 显示城市元信息（国旗、人口、坐标）

**高级功能**（Phase 2）
- 🔲 智能联想（输入 "bei" 提示 "Beijing", "Beirut"）
- 🔲 地图点选（直接在地图上选择城市）
- 🔲 批量导入（CSV/JSON 上传）
- 🔲 城市组（保存常用城市组合）

#### 4.2 UI 方案

**选项 A：下拉多选（当前实现）**
```
┌─────────────────────────────────┐
│ 🔍 搜索城市...                   │
├─────────────────────────────────┤
│ ✓ 🇨🇳 Beijing (北京)             │
│ ✓ 🇨🇳 Shanghai (上海)            │
│   🇺🇸 New York                   │
│   🇺🇸 Los Angeles                │
│   ...                            │
└─────────────────────────────────┘
已选择: 2 个城市
```

**选项 B：国家+城市二级选择器**
```
1. 先选国家 → CN (中国)
2. 再选城市 → [Beijing, Shanghai, Guangzhou...]
```

**选项 C：搜索优先 + 标签展示**
```
┌─────────────────────────────────┐
│ 🔍 输入城市名称或国家代码...     │
└─────────────────────────────────┘

已选择城市:
[Beijing ×] [New York ×] [Tokyo ×] ...
```

#### 🎯 推荐：选项 A + 分组优化
- 使用现有 `MultiSelect` 组件
- 按国家分组（中国、美国、日本...）
- 支持中英文搜索

#### 4.3 未匹配城市的前端行为（必须锁定）

当 `cf.city` 无法匹配到标准城市名时，前端显示策略：

**选项 A：显式降级标识（推荐）**
```
显示效果：
┌────────────────────────────────┐
│ 来源地区: Unknown City, CN 🔻 │
│          (已降级为国家级规则)   │
└────────────────────────────────┘

实现：
- 显示原始 cf.city 值 + 国家代码
- 添加视觉标识（⚠️ 或 🔻）
- Tooltip 说明："城市数据不可用，使用国家级规则"
```

**选项 B：静默降级（不推荐）**
```
显示效果：
┌────────────────────────────────┐
│ 来源地区: China (CN)           │
└────────────────────────────────┘

实现：
- 不显示城市信息
- 直接显示国家名称
- 无降级提示
```

**选项 C：占位符（适合调试）**
```
显示效果：
┌────────────────────────────────┐
│ 来源地区: [Unknown], CN        │
│          (请联系管理员补充)     │
└────────────────────────────────┘
```

**🔒 开发前必须决策**
- [ ] 前端降级显示方式：**选项 A**（推荐）
- [ ] 是否在管理后台显示"未匹配城市列表"：**是**（用于数据补充）
- [ ] 是否记录未匹配事件到 Analytics：**是**（用于监控）
- [ ] 是否允许管理员快速添加新城市：**Phase 2**（暂不支持）

---

### 5. 数据准确性与监控策略

#### 5.1 准确性预期

| 数据源 | 准确度 | 说明 |
|--------|-------|------|
| `cf.country` | 95%+ | IP 地址库准确度高 |
| `cf.city` | 70-85% | 受 IP 分配、代理影响 |
| `cf.region` | 80-90% | 省/州级别 |

**已知问题**：
- VPN/代理用户：城市可能为出口节点位置
- 移动网络：IP 段可能覆盖多个城市
- 企业专线：可能显示总部城市而非实际位置

#### 5.2 监控指标

**数据质量监控**
```
1. 未匹配城市统计
   - 每日记录 cf.city 原始值
   - 统计 top 100 未命中城市
   - 人工审核补充到别名表

2. 匹配准确率
   - 标准名命中率
   - 别名命中率
   - 回退到国家级的比例

3. 数据时效性
   - GeoNames 数据更新时间
   - 新城市发现频率
```

#### 5.3 城市指纹监控机制（City Fingerprinting）

为量化别名覆盖差距，引入"城市指纹"自动收集机制：

**目标**
- 自动发现未匹配的城市名称变体
- 量化数据质量（匹配率、覆盖率）
- 指导别名表补充优先级

**实现方案**

**Step 1: 实时记录（Worker 层）**
```typescript
// 在 geo-access-control.ts 中间件中
const rawCity = c.req.raw.cf?.city;
const normalizedCity = normalizeCityName(rawCity);

if (!CITY_COORDS[normalizedCity]) {
  // 未匹配，记录指纹
  c.executionCtx.waitUntil(
    recordCityFingerprint(env, {
      raw: rawCity,              // 原始值："beijing"
      normalized: normalizedCity, // 规范化："Beijing"
      country: c.req.raw.cf?.country,
      timestamp: Date.now(),
      colo: c.req.raw.cf?.colo
    })
  );
}
```

**Step 2: 聚合存储（KV 或 R2）**
```
方案 A：KV 存储（推荐，轻量级）
Key: city-fingerprint:{YYYY-MM-DD}
Value: {
  "beijing": { count: 123, country: "CN", firstSeen: 1700000000000 },
  "São Paulo": { count: 89, country: "BR", firstSeen: 1700000001000 },
  ...
}
TTL: 30 天

方案 B：R2 存储（海量数据）
Path: city-fingerprints/2025/10/20.json
内容：NDJSON 格式（每行一个 JSON 对象）
定期分析：每周生成报告
```

**Step 3: 日报生成（Scheduled Worker）**
```typescript
// 每日 02:00 UTC 执行
export async function scheduledCityFingerprintReport(env: Env) {
  const yesterday = getYesterdayDate();
  const fingerprints = await env.API_GATEWAY_STORAGE.get(
    `city-fingerprint:${yesterday}`, 
    'json'
  );
  
  // 排序：按 count 降序
  const top100 = Object.entries(fingerprints)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 100);
  
  // 生成报告
  const report = {
    date: yesterday,
    totalUnknownCities: Object.keys(fingerprints).length,
    totalRequests: sumCounts(fingerprints),
    top100: top100.map(([raw, data]) => ({
      raw,
      normalized: normalizeCityName(raw),
      count: data.count,
      country: data.country,
      suggestedAction: suggestAction(data)  // "add_alias" | "add_tier2" | "ignore"
    }))
  };
  
  // 存储报告
  await env.API_GATEWAY_STORAGE.put(
    `city-report:${yesterday}`,
    JSON.stringify(report),
    { expirationTtl: 90 * 86400 }  // 保留 90 天
  );
  
  // 可选：发送邮件/Slack 通知
  if (report.totalRequests > 1000) {
    await sendAlert(env, report);
  }
}
```

**Step 4: 管理后台展示**
```
新增页面：/admin/city-quality

展示内容：
┌─────────────────────────────────────────────────────────┐
│ 城市数据质量仪表盘                                       │
├─────────────────────────────────────────────────────────┤
│ 今日匹配率: 82.3% ▲ (+1.2%)                             │
│ 未匹配城市: 127 个                                       │
│ Top 10 未匹配城市:                                       │
│  1. "beijing" (CN) - 234 次 [建议: 添加别名]             │
│  2. "são paulo" (BR) - 189 次 [建议: 已存在，规范化问题] │
│  3. "mumbai" (IN) - 156 次 [建议: 添加到 Tier 2]        │
│  ...                                                     │
│                                                          │
│ [下载完整报告] [批量添加别名] [刷新 Tier 1]              │
└─────────────────────────────────────────────────────────┘
```

**监控告警规则**
```
警告阈值：
- 未匹配率 > 20%（连续 3 天）
- 单个未知城市流量 > 1000/天
- 新发现未知城市 > 50/天

告警渠道：
- Cloudflare Workers Analytics（自动）
- 管理后台红点提醒
- 可选：邮件/Slack（Phase 2）
```

**🔒 开发前必须决策**
- [ ] 城市指纹存储方案：**KV**（推荐）还是 R2
- [ ] 日报生成频率：**每日**还是每周
- [ ] 未匹配率告警阈值：**20%**（可调整）
- [ ] 是否自动补充高频未匹配城市：**否**（需人工审核）

**业务监控**
```
1. 规则执行统计
   - 城市级规则命中次数
   - 封禁/放行比例
   - Top 10 被拦截城市

2. 性能监控
   - 城市匹配延迟（目标 <2ms）
   - 内存占用（目标 <300KB）
   - 缓存命中率

3. 告警规则
   - 未匹配城市超过 1000/天
   - 城市匹配延迟 >5ms
   - 单个城市流量异常（±50%）
```

#### 5.4 数据更新机制与责任人（必须锁定）

**定期更新流程**

**更新频率（必须决策）**
- 选项 A：**每月手动更新**（推荐）
  - 适合稳定运营阶段
  - 人工审核质量高
  - 工作量：~30 分钟/月
  
- 选项 B：**每周自动更新**
  - 适合快速迭代阶段
  - 需要监控自动化质量
  - 工作量：初期投入 4-6h 开发 CI

**手动更新流程（推荐采用）**
```bash
# Step 1: 下载最新 GeoNames 数据（责任人执行）
curl -O https://download.geonames.org/export/dump/cities15000.zip
unzip cities15000.zip

# Step 2: 运行导入脚本（自动筛选 + 标准化）
cd apps/api
npm run import-cities -- \
  --input=cities15000.txt \
  --tier1-threshold=500000 \
  --tier2-threshold=100000 \
  --output=src/lib/

# Step 3: 审查变更（必须人工检查）
git diff src/lib/geo-city-coords.ts
git diff src/lib/geo-city-aliases.ts
# 检查点：
# - 新增城市数量是否合理（<100 个）
# - 删除城市是否有业务影响
# - 别名表是否有冲突

# Step 4: 本地测试
npm run test -- --grep "city"
npm run dev  # 验证启动正常

# Step 5: 部署到测试环境
npm run deploy -- --env test

# Step 6: 验证（运行 24 小时）
npm run test:city-quality -- --env test
# 检查未匹配率是否下降

# Step 7: 部署到生产环境
npm run deploy -- --env production

# Step 8: 提交代码
git add src/lib/geo-city-*.ts
git commit -m "chore: update GeoNames city data (2025-10)"
git push
```

**责任人分工（必须在启动前明确）**
```
角色分配：

1. 数据更新责任人（Data Owner）
   - 职责：每月执行更新流程、审查变更
   - 技能要求：熟悉 Git、命令行操作
   - 时间投入：30 分钟/月
   - 候选人：[待指定]

2. 质量审核人（QA Reviewer）
   - 职责：审查城市数据变更、测试环境验证
   - 技能要求：了解业务规则、能读懂 diff
   - 时间投入：15 分钟/月
   - 候选人：[待指定]

3. 紧急联系人（Escalation Contact）
   - 职责：处理更新失败、数据质量问题
   - 技能要求：全栈开发能力
   - 时间投入：按需
   - 候选人：[待指定]
```

**🔒 开发前必须锁定的更新策略**
- [ ] 更新频率：**每月 1 日**（具体日期）
- [ ] 数据更新责任人：**[姓名/团队]**
- [ ] 质量审核人：**[姓名/团队]**
- [ ] 测试环境验证时长：**24-48 小时**
- [ ] 更新失败回滚策略：**自动回滚**还是**人工介入**
- [ ] 是否建立自动化 Cron：**Phase 2**（MVP 手动执行）

**动态补充（实时）**
```typescript
// 在 traffic_events 中发现新城市时
if (!CITY_COORDS[city] && isValidCity(city)) {
  // 异步写入 KV
  await env.API_GATEWAY_STORAGE.put(
    `city-pending:${city}`, 
    JSON.stringify({ country, count: 1, firstSeen: Date.now() })
  );
}

// 定时任务每日汇总
// 人工审核后批量导入
```

---

## 📐 实施计划

### Phase 1：数据准备（3-5 小时）

**任务清单**
- [ ] 下载 GeoNames 数据（cities15000.txt）
- [ ] 编写数据导入脚本（筛选、转换、标准化）
- [ ] 生成 `CITY_COORDS` 常量文件（~1000 城市）
- [ ] 生成 `CITY_ALIASES` 别名映射表
- [ ] 测试数据加载和内存占用

**交付物**
```
apps/api/src/lib/
├── geo-city-coords.ts      # 城市坐标（Tier 1）
├── geo-city-aliases.ts     # 别名映射表
└── geo-city-loader.ts      # 动态加载逻辑（Tier 2）

scripts/
└── import-geonames.ts      # 数据导入脚本
```

---

### Phase 2：后端实现（4-6 小时）

**任务清单**
- [ ] 扩展 `GeoAccessRule` 类型（增加 `cities` 字段）
- [ ] 实现城市名称标准化函数
- [ ] 修改 `geo-access-control.ts` 中间件（增加城市匹配逻辑）
- [ ] 扩展管理 API（支持城市规则 CRUD）
- [ ] 扩展统计 API（城市维度聚合）
- [ ] 单元测试（城市匹配、别名解析）

**核心改动点**
```
apps/api/src/
├── types/geo-access-control.ts         # 类型扩展
├── middleware/geo-access-control.ts    # 匹配逻辑
├── routes/admin/geo-rules.ts           # API 扩展
├── routes/admin/geo-access-list.ts     # 统计扩展
└── lib/geo-city-matcher.ts             # 城市匹配核心逻辑（新增）
```

---

### Phase 3：前端实现（2-4 小时）

**任务清单**
- [ ] 在 `geo-selector.tsx` 增加"按城市"标签页
- [ ] 实现城市搜索和分组显示
- [ ] 加载城市数据（从后端 API 获取）
- [ ] 优化地图可视化（显示城市标记）
- [ ] 规则列表显示城市信息

**改动文件**
```
apps/web/src/
├── features/geo-rules/components/
│   ├── geo-selector.tsx                # 增加城市选择器
│   └── city-selector.tsx               # 新增：城市专用组件
├── features/dashboard/components/
│   └── realtime-map.tsx                # 地图标记城市
└── hooks/
    └── use-city-data.ts                # 新增：城市数据加载 Hook
```

---

### Phase 4：测试与优化（2-3 小时）

**测试数据集（必须准备）**

为确保别名匹配逻辑的健壮性，需构建包含边界情况的测试数据集：

```typescript
// apps/api/tests/fixtures/city-test-dataset.ts
export const CITY_TEST_CASES = [
  // 1. 标准格式（应该直接命中）
  { input: 'Beijing', expected: 'Beijing', country: 'CN' },
  { input: 'New York', expected: 'New York', country: 'US' },
  
  // 2. 大小写变体（应该通过规范化命中）
  { input: 'beijing', expected: 'Beijing', country: 'CN' },
  { input: 'BEIJING', expected: 'Beijing', country: 'CN' },
  { input: 'new york', expected: 'New York', country: 'US' },
  { input: 'NEW YORK', expected: 'New York', country: 'US' },
  
  // 3. 重音符号（应该通过 NFKD 规范化）
  { input: 'São Paulo', expected: 'Sao Paulo', country: 'BR' },
  { input: 'sao paulo', expected: 'Sao Paulo', country: 'BR' },
  { input: 'SAO PAULO', expected: 'Sao Paulo', country: 'BR' },
  
  // 4. 别名/简称（应该通过别名表命中）
  { input: 'NYC', expected: 'New York', country: 'US' },
  { input: '北京', expected: 'Beijing', country: 'CN' },
  { input: 'Peking', expected: 'Beijing', country: 'CN' },
  
  // 5. 首尾空格（应该 trim 后命中）
  { input: '  Beijing  ', expected: 'Beijing', country: 'CN' },
  { input: ' New York ', expected: 'New York', country: 'US' },
  
  // 6. 边界情况（应该返回 null 或降级到国家）
  { input: '', expected: null, country: null },
  { input: null, expected: null, country: null },
  { input: 'UnknownCity123', expected: null, country: 'XX' },
  
  // 7. 特殊字符
  { input: 'Saint-Petersburg', expected: 'Saint Petersburg', country: 'RU' },
  { input: "Xi'an", expected: 'Xian', country: 'CN' },
  
  // 8. 亚洲城市（中文变体）
  { input: '上海', expected: 'Shanghai', country: 'CN' },
  { input: '东京', expected: 'Tokyo', country: 'JP' },
  { input: 'Seoul', expected: 'Seoul', country: 'KR' },
  { input: '서울', expected: 'Seoul', country: 'KR' },  // 韩文
  
  // 9. 欧洲城市（多语言）
  { input: 'München', expected: 'Munich', country: 'DE' },
  { input: 'Munich', expected: 'Munich', country: 'DE' },
  { input: 'Москва', expected: 'Moscow', country: 'RU' },  // 俄文
  
  // 10. 同名城市（需要国家代码区分）
  { input: 'Paris', expected: 'Paris', country: 'FR' },
  { input: 'Paris', expected: 'Paris', country: 'US' },  // Paris, Texas
];
```

**单元测试用例**
```typescript
// apps/api/tests/unit/geo-city-matcher.test.ts
describe('normalizeCityName', () => {
  test.each(CITY_TEST_CASES)(
    'should normalize "$input" to "$expected"',
    ({ input, expected }) => {
      const result = normalizeCityName(input);
      expect(result).toBe(expected);
    }
  );
  
  test('should handle Unicode normalization', () => {
    expect(normalizeCityName('São Paulo')).toBe('Sao Paulo');
    expect(normalizeCityName('Zürich')).toBe('Zurich');
  });
  
  test('should preserve Chinese characters', () => {
    expect(normalizeCityName('北京')).toBe('北京');
    expect(normalizeCityName('上海')).toBe('上海');
  });
});

describe('cityMatcher', () => {
  test('should match city with alias', () => {
    const result = matchCity('NYC', 'US');
    expect(result).toEqual({
      standard: 'New York',
      coords: [-74.00597, 40.71427],
      tier: 1
    });
  });
  
  test('should fallback to country when city not found', () => {
    const result = matchCity('UnknownCity', 'CN');
    expect(result).toEqual({
      standard: null,
      fallbackToCountry: true,
      country: 'CN'
    });
  });
});
```

**测试维度**
- [ ] 功能测试（创建、编辑、删除城市规则）
- [ ] 性能测试（匹配延迟、内存占用）
- [ ] 别名测试（使用上述测试数据集，确保 95%+ 命中率）
- [ ] 边界测试（未知城市、空值、特殊字符）
- [ ] 兼容性测试（与现有国家级规则共存）

**优化点**
- 城市数据懒加载（首次访问时加载）
- 前端缓存（localStorage 缓存城市列表）
- 搜索性能（防抖、虚拟滚动）

---

## ⚠️ 风险与应对

### 风险 1：城市数据不准确
**影响**：误封禁/放行用户  
**概率**：中（15-30% 城市识别错误）  
**应对**：
- 提供"国家+城市"双重匹配（国家命中即可）
- 规则支持回退到国家级
- 提供用户申诉机制

### 风险 2：数据体积过大影响性能
**影响**：Worker 启动慢、内存占用高  
**概率**：低（通过分层加载控制）  
**应对**：
- 严格控制 Tier 1 数据量（<1000 城市）
- 监控内存占用，超阈值告警
- 提供数据裁剪工具

### 风险 3：GeoNames 数据更新延迟
**影响**：新城市无法识别  
**概率**：低（城市变更不频繁）  
**应对**：
- 动态补充机制（从 traffic_events 学习）
- 手动添加紧急城市的快速通道
- 每月定期更新

### 风险 4：前端搜索体验差（数据量大）
**影响**：用户难以找到目标城市  
**概率**：中（4000+ 城市）  
**应对**：
- 实现智能搜索（拼音、模糊匹配）
- 按国家分组+收起/展开
- 提供"最近使用"、"热门城市"快捷入口

---

## 📊 预期效果

### 业务价值
- ✅ 精细化地区控制能力提升（城市级 vs 国家级）
- ✅ 支持区域性运营策略（城市级白名单/黑名单）
- ✅ 更精准的风险控制（针对特定城市的欺诈行为）

### 技术指标
- ✅ 城市匹配准确率：70-85%（受限于 Cloudflare 数据）
- ✅ 匹配延迟：<2ms（内存查表）
- ✅ 数据覆盖：4,000+ 城市（全球主要城市）
- ✅ 内存占用：<300KB（分层加载）

### 用户体验
- ✅ 规则配置更灵活（支持 4 种维度：国家、大洲、城市、自定义组）
- ✅ 搜索便捷（支持中英文、分组、联想）
- ✅ 可视化增强（地图显示城市级流量分布）

---

## 📋 GeoNames 导入脚本规范

### 脚本功能需求

**输入**
- GeoNames 原始数据文件：`cities15000.txt`（人口 ≥ 15,000 的城市）
- 别名文件（可选）：`alternateNamesV2.txt`（多语言别名）
- 配置参数：Tier 1/2 阈值、输出路径

**输出**
- `geo-city-coords.ts`：Tier 1 城市坐标表（TypeScript 常量）
- `geo-city-aliases.ts`：别名映射表（TypeScript 常量）
- `city-tier2.json`：Tier 2 城市数据（KV 导入格式）
- `import-report.json`：导入统计报告

### 脚本接口定义

```typescript
// scripts/import-geonames.ts

interface ImportOptions {
  inputFile: string;              // 输入文件路径
  aliasFile?: string;             // 别名文件路径（可选）
  tier1Threshold: number;         // Tier 1 人口阈值（默认 500,000）
  tier2Threshold: number;         // Tier 2 人口阈值（默认 100,000）
  tier1MaxCount: number;          // Tier 1 最大城市数（默认 1000）
  tier2MaxCount: number;          // Tier 2 最大城市数（默认 5000）
  outputDir: string;              // 输出目录
  includeCapitals: boolean;       // 是否强制包含首都（默认 true）
  verbose: boolean;               // 详细日志（默认 false）
}

interface ImportResult {
  tier1Count: number;             // Tier 1 城市数量
  tier2Count: number;             // Tier 2 城市数量
  aliasCount: number;             // 别名总数
  countryCoverage: Record<string, number>;  // 每个国家的城市数量
  warnings: string[];             // 警告信息
  errors: string[];               // 错误信息
}
```

### 处理流程

```
Step 1: 读取和解析
├─ 解析 cities15000.txt（TSV 格式）
├─ 解析 alternateNamesV2.txt（可选）
└─ 验证数据完整性

Step 2: 筛选和分层
├─ Tier 1 筛选：人口 ≥ 500k OR 首都
├─ Tier 2 筛选：人口 ≥ 100k
├─ 按人口排序，限制数量上限
└─ 统计国家覆盖度

Step 3: 标准化处理
├─ 应用 normalizeCityName() 规则
├─ 生成别名变体（大小写、重音符号）
├─ 去重和冲突检测
└─ 验证坐标有效性

Step 4: 生成输出文件
├─ geo-city-coords.ts（TypeScript 常量）
├─ geo-city-aliases.ts（TypeScript 常量）
├─ city-tier2.json（KV 批量导入格式）
└─ import-report.json（统计报告）

Step 5: 质量检查
├─ 检查 Tier 1 数据量（预期 ~1000）
├─ 检查文件大小（预期 <500KB）
├─ 检查国家覆盖度（至少 100 个国家）
└─ 生成警告和建议
```

### 输出文件格式

**geo-city-coords.ts**
```typescript
/**
 * 城市坐标表（Tier 1）
 * 自动生成，请勿手动编辑
 * 
 * 数据来源: GeoNames (CC BY 4.0)
 * 生成时间: 2025-10-20T10:30:00Z
 * 城市数量: 1,023
 */
export const CITY_COORDS: Record<string, {
  coords: [number, number];  // [lng, lat]
  country: string;
  population: number;
  geonameId: number;
}> = {
  "Beijing": {
    coords: [116.39723, 39.9075],
    country: "CN",
    population: 21540000,
    geonameId: 1816670
  },
  // ...
};
```

**命令行使用**
```bash
# 基本用法
npm run import-cities -- \
  --input=./data/cities15000.txt \
  --output=./src/lib

# 完整参数
npm run import-cities -- \
  --input=./data/cities15000.txt \
  --alias-file=./data/alternateNamesV2.txt \
  --tier1-threshold=500000 \
  --tier2-threshold=100000 \
  --tier1-max=1000 \
  --tier2-max=5000 \
  --output=./src/lib \
  --include-capitals \
  --verbose

# 预览模式（不生成文件）
npm run import-cities -- \
  --input=./data/cities15000.txt \
  --dry-run
```

### 质量检查清单

脚本应自动检查并报告以下指标：

- [ ] Tier 1 城市数量在 900-1100 范围内
- [ ] Tier 2 城市数量在 3000-5000 范围内
- [ ] 所有城市都有有效坐标（-180~180, -90~90）
- [ ] 至少覆盖 100 个国家
- [ ] 中国、美国、印度等大国至少有 20 个城市
- [ ] 别名表无重复和冲突
- [ ] 生成的 TypeScript 文件通过 ESLint 检查
- [ ] 文件大小：geo-city-coords.ts < 300KB

**🔒 开发前必须确认**
- [ ] 脚本输入/输出格式
- [ ] 质量检查阈值
- [ ] 错误处理策略（严格 vs 宽松）

---

## 🧪 Spike 验证计划（Phase 0）

在正式开发前，建议先用 1-2 小时完成快速验证（Spike），确认技术方案可行性：

### Spike 目标

1. ✅ 验证 Tier 1 数据加载到 Worker 的内存占用和时间
2. ✅ 验证 normalizeCityName() 函数在 Worker 中的性能
3. ✅ 验证 GeoNames 数据质量和覆盖度
4. ✅ 验证前端搜索体验（1000+ 城市）

### Spike 任务清单

**任务 1：内存和时间测试（30 分钟）**
```typescript
// spike/test-city-loader.ts
import { CITY_COORDS } from './mock-city-data';  // 手动构造 100 个城市

// 测试 1：内存占用
console.log('City data size:', JSON.stringify(CITY_COORDS).length, 'bytes');

// 测试 2：加载时间
const start = performance.now();
const cities = Object.keys(CITY_COORDS);
const end = performance.now();
console.log('Load time:', end - start, 'ms');

// 测试 3：查找性能
const lookupStart = performance.now();
for (let i = 0; i < 10000; i++) {
  const city = cities[i % cities.length];
  const _ = CITY_COORDS[city];
}
const lookupEnd = performance.now();
console.log('10k lookups time:', lookupEnd - lookupStart, 'ms');
console.log('Avg lookup time:', (lookupEnd - lookupStart) / 10000, 'ms');
```

**预期结果**
- Tier 1 (1000 城市) 数据大小：~200KB
- Worker 启动时加载：<10ms
- 单次查找：<0.01ms

**任务 2：规范化函数性能（20 分钟）**
```typescript
// spike/test-normalization.ts
function normalizeCityName(input: string): string {
  return input
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// 测试 10,000 次规范化
const testCases = [
  'beijing', 'BEIJING', 'Beijing',
  'são paulo', 'SAO PAULO', 
  '  new york  '
];

const start = performance.now();
for (let i = 0; i < 10000; i++) {
  const input = testCases[i % testCases.length];
  const _ = normalizeCityName(input);
}
const end = performance.now();
console.log('10k normalizations:', end - start, 'ms');
console.log('Avg:', (end - start) / 10000, 'ms');
```

**预期结果**
- 单次规范化：<0.1ms
- 对 Worker 性能影响：可忽略

**任务 3：GeoNames 数据采样分析（30 分钟）**
```bash
# 下载 GeoNames 数据
curl -O https://download.geonames.org/export/dump/cities15000.zip
unzip cities15000.zip

# 统计分析
echo "Total cities:" 
wc -l cities15000.txt

echo "Cities with population > 500k:"
awk -F'\t' '$15 > 500000' cities15000.txt | wc -l

echo "Cities with population > 100k:"
awk -F'\t' '$15 > 100000' cities15000.txt | wc -l

echo "Top 10 countries by city count:"
awk -F'\t' '{print $9}' cities15000.txt | sort | uniq -c | sort -rn | head -10

# 随机抽样 100 个城市，检查数据质量
shuf -n 100 cities15000.txt > sample.txt
cat sample.txt  # 手动检查坐标、人口是否合理
```

**任务 4：前端搜索体验验证（20 分钟）**
```tsx
// spike/city-search-test.tsx
// 使用现有 MultiSelect 组件测试 1000+ 选项的性能
const mockCities = Array.from({ length: 1000 }, (_, i) => ({
  value: `city-${i}`,
  label: `City ${i}`
}));

export function CitySearchSpike() {
  const [selected, setSelected] = useState<string[]>([]);
  
  return (
    <MultiSelect
      options={mockCities}
      value={selected}
      onValueChange={setSelected}
      placeholder="Search cities..."
    />
  );
}

// 测试点：
// 1. 初始渲染速度
// 2. 搜索响应速度
// 3. 滚动流畅度
```

### Spike 完成标准

- [ ] Tier 1 内存占用 < 300KB ✅
- [ ] Worker 启动时间增加 < 50ms ✅
- [ ] 城市查找延迟 < 1ms ✅
- [ ] 规范化函数延迟 < 0.5ms ✅
- [ ] GeoNames 数据质量可接受（人工检查 100 个样本）✅
- [ ] 前端搜索体验流畅（无明显卡顿）✅

### Spike 决策点

**如果验证失败**
- 内存超标 → 减少 Tier 1 城市数量 or 优化数据结构
- 性能不达标 → 考虑异步加载 or 使用 KV 缓存
- 数据质量差 → 考虑其他数据源（MaxMind）
- 前端卡顿 → 虚拟滚动 or 分组懒加载

**如果验证通过**
- 更新方案文档，锁定参数
- 启动 Phase 1 正式开发

**🔒 Spike 执行时机**
- [ ] 在 Phase 1 启动前完成
- [ ] 责任人：技术负责人
- [ ] 时间预算：1-2 小时
- [ ] 交付物：Spike 验证报告（性能数据 + 建议）

---

## 🔍 后续扩展方向

### Phase 5+（可选）
- **地理围栏（Geo-fencing）**：支持经纬度范围匹配
- **时区感知规则**：按城市时区执行动态规则
- **城市组预设**：如"中国一线城市"、"美国西海岸"
- **机器学习优化**：根据历史数据自动优化城市识别
- **多数据源融合**：结合 MaxMind、IP2Location 提高准确度

---

## 📝 待澄清问题（启动前必须决策）

### 核心决策
1. ✅ **数据源确认**：是否使用 GeoNames？是否可接受 CC BY 4.0 协议？
2. ✅ **城市数量**：Tier 1 加载多少城市？（建议 1000）
3. ✅ **更新频率**：每月手动更新 vs 每周自动更新？
4. ✅ **准确度预期**：是否接受 70-85% 准确度？
5. ✅ **降级策略**：城市未命中时，是否回退到国家级匹配？

### 产品决策
6. ⏳ **前端交互**：选项 A（下拉多选）还是 选项 B（二级选择）？
7. ⏳ **搜索能力**：是否需要拼音搜索？（中国用户友好）
8. ⏳ **地图交互**：是否支持地图点选城市？（Phase 2 功能）
9. ⏳ **批量操作**：是否需要 CSV 导入城市列表？

### 运维决策
10. ⏳ **监控告警**：城市识别率低于多少时告警？（建议 70%）
11. ⏳ **数据审核**：谁负责审核新城市补充？（需要人工介入）
12. ⏳ **灰度发布**：是否先在 Test 环境运行 1 周验证？

### 时间节点规划（个人项目版）

> 💡 **个人项目提示**：由于是单人开发，无需复杂的审批流程，但仍建议设定清晰的里程碑以保持进度。

#### 核心里程碑
```
项目启动日期：______ 年 ____ 月 ____ 日

Phase 0（Spike 验证）：
  预计时间：1-2 小时
  完成日期：______ 年 ____ 月 ____ 日
  关键产出：性能数据验证报告

Phase 1-2（后端开发）：
  预计时间：4-6 小时
  完成日期：______ 年 ____ 月 ____ 日
  关键产出：城市匹配中间件 + 导入脚本

Phase 3（前端开发）：
  预计时间：2-4 小时
  完成日期：______ 年 ____ 月 ____ 日
  关键产出：城市选择器 + 地图可视化

Phase 4（测试优化）：
  预计时间：2-3 小时
  完成日期：______ 年 ____ 月 ____ 日
  关键产出：测试通过 + 性能优化

Test 环境灰度：
  运行时长：24-48 小时
  观察期结束：______ 年 ____ 月 ____ 日

生产上线日期：______ 年 ____ 月 ____ 日
```

#### 数据维护计划
```
GeoNames 数据更新：
  - 频率：每月 1 次（推荐每月 1 日）
  - 时间投入：30-60 分钟
  - 提醒方式：□ 日历提醒 □ 手动执行

城市指纹日报：
  - Scheduled Worker：每日 02:00 UTC 自动运行
  - 审查频率：每周查看一次（推荐周一）
  - 告警方式：管理后台红点提醒（匹配率 < 70% 时）
```

#### 灵活调整建议
- ✅ 可根据实际情况调整里程碑日期
- ✅ Spike 验证如果顺利可立即进入 Phase 1
- ✅ Phase 1-4 可以连续开发（单日完成 11-17h）或分多天
- ✅ Test 环境观察期可缩短至 24h（个人项目风险可控）
- ⚠️ 建议保留 Spike 验证步骤（避免技术风险）

---

## 📌 总结

城市级地区访问控制改造是一个**小项目级别**的增强需求，核心挑战在于：
1. **数据质量管理**（城市库维护、别名映射、准确性监控）
2. **性能优化**（内存占用控制、分层加载、缓存策略）
3. **用户体验**（搜索便捷性、可视化效果）

建议采用**分阶段实施**策略，Phase 1-3 完成核心功能（11-17h），后续根据实际使用情况决定是否投入 Phase 4+ 高级功能。

**关键成功因素**：
- ✅ 选对数据源（GeoNames 开源免费，数据全面）
- ✅ 控制数据量（分层加载，核心 1000 城市）
- ✅ 做好降级（城市匹配失败回退到国家级）
- ✅ 持续优化（监控未匹配城市，动态补充）

---

**文档版本**：v3.0（个人项目适配版）  
**最后更新**：2025-10-20  
**项目类型**：个人私有项目（单人开发、不开源、非商业）  
**状态**：✅ 方案完整 → 可立即执行 Spike 验证 → 周末突击开发

---

## ✅ 已整合的审查反馈

### 1. 许可证合规
- ✅ 新增 CC BY 4.0 许可证署名要求说明
- ✅ 明确署名位置选项（README + 管理后台页脚）
- ✅ 决策检查点清单

### 2. 锁定关键参数
- ✅ Tier 1/2 Cutoff 明确（500k / 100k，1000 / 5000 上限）
- ✅ 数据更新机制和责任人分工明确
- ✅ 前端未匹配城市显示方式（推荐选项 A：显式降级）

### 3. 城市指纹监控
- ✅ 新增 City Fingerprinting 机制（5.3 节）
- ✅ 实时记录、日报生成、管理后台展示
- ✅ KV 存储方案和告警阈值

### 4. 确定性规范化规则
- ✅ 详细的 normalizeCityName() 函数规范（7 步流程）
- ✅ 规范化规则强制执行点说明
- ✅ 别名映射表结构示例

### 5. 测试数据集
- ✅ 新增 Phase 4 测试数据集（10 类边界情况）
- ✅ 单元测试用例示例（95%+ 命中率目标）

### 6. GeoNames 导入脚本规范
- ✅ 完整的脚本接口定义（ImportOptions / ImportResult）
- ✅ 5 步处理流程说明
- ✅ 输出文件格式和命令行使用示例
- ✅ 质量检查清单

### 7. Spike 验证计划
- ✅ Phase 0 快速验证（1-2 小时）
- ✅ 4 个验证任务（内存、性能、数据质量、前端体验）
- ✅ 预期结果和决策点
- ✅ 验证失败的应对方案

### 8. 责任人与时间节点
- ✅ 4 个关键角色定义（数据维护、监控、技术、审核）
- ✅ 每个角色的职责和时间承诺
- ✅ Scheduled Worker 配置责任人明确
- ✅ 告警接收人和方式明确
- ✅ 首次上线目标日期和里程碑

### 9. 上线验收清单
- ✅ 74 项验收检查点（跨 8 个维度）
- ✅ Go/No-Go 决策标准明确
- ✅ 个人项目版：7 项极简清单
- ✅ 避免遗漏关键校验项（许可证、回归测试、监控等）

### 10. 个人项目适配（v3.0 新增）
- ✅ 移除多方协作流程（会议、签字、审批）
- ✅ 简化责任人为单人维护计划
- ✅ 精简执行流程为 3 步快速启动
- ✅ 提供周末突击路径（3 天上线）
- ✅ 保留核心质量保障（Spike、署名、回归测试、回滚）

---

## ✅ 上线验收清单（Go-Live Checklist）

在生产环境上线前，必须逐项验证以下检查点：

### Phase 0: Spike 验证通过标准

- [ ] **内存占用验证**
  - [ ] Tier 1 数据体积 < 300KB ✅
  - [ ] Worker 运行时内存 < 500KB（含 Tier 1 + 逻辑）
  - [ ] Worker 启动时间增加 < 50ms
  - [ ] 数据加载无错误和警告

- [ ] **性能验证**
  - [ ] 城市查找延迟 < 1ms（平均）
  - [ ] `normalizeCityName()` 延迟 < 0.5ms（平均）
  - [ ] 10,000 次连续查找 < 100ms

- [ ] **数据质量验证**
  - [ ] GeoNames 数据完整性检查通过（无损坏记录）
  - [ ] 手动审查 100 个随机城市样本（坐标、人口合理）
  - [ ] Tier 1 城市数量：900-1100 个
  - [ ] Tier 2 城市数量：3000-5000 个
  - [ ] 国家覆盖度 ≥ 100 个国家

- [ ] **前端体验验证**
  - [ ] 城市选择器渲染 < 500ms
  - [ ] 搜索响应 < 200ms（防抖后）
  - [ ] 滚动流畅无卡顿
  - [ ] 选择 10+ 城市无性能问题

### Phase 1-2: 后端功能验证

- [ ] **数据导入**
  - [ ] 导入脚本成功生成 `geo-city-coords.ts`
  - [ ] 导入脚本成功生成 `geo-city-aliases.ts`
  - [ ] 导入脚本成功生成 `city-tier2.json`
  - [ ] 导入报告显示 0 个错误
  - [ ] 生成的 TypeScript 文件通过 ESLint 检查

- [ ] **类型定义和中间件**
  - [ ] `GeoAccessRule` 类型扩展正确（支持 `cities` 字段）
  - [ ] `normalizeCityName()` 函数单元测试通过（95%+ 命中率）
  - [ ] 城市匹配逻辑单元测试通过（含边界情况）
  - [ ] 别名匹配测试通过（中英文、大小写、重音符号）

- [ ] **规则匹配逻辑**
  - [ ] 城市级规则优先于国家级规则
  - [ ] 城市未匹配时自动降级到国家级
  - [ ] `cf.city` 为空时不影响国家级规则
  - [ ] 城市 + 国家双重匹配逻辑正确

### Phase 3: 前端功能验证

- [ ] **城市选择器**
  - [ ] "按城市"标签页正常显示
  - [ ] 城市搜索功能正常（支持中英文）
  - [ ] 城市按国家分组显示正确
  - [ ] 多选城市功能正常（可选择 10+ 城市）
  - [ ] 已选城市标签正常显示和删除

- [ ] **规则管理界面**
  - [ ] 创建城市规则成功
  - [ ] 编辑城市规则成功
  - [ ] 删除城市规则成功
  - [ ] 规则列表正确显示城市信息
  - [ ] 城市规则和国家规则可共存

- [ ] **地图可视化**
  - [ ] 城市标记正确显示在地图上
  - [ ] 城市坐标准确（抽查 20 个主要城市）
  - [ ] 点击城市标记显示详细信息
  - [ ] 地图加载性能可接受（< 2s）

### Phase 4: 监控与数据质量

- [ ] **城市指纹监控**
  - [ ] Scheduled Worker 每日运行成功
  - [ ] 城市指纹数据正确写入 KV
  - [ ] 日报生成成功（包含 top 100 未匹配城市）
  - [ ] 管理后台显示城市数据质量仪表盘

- [ ] **匹配率监控**
  - [ ] 初始匹配率 ≥ 70%（测试环境运行 24h 后）
  - [ ] 未匹配城市自动记录到指纹库
  - [ ] 告警规则正确配置（未匹配率 > 20%）
  - [ ] 告警通知渠道正常工作

- [ ] **数据质量报告**
  - [ ] Tier 1 命中率 ≥ 80%
  - [ ] 别名命中率 ≥ 15%
  - [ ] 回退到国家级的比例 < 20%
  - [ ] 未知城市数量 < 总请求量的 30%

### 合规与文档

- [ ] **许可证合规**
  - [ ] README.md 中已添加 GeoNames 署名
  - [ ] 管理后台页脚已添加数据来源声明
  - [ ] 代码注释中包含 CC BY 4.0 协议链接
  - [ ] 无暗示 GeoNames 为产品背书的内容

- [ ] **技术文档**
  - [ ] 更新 API_REFERENCE.md（新增城市规则接口）
  - [ ] 更新用户指南（如何创建城市规则）
  - [ ] GeoNames 导入脚本使用文档已编写
  - [ ] 城市数据更新流程文档已编写

- [ ] **运维文档**
  - [ ] 责任人和联系方式已明确
  - [ ] 告警响应流程已文档化
  - [ ] 数据更新 SOP（标准操作流程）已编写
  - [ ] 回滚方案已准备

### 测试环境验证（灰度发布）

- [ ] **Test 环境运行 24-48 小时**
  - [ ] 无 Worker 崩溃或内存溢出
  - [ ] 无性能退化（P95 延迟 < 基线 + 5ms）
  - [ ] 无错误日志激增
  - [ ] 城市规则正确拦截/放行请求

- [ ] **回归测试**
  - [ ] 国家级规则仍正常工作
  - [ ] 大洲级规则仍正常工作
  - [ ] 预定义组规则仍正常工作
  - [ ] 默认动作（allow/block）仍正常工作
  - [ ] 现有规则优先级仍正确

- [ ] **边界情况测试**
  - [ ] `cf.city` 为 null/undefined 不影响功能
  - [ ] `cf.city` 包含特殊字符（如 "São Paulo"）正确处理
  - [ ] `cf.city` 为未知城市正确降级到国家级
  - [ ] 同名城市（不同国家）正确区分

### 生产上线准备

- [ ] **代码审查**
  - [ ] 所有 PR 已通过 Code Review
  - [ ] 所有单元测试通过（覆盖率 ≥ 80%）
  - [ ] 所有 ESLint/TypeScript 检查通过
  - [ ] 无遗留 TODO 或 FIXME 注释

- [ ] **部署准备**
  - [ ] 部署脚本已更新（包含 Tier 2 KV 导入）
  - [ ] Scheduled Worker 配置已添加到 wrangler.toml
  - [ ] 环境变量和 KV 绑定已配置
  - [ ] 回滚方案已准备并测试

- [ ] **监控准备**
  - [ ] Cloudflare Analytics 配置已更新
  - [ ] 告警规则已配置到监控系统
  - [ ] 日志采样率已设置（避免日志爆炸）
  - [ ] 仪表盘已创建（城市匹配率、未匹配 top 10）

### 上线后验证（首 24 小时）

- [ ] **生产环境运行监控**
  - [ ] Worker 运行正常，无崩溃
  - [ ] 城市匹配率 ≥ 70%
  - [ ] P95 延迟 < 基线 + 10ms
  - [ ] 无大量错误日志

- [ ] **功能抽查**
  - [ ] 创建 3 条城市规则测试（不同国家）
  - [ ] 验证规则是否正确生效
  - [ ] 检查城市指纹日报是否生成
  - [ ] 检查管理后台数据是否正确

- [ ] **数据质量初步评估**
  - [ ] 查看首日城市指纹报告
  - [ ] 识别 top 20 未匹配城市
  - [ ] 评估是否需要紧急补充别名
  - [ ] 记录首日匹配率基线

### 上线决策（个人项目版）

**Go / No-Go 自检清单**（建议所有项通过后再上线）

- [ ] ✅ Spike 验证通过（内存 < 300KB，延迟 < 1ms）
- [ ] ✅ 核心功能验证通过（城市匹配、规则 CRUD、前端选择器）
- [ ] ✅ 关键测试通过（别名匹配 95%+、回归测试、边界测试）
- [ ] ✅ 监控已配置（城市指纹日报、匹配率告警）
- [ ] ✅ 许可证合规（GeoNames 署名已添加）
- [ ] ✅ Test 环境稳定（运行 24h+ 无崩溃）
- [ ] ✅ 回滚方案已准备（可快速回退到上一版本）

**上线日期记录**
```
Spike 完成：______ 年 ____ 月 ____ 日
开发完成：______ 年 ____ 月 ____ 日
Test 验证完成：______ 年 ____ 月 ____ 日
生产上线：______ 年 ____ 月 ____ 日
首日匹配率：______%（基线数据）
```

---

## 🎯 下一步行动（个人项目版）

### 精简执行流程（3 步快速启动）

#### Step 1: 快速决策（30 分钟）

浏览待决策问题，快速确定以下关键点：

- [ ] **许可证署名位置**：✅ README.md + 管理后台页脚（推荐）
- [ ] **Tier 1/2 阈值**：✅ 500k / 100k（已锁定，无需修改）
- [ ] **更新频率**：✅ 每月 1 日手动更新（设日历提醒）
- [ ] **告警阈值**：✅ 匹配率 < 70% 时提醒（管理后台）
- [ ] **降级策略**：✅ 城市未命中自动回退到国家级
- [ ] **前端交互**：✅ 选项 A（下拉多选 + 分组）
- [ ] **灰度时长**：✅ Test 环境运行 24h（个人项目可缩短）

**设定目标上线日期**：______ 年 ____ 月 ____ 日

---

#### Step 2: Spike 验证（1-2 小时，必做）

> ⚠️ **重要**：即使是个人项目，也强烈建议执行 Spike，避免开发到一半发现性能问题。

**执行 4 个快速验证**：

1. **内存测试**（15 分钟）
   ```bash
   # 下载 GeoNames 样本数据
   curl -O https://download.geonames.org/export/dump/cities15000.zip
   unzip cities15000.zip
   
   # 统计城市数量
   awk -F'\t' '$15 > 500000' cities15000.txt | wc -l  # Tier 1
   awk -F'\t' '$15 > 100000' cities15000.txt | wc -l  # Tier 2
   ```
   
2. **性能测试**（20 分钟）
   - 手动构造 100 个城市数据的 JSON
   - 测试 `normalizeCityName()` 函数 10,000 次循环
   - 记录延迟：______ ms（预期 < 100ms）

3. **数据质量**（15 分钟）
   - 随机抽样 20 个城市，检查坐标和人口是否合理
   - 确认无明显错误数据

4. **前端体验**（10 分钟）
   - 用现有 `MultiSelect` 组件测试 1000 个选项
   - 验证搜索和滚动流畅

**记录结果**：
- Tier 1 预估内存：______ KB（目标 < 300KB）
- 查找延迟：______ ms（目标 < 1ms）
- 前端体验：✅ 流畅 / ⚠️ 需优化

**决策**：
- ✅ 验证通过 → 进入 Step 3 开发
- ❌ 有问题 → 调整参数（减少 Tier 1 城市数量）

---

#### Step 3: 连续开发 + 上线（2-3 天）

**方案 A：周末突击（推荐）**
```
周六上午（4h）：Phase 1-2 后端开发
周六下午（3h）：Phase 3 前端开发
周六晚上（1h）：Phase 4 测试
周日全天：Test 环境观察 24h
周一：生产上线
```

**方案 B：工作日晚上（分散）**
```
Day 1 晚上（2h）：Phase 1 部分（导入脚本）
Day 2 晚上（2h）：Phase 1 完成 + Phase 2
Day 3 晚上（3h）：Phase 3 前端
Day 4 晚上（1h）：Phase 4 测试
Day 5-6：Test 环境观察
Day 7：生产上线
```

**开发过程中的简化**：
- ✅ 可跳过正式的 Code Review（自己审查即可）
- ✅ 单元测试覆盖核心逻辑即可（不强求 80%）
- ✅ Test 环境观察可缩短至 24h
- ⚠️ 建议保留关键验收项：许可证署名、回归测试、回滚方案

---

### 极简版执行清单（最少步骤）

如果时间紧张，以下是**绝对不能跳过**的步骤：

- [ ] **Spike 验证**：确认内存和性能可行（1-2h）
- [ ] **Phase 1-4 开发**：实现核心功能（11-17h）
- [ ] **添加 GeoNames 署名**：README + 管理后台（5 分钟）
- [ ] **回归测试**：确保国家级规则仍正常（15 分钟）
- [ ] **Test 环境验证**：运行 24h 无崩溃（24h 等待）
- [ ] **准备回滚方案**：保留上一版本部署脚本（10 分钟）
- [ ] **生产上线**：部署 + 首日监控（1h + 观察）

**最少总时间**：~15 小时开发 + 24 小时观察 = 2 天

---

**个人项目关键路径（精简版）**：
```
Day 1: 快速决策 + Spike 验证（2h）
Day 2: 周末突击开发 Phase 1-4（8-12h）
Day 3: Test 环境观察（24h）
Day 4: 生产上线

或分散执行：
Week 1: Spike 验证 + Phase 1-2（6h，工作日晚上）
Week 2: Phase 3-4 + Test 验证（5h 开发 + 24h 观察）
Week 3: 生产上线
```

**总预计时间**：
- 最快：**3 天**（周末突击 + 灰度 + 上线）
- 舒适：**2 周**（工作日晚上分散开发）

---

## 📊 文档统计

| 指标 | 数量 | 个人项目建议 |
|------|------|------------|
| 总行数 | ~1,730 行 | 重点看前 30% |
| 主要章节 | 15 个 | 必看 3 个（快速开始、导入脚本、验收清单） |
| 决策点 | 7 个（精简版） | 30 分钟快速决策 |
| 验收检查点 | 7 项（极简版） | 绝对不能跳过 |
| 完整验收点 | 74 项（可选） | 按需参考 |
| 代码示例 | 18+ 个 | 直接复用 |
| Phase 数量 | 5 个（Phase 0-4） | 周末可完成 |
| **总开发时间** | **11-17 小时** | **2-3 天（含 24h 灰度）** |

---

## 🎯 个人开发者快速导航

**核心章节（必读）**：
- 🚀 **[快速开始](#-快速开始个人开发者)**（周末 3 天上线路径）
- 📋 **[GeoNames 导入脚本规范](#-geonames-导入脚本规范)**（实现细节）
- 🧪 **[Spike 验证计划](#-spike-验证计划phase-0)**（1-2h 快速验证）
- ✅ **[极简版执行清单](#极简版执行清单最少步骤)**（7 项必做）
- 🎯 **[下一步行动](#-下一步行动个人项目版)**（3 步启动）

**参考章节（按需查阅）**：
- 🔑 [关键决策点](#-关键决策点)（技术方案详解）
- 📐 [实施计划](#-实施计划)（Phase 1-4 详细任务）
- ✅ [完整验收清单](#-上线验收清单go-live-checklist)（74 项详细检查）
- ⚠️ [风险与应对](#️-风险与应对)（问题预案）

---

## ✅ 个人项目适配总结

本方案已针对**单人开发**场景进行优化：

**简化的流程**：
- ✅ 移除多方审批和会议（决策 30 分钟即可）
- ✅ 灰度时长可缩短至 24h（团队项目建议 48h）
- ✅ 单元测试覆盖核心逻辑即可（不强求 80%）
- ✅ Code Review 自己完成即可

**保留的核心**：
- ⚠️ **必须执行 Spike 验证**（避免技术风险）
- ⚠️ **必须添加 GeoNames 署名**（许可证合规）
- ⚠️ **必须做回归测试**（确保不影响现有功能）
- ⚠️ **必须准备回滚方案**（快速恢复能力）

**推荐执行方式**：
```
周六上午：下载 GeoNames 数据 + Spike 验证（2h）
周六下午：Phase 1-2 后端开发（4h）
周六晚上：Phase 3-4 前端开发 + 测试（3h）
周日全天：Test 环境观察 24h（自动运行）
周一：生产上线 + 首日监控（1h）
```

**最少总时间**：~15h 开发 + 24h 观察 = **周末即可完成**

---

**🚀 方案已就绪，可立即开始 Spike 验证！**

---

## 🎁 Quick Win: IP 监控显示原始城市（30 分钟）

### 背景与动机

当前 IP 监控页面的"主要来源"列只显示国家信息，但用户希望看到城市级别的来源。完整的城市聚合需要等待城市级访问控制方案实施完成（11-17h），但可以先用 **30 分钟**实现一个轻量版本，立即看到效果。

**核心思路**：
- 采集层已有 `cf.city` 数据存储在 `traffic_events.city`
- 聚合时额外保存"最后一次出现的城市"字符串
- 前端直接显示原始城市名称（未标准化）

### 实施步骤

#### Step 1: 修改 IP 聚合逻辑（15 分钟）

**文件**：`apps/api/src/lib/ip-aggregator.ts`

```typescript
// 在 aggregateIPTrafficDaily() 函数中
// 找到构建 daily aggregation 的地方，添加 lastSeenCity 字段

interface IPTrafficDaily {
  ip: string;
  date: string;
  requests: number;
  primaryCountry: string;
  lastSeenCity?: string;  // ← 新增字段
  // ... 其他字段
}

// 在聚合循环中，记录最后一次出现的城市
for (const event of events) {
  const city = event.city;
  
  if (city && city !== 'UNKNOWN') {
    aggregatedData.lastSeenCity = city;  // 简单覆盖，保留最新的
  }
}

// 或者更智能的方式：保留出现次数最多的城市
const cityCounts = new Map<string, number>();
for (const event of events) {
  if (event.city && event.city !== 'UNKNOWN') {
    cityCounts.set(event.city, (cityCounts.get(event.city) || 0) + 1);
  }
}
// 选择出现次数最多的城市
const mostFrequentCity = Array.from(cityCounts.entries())
  .sort((a, b) => b[1] - a[1])[0]?.[0];
aggregatedData.lastSeenCity = mostFrequentCity;
```

**写入 D1 时添加字段**：
```typescript
// 在 INSERT INTO ip_traffic_daily 的 SQL 语句中
await db.prepare(`
  INSERT INTO ip_traffic_daily (
    ip, date, requests, primary_country, last_seen_city, ...
  ) VALUES (?, ?, ?, ?, ?, ...)
`).bind(
  ip, date, requests, primaryCountry, lastSeenCity, ...
).run();
```

**⚠️ 注意**：需要先在 D1 数据库中添加 `last_seen_city` 列：
```sql
-- 在 migrations/ 下创建新的迁移文件
ALTER TABLE ip_traffic_daily 
ADD COLUMN last_seen_city TEXT;
```

#### Step 2: 修改 IP 监控 API（5 分钟）

**文件**：`apps/api/src/routes/admin/ip-monitor.ts`

```typescript
// 在返回 IP 列表的接口中，添加 rawCity 字段
app.get('/api/admin/ip-monitor/ips', async (c) => {
  // ... 查询逻辑
  
  const results = await db.prepare(`
    SELECT 
      ip,
      primary_country,
      last_seen_city,  -- ← 新增
      requests,
      ...
    FROM ip_traffic_daily
    WHERE ...
  `).all();
  
  return c.json({
    items: results.map(row => ({
      ip: row.ip,
      primaryCountry: {
        name: getCountryName(row.primary_country),
        code: row.primary_country,
        count: row.requests
      },
      rawCity: row.last_seen_city || null,  // ← 新增
      // ...
    }))
  });
});
```

#### Step 3: 修改前端显示（10 分钟）

**文件**：`apps/web/src/features/ip-monitor/components/ip-list-table.tsx`

```typescript
// 在 ColumnDef 定义中，找到"主要来源"列（约第 155 行）
{
  accessorKey: 'primaryCountry',
  header: '主要来源',
  cell: ({ row }) => {
    const { primaryCountry, rawCity } = row.original;
    
    // 如果有城市数据，显示"城市, 国家"格式
    if (rawCity) {
      return (
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="font-medium">{rawCity}</div>
            <div className="text-xs text-muted-foreground">
              {primaryCountry.name} ({primaryCountry.code})
            </div>
          </div>
        </div>
      );
    }
    
    // 没有城市数据，只显示国家
    return (
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <span>{primaryCountry.name} ({primaryCountry.code})</span>
      </div>
    );
  }
}
```

**类型定义**（如果使用 TypeScript）：
```typescript
// apps/web/src/features/ip-monitor/types.ts
export interface IPMonitorItem {
  ip: string;
  primaryCountry: {
    name: string;
    code: string;
    count: number;
  };
  rawCity?: string | null;  // ← 新增
  // ...
}
```

### 效果展示

**改动前**：
```
IP 地址          主要来源
1.2.3.4         中国 (CN)
5.6.7.8         美国 (US)
```

**改动后**：
```
IP 地址          主要来源
1.2.3.4         Beijing
                中国 (CN)
                
5.6.7.8         New York
                美国 (US)
```

### 验证步骤

1. **本地测试**（5 分钟）
   ```bash
   # 1. 运行迁移
   cd apps/api
   wrangler d1 execute API_GATEWAY_DB --local --file=migrations/XXXX_add_last_seen_city.sql
   
   # 2. 重新聚合（触发一次聚合任务）
   npm run dev  # 访问后端触发聚合
   
   # 3. 查看数据
   wrangler d1 execute API_GATEWAY_DB --local --command="SELECT ip, last_seen_city FROM ip_traffic_daily LIMIT 10"
   ```

2. **前端验证**（2 分钟）
   - 访问 IP 监控页面
   - 查看"主要来源"列是否显示城市
   - 悬停查看是否有国家信息

3. **数据质量检查**（3 分钟）
   - 检查城市名称是否合理（可能有大小写问题）
   - 记录常见的城市名称变体（如 "beijing" vs "Beijing"）
   - 为后续 Spike 验证提供依据

### 已知限制

- ⚠️ **未标准化**：城市名称可能是 "Beijing"、"北京"、"BEIJING"、"beijing" 等不同形式
- ⚠️ **未聚合**：显示的是最后一次或最频繁的城市，不是加权聚合
- ⚠️ **无坐标**：无法在地图上显示（需要完整方案）
- ⚠️ **无别名**：简称（如 "NYC"）不会转换为标准名称

### 与完整方案的关系

这个 Quick Win 是完整城市级方案的**前置步骤**，可以：

1. **验证数据质量**：立即看到 Cloudflare 返回的城市数据是否准确
2. **识别问题**：发现常见的城市名称变体，指导别名表设计
3. **快速迭代**：30 分钟即可上线，用户立即看到改进
4. **平滑过渡**：后续实施完整方案时，只需替换 `rawCity` 为 `standardizedCity`

### 实施时机建议

**选项 A：立即实施**（推荐）
- 今天或明天花 30 分钟完成
- 立即看到城市数据，验证 Cloudflare 数据质量
- 为周末的 Spike 验证提供实际数据

**选项 B：与 Phase 1 一起做**
- 在实施城市级方案的 Phase 1 时一并完成
- 避免重复改动（直接做标准化版本）
- 但用户需要等待 1-2 周才能看到改进

**个人建议**：选择选项 A，因为 30 分钟的投入可以立即看到效果，且能为后续方案提供数据验证。

---

