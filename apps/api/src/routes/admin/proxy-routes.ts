import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env } from '../../types/env';
import type { ProxyRoute, PathsPaginationResponse, UnifiedPathConfig } from '../../types/config';
import { ERROR_MESSAGES, PROXY_ROUTES } from '../../lib/constants';
import { createRequestLogger } from '../../lib/logger';
import { PathMatcher } from '../../lib/path-matcher';

const app = new Hono<{ Bindings: Env }>();

// 代理路由存储键
const PROXY_ROUTES_KEY = 'proxy-routes:list';

// 代理路由验证 Schema
const ProxyRouteSchema = z.object({
  pattern: z.string().min(1, '路径模式不能为空').regex(/^\//, '路径模式必须以 / 开头'),
  target: z.string().url('目标地址必须是有效的URL'),
  stripPrefix: z.boolean().default(false),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
  cacheEnabled: z.boolean().optional(),
  rateLimitEnabled: z.boolean().optional(),
  rateLimit: z.number().int().min(1).optional(),
  geoEnabled: z.boolean().optional(),
  geoCountries: z.array(z.string()).optional(),
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
});

const ProxyRouteUpdateSchema = ProxyRouteSchema.partial().extend({
  id: z.string().min(1)
});

const BatchOperationSchema = z.object({
  operation: z.enum(['enable', 'disable', 'delete']),
  ids: z.array(z.string()).min(1)
});

const ReorderSchema = z.object({
  routes: z.array(z.object({
    id: z.string(),
    priority: z.number().int().min(0)
  }))
});

/**
 * 从 KV 获取代理路由列表
 */
async function getProxyRoutesFromKV(env: Env): Promise<ProxyRoute[]> {
  try {
    const stored = await env.API_GATEWAY_STORAGE.get(PROXY_ROUTES_KEY, 'json');
    return (stored as ProxyRoute[]) || [];
  } catch (error) {
    console.error('获取代理路由失败:', error);
    return [];
  }
}

/**
 * 保存代理路由到 KV
 */
async function saveProxyRoutesToKV(env: Env, routes: ProxyRoute[]): Promise<void> {
  await env.API_GATEWAY_STORAGE.put(PROXY_ROUTES_KEY, JSON.stringify(routes));
}

/**
 * 初始化代理路由（如果KV中没有数据，使用内置默认值）
 */
async function initializeProxyRoutes(env: Env): Promise<ProxyRoute[]> {
  const existing = await getProxyRoutesFromKV(env);
  
  if (existing.length === 0) {
    // 将内置路由转换为完整的代理路由配置
    const initialRoutes: ProxyRoute[] = PROXY_ROUTES.map((route, index) => ({
      ...route,
      id: `default-${index + 1}`,
      enabled: true,
      priority: index
    }));
    
    await saveProxyRoutesToKV(env, initialRoutes);
    return initialRoutes;
  }
  
  return existing;
}

/**
 * 生成新的代理路由ID
 */
function generateRouteId(): string {
  return `route-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 验证路径模式是否唯一
 */
function validateUniquePathPattern(routes: ProxyRoute[], pattern: string, excludeId?: string): boolean {
  return !routes.some(route => 
    route.pattern === pattern && route.id !== excludeId
  );
}

/**
 * 从 KV 获取统一路径配置
 */
async function getUnifiedPathsFromKV(env: Env): Promise<UnifiedPathConfig[]> {
  try {
    const UNIFIED_PATHS_KEY = 'unified-paths:list';
    const stored = await env.API_GATEWAY_STORAGE.get(UNIFIED_PATHS_KEY, 'json');
    return (stored as UnifiedPathConfig[]) || [];
  } catch (error) {
    console.error('获取统一路径配置失败:', error);
    return [];
  }
}

/**
 * 为代理路由计算统计信息
 * @param proxyRoutes 代理路由列表
 * @param paths 路径列表
 * @returns 包含统计信息的代理路由列表
 */
function enrichProxyRoutesWithStats(proxyRoutes: ProxyRoute[], paths: UnifiedPathConfig[]): ProxyRoute[] {
  return proxyRoutes.map(proxy => ({
    ...proxy,
    stats: PathMatcher.getProxyStats(proxy.id, paths)
  }));
}

// GET /admin/proxy-routes - 获取代理路由列表
app.get('/proxy-routes', async (c) => {
  try {
    const logger = createRequestLogger(c);
    const searchQuery = c.req.query('q') || '';
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
    const enabledOnly = c.req.query('enabled') === 'true';

    logger.info('获取代理路由列表', { searchQuery, page, limit, enabledOnly });

    // 获取或初始化代理路由，以及统一路径数据
    const [allRoutes, paths] = await Promise.all([
      initializeProxyRoutes(c.env),
      getUnifiedPathsFromKV(c.env)
    ]);

    // 为代理路由添加统计信息
    const routesWithStats = enrichProxyRoutesWithStats(allRoutes, paths);

    // 过滤条件
    let filteredRoutes = routesWithStats;

    if (enabledOnly) {
      filteredRoutes = filteredRoutes.filter(route => route.enabled);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredRoutes = filteredRoutes.filter(route =>
        route.pattern.toLowerCase().includes(query) ||
        route.target.toLowerCase().includes(query)
      );
    }

    // 按优先级排序
    filteredRoutes.sort((a, b) => (a.priority || 999) - (b.priority || 999));

    // 分页
    const total = filteredRoutes.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedRoutes = filteredRoutes.slice(startIndex, startIndex + limit);

    const response: PathsPaginationResponse<ProxyRoute> = {
      data: paginatedRoutes,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };

    return c.json({
      success: true,
      ...response,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const logger = createRequestLogger(c);
    logger.error('获取代理路由失败', logger.context, error as Error);
    
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// POST /admin/proxy-routes - 创建新代理路由
app.post('/proxy-routes', zValidator('json', ProxyRouteSchema), async (c) => {
  try {
    const logger = createRequestLogger(c);
    const data = c.req.valid('json');
    
    logger.info('创建代理路由', data);

    // 获取现有路由
    const existingRoutes = await getProxyRoutesFromKV(c.env);

    // 验证路径模式唯一性
    if (!validateUniquePathPattern(existingRoutes, data.pattern)) {
      return c.json({
        success: false,
        error: 'DUPLICATE_PATTERN',
        message: `路径模式 ${data.pattern} 已存在`
      }, 400);
    }

    // 创建新路由
    const newRoute: ProxyRoute = {
      ...data,
      id: generateRouteId(),
      enabled: data.enabled ?? true,
      priority: data.priority ?? 0
    };

    // 添加到列表
    const updatedRoutes = [...existingRoutes, newRoute];
    await saveProxyRoutesToKV(c.env, updatedRoutes);

    logger.info('代理路由创建成功', { id: newRoute.id, pattern: newRoute.pattern });

    return c.json({
      success: true,
      data: newRoute,
      message: '代理路由创建成功',
      timestamp: new Date().toISOString()
    }, 201);
  } catch (error) {
    const logger = createRequestLogger(c);
    logger.error('创建代理路由失败', logger.context, error as Error);
    
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// PUT /admin/proxy-routes/:id - 更新代理路由
app.put('/proxy-routes/:id', zValidator('json', ProxyRouteUpdateSchema.omit({ id: true })), async (c) => {
  try {
    const logger = createRequestLogger(c);
    const routeId = c.req.param('id');
    const updateData = c.req.valid('json');
    
    logger.info('更新代理路由', { routeId, updateData });

    // 获取现有路由
    const existingRoutes = await getProxyRoutesFromKV(c.env);
    const routeIndex = existingRoutes.findIndex(route => route.id === routeId);

    if (routeIndex === -1) {
      return c.json({
        success: false,
        error: 'NOT_FOUND',
        message: '代理路由不存在'
      }, 404);
    }

    // 如果更新路径模式，验证唯一性
    if (updateData.pattern && !validateUniquePathPattern(existingRoutes, updateData.pattern, routeId)) {
      return c.json({
        success: false,
        error: 'DUPLICATE_PATTERN',
        message: `路径模式 ${updateData.pattern} 已存在`
      }, 400);
    }

    // 更新路由
    const updatedRoute: ProxyRoute = {
      ...existingRoutes[routeIndex],
      ...updateData
    };

    existingRoutes[routeIndex] = updatedRoute;
    await saveProxyRoutesToKV(c.env, existingRoutes);

    logger.info('代理路由更新成功', { id: routeId });

    return c.json({
      success: true,
      data: updatedRoute,
      message: '代理路由更新成功',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const logger = createRequestLogger(c);
    logger.error('更新代理路由失败', logger.context, error as Error);
    
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// DELETE /admin/proxy-routes/:id - 删除代理路由
app.delete('/proxy-routes/:id', async (c) => {
  try {
    const logger = createRequestLogger(c);
    const routeId = c.req.param('id');
    
    logger.info('删除代理路由', { routeId });

    // 获取现有路由
    const existingRoutes = await getProxyRoutesFromKV(c.env);
    const routeIndex = existingRoutes.findIndex(route => route.id === routeId);

    if (routeIndex === -1) {
      return c.json({
        success: false,
        error: 'NOT_FOUND',
        message: '代理路由不存在'
      }, 404);
    }

    // 删除路由
    const deletedRoute = existingRoutes[routeIndex];
    existingRoutes.splice(routeIndex, 1);
    await saveProxyRoutesToKV(c.env, existingRoutes);

    logger.info('代理路由删除成功', { id: routeId, pattern: deletedRoute.pattern });

    return c.json({
      success: true,
      data: deletedRoute,
      message: '代理路由删除成功',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const logger = createRequestLogger(c);
    logger.error('删除代理路由失败', logger.context, error as Error);
    
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// POST /admin/proxy-routes/reorder - 调整路由优先级
app.post('/proxy-routes/reorder', zValidator('json', ReorderSchema), async (c) => {
  try {
    const logger = createRequestLogger(c);
    const { routes: reorderData } = c.req.valid('json');
    
    logger.info('调整代理路由优先级', { count: reorderData.length });

    // 获取现有路由
    const existingRoutes = await getProxyRoutesFromKV(c.env);

    // 更新优先级
    reorderData.forEach(({ id, priority }) => {
      const route = existingRoutes.find(r => r.id === id);
      if (route) {
        route.priority = priority;
      }
    });

    await saveProxyRoutesToKV(c.env, existingRoutes);

    logger.info('代理路由优先级调整成功');

    return c.json({
      success: true,
      message: '代理路由优先级调整成功',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const logger = createRequestLogger(c);
    logger.error('调整代理路由优先级失败', logger.context, error as Error);
    
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// POST /admin/proxy-routes/batch - 批量操作
app.post('/proxy-routes/batch', zValidator('json', BatchOperationSchema), async (c) => {
  try {
    const logger = createRequestLogger(c);
    const { operation, ids } = c.req.valid('json');
    
    logger.info('批量操作代理路由', { operation, count: ids.length });

    // 获取现有路由
    const existingRoutes = await getProxyRoutesFromKV(c.env);
    let affectedCount = 0;

    if (operation === 'delete') {
      // 批量删除
      const filteredRoutes = existingRoutes.filter(route => route.id && !ids.includes(route.id));
      affectedCount = existingRoutes.length - filteredRoutes.length;
      await saveProxyRoutesToKV(c.env, filteredRoutes);
    } else {
      // 批量启用/禁用
      existingRoutes.forEach(route => {
        if (route.id && ids.includes(route.id)) {
          route.enabled = operation === 'enable';
          affectedCount++;
        }
      });
      await saveProxyRoutesToKV(c.env, existingRoutes);
    }

    logger.info('批量操作完成', { operation, affectedCount });

    return c.json({
      success: true,
      message: `成功${operation === 'delete' ? '删除' : (operation === 'enable' ? '启用' : '禁用')} ${affectedCount} 个代理路由`,
      affectedCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const logger = createRequestLogger(c);
    logger.error('批量操作代理路由失败', logger.context, error as Error);
    
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// GET /admin/proxy-routes/stats - 获取代理路由统计信息
app.get('/proxy-routes/stats', async (c) => {
  try {
    const logger = createRequestLogger(c);
    
    logger.info('获取代理路由统计');

    const routes = await getProxyRoutesFromKV(c.env);
    
    const stats = {
      totalRoutes: routes.length,
      enabledRoutes: routes.filter(r => r.enabled).length,
      disabledRoutes: routes.filter(r => !r.enabled).length,
      routesWithCache: routes.filter(r => r.cacheEnabled).length,
      routesWithRateLimit: routes.filter(r => r.rateLimitEnabled).length,
      routesWithGeo: routes.filter(r => r.geoEnabled).length,
    };

    return c.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const logger = createRequestLogger(c);
    logger.error('获取代理路由统计失败', logger.context, error as Error);
    
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// GET /admin/proxy-routes/:id/paths - 获取代理下的所有路径
app.get('/proxy-routes/:id/paths', async (c) => {
  try {
    const logger = createRequestLogger(c);
    const proxyId = c.req.param('id');
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
    
    logger.info('获取代理路由关联路径', { proxyId, page, limit });

    // 验证代理路由是否存在
    const proxyRoutes = await getProxyRoutesFromKV(c.env);
    const proxy = proxyRoutes.find(r => r.id === proxyId);
    
    if (!proxy) {
      return c.json({
        success: false,
        error: 'NOT_FOUND',
        message: '代理路由不存在'
      }, 404);
    }

    // 获取该代理下的所有路径
    const allPaths = await getUnifiedPathsFromKV(c.env);
    const proxyPaths = PathMatcher.getPathsByProxy(proxyId, allPaths);
    
    // 按最后更新时间排序
    proxyPaths.sort((a, b) => {
      const aTime = a.metadata?.updatedAt || new Date(0);
      const bTime = b.metadata?.updatedAt || new Date(0);
      return bTime.getTime() - aTime.getTime();
    });

    // 分页
    const total = proxyPaths.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedPaths = proxyPaths.slice(startIndex, startIndex + limit);

    const response: PathsPaginationResponse<UnifiedPathConfig> = {
      data: paginatedPaths,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };

    return c.json({
      success: true,
      proxy: {
        id: proxy.id,
        pattern: proxy.pattern,
        target: proxy.target,
        enabled: proxy.enabled
      },
      ...response,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const logger = createRequestLogger(c);
    logger.error('获取代理路由关联路径失败', logger.context, error as Error);
    
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default app;