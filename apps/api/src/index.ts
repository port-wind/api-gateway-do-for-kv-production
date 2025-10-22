/**
 * Generated with create-worker-app
 * https://github.com/leeguooooo/create-worker-app
 * 
 * A high-performance Cloudflare Worker application built with Hono.js
 */

import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { createApp, openAPISpec } from './lib/openapi';
import healthRoutes from './routes/health';
import counterRoutes from './routes/counter';
import proxyRoutes from './routes/proxy';
import authRoutes from './routes/auth';
import adminCacheRoutes from './routes/admin/cache';
import adminRateLimitRoutes from './routes/admin/rate-limit';
import adminGeoRoutes from './routes/admin/geo';
import adminPathsRoutes from './routes/admin/paths';
import adminProxyRoutes from './routes/admin/proxy-routes';
import adminTrafficRoutes from './routes/admin/traffic';
import adminAnalyticsRoutes from './routes/admin/analytics';
import adminPathHealthRoutes from './routes/admin/path-health';
import adminGlobalStatsRoutes from './routes/admin/global-stats';
import adminIpMonitorRoutes from './routes/admin/ip-monitor';
import adminDashboardRoutes from './routes/admin/dashboard';
import adminGeoRulesRoutes from './routes/admin/geo-rules';
import adminGeoAccessListRoutes from './routes/admin/geo-access-list';
import adminOptimizationRoutes from './routes/admin/optimization';
import adminCitiesRoutes from './routes/admin/cities';
import { Counter } from './lib/counter';
import { RateLimiter } from './durable-objects/RateLimiter';
import { TrafficMonitor } from './durable-objects/TrafficMonitor';
// PathCollector 和 GlobalStatsAggregator DO 已下线，使用 Queue + D1 替代
import { pathCollectorDOMiddleware } from './middleware/path-collector-do';
import { globalIpGuardMiddleware } from './middleware/global-ip-guard';
import { geoAccessControlMiddleware } from './middleware/geo-access-control';
import { authMiddleware } from './middleware/auth';
import queueConsumer from './queue-consumer';
import { handleScheduled } from './scheduled-handler';
import type { Env } from './types/env';

const app = createApp();

// Middleware
app.use('*', logger());
app.use('*', cors());
app.use('*', pathCollectorDOMiddleware);
// ⚠️ 全局 IP Guard 必须在 pathCollectorDOMiddleware 之后
// 这样可以先收集访问数据，再进行封禁/限流检查
app.use('*', globalIpGuardMiddleware);
// ⚠️ 地区访问控制在 IP Guard 之后执行
// 优先级：IP 规则 > 地区规则 > 路径限流
app.use('*', geoAccessControlMiddleware());

// API 路由 - 统一使用 /api 前缀
app.route('/api', healthRoutes);
app.route('/api', counterRoutes);

// TK 检查接口
app.get('/api/tk-check', (c) => {
  return c.json({ v: '1' });
});

// ============================================
// 认证路由（公开访问，不需要鉴权）
// ============================================
app.route('/api/auth', authRoutes);

// ============================================
// 管理 API 路由（需要登录鉴权）
// ============================================
// ⚠️ 所有 /api/admin/* 路由都需要认证
// TODO: 暂时禁用认证中间件以排查500错误
// app.use('/api/admin/*', authMiddleware);

app.route('/api/admin', adminCacheRoutes);
app.route('/api/admin', adminRateLimitRoutes);
app.route('/api/admin', adminGeoRoutes);
app.route('/api/admin', adminPathsRoutes);
app.route('/api/admin', adminProxyRoutes);
app.route('/api/admin', adminTrafficRoutes);
app.route('/api/admin', adminAnalyticsRoutes);
app.route('/api/admin', adminPathHealthRoutes);
app.route('/api/admin', adminGlobalStatsRoutes);
app.route('/api/admin/ip-monitor', adminIpMonitorRoutes);
app.route('/api/admin/dashboard', adminDashboardRoutes);
app.route('/api/admin/geo/rules', adminGeoRulesRoutes);
app.route('/api/admin/geo/access-list', adminGeoAccessListRoutes);
app.route('/api/admin/optimization', adminOptimizationRoutes);
app.route('/api/admin/cities', adminCitiesRoutes);

// 代理相关 API （健康检查和调试）
app.route('/api', proxyRoutes);

// 动态代理处理器 - 必须放在最后，处理所有非 API 请求
app.route('/', proxyRoutes);

// API Documentation
app.get('/', (c) => {
  return c.json({
    message: 'api-gateway API',
    version: '1.0.1',
    docs: '/docs'
  });
});

// Swagger UI - only in development 
app.get('/docs', swaggerUI({ url: '/openapi.json' }));

// OpenAPI spec
app.get('/openapi.json', (c) => {
  return c.json({
    ...openAPISpec,
    ...app.getOpenAPI31Document(openAPISpec)
  });
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error(`${err}`);
  return c.json({ error: 'Internal Server Error' }, 500);
});

// Phase 2: 导出 Worker handlers（fetch, queue, scheduled）
export default {
  fetch: app.fetch,
  queue: queueConsumer.queue,
  scheduled: handleScheduled,
} as ExportedHandler<Env>;

// 导出 Durable Objects
// PathCollector 和 GlobalStatsAggregator 已下线，使用 Queue + D1 替代
export { Counter, RateLimiter, TrafficMonitor };
// Phase 3: 导出已废弃的 DO 类（仅作为 migration 占位符）
export { PathCollector, GlobalStatsAggregator } from './durable-objects/deprecated-dos';