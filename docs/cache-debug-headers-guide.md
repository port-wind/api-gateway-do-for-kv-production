
# 缓存调试响应头完整指南

## 📊 所有缓存相关响应头

### 1. 缓存状态头

| 响应头 | 取值 | 说明 | 示例 |
|--------|------|------|------|
| `X-Cache-Status` | HIT/STALE/MISS | 缓存命中状态 | `HIT` |
| `X-Cache-Stale` | true/false | 是否为过期缓存 | `true` |
| `X-Cache-Updating` | true/false | 是否正在后台刷新 | `false` |

### 2. 缓存年龄头（新增！）✨

| 响应头 | 单位 | 说明 | 示例 |
|--------|------|------|------|
| **`Age`** | 秒 | **标准HTTP头**，缓存年龄 | `15` |
| **`X-Cache-Age`** | 秒 | 自定义头，缓存存在时长 | `15` |

💡 **使用场景**：
- 快速判断缓存是否新鲜
- 计算缓存命中率
- 调试缓存TTL设置

### 3. 缓存时间头

| 响应头 | 格式 | 说明 | 示例 |
|--------|------|------|------|
| `X-Cache-Created` | ISO 8601 | 缓存创建时间 | `2025-10-07T11:11:30.014Z` |
| `X-Cache-Expires` | ISO 8601 | 缓存过期时间 | `2025-10-07T11:16:30.014Z` |

### 4. 缓存TTL头

| 响应头 | 单位 | 说明 | 示例 |
|--------|------|------|------|
| `X-Cache-TTL` | 秒 | 总TTL（包含随机化） | `300` |
| `X-Cache-Remaining-TTL` | 秒 | 剩余TTL（负数=已过期） | `285` 或 `-10` |

### 5. 其他头

| 响应头 | 说明 | 示例 |
|--------|------|------|
| `X-Cache-Version` | 缓存版本号 | `200` |
| `X-Cache-Key` | 缓存键（截断） | `cache:v200:/kv/...` |
| `X-Cache-Warmer` | 是否为预热缓存 | `true` |


## 🔍 实际调试示例

### 示例 1：正常缓存命中

```bash
$ curl -I 'http://localhost:8787/api/users'

Age: 45                              # 缓存已存在45秒
X-Cache-Age: 45                      
X-Cache-Status: HIT                  # 命中
X-Cache-Created: 2025-10-07T11:10:00.000Z
X-Cache-TTL: 300                     # 总TTL 5分钟
X-Cache-Remaining-TTL: 255           # 还剩255秒
X-Cache-Expires: 2025-10-07T11:15:00.000Z
```

**分析**：
- ✅ 缓存命中，响应快速
- ✅ 缓存还有 255 秒才过期
- ✅ 数据新鲜度：45/300 = 15%，很新鲜


### 示例 2：过期缓存（SWR 触发）

```bash
$ curl -I 'http://localhost:8787/api/users'

Age: 310                             # 已存在310秒
X-Cache-Age: 310
X-Cache-Status: STALE                # 过期
X-Cache-Stale: true
X-Cache-Updating: true               # 正在后台刷新
X-Cache-TTL: 300
X-Cache-Remaining-TTL: -10           # 负数！已过期10秒
X-Cache-Expires: 2025-10-07T11:15:00.000Z
```

**分析**：
- ⚡ SWR 机制生效，立即返回过期缓存
- 🔄 后台正在刷新（updating=true）
- ⏱️ 已过期 10 秒（Age 310 - TTL 300 = 10）
- ✅ 用户无感知，响应仍然很快


### 示例 3：缓存未命中

```bash
$ curl -I 'http://localhost:8787/api/users'

X-Cache-Status: MISS                 # 未命中
X-Cache-Version: 200
X-Cache-Key: cache:v200:/api/users...
```

**分析**：
- ❌ 缓存不存在或已被清除
- 📝 系统会创建新缓存
- ⏱️ 响应时间较慢（需要请求后端）


### 示例 4：预热的缓存

```bash
$ curl -I 'http://localhost:8787/api/users'

Age: 0                               # 刚创建
X-Cache-Age: 0
X-Cache-Status: HIT
X-Cache-Warmer: true                 # 预热标记
X-Cache-Created: 2025-10-07T11:20:00.000Z
```

**分析**：
- 🔥 这是预热创建的缓存
- ✅ 用户首次请求就命中
- 🚀 消除冷启动延迟


## 📈 使用场景

### 1. 判断缓存新鲜度

```bash
# 获取 Age 和 TTL
AGE=$(curl -I 'http://localhost:8787/api/users' 2>&1 | grep "^Age:" | awk '{print $2}' | tr -d '\r')
TTL=$(curl -I 'http://localhost:8787/api/users' 2>&1 | grep "^X-Cache-TTL:" | awk '{print $2}' | tr -d '\r')

# 计算新鲜度百分比
FRESHNESS=$(echo "scale=2; (1 - $AGE / $TTL) * 100" | bc)
echo "缓存新鲜度: ${FRESHNESS}%"
```

### 2. 监控缓存命中率

```bash
# 采样100个请求
for i in {1..100}; do
  curl -I 'http://localhost:8787/api/users' 2>&1 | grep "X-Cache-Status"
done | sort | uniq -c

# 输出示例:
#   85 X-Cache-Status: HIT
#   10 X-Cache-Status: STALE
#    5 X-Cache-Status: MISS
# 命中率: (85+10)/100 = 95%
```

### 3. 验证 TTL 配置

```bash
# 1. 记录创建时间
curl -I 'http://localhost:8787/api/users' 2>&1 | grep "X-Cache-Created"

# 2. 等待一段时间后检查 Age
sleep 60
curl -I 'http://localhost:8787/api/users' 2>&1 | grep -E "Age|X-Cache-Remaining-TTL"

# 3. 验证 Age 增长是否正确
# Age 应该约等于等待的时间
```

### 4. 调试 SWR 机制

```bash
# 1. 配置短 TTL
curl -X PUT 'http://localhost:8787/api/admin/paths/%2Fapi%2Fusers' \
  -H 'Content-Type: application/json' \
  --data '{"cache": {"enabled": true, "ttl": 10}}'

# 2. 创建缓存
curl 'http://localhost:8787/api/users' > /dev/null

# 3. 等待过期
sleep 11

# 4. 检查是否返回 STALE
curl -I 'http://localhost:8787/api/users' 2>&1 | grep -E "Age|X-Cache-Status|X-Cache-Stale|X-Cache-Updating"

# 预期输出:
#   Age: 11
#   X-Cache-Status: STALE
#   X-Cache-Stale: true
#   X-Cache-Updating: true
```


## 🛠️ 调试技巧

### 技巧 1：一键查看所有缓存头

```bash
alias cache-headers='curl -I "$1" 2>&1 | grep -E "^(Age|X-Cache-)"'

# 使用
cache-headers 'http://localhost:8787/api/users'
```

### 技巧 2：计算缓存过期时间

```bash
# 获取剩余 TTL
REMAINING=$(curl -I 'http://localhost:8787/api/users' 2>&1 | grep "X-Cache-Remaining-TTL:" | awk '{print $2}' | tr -d '\r')

if [ $REMAINING -gt 0 ]; then
  echo "缓存将在 $REMAINING 秒后过期"
  EXPIRE_TIME=$(date -d "+$REMAINING seconds" +"%H:%M:%S")
  echo "过期时间: $EXPIRE_TIME"
else
  echo "缓存已过期 $((-$REMAINING)) 秒"
fi
```

### 技巧 3：监控缓存刷新

```bash
# 持续监控缓存状态
watch -n 1 'curl -I "http://localhost:8787/api/users" 2>&1 | grep -E "Age|X-Cache-Status|X-Cache-Updating"'
```


## 📊 响应头关系图

```
创建时间                     过期时间
    |                          |
    v                          v
    +------------ TTL ----------+
    |                           |
    |<-- Age -->|               |
    |           |<- Remaining ->|
    |           |               |
   创建        现在            过期

Age + Remaining = TTL
```

**示例**：
- TTL = 300 秒
- Age = 45 秒
- Remaining = 255 秒
- 45 + 255 = 300 ✅


## 🔥 常见问题

### Q1: Age 和 X-Cache-Age 有什么区别？

**A**: 
- `Age`: 标准 HTTP 响应头（RFC 7234）
- `X-Cache-Age`: 自定义头，更明确地表示缓存年龄
- 两者值相同，建议优先使用 `Age`

### Q2: Remaining-TTL 为负数是什么意思？

**A**: 表示缓存已过期。
- `-10` = 已过期 10 秒
- 此时应该看到 `X-Cache-Status: STALE`

### Q3: Age > TTL 时为什么还能命中？

**A**: SWR 机制！
- 缓存过期后不会立即删除
- 系统返回过期缓存（STALE）
- 同时后台刷新
- 用户无感知

### Q4: 如何判断缓存是否太旧？

**A**: 看新鲜度百分比：
```
新鲜度 = (1 - Age/TTL) * 100%

100%-80%: 很新鲜 ✅
80%-50%:  一般 ⚠️
50%-0%:   较旧 ⚠️
<0%:      已过期（STALE）❌
```


## 🎯 最佳实践

1. **开发环境**：使用短 TTL（10-30秒）方便测试
2. **生产环境**：根据数据特性设置合理 TTL
3. **监控告警**：Age 过大时触发告警
4. **日志记录**：记录 Age、Status、Remaining-TTL
5. **性能分析**：分析不同 Age 区间的响应时间


## 📝 总结

新增的 **Age** 头极大地方便了调试：

- ✅ 快速判断缓存新鲜度
- ✅ 验证 TTL 配置是否合理
- ✅ 监控缓存命中率
- ✅ 调试 SWR 机制
- ✅ 符合 HTTP 标准

