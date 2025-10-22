import { z } from 'zod';

// 通用响应模式
export const baseResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
  timestamp: z.string()
});

// 通用配置响应模式
export const configResponseSchema = baseResponseSchema.extend({
  config: z.any().optional()
});

// 通用健康检查响应模式
export const healthResponseSchema = z.object({
  status: z.enum(['healthy', 'unhealthy', 'degraded']),
  timestamp: z.string()
}).and(z.record(z.string(), z.any()));

// 限流相关模式
export const rateLimitConfigSchema = z.object({
  enabled: z.boolean(),
  defaultLimit: z.number().int().min(1),
  windowSeconds: z.number().int().min(1),
  pathLimits: z.record(z.string(), z.number().int().min(1))
});

export const updateRateLimitConfigSchema = z.object({
  enabled: z.boolean().optional(),
  defaultLimit: z.number().int().min(1).optional(),
  windowSeconds: z.number().int().min(1).optional(),
  pathLimits: z.record(z.string(), z.number().int().min(1)).optional()
}).refine(data => Object.keys(data).length > 0, {
  message: "At least one field must be provided"
});

export const rateLimitStatusSchema = z.object({
  allowed: z.boolean(),
  remaining: z.number().int().min(0),
  resetAt: z.number().int().optional(),
  windowStart: z.number().int().optional(),
  requests: z.number().int().min(0).optional()
});

// 地域封锁相关模式
export const geoConfigSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['whitelist', 'blacklist']),
  countries: z.array(z.string().length(2).regex(/^[A-Z]{2}$/)),
  pathOverrides: z.record(z.string(), z.array(z.string().length(2).regex(/^[A-Z]{2}$/)))
});

export const updateGeoConfigSchema = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(['whitelist', 'blacklist']).optional(),
  countries: z.array(z.string().length(2).regex(/^[A-Z]{2}$/)).optional(),
  pathOverrides: z.record(z.string(), z.array(z.string().length(2).regex(/^[A-Z]{2}$/))).optional()
}).refine(data => Object.keys(data).length > 0, {
  message: "At least one field must be provided"
});

export const geoTestRequestSchema = z.object({
  country: z.string().length(2).regex(/^[A-Z]{2}$/),
  path: z.string().optional()
});

export const geoTestResponseSchema = baseResponseSchema.extend({
  result: z.enum(['allowed', 'blocked']).optional(),
  reason: z.string().optional(),
  appliedRule: z.string().optional(),
  config: z.object({
    mode: z.enum(['whitelist', 'blacklist']),
    countries: z.array(z.string())
  }).optional(),
  country: z.string().optional(),
  path: z.string().optional()
});

export const countrySchema = z.object({
  code: z.string().length(2),
  name: z.string()
});

export const countriesResponseSchema = baseResponseSchema.extend({
  countries: z.array(countrySchema),
  note: z.string().optional()
});

// 流量监控相关模式
export const trafficConfigSchema = z.object({
  alertThreshold: z.number().int().min(1),
  autoEnableCache: z.boolean(),
  measurementWindow: z.number().int().min(60)
});

export const updateTrafficConfigSchema = z.object({
  alertThreshold: z.number().int().min(1).optional(),
  autoEnableCache: z.boolean().optional(),
  measurementWindow: z.number().int().min(60).optional()
}).refine(data => Object.keys(data).length > 0, {
  message: "At least one field must be provided"
});

export const trafficStatsSchema = z.object({
  currentRpm: z.number().min(0),
  peakRpm: z.number().min(0),
  totalRequests: z.number().int().min(0),
  cacheHitRate: z.number().min(0).max(100),
  autoCache: z.boolean()
});

export const trafficWindowSchema = z.object({
  start: z.string(),
  requests: z.number().int().min(0),
  cacheHits: z.number().int().min(0),
  duration: z.number().min(0),
  threshold: z.number().int().min(1),
  thresholdExceeded: z.boolean()
});

export const topPathSchema = z.object({
  path: z.string(),
  requests: z.number().int().min(0)
});

export const trafficStatsResponseSchema = baseResponseSchema.extend({
  stats: trafficStatsSchema.optional(),
  currentWindow: trafficWindowSchema.optional(),
  topPaths: z.array(topPathSchema).optional()
});

export const autoCacheRequestSchema = z.object({
  enabled: z.boolean()
});

export const alertStatusSchema = z.object({
  active: z.boolean(),
  currentRequests: z.number().int().min(0),
  threshold: z.number().int().min(1),
  autoCacheEnabled: z.boolean(),
  windowStart: z.string().optional(),
  message: z.string()
});

export const alertStatusResponseSchema = baseResponseSchema.extend({
  alerts: alertStatusSchema.optional()
});

// 通用错误响应模式
export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  message: z.string(),
  details: z.any().optional(),
  timestamp: z.string()
});

// API 状态响应模式
export const apiStatusSchema = z.object({
  api: z.string(),
  version: z.string(),
  status: z.enum(['operational', 'degraded', 'down']),
  components: z.record(z.string(), z.enum(['healthy', 'unhealthy', 'degraded'])),
  timestamp: z.string()
});

// 类型导出
export type BaseResponse = z.infer<typeof baseResponseSchema>;
export type ConfigResponse = z.infer<typeof configResponseSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export type RateLimitConfig = z.infer<typeof rateLimitConfigSchema>;
export type UpdateRateLimitConfig = z.infer<typeof updateRateLimitConfigSchema>;
export type RateLimitStatus = z.infer<typeof rateLimitStatusSchema>;

export type GeoConfig = z.infer<typeof geoConfigSchema>;
export type UpdateGeoConfig = z.infer<typeof updateGeoConfigSchema>;
export type GeoTestRequest = z.infer<typeof geoTestRequestSchema>;
export type GeoTestResponse = z.infer<typeof geoTestResponseSchema>;
export type Country = z.infer<typeof countrySchema>;
export type CountriesResponse = z.infer<typeof countriesResponseSchema>;

export type TrafficConfig = z.infer<typeof trafficConfigSchema>;
export type UpdateTrafficConfig = z.infer<typeof updateTrafficConfigSchema>;
export type TrafficStats = z.infer<typeof trafficStatsSchema>;
export type TrafficWindow = z.infer<typeof trafficWindowSchema>;
export type TopPath = z.infer<typeof topPathSchema>;
export type TrafficStatsResponse = z.infer<typeof trafficStatsResponseSchema>;
export type AutoCacheRequest = z.infer<typeof autoCacheRequestSchema>;
export type AlertStatus = z.infer<typeof alertStatusSchema>;
export type AlertStatusResponse = z.infer<typeof alertStatusResponseSchema>;

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type ApiStatus = z.infer<typeof apiStatusSchema>;