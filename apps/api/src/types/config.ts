export interface ProxyRoute {
  id: string;            // 唯一标识符，用于动态路由管理
  pattern: string;       // 通配符模式，如 '/api/*'
  target: string;        // 目标 URL，如 'https://api.example.com'
  stripPrefix: boolean;  // 是否移除路径前缀
  enabled: boolean;      // 代理路由是否启用
  priority: number;      // 匹配优先级，数值越小优先级越高

  // 代理级别的默认配置
  defaultCache?: {
    enabled: boolean;
    version?: number;
  };

  defaultRateLimit?: {
    enabled: boolean;
    limit: number;
    window: number;
  };

  defaultGeo?: {
    enabled: boolean;
    mode: 'whitelist' | 'blacklist';
    countries: string[];
  };

  // 统计信息
  stats?: {
    pathCount: number;   // 关联的精确路径数量
    lastUpdated: Date;
  };

  // 保持向后兼容的字段
  cacheEnabled?: boolean; // 该路由是否启用缓存
  rateLimitEnabled?: boolean; // 该路由是否启用限流
  rateLimit?: number;    // 该路由的限流值
  geoEnabled?: boolean;  // 该路由是否启用地域封锁
  geoCountries?: string[]; // 该路由的地域国家列表
}

// 缓存键生成策略
export type CacheKeyStrategy =
  | 'path-only'              // 仅路径：所有用户共享缓存
  | 'path-params'            // 路径 + 全部参数：根据参数区分缓存
  | 'path-headers'           // 路径 + 指定 headers：根据 header 区分缓存（用户隔离）
  | 'path-params-headers';   // 路径 + 参数 + headers：组合策略

export interface CacheConfig {
  version: number;
  enabled: boolean;
  defaultTtl?: number; // 全局默认TTL秒数
  whitelist: string[];
  pathConfigs: Record<string, PathCacheConfig>;
}

export interface PathCacheConfig {
  enabled: boolean;
  version: number;
  ttl?: number; // TTL秒数（新契约2025-10-14：undefined时默认300秒，需永久缓存请设置超大值如31536000）

  // 缓存键策略配置
  // 注意：使用 null 而非 undefined，因为 JSON.stringify 会丢弃 undefined 字段
  keyStrategy?: CacheKeyStrategy | null;       // 缓存键生成策略，null表示使用默认策略 'path-params'
  keyHeaders?: 'all' | string[] | null;        // 'all' 表示所有 headers，或指定 header 名称列表（小写），null表示不使用
  keyParams?: 'all' | string[] | null;         // 'all' 表示所有参数，或指定参数名列表，null表示不使用
}

export interface CacheEntry {
  data: any;
  version: number;
  createdAt: number;
  path: string;
  headers: Record<string, string>;

  // TTL相关字段
  // 新契约（2025-10-14）：undefined/null 的 ttl 和 expiresAt 默认使用 5 分钟 TTL
  // 理由：避免旧缓存永不过期，导致数据陈旧和存储浪费
  // 如需永不过期，请显式传递超大 TTL（如 365*24*3600 = 31536000 秒）
  ttl?: number;           // TTL秒数，undefined 时默认 300 秒（5分钟）
  expiresAt?: number;     // 过期时间戳，undefined 时基于 createdAt + DEFAULT_CACHE_TTL 计算
  etag?: string;          // ETag标识
  lastModified?: string;  // 最后修改时间
}

// 缓存条目元数据（用于管理界面展示）
export interface CacheEntryMetadata {
  cacheKey: string;          // 完整的缓存键
  hash: string;              // hash 值（截取显示）
  path: string;              // 路径
  requestCount: number;      // 该缓存条目的请求次数
  size: number;              // 缓存大小（字节）
  createdAt: number;         // 创建时间戳
  lastAccessed: number;      // 最后访问时间戳
  ttl?: number;              // TTL配置（秒）
  expiresAt?: number;        // 过期时间戳
}

export interface RateLimitConfig {
  // 移除全局限流配置，仅保留路径级别和代理路由级别的限流
  pathLimits: Record<string, number>; // 路径 -> 限流值（req/min）
  windowSeconds: number; // 时间窗口（秒），应用于所有路径
}

export interface GeoConfig {
  enabled: boolean;
  mode: 'whitelist' | 'blacklist';
  countries: string[];
  pathOverrides: Record<string, string[]>;
}

export interface TrafficConfig {
  alertThreshold: number;
  autoEnableCache: boolean;
  measurementWindow: number; // 秒
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt?: number;
}

export interface TrafficStats {
  currentRpm: number;
  peakRpm: number;
  totalRequests: number;
  cacheHitRate: number;
  autoCache: boolean;
}

export type ConfigType = 'cache' | 'rate-limit' | 'geo' | 'traffic';

export interface ConfigContainer {
  cache: CacheConfig;
  'rate-limit': RateLimitConfig;
  geo: GeoConfig;
  traffic: TrafficConfig;
}

// 统一路径配置接口
export interface UnifiedPathConfig {
  path: string;                 // 精确路径（无通配符）
  method?: string;              // HTTP方法 (GET, POST, PUT, DELETE, etc.)
  proxyId?: string;             // 关联的代理路由 ID
  proxyPattern?: string;        // 关联的代理路由模式（用于显示）
  proxyTarget?: string;         // 向后兼容字段
  stripPrefix?: boolean;
  lastAccessed?: Date;
  requestCount?: number;
  sourceIPs?: string[];  // 访问该路径的源IP列表

  // 配置覆盖（继承代理和全局配置，undefined 表示继承）
  cache?: {
    enabled?: boolean;          // undefined 表示继承
    version?: number;
    ttl?: number;              // TTL配置（新契约2025-10-14：undefined表示继承，最终默认300秒）
    keyStrategy?: CacheKeyStrategy;    // 缓存键生成策略
    keyHeaders?: 'all' | string[];     // 'all' 表示所有 headers，或指定 header 名称列表
    keyParams?: 'all' | string[];      // 'all' 或指定参数列表
  };

  // 缓存条目列表（可选，用于详情展示）
  cacheEntries?: CacheEntryMetadata[];

  // 缓存条目数量（用于列表展示）
  cacheEntryCount?: number;

  // 限流配置  
  rateLimit?: {
    enabled?: boolean;          // undefined 表示继承
    limit?: number;             // undefined 表示继承代理配置
    window?: number;
  };

  // 地域封锁配置
  geo?: {
    enabled?: boolean;
    mode?: 'whitelist' | 'blacklist';
    countries?: string[];
  };

  metadata?: {
    createdAt: Date;
    updatedAt: Date;
    source: 'auto' | 'manual';   // 移除 'proxy' 来源
    autoAssigned?: boolean;      // 是否自动分配到代理
  };
}

// 批量操作类型
export interface UnifiedPathOperation {
  type: 'set' | 'delete' | 'toggle-cache' | 'toggle-rate-limit' | 'toggle-geo';
  path: string;
  config?: Partial<UnifiedPathConfig>;
}

// 全局配置接口
export interface GlobalConfig {
  defaultCacheEnabled: boolean;
  defaultCacheVersion: number;
  defaultRateLimitEnabled: boolean;
  defaultRateLimit: number;
  defaultRateLimitWindow: number;
  defaultGeoEnabled: boolean;
  defaultGeoMode: 'whitelist' | 'blacklist';
  defaultGeoCountries: string[];
}

// 解析后的最终配置
export interface ResolvedConfig {
  cache: {
    enabled: boolean;
    version: number;
  };
  rateLimit: {
    enabled: boolean;
    limit: number;
    window: number;
  };
  geo: {
    enabled: boolean;
    mode: 'whitelist' | 'blacklist';
    countries: string[];
  };
}

// 分页响应类型
export interface PathsPaginationResponse<T = any> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}