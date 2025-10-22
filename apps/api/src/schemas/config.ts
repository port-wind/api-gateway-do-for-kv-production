import { z } from 'zod';

// 代理路由配置模式
export const proxyRouteSchema = z.object({
  path: z.string().min(1),
  target: z.string().url(),
  stripPrefix: z.boolean().default(false),
  cacheEnabled: z.boolean().default(true)
});

// 路径缓存配置模式
export const pathCacheConfigSchema = z.object({
  enabled: z.boolean(),
  version: z.number().int().min(1)
});

// 完整缓存配置模式
export const cacheConfigSchema = z.object({
  version: z.number().int().min(1),
  enabled: z.boolean(),
  whitelist: z.array(z.string()),
  pathConfigs: z.record(z.string(), pathCacheConfigSchema).default({})
});

// 限流配置模式
export const rateLimitConfigSchema = z.object({
  enabled: z.boolean(),
  defaultLimit: z.number().int().min(1),
  windowSeconds: z.number().int().min(1),
  pathLimits: z.record(z.string(), z.number().int().min(1)).default({})
});

// 地域封锁配置模式
export const geoConfigSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['whitelist', 'blacklist']),
  countries: z.array(z.string().length(2).regex(/^[A-Z]{2}$/)),
  pathOverrides: z.record(z.string(), z.array(z.string().length(2).regex(/^[A-Z]{2}$/)))
    .default({})
});

// 流量监控配置模式
export const trafficConfigSchema = z.object({
  alertThreshold: z.number().int().min(1),
  autoEnableCache: z.boolean(),
  measurementWindow: z.number().int().min(60) // 至少 60 秒
});

// 缓存条目模式
export const cacheEntrySchema = z.object({
  data: z.any(),
  version: z.number().int().min(1),
  createdAt: z.number().int().min(0),
  path: z.string(),
  headers: z.record(z.string(), z.string())
});

// 流量统计模式
export const trafficStatsSchema = z.object({
  currentRpm: z.number().min(0),
  peakRpm: z.number().min(0),
  totalRequests: z.number().int().min(0),
  cacheHitRate: z.number().min(0).max(100),
  autoCache: z.boolean()
});

// 配置类型模式
export const configTypeSchema = z.enum(['cache', 'rate-limit', 'geo', 'traffic']);

// 通用配置模式（用于配置存储的联合类型）
export const configDataSchema = z.union([
  cacheConfigSchema,
  rateLimitConfigSchema,
  geoConfigSchema,
  trafficConfigSchema
]);

// 配置条目模式（包含元数据）
export const configEntrySchema = z.object({
  type: configTypeSchema,
  data: configDataSchema,
  version: z.number().int().min(1),
  createdAt: z.number().int().min(0),
  updatedAt: z.number().int().min(0),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional()
});

// 环境变量配置模式
export const envConfigSchema = z.object({
  DEFAULT_RATE_LIMIT: z.string().regex(/^\d+$/).transform(Number),
  DEFAULT_RATE_WINDOW: z.string().regex(/^\d+$/).transform(Number),
  DEFAULT_CACHE_VERSION: z.string().regex(/^\d+$/).transform(Number),
  TRAFFIC_THRESHOLD: z.string().regex(/^\d+$/).transform(Number)
});

// 应用配置模式（所有配置的集合）
export const appConfigSchema = z.object({
  cache: cacheConfigSchema,
  rateLimit: rateLimitConfigSchema,
  geo: geoConfigSchema,
  traffic: trafficConfigSchema,
  proxyRoutes: z.array(proxyRouteSchema)
});

// 配置验证选项
export const configValidationOptionsSchema = z.object({
  strict: z.boolean().default(true),
  allowUnknownKeys: z.boolean().default(false),
  validateReferences: z.boolean().default(true)
});

// 配置更新请求模式
export const configUpdateRequestSchema = z.object({
  type: configTypeSchema,
  data: configDataSchema,
  version: z.number().int().min(1).optional(),
  updatedBy: z.string().optional()
});

// 批量配置更新模式
export const batchConfigUpdateSchema = z.object({
  updates: z.array(configUpdateRequestSchema),
  validateOnly: z.boolean().default(false),
  updatedBy: z.string().optional()
});

// 配置备份模式
export const configBackupSchema = z.object({
  timestamp: z.number().int().min(0),
  version: z.string(),
  configs: appConfigSchema,
  metadata: z.record(z.string(), z.any()).optional()
});

// 配置迁移模式
export const configMigrationSchema = z.object({
  fromVersion: z.string(),
  toVersion: z.string(),
  migrations: z.array(z.object({
    type: configTypeSchema,
    operation: z.enum(['create', 'update', 'delete', 'rename']),
    path: z.string(),
    value: z.any().optional(),
    oldValue: z.any().optional()
  })),
  timestamp: z.number().int().min(0)
});

// 类型导出
export type ProxyRoute = z.infer<typeof proxyRouteSchema>;
export type PathCacheConfig = z.infer<typeof pathCacheConfigSchema>;
export type CacheConfig = z.infer<typeof cacheConfigSchema>;
export type RateLimitConfig = z.infer<typeof rateLimitConfigSchema>;
export type GeoConfig = z.infer<typeof geoConfigSchema>;
export type TrafficConfig = z.infer<typeof trafficConfigSchema>;
export type CacheEntry = z.infer<typeof cacheEntrySchema>;
export type TrafficStats = z.infer<typeof trafficStatsSchema>;
export type ConfigType = z.infer<typeof configTypeSchema>;
export type ConfigData = z.infer<typeof configDataSchema>;
export type ConfigEntry = z.infer<typeof configEntrySchema>;
export type EnvConfig = z.infer<typeof envConfigSchema>;
export type AppConfig = z.infer<typeof appConfigSchema>;
export type ConfigValidationOptions = z.infer<typeof configValidationOptionsSchema>;
export type ConfigUpdateRequest = z.infer<typeof configUpdateRequestSchema>;
export type BatchConfigUpdate = z.infer<typeof batchConfigUpdateSchema>;
export type ConfigBackup = z.infer<typeof configBackupSchema>;
export type ConfigMigration = z.infer<typeof configMigrationSchema>;

// 配置验证工具函数类型
export type ConfigValidator<T> = (data: unknown, options?: ConfigValidationOptions) => T;

// 配置类型映射
export type ConfigTypeMap = {
  'cache': CacheConfig;
  'rate-limit': RateLimitConfig;
  'geo': GeoConfig;
  'traffic': TrafficConfig;
};