import type { ProxyRoute, CacheConfig, RateLimitConfig, GeoConfig, TrafficConfig } from '../types/config';

// 代理路由配置
export const PROXY_ROUTES: ProxyRoute[] = [
  {
    id: 'default-1',
    pattern: '/kv/*',
    target: 'https://dokv.pwtk.cc',
    stripPrefix: false,
    enabled: true,
    priority: 0,
    cacheEnabled: false,
    rateLimitEnabled: true,
    rateLimit: 100,
    geoEnabled: false
  },
  {
    id: 'default-2',
    pattern: '/biz-client/*',
    target: 'https://biz-client.pwtk.cc',
    stripPrefix: false,
    enabled: true,
    priority: 1,
    cacheEnabled: false,
    rateLimitEnabled: true,
    rateLimit: 100,
    geoEnabled: false
  },
  {
    id: 'default-3',
    pattern: '/rendering-client/*',
    target: 'https://rendering-client.pwtk.cc',
    stripPrefix: false,
    enabled: true,
    priority: 2,
    cacheEnabled: false, // 默认关闭缓存，按需在路径级别启用
    rateLimitEnabled: true,
    rateLimit: 100,
    geoEnabled: false
  }
];

// 默认缓存TTL（5分钟）
export const DEFAULT_CACHE_TTL = 300; // 5分钟 = 300秒
export const MAX_CACHE_TTL = 86400; // 最大缓存时间：1天 = 86400秒（防止旧数据设置超长TTL）

// 默认缓存配置
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  version: 1,
  enabled: false, // 全局缓存默认关闭，只允许路径级配置
  defaultTtl: DEFAULT_CACHE_TTL, // 全局默认TTL为5分钟
  whitelist: [
    '/kv/*',
    '/biz-client/*',
    '/rendering-client/*'
  ],
  pathConfigs: {}
};

// 默认限流配置（移除全局限流，仅保留路径级别）
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  windowSeconds: 60, // 1 分钟时间窗口
  pathLimits: {} // 默认无路径限流，由路径配置或代理路由配置指定
};

// 默认地域封锁配置
export const DEFAULT_GEO_CONFIG: GeoConfig = {
  enabled: false,
  mode: 'blacklist',
  countries: [], // empty by default
  pathOverrides: {}
};

// 默认流量监控配置
export const DEFAULT_TRAFFIC_CONFIG: TrafficConfig = {
  alertThreshold: 10000, // requests per measurement window
  autoEnableCache: true,
  measurementWindow: 300 // 5 minutes in seconds
};

// 缓存键前缀
export const CACHE_PREFIXES = {
  CONFIG: 'config:',
  CACHE: 'cache:',
  RESPONSE: 'response:'
} as const;

// 错误信息
export const ERROR_MESSAGES = {
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Please try again later.',
  GEO_BLOCKED: 'Access denied from your location.',
  CACHE_ERROR: 'Cache operation failed.',
  CONFIG_ERROR: 'Configuration error.',
  PROXY_ERROR: 'Proxy request failed.',
  INVALID_CONFIG: 'Invalid configuration provided.',
  DURABLE_OBJECT_ERROR: 'Durable Object operation failed.'
} as const;

// 配置类型
export const CONFIG_TYPES = {
  CACHE: 'cache',
  RATE_LIMIT: 'rate-limit',
  GEO: 'geo',
  TRAFFIC: 'traffic'
} as const;

// HTTP 状态码
export const STATUS_CODES = {
  OK: 200,
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500
} as const;

// 默认环境变量值 (回退到默认值)
export const DEFAULT_ENV_VALUES = {
  RATE_LIMIT: 60,
  RATE_WINDOW: 60,
  CACHE_VERSION: 1,
  TRAFFIC_THRESHOLD: 10000
} as const;