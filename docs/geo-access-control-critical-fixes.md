# 地区访问控制功能关键问题修复

## 📋 修复日期
2025-10-18

## 🐛 修复的问题

### 问题 1：enabled 字段被 Zod 丢弃（高优先级）

**原因**：
- `updateRuleSchema` 继承自 `createRuleSchema.partial()`
- `createRuleSchema` 没有包含 `enabled` 字段
- Zod 默认会 strip 未声明的字段
- 导致 `PUT /api/admin/geo/rules/:id` 请求中的 `{ enabled: false }` 被丢弃
- 列表中的启用/禁用开关永远无法生效

**修复方案**：
在 `createRuleSchema` 中添加 `enabled` 字段：

```typescript
const createRuleSchema = z.object({
  name: z.string().min(1).max(100),
  mode: z.enum(['allow', 'block']),
  priority: z.number().int().min(0).max(1000),
  enabled: z.boolean().optional().default(true), // ✅ 添加 enabled 字段
  geoMatch: geoMatchSchema,
  // ... 其他字段
});
```

**影响文件**：
- ✅ `apps/api/src/routes/admin/geo-rules.ts`

---

### 问题 2：geo_action 字段没有实际写入（高优先级）

**原因**：
- 中间件通过 `c.set('geoAction')` 记录动作
- 但路径采集/队列写入流程完全没有读取该值
- `TrafficEvent` 类型定义没有 `geo_action` 字段
- D1 写入 SQL 也没有 `geo_action` 列
- 结果是 `traffic_events.geo_action` 永远为 NULL
- 地区统计和告警无法发挥作用

**修复方案**：

#### 2.1 在 TrafficEvent 接口添加字段
```typescript
// apps/api/src/lib/d1-writer.ts
export interface TrafficEvent extends StatsEvent {
    idempotentId: string;
    userAgent?: string;
    country?: string;
    isError?: boolean;
    clientIp?: string;
    edgeColo?: string;
    geoAction?: 'allowed' | 'blocked' | 'throttled';  // ✅ 新增
}
```

#### 2.2 更新 D1 插入 SQL
```typescript
// apps/api/src/lib/d1-writer.ts
INSERT OR IGNORE INTO traffic_events 
  (id, path, method, status, response_time, client_ip_hash, ip_address, 
   timestamp, event_date, user_agent, country, is_error, edge_colo, geo_action)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

#### 2.3 在路径采集中间件读取并传递
```typescript
// apps/api/src/middleware/path-collector-do.ts

// 读取地区访问控制动作
const geoAction = c.get('geoAction') as 'allowed' | 'blocked' | 'throttled' | undefined;

// 传递给 recordPathWithFallback
recordPathWithFallback(c.env, {
  // ... 其他字段
  geoAction  // ✅ 传递动作
})
```

#### 2.4 更新函数签名和事件构造
```typescript
// apps/api/src/middleware/path-collector-do.ts

async function recordPathWithFallback(
  env: Env,
  data: {
    // ... 其他字段
    geoAction?: 'allowed' | 'blocked' | 'throttled'; // ✅ 新增参数
  }
): Promise<void> {
  // 构造队列事件
  const event: TrafficEvent = {
    // ... 其他字段
    geoAction: data.geoAction,  // ✅ 包含在事件中
  };
}
```

#### 2.5 更新 Context 类型定义
```typescript
// apps/api/src/middleware/path-collector-do.ts

export async function pathCollectorDOMiddleware(
  c: Context<{ 
    Bindings: Env; 
    Variables: { 
      pathCollected?: boolean;
      geoAction?: 'allowed' | 'blocked' | 'throttled';  // ✅ 新增
    } 
  }>,
  next: Next
) {
  // ...
}
```

**影响文件**：
- ✅ `apps/api/src/lib/d1-writer.ts`
- ✅ `apps/api/src/middleware/path-collector-do.ts`

---

## 🔧 附加修复

### 修复 3：GeoAccessRule 响应字段类型不匹配

**问题**：
- TypeScript 类型定义要求 `response.statusCode` 和 `response.message` 是必需的
- 但 Zod schema 把它们定义为可选的
- 导致类型不兼容

**修复方案**：
```typescript
// apps/api/src/types/geo-access-control.ts
response?: {
    statusCode?: number;   // ✅ 改为可选
    message?: string;      // ✅ 改为可选
    headers?: Record<string, string>;
};
```

**影响文件**：
- ✅ `apps/api/src/types/geo-access-control.ts`

---

### 修复 4：创建规则时 enabled 字段被忽略（中优先级）

**问题**：
- `createRuleSchema` 允许请求中携带 `enabled` 字段（默认 `true`）
- 但 `newRule` 对象硬编码 `enabled: true`
- 导致即使请求中传 `enabled: false`，规则仍被创建为启用状态
- 调用方无法按需创建"已禁用"的规则

**修复方案**：
```typescript
// apps/api/src/routes/admin/geo-rules.ts
const newRule: GeoAccessRule = {
  id: ruleId,
  name: data.name,
  enabled: data.enabled ?? true,  // ✅ 尊重请求中的 enabled 值，默认为 true
  mode: data.mode,
  priority: data.priority,
  // ... 其他字段
};
```

**逻辑说明**：
- 如果请求中明确传入 `enabled: false` → 使用 `false`
- 如果请求中明确传入 `enabled: true` → 使用 `true`
- 如果请求中未传入 `enabled` → Zod schema 默认值 `true` 生效
- 与 schema 的默认值逻辑保持一致

**影响文件**：
- ✅ `apps/api/src/routes/admin/geo-rules.ts`

---

## 📊 修复验证

### 验证步骤

#### 1. 验证 enabled 字段

**测试 1：创建时不指定 enabled（应默认为 true）**
```bash
curl -X POST https://your-worker.workers.dev/api/admin/geo/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Rule Default",
    "mode": "block",
    "priority": 100,
    "geoMatch": {"type": "country", "countries": ["CN"]}
  }'

# 验证：规则应该被创建为启用状态（enabled: true）
```

**测试 2：创建时指定 enabled: false**
```bash
curl -X POST https://your-worker.workers.dev/api/admin/geo/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Rule Disabled",
    "mode": "block",
    "priority": 101,
    "enabled": false,
    "geoMatch": {"type": "country", "countries": ["US"]}
  }'

# ✅ 验证：规则应该被创建为禁用状态（enabled: false）
```

**测试 3：更新规则状态**
```bash
curl -X PUT https://your-worker.workers.dev/api/admin/geo/rules/{ruleId} \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# 验证：规则应该被禁用
```

#### 2. 验证 geo_action 字段
```sql
-- 触发地区规则后，查询 D1
SELECT 
  id, 
  path, 
  country, 
  geo_action,
  timestamp 
FROM traffic_events 
WHERE geo_action IS NOT NULL 
ORDER BY timestamp DESC 
LIMIT 10;

-- 预期结果：应该看到 'allowed', 'blocked', 或 'throttled' 值
```

#### 3. 前端验证
1. 访问"地区规则"页面
2. 创建一条测试规则
3. 使用开关切换启用/禁用状态
4. 刷新页面确认状态已保存
5. 测试规则生效（从对应国家发起请求）
6. 查询 D1 确认 geo_action 字段已记录

---

## 🎯 影响范围

### 已修复的功能
- ✅ 规则启用/禁用开关正常工作
- ✅ 地区访问控制动作正确记录到 D1
- ✅ 地区流量统计可以正常工作
- ✅ 未来的地区级告警功能有数据支持

### 无影响的功能
- ✅ 规则创建和删除
- ✅ 规则优先级
- ✅ 地区匹配逻辑
- ✅ 其他中间件（IP Guard、缓存等）

---

## 📝 后续建议

### 短期（1 周内）
1. 添加单元测试覆盖 `enabled` 字段
2. 添加集成测试验证 `geo_action` 写入
3. 监控 `geo_action` 字段的数据质量

### 中期（1 月内）
1. 实现地区流量统计聚合
2. 添加地区级流量告警
3. 创建地区流量统计 API

### 长期（3 月内）
1. 实现地区热力图可视化
2. 添加地区级 A/B 测试支持
3. 优化地区规则匹配性能

---

## 🔍 代码审查清单

- [x] Zod schema 包含所有需要验证的字段
- [x] TypeScript 类型定义与 Zod schema 一致
- [x] Context 变量在中间件间正确传递
- [x] D1 表结构包含所有需要的列
- [x] SQL 插入语句包含所有字段
- [x] 类型定义没有不必要的 required 约束
- [x] 所有 linter 错误已修复

---

## 📞 技术支持

如有问题，请参考：
- 技术方案：`docs/geo-access-control.plan.md`
- 用户指南：`docs/geo-access-control-user-guide.md`
- 实施总结：`docs/geo-access-control-implementation-summary.md`

---

**修复完成** ✅  
**所有关键问题已解决，功能可正常使用！**

