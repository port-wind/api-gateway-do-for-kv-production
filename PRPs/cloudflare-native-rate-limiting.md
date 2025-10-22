name: "Durable Objects Rate Limiting Optimization with Dynamic Configuration"
description: |
  基于现有 Durable Objects 的限流系统优化，支持动态配置管理，
  经可行性验证后确认为最佳方案。

## 目标
优化现有基于 Durable Objects 的限流系统，实现动态配置管理，
提升性能和可靠性，同时保持系统的简洁性和可维护性。

## 原因
- **性能优化**: 基于现有 DO 架构，优化调用频率和存储策略
- **可行性确认**: 经验证 Native Rate Limiting API 无法动态配置，DO 方案更可靠
- **配置灵活性**: 通过 KV 存储实现动态配置管理，无需重新部署
- **架构优势**: 基于 IP 分片的 DO 架构天然避免 1000 并发限制
- **故障容错**: KV + DO 双重保障确保服务高可用性

## 内容
系统将实现以下核心功能：
1. 优化的 Durable Objects 限流（主方案）
2. KV + TTL 限流（辅助方案）
3. 动态配置管理（通过 KV 存储 + Admin API）
4. 性能优化（白名单、批量检查、Alarms API）
5. 实时监控与告警

### 成功标准
- [ ] 限流检查延迟 < 50ms (P99)
- [ ] 单个 IP 支持 1000 并发请求/秒
- [ ] 总体支持 50000+ 请求/秒（Worker 限制）
- [ ] 配置更新生效时间 < 60 秒
- [ ] 零配置更新期间的服务中断
- [ ] 完整的测试覆盖率 > 80%

## 可行性验证结果

### ❌ 排除的方案
1. **Cloudflare Native Rate Limiting API**
   - **限制**：配置必须在 wrangler.toml 中静态定义
   - **问题**：运行时无法动态读取或修改配置
   - **API 返回**：仅提供 {success: boolean}，无详细信息
   - **结论**：不符合动态配置管理需求

2. **Worker 内存缓存**
   - **限制**：Worker 是无状态的，每次请求可能在不同实例
   - **问题**：无法依赖全局变量或内存状态
   - **结论**：在 Cloudflare Worker 环境不可行

### ✅ 推荐方案：优化的 Durable Objects

#### 架构优势分析
1. **1000 并发限制不是瓶颈**
   - 每个 IP 独立的 DO 实例（基于 IP 分片）
   - 单个 IP 很难达到 1000 并发请求/秒
   - 达到限制时正好实现了限流保护
   - 其他 IP 不受影响

2. **水平扩展能力**
   - 可创建无限数量的 DO 实例
   - 1000 个不同 IP = 1000 个独立 DO
   - 每个 DO 处理自己的 IP 请求

3. **容量估算**
   | 指标 | 当前架构支持 |
   |-----|-------------|
   | 独立 IP 数量 | 无限制 |
   | 单 IP 并发 | 1000 req/s |
   | 总体并发 | ~50k req/s（Worker 限制）|
   | 延迟 | 10-50ms |

4. **成本效益**
   - 基于现有稳定实现
   - 无需重构架构
   - 主要是性能优化和功能增强

## 所需全部上下文

### 文档与参考资料
```yaml
# 必读 - 将这些包含在你的上下文窗口中
- url: https://developers.cloudflare.com/durable-objects/platform/limits/
  why: Durable Objects 限制和性能指标，了解 1000 并发限制
  
- url: https://developers.cloudflare.com/durable-objects/examples/build-a-rate-limiter/
  why: Durable Objects 限流器实现示例，了解令牌桶算法和 Alarms API
  
- url: https://developers.cloudflare.com/kv/api/write-key-value-pairs/
  why: KV 存储 TTL 功能文档，用于实现自动过期的限流计数器
  
- url: https://developers.cloudflare.com/kv/platform/limits/
  why: KV 存储限制，了解写入频率限制和 TTL 最小值

- file: apps/api/src/middleware/rate-limit.ts
  why: 现有限流中间件实现，了解当前模式和需要保持的兼容性
  
- file: apps/api/src/durable-objects/RateLimiter.ts
  why: 现有 Durable Object 实现，作为降级策略的参考
  
- file: apps/api/src/lib/config.ts
  why: 配置管理模块，了解动态配置的存储和读取模式

- file: apps/api/src/routes/admin/rate-limit.ts
  why: 管理 API 实现，了解配置更新接口
  
- docfile: docs/rate-limit-optimization-plan.md
  why: 已有的优化方案文档，包含详细的技术设计
```

### 当前代码库结构
```bash
api-gateway-do-for-kv/                    # 根 Monorepo
├── pnpm-workspace.yaml                   # Workspace 配置
├── package.json                          # 根脚本（@gateway/monorepo）
├── apps/
│   ├── api/                             # @gateway/api - API 网关
│   │   ├── src/
│   │   │   ├── index.ts                 # 主应用入口
│   │   │   ├── routes/                  # 路由目录
│   │   │   │   └── admin/              # 管理 API
│   │   │   │       └── rate-limit.ts   # 限流配置管理
│   │   │   ├── middleware/              # 中间件目录
│   │   │   │   └── rate-limit.ts       # 当前限流中间件
│   │   │   ├── durable-objects/         # Durable Objects
│   │   │   │   └── RateLimiter.ts      # 限流器 DO
│   │   │   ├── lib/                     # 工具库
│   │   │   │   ├── config.ts           # 配置管理
│   │   │   │   └── constants.ts        # 常量定义
│   │   │   ├── schemas/                 # 验证模式
│   │   │   └── types/                   # 类型定义
│   │   │       ├── config.ts           # 配置类型
│   │   │       └── env.ts              # 环境类型
│   │   ├── wrangler.toml                # Worker 配置
│   │   └── package.json                 # API 依赖
│   └── web/                             # @gateway/web - 管理后台
└── docs/                                # 文档目录
    └── rate-limit-optimization-plan.md # 优化方案
```

### 目标代码库结构
```bash
apps/api/src/                            
├── middleware/
│   ├── rate-limit.ts                   # 改造：支持多策略选择
│   └── rate-limit-native.ts            # 新增：Native API 实现
├── lib/
│   ├── rate-limit/                     # 新增：限流相关工具
│   │   ├── strategies/                 # 限流策略实现
│   │   │   ├── native.ts              # Native API 策略
│   │   │   ├── kv.ts                  # KV + TTL 策略
│   │   │   ├── durable.ts             # Durable Objects 策略
│   │   │   └── hybrid.ts              # 混合策略
│   │   ├── config-manager.ts          # 配置管理器
│   │   ├── selector.ts                # 策略选择器
│   │   └── types.ts                   # 限流类型定义
│   └── config.ts                       # 改造：增强配置管理
├── types/
│   ├── config.ts                       # 改造：扩展配置类型
│   └── env.ts                          # 改造：添加 Native API 绑定
└── tests/
    └── integration/
        └── rate-limit-native.test.ts   # 新增：Native API 测试
```

### Known Gotchas & Library Quirks
```typescript
// 重要：可行性验证结果
// 1. Native Rate Limiting API 无法动态配置，不适合本项目
// 2. 当前基于 IP 分片的 DO 架构是最佳方案
// 3. DO 的 1000 并发限制不会影响我们（每个 IP 独立 DO）
// 4. 单个 IP 很难达到 1000 并发，达到了正好实现限流

// KV 存储限制（作为辅助方案）
// 1. 每个键每秒只能写入一次，超过会返回 429 错误
// 2. TTL 最小值为 60 秒，适合分钟级窗口限流
// 3. 最终一致性，可能有最多 60 秒延迟
// 4. 主要用于配置存储，不是主要限流手段

// Durable Objects 注意事项（主方案）
// 1. 当前按 IP 分片架构已经很好，继续优化
// 2. 每次调用有成本，可通过批量操作和缓存优化
// 3. 使用 Alarms API 定时清理，减少存储占用
// 4. 考虑添加白名单机制，跳过可信 IP 的 DO 调用

// Workers 环境特殊性
// 1. 无状态执行，不能依赖内存存储
// 2. 请求体只能读取一次，需要先克隆
// 3. 使用 Web 标准 API，不是 Node.js API

// 重要：所有注释必须使用中文
```

## Implementation Blueprint

### Data Models and Structure
```typescript
// 增强的限流配置类型
interface EnhancedRateLimitConfig extends RateLimitConfig {
  // 限流策略类型
  strategy: 'durable' | 'kv' | 'hybrid';
  
  // 路径到策略的映射
  pathStrategies?: Record<string, {
    strategy: 'durable' | 'kv';
    customLimit?: number;
    customWindow?: number;
    whitelist?: string[];  // IP 白名单
    blacklist?: string[];  // IP 黑名单
  }>;
  
  // 降级配置
  fallback?: {
    enabled: boolean;
    strategy: 'kv' | 'allow' | 'deny';
    kvLimit?: number;
    kvWindow?: number;
  };
  
  // 性能优化配置
  optimization?: {
    batchSize?: number;      // 批量检查大小
    cacheConfig?: boolean;   // 是否缓存配置
    useAlarms?: boolean;     // 是否使用 Alarms API
    cleanupInterval?: number; // 清理间隔（分钟）
  };
  
  // 监控配置
  monitoring?: {
    enabled: boolean;
    alertThreshold: number;
    metricsWindow: number;
  };
}

// KV 限流记录（用于分钟级窗口）
interface KVRateLimitRecord {
  count: number;
  windowStart: number;    // 窗口起始时间
  lastUpdate: number;     // 上次更新时间
  ip: string;             // IP 地址
}

// 限流策略接口
interface RateLimitStrategy {
  checkLimit(key: string, config: any): Promise<RateLimitResult>;
  batchCheck?(keys: string[], config: any): Promise<RateLimitResult[]>; // 批量检查
  reset(key: string): Promise<void>;
  getStatus(key: string): Promise<any>;
  cleanup?(): Promise<void>; // 定期清理
}
```

### 完成 PRP 所需任务列表（按完成顺序）

```yaml
任务 1: 创建限流策略接口和类型
创建 apps/api/src/lib/rate-limit/types.ts：
  - 定义增强的策略接口
  - 定义配置类型
  - 支持批量操作和清理

任务 2: 实现 KV + TTL 限流策略（辅助方案）
创建 apps/api/src/lib/rate-limit/strategies/kv.ts：
  - 使用 KV 存储和 60秒 TTL
  - 分钟级时间窗口算法
  - 处理写入频率限制

任务 3: 优化 Durable Objects 策略（主方案）
修改 apps/api/src/durable-objects/RateLimiter.ts：
  - 添加批量检查支持
  - 实现 Alarms API 定时清理
  - 优化存储操作

任务 4: 实现混合策略
创建 apps/api/src/lib/rate-limit/strategies/hybrid.ts：
  - DO 为主，KV 为辅
  - 白黑名单快速路径
  - 智能降级机制

任务 5: 创建策略选择器
创建 apps/api/src/lib/rate-limit/selector.ts：
  - 根据配置选择策略
  - 处理路径匹配
  - 管理策略实例

任务 6: 实现动态配置管理器
创建 apps/api/src/lib/rate-limit/config-manager.ts：
  - 从 KV 读取配置
  - 60秒缓存机制
  - 支持热更新

任务 7: 改造限流中间件
修改 apps/api/src/middleware/rate-limit.ts：
  - 集成新的策略系统
  - 添加性能监控
  - 保持向后兼容

任务 8: 更新 Admin API
修改 apps/api/src/routes/admin/rate-limit.ts：
  - 支持新的配置结构
  - 添加策略切换接口
  - 实现配置验证

任务 9: 添加测试用例
创建 apps/api/tests/integration/rate-limit-enhanced.test.ts：
  - 测试 DO 和 KV 策略
  - 测试配置动态更新
  - 测试性能优化

任务 10: 更新文档
创建 apps/api/docs/rate-limiting.md：
  - 架构设计说明
  - 配置示例
  - 性能优化指南
```

### 各任务伪代码

```typescript
// 任务 3: 优化 Durable Objects 策略
class OptimizedDurableRateLimitStrategy implements RateLimitStrategy {
  constructor(private env: Env) {}
  
  async checkLimit(key: string, config: any): Promise<RateLimitResult> {
    // 检查白名单（快速路径）
    if (config.whitelist?.includes(key)) {
      return { allowed: true, remaining: -1 };
    }
    
    // 检查黑名单（快速拒绝）
    if (config.blacklist?.includes(key)) {
      return { allowed: false, remaining: 0, resetAt: Date.now() + 60000 };
    }
    
    // 获取 DO 实例（按 IP 分片）
    const id = this.env.RATE_LIMITER.idFromName(key);
    const rateLimiter = this.env.RATE_LIMITER.get(id);
    
    try {
      const checkUrl = new URL('http://dummy/check');
      checkUrl.searchParams.set('ip', key);
      checkUrl.searchParams.set('limit', config.limit?.toString() || '100');
      checkUrl.searchParams.set('window', config.window?.toString() || '60');
      
      const response = await rateLimiter.fetch(checkUrl.toString());
      return await response.json();
    } catch (error) {
      console.error('DO rate limit failed:', error);
      // 降级到 KV 策略
      return this.fallbackToKV(key, config);
    }
  }
  
  // 批量检查支持
  async batchCheck(keys: string[], config: any): Promise<RateLimitResult[]> {
    // 对相同 IP 的请求进行批量处理
    const groupedByIP = keys.reduce((acc, key) => {
      const ip = this.extractIP(key);
      if (!acc[ip]) acc[ip] = [];
      acc[ip].push(key);
      return acc;
    }, {} as Record<string, string[]>);
    
    const results: RateLimitResult[] = [];
    for (const [ip, ipKeys] of Object.entries(groupedByIP)) {
      // 为每个 IP 批量检查
      const batchResult = await this.checkBatchForIP(ip, ipKeys, config);
      results.push(...batchResult);
    }
    
    return results;
  }
  
  private extractIP(key: string): string {
    // 从 key 中提取 IP
    return key.split(':')[0] || key;
  }
}

// 任务 2: KV 策略实现（辅助方案）
class KVRateLimitStrategy implements RateLimitStrategy {
  constructor(private env: Env) {}
  
  async checkLimit(key: string, config: any): Promise<RateLimitResult> {
    // 使用分钟级窗口（TTL 最小 60秒）
    const windowMinutes = Math.max(Math.floor((config.window || 60) / 60), 1);
    const limit = config.limit || 60;
    
    // 分钟级窗口键
    const windowKey = Math.floor(Date.now() / (windowMinutes * 60 * 1000));
    const kvKey = `ratelimit:${key}:${windowKey}`;
    
    try {
      // 获取当前计数
      const record = await this.env.KV.get<KVRateLimitRecord>(kvKey, 'json');
      const count = record?.count || 0;
      
      if (count >= limit) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: (windowKey + 1) * windowMinutes * 60 * 1000
        };
      }
      
      // 增加计数，使用 TTL 自动过期
      const newRecord: KVRateLimitRecord = {
        count: count + 1,
        windowStart: windowKey * windowMinutes * 60 * 1000,
        lastUpdate: Date.now(),
        ip: key
      };
      
      await this.env.KV.put(
        kvKey,
        JSON.stringify(newRecord),
        { expirationTtl: windowMinutes * 60 }
      );
      
      return {
        allowed: true,
        remaining: limit - count - 1
      };
    } catch (error) {
      // KV 写入限制错误处理
      if (error.message?.includes('429')) {
        console.warn(`KV write limit hit for key: ${kvKey}`);
        // 写入过快，可以放行或者降级到 DO
        return { allowed: true, remaining: -1 };
      }
      throw error;
    }
  }
  
  // 定期清理（虽然 TTL 会自动清理，但可以手动清理过期记录）
  async cleanup(): Promise<void> {
    // KV 有 TTL，不需要手动清理
    console.log('KV strategy: TTL handles cleanup automatically');
  }
}

// 任务 8: 配置管理器
class RateLimitConfigManager {
  private cache: Map<string, { config: any; expires: number }> = new Map();
  private readonly CACHE_TTL = 60000; // 60 秒缓存
  
  async getConfig(env: Env, path: string): Promise<any> {
    // 检查缓存
    const cached = this.cache.get(path);
    if (cached && cached.expires > Date.now()) {
      return cached.config;
    }
    
    // 从 KV 读取配置
    const config = await env.KV.get('config:rate-limit:enhanced', 'json');
    if (!config) {
      return this.getDefaultConfig();
    }
    
    // 匹配路径规则
    const pathConfig = this.matchPathConfig(config, path);
    
    // 缓存配置
    this.cache.set(path, {
      config: pathConfig,
      expires: Date.now() + this.CACHE_TTL
    });
    
    return pathConfig;
  }
  
  private matchPathConfig(config: any, path: string) {
    // 查找最匹配的路径配置
    for (const [pattern, pathConfig] of Object.entries(config.pathStrategies || {})) {
      if (this.matchPattern(path, pattern)) {
        return { ...config, ...pathConfig };
      }
    }
    return config;
  }
}

// 任务 9: 改造中间件
export async function enhancedRateLimitMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const startTime = Date.now();
  
  try {
    // 获取增强配置
    const configManager = new RateLimitConfigManager();
    const config = await configManager.getConfig(c.env, c.req.path);
    
    if (!config.enabled) {
      return next();
    }
    
    // 获取客户端标识
    const clientKey = getClientIdentifier(c);
    
    // 选择策略
    const strategy = selectStrategy(c.env, config);
    
    // 执行限流检查
    const result = await strategy.checkLimit(clientKey, config);
    
    // 设置响应头
    setRateLimitHeaders(c, result, config);
    
    // 记录指标
    recordMetrics(c.env, {
      strategy: config.strategy,
      allowed: result.allowed,
      latency: Date.now() - startTime
    });
    
    if (!result.allowed) {
      return c.json({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000)
      }, 429);
    }
    
    return next();
  } catch (error) {
    // 错误处理 - 根据配置决定是否放行
    console.error('Rate limit error:', error);
    
    if (config?.fallback?.failOpen !== false) {
      // 默认放行
      return next();
    } else {
      // 拒绝请求
      return c.json({ error: 'Rate limit service unavailable' }, 503);
    }
  }
}
```

### 集成点
```yaml
ENVIRONMENT_TYPES:
  位置: apps/api/src/types/env.ts
  保持现有结构（无需修改）:
    RATE_LIMITER: DurableObjectNamespace;
    KV: KVNamespace;

KV_CONFIG:
  键: config:rate-limit:enhanced
  示例:
    {
      "enabled": true,
      "strategy": "hybrid",
      "defaultLimit": 100,
      "windowSeconds": 60,
      "pathStrategies": {
        "/admin/*": {
          "strategy": "durable",
          "limit": 50,
          "window": 60,
          "whitelist": ["192.168.1.100", "10.0.0.1"]
        },
        "/kv/*": {
          "strategy": "durable",
          "limit": 100,
          "window": 60
        },
        "/public/*": {
          "strategy": "kv",
          "limit": 30,
          "window": 120
        }
      },
      "optimization": {
        "batchSize": 10,
        "cacheConfig": true,
        "useAlarms": true,
        "cleanupInterval": 30
      },
      "fallback": {
        "enabled": true,
        "strategy": "kv",
        "kvLimit": 50,
        "kvWindow": 120
      }
    }

MIDDLEWARE_STACK:
  位置: apps/api/src/index.ts
  更新: 使用新的增强限流中间件
  
ADMIN_API:
  位置: apps/api/src/routes/admin/rate-limit.ts
  新增端点:
    PUT /admin/rate-limit/strategy - 切换限流策略
    GET /admin/rate-limit/metrics - 获取性能指标
    POST /admin/rate-limit/test - 测试限流配置
    POST /admin/rate-limit/whitelist - 管理白名单
    POST /admin/rate-limit/blacklist - 管理黑名单
    POST /admin/rate-limit/cleanup - 手动触发清理
```

## 验证循环

### 第一层级：语法与样式
```bash
# TypeScript 类型检查
cd apps/api
npm run typecheck

# 代码格式检查
npm run lint

# 预期：无错误。如有错误，根据提示修复。
```

### 第二层级：单元测试
```typescript
// apps/api/tests/unit/rate-limit-strategies.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NativeRateLimitStrategy } from '../../src/lib/rate-limit/strategies/native';
import { KVRateLimitStrategy } from '../../src/lib/rate-limit/strategies/kv';

describe('Rate Limit Strategies', () => {
  describe('Native Strategy', () => {
    it('应该正确调用 Native API', async () => {
      const mockEnv = {
        RATE_LIMITER_NORMAL: {
          limit: vi.fn().mockResolvedValue({ success: true })
        }
      };
      
      const strategy = new NativeRateLimitStrategy(mockEnv);
      const result = await strategy.checkLimit('test-key', { limiterType: 'normal' });
      
      expect(result.allowed).toBe(true);
      expect(mockEnv.RATE_LIMITER_NORMAL.limit).toHaveBeenCalledWith({ key: 'test-key' });
    });
    
    it('Native API 失败时应降级到 KV', async () => {
      const mockEnv = {
        RATE_LIMITER_NORMAL: {
          limit: vi.fn().mockRejectedValue(new Error('API Error'))
        },
        KV: {
          get: vi.fn().mockResolvedValue(null),
          put: vi.fn().mockResolvedValue(undefined)
        }
      };
      
      const strategy = new NativeRateLimitStrategy(mockEnv);
      const result = await strategy.checkLimit('test-key', { 
        limiterType: 'normal',
        fallback: { strategy: 'kv', limit: 10, window: 60 }
      });
      
      expect(result.allowed).toBe(true);
      expect(mockEnv.KV.get).toHaveBeenCalled();
    });
  });
  
  describe('KV Strategy', () => {
    it('应该正确处理 TTL 和计数', async () => {
      const mockEnv = {
        KV: {
          get: vi.fn().mockResolvedValue({ count: 5 }),
          put: vi.fn().mockResolvedValue(undefined)
        }
      };
      
      const strategy = new KVRateLimitStrategy(mockEnv);
      const result = await strategy.checkLimit('test-key', { limit: 10, window: 60 });
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(mockEnv.KV.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ expirationTtl: 60 })
      );
    });
    
    it('应该处理 KV 写入限制（429）', async () => {
      const mockEnv = {
        KV: {
          get: vi.fn().mockResolvedValue({ count: 5 }),
          put: vi.fn().mockRejectedValue(new Error('429 Too Many Requests'))
        }
      };
      
      const strategy = new KVRateLimitStrategy(mockEnv);
      const result = await strategy.checkLimit('test-key', { limit: 10, window: 60 });
      
      // 写入失败时仍然放行，避免影响业务
      expect(result.allowed).toBe(true);
    });
  });
});
```

```bash
# 运行单元测试
npm test -- rate-limit-strategies.test.ts

# 如果失败：检查错误信息，修复代码，重新运行
```

### 第三层级：集成测试
```bash
# 启动开发服务器
npm run dev

# 测试 DO 限流功能
for i in {1..12}; do
  curl -X GET http://localhost:8787/kv/test \
    -H "CF-Connecting-IP: 192.168.1.1"
  echo ""
done
# 预期：根据配置限制，超过限制后返回 429

# 测试配置更新
curl -X PUT http://localhost:8787/admin/rate-limit/config \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "strategy": "native",
    "pathStrategies": {
      "/kv/*": {
        "limiterType": "strict"
      }
    }
  }'
# 预期：{"success": true, "message": "Configuration updated"}

# 验证新配置生效
for i in {1..8}; do
  curl -X GET http://localhost:8787/kv/test \
    -H "CF-Connecting-IP: 192.168.1.2"
done
# 预期：根据新配置限制生效

# 测试降级机制
# 模拟 DO 不可用的情况
curl -X GET http://localhost:8787/kv/test \
  -H "CF-Connecting-IP: 192.168.1.3" \
  -H "X-Force-Fallback: kv"
# 预期：请求成功，使用 KV 降级策略（分钟级精度）
```

### 第四层级：性能测试
```bash
# 使用 autocannon 进行压力测试
npx autocannon -c 100 -d 10 http://localhost:8787/kv/test

# 预期结果：
# - 延迟 P99 < 10ms
# - 吞吐量 > 10000 req/s
# - 错误率 < 0.1%

# 测试配置更新期间的服务稳定性
# 终端 1：持续发送请求
while true; do
  curl -s http://localhost:8787/kv/test > /dev/null
  sleep 0.1
done

# 终端 2：更新配置
curl -X PUT http://localhost:8787/admin/rate-limit/config \
  -H "Content-Type: application/json" \
  -d '{"strategy": "kv"}'

# 预期：配置更新期间无服务中断
```

## 最终验证清单
- [ ] 所有测试通过：`npm test`
- [ ] 无类型错误：`npm run typecheck`
- [ ] 代码规范通过：`npm run lint`
- [ ] DO 主策略正常工作（支持 1000 并发/IP）
- [ ] KV 辅助策略正常工作（分钟级精度）
- [ ] 配置动态更新生效（< 60秒）
- [ ] 性能指标达标（P99 < 50ms）
- [ ] 白黑名单快速路径正常
- [ ] 批量检查优化生效
- [ ] Alarms API 清理机制正常
- [ ] Admin API 所有端点正常
- [ ] 监控指标正确上报
- [ ] 文档已更新

## 需避免的反模式
- ❌ 不要在 Worker 中使用全局变量存储状态（Worker 无状态）
- ❌ 不要尝试使用 Native Rate Limiting API（无法动态配置）
- ❌ 不要频繁写入同一个 KV 键（1次/秒限制）
- ❌ 不要创建全局单一的 Durable Object（已按 IP 分片，保持现有架构）
- ❌ 不要硬编码限流值，使用 KV 配置管理
- ❌ 不要忽略降级策略，确保高可用
- ❌ 不要跳过性能测试，验证延迟目标
- ❌ 不要忘记利用白名单机制跳过可信 IP
- ❌ 不要忘记实现 Alarms API 自动清理过期数据

## 实施风险与缓解措施

### 风险 1：DO 调用成本和延迟
**缓解**: 
- 白名单 IP 跳过 DO 调用
- 批量检查减少调用次数
- 配置缓存减少 KV 读取

### 风险 2：KV 写入限制导致计数不准确  
**缓解**: 
- 使用分钟级时间窗口减少写入频率
- KV 主要用于配置存储，不是主要限流手段
- DO 作为主要精确计数方案

### 风险 3：配置更新导致服务中断
**缓解**: 
- 60 秒配置缓存，平滑更新
- 配置验证避免无效配置
- 降级策略确保服务可用

### 风险 4：单个 IP 的 DO 成为热点
**缓解**: 
- 这正是我们想要的限流效果
- 1000 并发限制天然实现限流保护
- 热点 IP 被限制，正常 IP 不受影响

## 性能优化建议

1. **白名单快速路径**: 可信 IP 跳过所有限流检查
2. **配置缓存**: 缓存 60 秒，减少 KV 读取频次
3. **批量检查**: 相同 IP 的多个请求批量处理
4. **Alarms API**: 定时清理过期数据，而非每次请求清理
5. **黑名单机制**: 恶意 IP 快速拒绝，节省 DO 资源
6. **监控优化**: 异步上报指标，不阻塞主流程
7. **智能分片**: 当前按 IP 分片已经最优，保持不变

---

## PRP 自评分

**实施成功率评分: 9.0/10**

### 评分理由：
- ✅ **可行性确认** (9/10): 经过充分验证，排除不可行方案
- ✅ **架构优势** (9/10): 基于现有稳定实现，1000 并发限制不是问题
- ✅ **完整的上下文** (9/10): 包含所有必要的文档和代码引用
- ✅ **清晰的实施路径** (9/10): 10 个明确任务，优先级清晰
- ✅ **风险管理** (9/10): 识别实际风险并提供实用缓解措施

### 成功关键：
1. **基于现实**: 不追求理论上的“最佳”，选择可行的最优解
2. **利用优势**: 将 1000 并发限制转化为限流保护机制
3. **渐进优化**: 保持现有架构，只做性能和功能增强
4. **完备的监控**: 详细的测试和验证步骤

### 与原方案对比：
| 指标 | 原 Native API 方案 | 现 DO 优化方案 |
|-----|---------------------|------------------|
| 动态配置 | ❌ 不支持 | ✅ 支持 |
| 延迟 | 1-5ms | 10-50ms |
| 精度 | 低（地理分散） | 高（全局统一） |
| 复杂度 | 高（多策略） | 低（优化现有） |
| 可维护性 | 低 | 高 |
| 成本 | 低 | 中 |

### 潜在改进：
1. 增加 A/B 测试支持以验证优化效果
2. 补充更详细的性能基准测试
3. 添加故障恢复和灵灾切换机制