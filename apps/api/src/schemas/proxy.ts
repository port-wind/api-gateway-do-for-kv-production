import { z } from 'zod'

// 代理路由数据验证模式
export const proxyRouteSchema = z.object({
  id: z.string().optional(),
  pattern: z.string().min(1, '路径模式不能为空'),
  target: z.string().url('目标URL格式不正确'),
  stripPrefix: z.boolean().default(false),
  cacheEnabled: z.boolean().default(true),
  enabled: z.boolean().default(true),
  priority: z.number().default(0),
  // 添加默认配置字段
  defaultCache: z.object({
    enabled: z.boolean().default(true),
    version: z.number().optional()
  }).optional(),
  defaultRateLimit: z.object({
    enabled: z.boolean().default(true),
    limit: z.number().default(100),
    window: z.number().default(60)
  }).optional(),
  defaultGeoBlock: z.object({
    enabled: z.boolean().default(false),
    allowedCountries: z.array(z.string()).optional(),
    blockedCountries: z.array(z.string()).optional()
  }).optional()
})

export const proxyRouteUpdateSchema = proxyRouteSchema.partial().extend({
  id: z.string()
})