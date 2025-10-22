// API 响应类型定义，与后端保持一致

export interface ProxyRoute {
  id: string
  pattern: string // 使用 pattern 而不是 path，与后端保持一致
  target: string
  stripPrefix: boolean
  enabled?: boolean
  priority?: number
  cacheEnabled?: boolean
  rateLimitEnabled?: boolean
  rateLimit?: number
  geoEnabled?: boolean
  geoCountries?: string[]
}


export interface CacheConfig {
  version: number
  enabled: boolean
  whitelist: string[] // 缓存白名单路径模式
  pathConfigs: Record<string, PathCacheConfig> // 路径特定配置
  proxyRoutes?: ProxyRoute[] // 代理路由信息（从后端获取）
}

// 缓存键生成策略
export type CacheKeyStrategy =
  | 'path-only'              // 仅路径：所有用户共享缓存
  | 'path-params'            // 路径 + 全部参数：根据参数区分缓存
  | 'path-headers'           // 路径 + 指定 headers：根据 header 区分缓存（用户隔离）
  | 'path-params-headers'    // 路径 + 参数 + headers：组合策略

export interface PathCacheConfig {
  enabled: boolean // 是否为该路径启用缓存
  version: number // 配置版本
  ttl?: number // TTL秒数，undefined时默认300秒（5分钟）- 新契约2025-10-14
  lastModified?: string // 最后修改时间

  // 灵活缓存键策略配置
  keyStrategy?: CacheKeyStrategy       // 缓存键生成策略，默认为 'path-params'
  keyHeaders?: 'all' | string[]        // 'all' 表示所有 headers，或指定 header 名称列表（小写）
  keyParams?: 'all' | string[]         // 'all' 表示所有参数，或指定参数名列表
}

// 缓存条目元数据（用于管理界面展示）
export interface CacheEntryMetadata {
  cacheKey: string          // 完整的缓存键
  hash: string              // hash 值（截取显示）
  path: string              // 路径
  requestCount: number      // 该缓存条目的请求次数
  size: number              // 缓存大小（字节）
  createdAt: number         // 创建时间戳
  lastAccessed: number      // 最后访问时间戳
  ttl?: number              // TTL配置（秒）
  expiresAt?: number        // 过期时间戳
}

export interface CachePath {
  path: string // 路径
  enabled: boolean // 是否启用
  version: number // 版本
  lastModified: string // 最后修改时间
}

export interface CachePathsResponse {
  success: boolean
  data: {
    paths: CachePath[]
    pagination: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
  }
  timestamp: string
}

export interface BatchPathOperation {
  type: 'set' | 'delete' | 'toggle'
  path: string
  config?: {
    enabled?: boolean
    version?: number
  }
}

export interface RateLimitConfig {
  enabled: boolean // 是否启用限流
  defaultLimit: number // 默认限制数
  windowSeconds: number // 时间窗口（秒）
  pathLimits: Record<string, number> // 路径特定限制
}

export interface RateLimitStatus {
  ip: string // IP 地址
  allowed: boolean // 是否允许
  remaining: number // 剩余请求数
  resetAt?: number // 重置时间戳
  currentWindow: {
    requests: number // 当前窗口请求数
    windowStart: number // 窗口开始时间
  }
}

export interface RateLimitHealth {
  status: 'healthy' | 'unhealthy'
  enabled: boolean
  defaultLimit: number
  windowSeconds: number
  pathLimits: number // 路径限制配置数量
  timestamp: string
  error?: string
}

export interface GeoConfig {
  enabled: boolean // 是否启用地域封锁
  mode: 'whitelist' | 'blacklist' // 模式：白名单或黑名单
  countries: string[] // 国家代码列表
  pathOverrides: Record<string, string[]> // 路径覆盖配置
}

export interface TrafficConfig {
  alertThreshold: number // 告警阈值
  autoEnableCache: boolean // 是否自动启用缓存
  measurementWindow: number // 测量时间窗口（秒）
}

export interface TrafficStats {
  currentRpm: number // 当前每分钟请求数
  peakRpm: number // 峰值每分钟请求数
  totalRequests: number // 总请求数
  cacheHitRate: number // 缓存命中率
  autoCache: boolean // 是否自动启用了缓存
}

// 统一路径管理类型
export interface UnifiedPathConfig {
  path: string
  method?: string              // HTTP方法 (GET, POST, PUT, DELETE, etc.)
  proxyTarget?: string
  proxyId?: string
  proxyPattern?: string
  lastAccessed?: string
  requestCount?: number

  // 缓存配置
  cache: {
    enabled: boolean
    version?: number
    ttl?: number // TTL配置（秒），undefined时默认300秒（5分钟）- 新契约2025-10-14
    // 灵活缓存键策略
    keyStrategy?: CacheKeyStrategy       // 缓存键生成策略
    keyHeaders?: string[]                // 参与缓存键的 header 名称列表
    keyParams?: 'all' | string[]         // 'all' 或指定参数列表
  }

  // 缓存条目列表（可选，用于详情展示）
  cacheEntries?: CacheEntryMetadata[]

  // 缓存条目数量（用于列表展示）
  cacheEntryCount?: number

  // 限流配置  
  rateLimit: {
    enabled: boolean
    limit?: number
    window?: number
  }

  // 地域封锁配置
  geo: {
    enabled: boolean
    mode?: 'whitelist' | 'blacklist'
    countries?: string[]
  }

  metadata?: {
    createdAt: string
    updatedAt: string
    source: 'auto' | 'manual' // 自动发现或手动添加
  }
}

// 批量操作类型
export interface UnifiedPathOperation {
  type: 'set' | 'delete' | 'toggle-cache' | 'toggle-rate-limit' | 'toggle-geo'
  path: string
  config?: Partial<UnifiedPathConfig>
}

// 分页响应类型
export interface PathsPaginationResponse<T = UnifiedPathConfig> {
  success: boolean
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
  timestamp: string
}

/**
 * 路径发现统计
 * 
 * @deprecated 此类型已废弃 (Phase 3 - 2025-10-16)
 * 原因：PathCollector DO 已下线，/api/admin/paths/discovered 端点返回 410 Gone
 * 
 * 保留此类型定义仅供向后兼容，请勿在新代码中使用
 */
export interface PathDiscoveryStats {
  totalPaths: number
  totalRequests: number
  uniqueMethods: string[]
  topPaths: Array<{ path: string; count: number }>
}

// 路径健康状态
export interface PathHealthResponse {
  status: 'healthy' | 'unhealthy'
  summary: {
    totalUniquePaths: number
    configuredPaths: number
    discoveredPaths: number
    proxyPaths: number
    pathsWithCache: number
    pathsWithRateLimit: number
    pathsWithGeo: number
  }
  stats: PathDiscoveryStats
  timestamp: string
  error?: string
}

export interface CacheStats {
  hitRate: number // 命中率
  totalHits: number // 总命中数
  totalMisses: number // 总未命中数
  totalEntries: number // 总条目数
  memoryUsage?: number // 内存使用量（可选）
}

// ProxyRoute 接口已在文件开头定义，避免重复

// API 响应基础结构
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  config?: T
  stats?: T
  error?: string
  message?: string
  timestamp: string
}

// 缓存失效请求
export interface InvalidateCacheRequest {
  pattern?: string // 匹配模式
  key?: string // 特定键
}

// 缓存失效响应
export interface InvalidateCacheResponse {
  success: boolean
  message: string
  invalidatedCount: number
  pattern?: string
  key?: string
  timestamp: string
}

// 缓存健康检查响应
export interface CacheHealthResponse {
  status: 'healthy' | 'unhealthy'
  enabled: boolean
  version: number
  whitelistPaths: number
  pathConfigs: number
  stats: CacheStats
  timestamp: string
  error?: string
}

// 通用配置类型
export type ConfigType = 'cache' | 'rate-limit' | 'geo' | 'traffic'

export interface ConfigContainer {
  cache: CacheConfig
  'rate-limit': RateLimitConfig
  geo: GeoConfig
  traffic: TrafficConfig
}

// 表单数据类型
export interface CacheConfigFormData {
  enabled: boolean
  whitelist: string[]
  // 路径配置将通过单独的组件处理
}

export interface PathConfigFormData {
  path: string
  enabled: boolean
  version: number
}

export interface RateLimitConfigFormData {
  enabled: boolean
  defaultLimit: number
  windowSeconds: number
  // 路径限制将通过单独的组件处理
}

export interface PathLimitFormData {
  path: string
  limit: number
}

export interface GeoConfigFormData {
  enabled: boolean
  mode: 'whitelist' | 'blacklist'
  countries: string[]
  // 路径覆盖将通过单独的组件处理
}

export interface PathGeoOverrideFormData {
  path: string
  countries: string[]
}

export interface Country {
  code: string // 国家代码，如 "US", "CN"
  name: string // 国家名称，如 "United States", "China"
}

export interface GeoTestResult {
  success: boolean
  result: 'allowed' | 'blocked'
  reason: string
  appliedRule: string
  config: {
    mode: 'whitelist' | 'blacklist'
    countries: string[]
  }
  country: string
  path: string
  timestamp: string
}

export interface GeoHealth {
  status: 'healthy' | 'unhealthy'
  enabled: boolean
  mode: 'whitelist' | 'blacklist'
  countries: number // 配置的国家数量
  pathOverrides: number // 路径覆盖配置数量
  timestamp: string
  error?: string
}

// UI 状态类型
export interface CacheManagementState {
  isLoading: boolean
  isUpdating: boolean
  error: string | null
  lastUpdated: Date | null
}

export interface RateLimitManagementState {
  isLoading: boolean
  isUpdating: boolean
  error: string | null
  lastUpdated: Date | null
}

export interface GeoManagementState {
  isLoading: boolean
  isUpdating: boolean
  error: string | null
  lastUpdated: Date | null
}