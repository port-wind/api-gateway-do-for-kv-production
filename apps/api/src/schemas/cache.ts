import { z } from 'zod';

// 路径缓存配置模式
export const pathCacheConfigSchema = z.object({
  enabled: z.boolean(),
  version: z.number().int().min(1)
});

// 缓存配置模式
export const cacheConfigSchema = z.object({
  version: z.number().int().min(1),
  enabled: z.boolean(),
  whitelist: z.array(z.string()),
  pathConfigs: z.record(z.string(), pathCacheConfigSchema)
});

// 缓存配置更新请求模式
export const updateCacheConfigSchema = z.object({
  version: z.number().int().min(1).optional(),
  enabled: z.boolean().optional(),
  whitelist: z.array(z.string()).optional(),
  pathConfigs: z.record(z.string(), pathCacheConfigSchema).optional()
}).refine(data => Object.keys(data).length > 0, {
  message: "At least one field must be provided"
});

// 缓存条目模式
export const cacheEntrySchema = z.object({
  data: z.any(),
  version: z.number().int().min(1),
  createdAt: z.number().int().min(0),
  path: z.string(),
  headers: z.record(z.string(), z.string())
});

// 缓存失效请求模式
export const cacheInvalidateSchema = z.object({
  pattern: z.string().optional(),
  key: z.string().optional()
}).refine(data => data.pattern || data.key, {
  message: "Either 'pattern' or 'key' must be provided"
});

// 缓存统计模式
export const cacheStatsSchema = z.object({
  totalEntries: z.number().int().min(0),
  hitRate: z.number().min(0).max(100),
  missRate: z.number().min(0).max(100)
});

// 缓存配置响应模式
export const cacheConfigResponseSchema = z.object({
  success: z.boolean(),
  config: cacheConfigSchema.optional(),
  message: z.string().optional(),
  error: z.string().optional(),
  timestamp: z.string()
});

// 缓存失效响应模式
export const cacheInvalidateResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  invalidatedCount: z.number().int().min(0),
  pattern: z.string().optional(),
  key: z.string().optional(),
  timestamp: z.string()
});

// 缓存统计响应模式
export const cacheStatsResponseSchema = z.object({
  success: z.boolean(),
  stats: cacheStatsSchema,
  timestamp: z.string()
});

// 缓存健康检查响应模式
export const cacheHealthResponseSchema = z.object({
  status: z.enum(['healthy', 'unhealthy']),
  enabled: z.boolean().optional(),
  version: z.number().int().min(1).optional(),
  whitelistPaths: z.number().int().min(0).optional(),
  pathConfigs: z.number().int().min(0).optional(),
  stats: cacheStatsSchema.optional(),
  error: z.string().optional(),
  timestamp: z.string()
});

// 类型导出
export type PathCacheConfig = z.infer<typeof pathCacheConfigSchema>;
export type CacheConfig = z.infer<typeof cacheConfigSchema>;
export type UpdateCacheConfig = z.infer<typeof updateCacheConfigSchema>;
export type CacheEntry = z.infer<typeof cacheEntrySchema>;
export type CacheInvalidate = z.infer<typeof cacheInvalidateSchema>;
export type CacheStats = z.infer<typeof cacheStatsSchema>;
export type CacheConfigResponse = z.infer<typeof cacheConfigResponseSchema>;
export type CacheInvalidateResponse = z.infer<typeof cacheInvalidateResponseSchema>;
export type CacheStatsResponse = z.infer<typeof cacheStatsResponseSchema>;
export type CacheHealthResponse = z.infer<typeof cacheHealthResponseSchema>;