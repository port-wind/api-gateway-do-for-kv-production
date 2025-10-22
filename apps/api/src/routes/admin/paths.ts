import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env } from '../../types/env';
import type {
  UnifiedPathConfig,
  UnifiedPathOperation,
  PathsPaginationResponse,
  CacheConfig,
  RateLimitConfig,
  GeoConfig,
  ProxyRoute
} from '../../types/config';
import { getConfig, updateConfig } from '../../lib/config';
import { CONFIG_TYPES, ERROR_MESSAGES } from '../../lib/constants';
// PathAggregator 和 PathCollector DO 已下线，使用 Queue + D1 替代
// getIPPathStats / getIPPathDetails 已移除 - DO 端点已废弃，返回 410
import { PathMatcher } from '../../lib/path-matcher';
import { ConfigResolver } from '../../lib/config-resolver';
import { createRequestLogger } from '../../lib/logger';
import { getPathCacheEntries } from '../../lib/cache-manager';
import { readPathsFromKV, readPathsFromD1 } from '../../lib/paths-api-v2';
// shouldUseNewAPI 已移除 - Phase 3 完成，全量使用新 API
// compareDataSources 已废弃 - PathCollector DO 已下线，无法进行数据对比

const app = new Hono<{ Bindings: Env }>();

// 统一路径存储键
const UNIFIED_PATHS_KEY = 'unified-paths:list'
const DO_PATHS_TIMEOUT_MS = 3000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

// 路径创建验证模式
const CreatePathSchema = z.object({
  path: z.string().min(1, '路径不能为空').regex(/^\//, '路径必须以 / 开头'),
  proxyId: z.string().min(1, '必须指定所属代理路由'),
  cache: z.object({
    enabled: z.boolean().optional(),
    version: z.number().int().positive().optional(),
    ttl: z.number().int().positive().optional(),
    // 新增：灵活缓存键策略
    keyStrategy: z.enum(['path-only', 'path-params', 'path-headers', 'path-params-headers']).optional(),
    keyHeaders: z.union([
      z.literal('all'),
      z.array(z.string())
    ]).optional(),
    keyParams: z.union([
      z.literal('all'),
      z.array(z.string())
    ]).optional()
  }).optional(),
  rateLimit: z.object({
    enabled: z.boolean().optional(),
    limit: z.number().int().positive().optional(),
    window: z.number().int().positive().optional()
  }).optional(),
  geo: z.object({
    enabled: z.boolean().optional(),
    mode: z.enum(['whitelist', 'blacklist']).optional(),
    countries: z.array(z.string()).optional()
  }).optional()
});

// 路径更新验证模式
const UpdatePathSchema = CreatePathSchema.partial().extend({
  proxyId: z.string().optional() // 更新时代理 ID 可选
});

/**
 * 从 KV 获取统一路径配置
 */
async function getUnifiedPathsFromKV(env: Env): Promise<UnifiedPathConfig[]> {
  try {
    const stored = await env.API_GATEWAY_STORAGE.get(UNIFIED_PATHS_KEY, 'json')
    return (stored as UnifiedPathConfig[]) || []
  } catch (error) {
    console.error('获取统一路径配置失败:', error)
    return []
  }
}

/**
 * 保存统一路径配置到 KV
 */
async function saveUnifiedPathsToKV(env: Env, paths: UnifiedPathConfig[]): Promise<void> {
  await env.API_GATEWAY_STORAGE.put(UNIFIED_PATHS_KEY, JSON.stringify(paths))
}

/**
 * 获取单个路径配置
 */
async function getUnifiedPathConfig(env: Env, path: string): Promise<UnifiedPathConfig | null> {
  const paths = await getUnifiedPathsFromKV(env)
  return paths.find(p => p.path === path) || null
}

/**
 * 更新或创建路径配置
 */
async function updateUnifiedPathConfig(env: Env, path: string, config: Partial<UnifiedPathConfig>): Promise<void> {
  const paths = await getUnifiedPathsFromKV(env)

  // 同时检查自动发现的路径，获取完整的路径信息
  const discoveredPaths = await getDiscoveredPaths(env);
  const discoveredPath = discoveredPaths.find(p => p.path === path);

  // 查找现有配置时，优先匹配有method的记录
  let existingIndex = paths.findIndex(p => p.path === path && p.method)

  // 如果没找到有method的记录，再查找没有method的记录
  if (existingIndex === -1) {
    existingIndex = paths.findIndex(p => p.path === path && !p.method)
  }

  const existingPath = existingIndex >= 0 ? paths[existingIndex] : null

  // 只允许更新特定的配置字段，保护关键数据字段
  const allowedConfigFields = ['cache', 'rateLimit', 'geo'] as const;
  const filteredConfig = Object.keys(config)
    .filter(key => allowedConfigFields.includes(key as any))
    .reduce((obj, key) => ({ ...obj, [key]: config[key as keyof UnifiedPathConfig] }), {});

  const newConfig: UnifiedPathConfig = {
    path,
    // 1. 保留所有原有数据（优先从现有配置，其次从自动发现）
    ...(existingPath || {}),
    ...(!existingPath && discoveredPath ? discoveredPath : {}),

    // 2. 只应用允许的配置更新，保护关键字段
    ...filteredConfig,

    // 3. 确保必要字段存在（只在没有值时设置默认值）
    cache: config.cache ||
      existingPath?.cache ||
      discoveredPath?.cache ||
      { enabled: false },
    rateLimit: config.rateLimit ||
      existingPath?.rateLimit ||
      discoveredPath?.rateLimit ||
      { enabled: false },
    geo: config.geo ||
      existingPath?.geo ||
      discoveredPath?.geo ||
      { enabled: false },

    // 4. 更新元数据（保留创建时间）
    metadata: {
      createdAt: existingPath?.metadata?.createdAt ||
        discoveredPath?.metadata?.createdAt ||
        new Date(),
      updatedAt: new Date(),
      source: 'manual'  // 手动配置后标记为manual
    }
  }

  if (existingIndex >= 0) {
    // 更新现有配置，保留重要的原有信息
    paths[existingIndex] = {
      ...newConfig,
      metadata: {
        ...newConfig.metadata,
        createdAt: existingPath?.metadata?.createdAt || new Date(),
        updatedAt: new Date(),
        // 如果原来是auto且现在是手动配置，改为manual
        source: existingPath?.metadata?.source === 'auto' ? 'manual' : (newConfig.metadata?.source || 'manual')
      }
    }

    console.log(`[路径配置] 更新现有路径: ${path}, method: ${newConfig.method || 'null'}, existingIndex: ${existingIndex}`)
  } else {
    // 添加新配置
    paths.push(newConfig)
    console.log(`[路径配置] 创建新路径: ${path}, method: ${newConfig.method || 'null'}, discoveredPath: ${!!discoveredPath}`)
  }

  await saveUnifiedPathsToKV(env, paths)
}

/**
 * 从各个配置源获取已配置的路径
 */
async function getConfiguredPaths(env: Env): Promise<UnifiedPathConfig[]> {
  const [cacheConfig, rateLimitConfig, geoConfig] = await Promise.all([
    getConfig(env, CONFIG_TYPES.CACHE) as Promise<CacheConfig>,
    getConfig(env, CONFIG_TYPES.RATE_LIMIT) as Promise<RateLimitConfig>,
    getConfig(env, CONFIG_TYPES.GEO) as Promise<GeoConfig>
  ]);

  const pathsMap = new Map<string, UnifiedPathConfig>();

  // 从缓存配置中获取路径（过滤掉通配符路径）
  Object.entries(cacheConfig.pathConfigs).forEach(([path, config]) => {
    // 跳过通配符路径，这些应该在代理路由中管理
    if (path.includes('*')) {
      return;
    }

    pathsMap.set(path, {
      path,
      cache: {
        enabled: config.enabled,
        version: config.version
      },
      rateLimit: {
        enabled: false
      },
      geo: {
        enabled: false
      },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        source: 'manual'
      }
    });
  });

  // 从限流配置中获取路径（过滤掉通配符路径）
  Object.entries(rateLimitConfig.pathLimits).forEach(([path, limit]) => {
    // 跳过通配符路径，这些应该在代理路由中管理
    if (path.includes('*')) {
      return;
    }

    const existing = pathsMap.get(path);
    if (existing) {
      existing.rateLimit = { enabled: true, limit, window: rateLimitConfig.windowSeconds };
    } else {
      pathsMap.set(path, {
        path,
        cache: { enabled: false },
        rateLimit: { enabled: true, limit, window: rateLimitConfig.windowSeconds },
        geo: { enabled: false },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          source: 'manual'
        }
      });
    }
  });

  // 从地域配置中获取路径（过滤掉通配符路径）
  Object.entries(geoConfig.pathOverrides).forEach(([path, countries]) => {
    // 跳过通配符路径，这些应该在代理路由中管理
    if (path.includes('*')) {
      return;
    }

    const existing = pathsMap.get(path);
    if (existing) {
      existing.geo = { enabled: true, mode: geoConfig.mode, countries };
    } else {
      pathsMap.set(path, {
        path,
        cache: { enabled: false },
        rateLimit: { enabled: false },
        geo: { enabled: true, mode: geoConfig.mode, countries },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          source: 'manual'
        }
      });
    }
  });

  return Array.from(pathsMap.values());
}

/**
 * 从路径收集器获取自动发现的路径
 */
async function getDiscoveredPaths(env: Env): Promise<UnifiedPathConfig[]> {
  try {
    // 直接从统一存储获取所有自动发现的路径
    const UNIFIED_PATHS_KEY = 'unified-paths:list';
    const allPaths = await env.API_GATEWAY_STORAGE.get(UNIFIED_PATHS_KEY, 'json') as UnifiedPathConfig[] || [];

    // 过滤出自动发现的路径
    const discoveredPaths = allPaths.filter(path => path.metadata?.source === 'auto');

    // 确保数据格式正确，处理字段映射
    return discoveredPaths.map(path => ({
      ...path,
      // 兼容处理：优先使用 lastAccessed，如果没有则使用 lastSeen（向后兼容）
      lastAccessed: path.lastAccessed ? new Date(path.lastAccessed) :
        (path as any).lastSeen ? new Date((path as any).lastSeen) : undefined,
      cache: path.cache || { enabled: false },
      rateLimit: path.rateLimit || { enabled: false },
      geo: path.geo || { enabled: false },
      metadata: {
        createdAt: path.metadata?.createdAt ? new Date(path.metadata.createdAt) : new Date(),
        updatedAt: path.metadata?.updatedAt ? new Date(path.metadata.updatedAt) : new Date(),
        source: 'auto' as const
      }
    }));
  } catch (error) {
    console.error('Failed to get discovered paths:', error);
    return [];
  }
}

/**
 * 从 KV 获取代理路由列表
 * 用于路径自动归类和关联显示
 */
async function getProxyRoutesFromKV(env: Env): Promise<ProxyRoute[]> {
  try {
    const PROXY_ROUTES_KEY = 'proxy-routes:list';
    const stored = await env.API_GATEWAY_STORAGE.get(PROXY_ROUTES_KEY, 'json');
    return (stored as ProxyRoute[]) || [];
  } catch (error) {
    console.error('获取代理路由失败:', error);
    return [];
  }
}

/**
 * 为路径列表添加代理关联信息
 * @param paths 路径列表
 * @param proxyRoutes 代理路由列表
 * @returns 包含代理信息的路径列表
 */
function enrichPathsWithProxyInfo(
  paths: UnifiedPathConfig[],
  proxyRoutes: ProxyRoute[]
): UnifiedPathConfig[] {
  const proxyMap = new Map(proxyRoutes.map(proxy => [proxy.id, proxy]));

  return paths.map(path => {
    if (path.proxyId) {
      const proxy = proxyMap.get(path.proxyId);
      return {
        ...path,
        proxyPattern: proxy?.pattern
      };
    }
    return path;
  });
}

/**
 * 合并 DO 实时数据与 KV 配置数据
 */
function mergeDODataWithKVConfigs(
  doPathsData: Array<{
    path: string;
    method?: string;
    requestCount: number;
    lastAccessed: string;
    sourceIPs: string[];
    metadata: {
      source: 'auto';
      createdAt: Date;
      updatedAt: Date;
    };
  }>,
  kvConfigs: UnifiedPathConfig[]
): UnifiedPathConfig[] {
  const pathsMap = new Map<string, UnifiedPathConfig>();

  // 首先添加所有 KV 配置（手动配置的路径）
  kvConfigs.forEach(kvConfig => {
    const pathKey = `${kvConfig.method || 'GET'}:${kvConfig.path}`;
    pathsMap.set(pathKey, {
      ...kvConfig,
      // 确保基本字段有默认值
      cache: kvConfig.cache || { enabled: false },
      rateLimit: kvConfig.rateLimit || { enabled: false },
      geo: kvConfig.geo || { enabled: false },
      requestCount: kvConfig.requestCount || 0
    });
  });

  // 然后添加或更新 DO 实时数据
  doPathsData.forEach(doPath => {
    const pathKey = `${doPath.method || 'GET'}:${doPath.path}`;
    const existing = pathsMap.get(pathKey);

    if (existing) {
      // 如果已存在配置，更新实时数据但保留配置
      pathsMap.set(pathKey, {
        ...existing,
        requestCount: doPath.requestCount,
        lastAccessed: new Date(doPath.lastAccessed),
        sourceIPs: doPath.sourceIPs,
        metadata: {
          ...existing.metadata,
          updatedAt: doPath.metadata.updatedAt,
          createdAt: existing.metadata?.createdAt || doPath.metadata.createdAt,
          // 如果原来是自动发现且现在有手动配置，保持手动配置标记
          source: existing.metadata?.source === 'manual' ? 'manual' : 'auto'
        }
      });
    } else {
      // 新的自动发现路径
      pathsMap.set(pathKey, {
        path: doPath.path,
        method: doPath.method,
        requestCount: doPath.requestCount,
        lastAccessed: new Date(doPath.lastAccessed),
        sourceIPs: doPath.sourceIPs,
        cache: { enabled: false },
        rateLimit: { enabled: false },
        geo: { enabled: false },
        metadata: {
          createdAt: doPath.metadata.createdAt,
          updatedAt: doPath.metadata.updatedAt,
          source: doPath.metadata.source
        }
      });
    }
  });

  return Array.from(pathsMap.values());
}

/**
 * 合并多个数据源的路径，去重并合并配置
 */
function mergePaths(...pathArrays: UnifiedPathConfig[][]): UnifiedPathConfig[] {
  const pathsMap = new Map<string, UnifiedPathConfig>();
  const manualPaths = new Set<string>();

  // 先收集所有手动配置的路径
  pathArrays.flat().forEach(pathConfig => {
    if (pathConfig.metadata?.source === 'manual') {
      manualPaths.add(pathConfig.path);
    }
  });

  pathArrays.flat().forEach(pathConfig => {
    // 如果这个路径已有手动配置，且当前记录是自动发现的，跳过
    if (manualPaths.has(pathConfig.path) && pathConfig.metadata?.source === 'auto') {
      return;
    }

    // 使用路径和方法的组合作为键，确保同一路径不同方法分开处理
    const pathKey = `${pathConfig.method || 'UNKNOWN'}:${pathConfig.path}`;
    const existing = pathsMap.get(pathKey);
    if (existing) {
      // 合并配置，优先使用已配置的设置
      pathsMap.set(pathKey, {
        ...existing,
        ...pathConfig,
        proxyTarget: existing.proxyTarget || pathConfig.proxyTarget,
        lastAccessed: pathConfig.lastAccessed || existing.lastAccessed,
        requestCount: (existing.requestCount || 0) + (pathConfig.requestCount || 0),
        cache: {
          enabled: existing.cache?.enabled !== undefined ? existing.cache.enabled : pathConfig.cache?.enabled,
          version: existing.cache?.version || pathConfig.cache?.version
        },
        rateLimit: {
          enabled: existing.rateLimit?.enabled !== undefined ? existing.rateLimit.enabled : pathConfig.rateLimit?.enabled,
          limit: existing.rateLimit?.limit || pathConfig.rateLimit?.limit,
          window: existing.rateLimit?.window || pathConfig.rateLimit?.window
        },
        geo: {
          enabled: existing.geo?.enabled !== undefined ? existing.geo.enabled : pathConfig.geo?.enabled,
          mode: existing.geo?.mode || pathConfig.geo?.mode,
          countries: existing.geo?.countries || pathConfig.geo?.countries
        },
        metadata: {
          createdAt: existing.metadata?.createdAt || pathConfig.metadata?.createdAt || new Date(),
          updatedAt: new Date(),
          source: existing.metadata?.source === 'manual' ? 'manual' : pathConfig.metadata?.source || 'auto'
        }
      });
    } else {
      pathsMap.set(pathKey, pathConfig);
    }
  });

  return Array.from(pathsMap.values());
}

// ============================================
// 调试端点已移除 (Security Issue - 2025-10-16)
// ============================================
// 
// 原因：无认证保护，可暴露/删除生产数据
// 
// 已移除端点：
// - GET  /debug/d1-paths          (暴露 D1 原始数据)
// - GET  /debug/paths-from-d1     (暴露路径统计)
// - POST /debug/delete-snapshot   (删除 KV snapshot)
// - GET  /debug/cache-keys        (暴露缓存键)
// - GET  /debug/simulate-empty-response
// - POST /debug/clear-all-cache   (清空所有缓存)
// - POST /debug/cleanup-internal-paths (删除统计数据)
// - GET  /debug/full-flow         (暴露数据流)
//
// 替代方案（本地开发）：
// - wrangler d1 execute path-stats-db --command "SELECT ..."
// - wrangler kv:key list --binding=API_GATEWAY_STORAGE
// - wrangler dev （本地开发服务器）
// ============================================

// GET /paths - 获取所有路径（搜索、分页、代理过滤）
// Phase 3: 支持灰度切换（DO → KV Snapshot）
app.get('/paths', async (c) => {
  try {
    const logger = createRequestLogger(c);
    const searchQuery = c.req.query('q') || '';
    const proxyId = c.req.query('proxyId') || '';
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
    const clientIP = c.req.header('CF-Connecting-IP') || 'unknown';

    logger.info('获取路径列表', { searchQuery, proxyId, page, limit, clientIP });

    // Phase 3: 已完成灰度切换，全量使用新 API（KV Snapshot + D1）
    return await handlePathsV2(c, logger, { searchQuery, proxyId, page, limit });
  } catch (error) {
    const logger = createRequestLogger(c);
    logger.error('获取路径列表失败', logger.context, error as Error);

    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * 新版处理器：KV Snapshot + D1 fallback (Phase 3)
 */
async function handlePathsV2(
  c: any,
  logger: any,
  options: { searchQuery: string; proxyId: string; page: number; limit: number }
): Promise<Response> {
  const { searchQuery, proxyId, page, limit } = options;

  logger.info('Using new API (KV Snapshot)', { page, limit });

  try {
    // 调用新版 API（paths-api-v2.ts）
    const response = await readPathsFromKV(
      c.env,
      { searchQuery, proxyId, page, limit },
      logger
    );

    // 添加代理关联信息
    const proxyRoutes = await getProxyRoutesFromKV(c.env);
    response.data = enrichPathsWithProxyInfo(response.data, proxyRoutes);

    // 添加缓存条目数量统计
    try {
      const cacheIndex = await c.env.API_GATEWAY_STORAGE.get('cache:index', 'json') as Record<string, string[]> || {};

      response.data.forEach(path => {
        const cacheKeys = cacheIndex[path.path] || [];
        path.cacheEntryCount = cacheKeys.length;
      });

      logger.debug('缓存条目数量统计完成', { pathsWithCache: Object.keys(cacheIndex).length });
    } catch (error) {
      logger.warn('获取缓存条目数量失败', { error: error instanceof Error ? error.message : 'Unknown' });
    }

    return c.json(response);
  } catch (error) {
    logger.error('New API failed', error as Error);
    // 返回错误（Phase 3 后不再有 DO fallback）
    return c.json({
      success: false,
      error: 'PATHS_API_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
}

// ============================================
// 以下端点已废弃 - PathCollector DO 已下线
// ============================================

// GET /paths/discovered - 获取自动发现的路径（已废弃：DO 已下线）
app.get('/paths/discovered', async (c) => {
  return c.json({
    success: false,
    error: 'DEPRECATED_ENDPOINT',
    message: 'PathCollector DO 已下线。请使用 GET /paths API 查询路径统计（基于 D1 数据）。'
  }, 410); // 410 Gone
});

// GET /paths/health - 统一路径系统健康检查（Phase 3: 基于 D1）
app.get('/paths/health', async (c) => {
  try {
    const unifiedPaths = await getUnifiedPathsFromKV(c.env);

    // 从 D1 获取统计（替代 DO）
    let stats = { totalRequests: 0, totalPaths: 0, totalActiveIPs: 0 };
    try {
      const result = await c.env.D1.prepare(
        `SELECT 
          COUNT(DISTINCT path) as totalPaths,
          SUM(requests) as totalRequests,
          SUM(unique_ips_seen) as totalActiveIPs
        FROM path_stats_hourly
        WHERE hour_bucket >= ?`
      ).bind(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 13)).first() as any;

      stats = {
        totalRequests: result?.totalRequests || 0,
        totalPaths: result?.totalPaths || 0,
        totalActiveIPs: result?.totalActiveIPs || 0
      };
    } catch (error) {
      console.warn('获取 D1 统计失败:', error);
    }

    // 基于统一数据计算统计
    const manualPaths = unifiedPaths.filter((p: any) => p.metadata?.source === 'manual');
    const autoPaths = unifiedPaths.filter((p: any) => p.metadata?.source === 'auto');

    return c.json({
      status: 'healthy',
      summary: {
        totalUniquePaths: unifiedPaths.length,
        manualPaths: manualPaths.length,
        autoPaths: autoPaths.length,
        pathsWithCache: unifiedPaths.filter((p: any) => p.cache?.enabled).length,
        pathsWithRateLimit: unifiedPaths.filter((p: any) => p.rateLimit?.enabled).length,
        pathsWithGeo: unifiedPaths.filter((p: any) => p.geo?.enabled).length,
        pathsWithMethod: unifiedPaths.filter((p: any) => p.method).length,
        pathsWithRequestCount: unifiedPaths.filter((p: any) => p.requestCount && p.requestCount > 0).length
      },
      stats,
      dataSource: 'd1', // 标记数据来源
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Unified paths health check error:', error);
    return c.json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, 500);
  }
});

// POST /paths/auto-assign - 自动归类未分配的路径
app.post('/paths/auto-assign', async (c) => {
  try {
    const logger = createRequestLogger(c);
    logger.info('开始自动归类路径');

    // 获取当前所有路径和代理路由
    const [paths, proxyRoutes] = await Promise.all([
      getUnifiedPathsFromKV(c.env),
      getProxyRoutesFromKV(c.env)
    ]);

    // 找出未分配代理的路径
    const unassignedPaths = paths.filter(path => !path.proxyId);
    logger.info('找到未分配路径', { count: unassignedPaths.length });

    if (unassignedPaths.length === 0) {
      return c.json({
        success: true,
        message: '没有需要归类的路径',
        data: {
          totalPaths: paths.length,
          assignedCount: 0,
          unassignedCount: 0
        },
        timestamp: new Date().toISOString()
      });
    }

    // 执行自动归类
    const assignedPaths = PathMatcher.autoAssignProxyToPaths(unassignedPaths, proxyRoutes);
    const successfullyAssigned = assignedPaths.filter(path => path.proxyId);

    // 更新路径数据
    const updatedPaths = paths.map(existingPath => {
      const assigned = assignedPaths.find(ap => ap.path === existingPath.path);
      return assigned || existingPath;
    });

    await saveUnifiedPathsToKV(c.env, updatedPaths);

    logger.info('自动归类完成', {
      assigned: successfullyAssigned.length,
      unassigned: unassignedPaths.length - successfullyAssigned.length
    });

    return c.json({
      success: true,
      message: `成功归类 ${successfullyAssigned.length} 个路径`,
      data: {
        totalPaths: updatedPaths.length,
        assignedCount: successfullyAssigned.length,
        unassignedCount: unassignedPaths.length - successfullyAssigned.length,
        assignedPaths: successfullyAssigned.map(p => ({
          path: p.path,
          proxyId: p.proxyId,
          proxyPattern: p.proxyPattern
        }))
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const logger = createRequestLogger(c);
    logger.error('自动归类失败', logger.context, error as Error);

    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// POST /paths - 创建新的路径配置（需要指定代理）
app.post('/paths', zValidator('json', CreatePathSchema), async (c) => {
  try {
    const logger = createRequestLogger(c);
    const data = c.req.valid('json');

    logger.info('创建路径配置', { path: data.path, proxyId: data.proxyId });

    // 验证代理路由是否存在
    const proxyRoutes = await getProxyRoutesFromKV(c.env);
    const proxy = proxyRoutes.find(p => p.id === data.proxyId);

    if (!proxy) {
      return c.json({
        success: false,
        error: 'PROXY_NOT_FOUND',
        message: `指定的代理路由不存在: ${data.proxyId}`
      }, 400);
    }

    // 验证路径是否匹配代理模式
    if (!PathMatcher.isPathMatchingPattern(data.path, proxy.pattern)) {
      return c.json({
        success: false,
        error: 'PATH_PROXY_MISMATCH',
        message: `路径 ${data.path} 不匹配代理模式 ${proxy.pattern}`
      }, 400);
    }

    // 检查路径是否已存在
    const existingPaths = await getUnifiedPathsFromKV(c.env);
    if (existingPaths.some(p => p.path === data.path)) {
      return c.json({
        success: false,
        error: 'PATH_EXISTS',
        message: `路径 ${data.path} 已存在`
      }, 400);
    }

    // 创建新的路径配置
    const newPathConfig: UnifiedPathConfig = {
      path: data.path,
      proxyId: data.proxyId,
      proxyPattern: proxy.pattern,
      cache: data.cache,
      rateLimit: data.rateLimit,
      geo: data.geo,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        source: 'manual'
      }
    };

    // 保存到 KV
    const updatedPaths = [...existingPaths, newPathConfig];
    await saveUnifiedPathsToKV(c.env, updatedPaths);

    logger.info('路径配置创建成功', { path: data.path, proxyId: data.proxyId });

    return c.json({
      success: true,
      data: newPathConfig,
      message: '路径配置创建成功',
      timestamp: new Date().toISOString()
    }, 201);
  } catch (error) {
    const logger = createRequestLogger(c);
    logger.error('创建路径配置失败', logger.context, error as Error);

    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// ============================================
// Phase 3: 灰度迁移 API（必须在参数化路由之前）
// ============================================

// GET /paths/compare - 数据源对比（DO vs D1）（已废弃）
app.get('/paths/compare', async (c) => {
  return c.json({
    success: false,
    error: 'DEPRECATED_ENDPOINT',
    message: 'PathCollector DO 已下线，数据对比功能不再可用。灰度迁移已完成，无需对比。'
  }, 410); // 410 Gone
});

// GET /paths/migration-config - 获取灰度配置
app.get('/paths/migration-config', async (c) => {
  try {
    const logger = createRequestLogger(c);
    logger.info('获取灰度配置');

    const config = await c.env.API_GATEWAY_STORAGE.get(
      'migration:paths-api-config',
      'json'
    ) as any;

    const defaultConfig = {
      newAPIPercentage: 0,
      forceNewAPIIPs: [],
      forceOldAPIIPs: [],
      enableComparison: false,
      updatedAt: new Date().toISOString()
    };

    return c.json({
      success: true,
      data: config || defaultConfig,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting migration config:', error);
    return c.json({
      success: false,
      error: 'CONFIG_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// PUT /paths/migration-config - 更新灰度配置
app.put('/paths/migration-config', async (c) => {
  try {
    const logger = createRequestLogger(c);
    const newConfig = await c.req.json() as any;

    // 验证配置
    if (newConfig.newAPIPercentage !== undefined) {
      if (newConfig.newAPIPercentage < 0 || newConfig.newAPIPercentage > 100) {
        return c.json({
          success: false,
          error: 'INVALID_PERCENTAGE',
          message: 'newAPIPercentage must be between 0 and 100'
        }, 400);
      }
    }

    // 读取现有配置
    const existing = await c.env.API_GATEWAY_STORAGE.get(
      'migration:paths-api-config',
      'json'
    ) as any;

    const updated = {
      newAPIPercentage: newConfig.newAPIPercentage ?? existing?.newAPIPercentage ?? 0,
      forceNewAPIIPs: newConfig.forceNewAPIIPs ?? existing?.forceNewAPIIPs ?? [],
      forceOldAPIIPs: newConfig.forceOldAPIIPs ?? existing?.forceOldAPIIPs ?? [],
      enableComparison: newConfig.enableComparison ?? existing?.enableComparison ?? false,
      updatedAt: new Date().toISOString()
    };

    await c.env.API_GATEWAY_STORAGE.put(
      'migration:paths-api-config',
      JSON.stringify(updated)
    );

    logger.info('Migration config updated', updated);

    return c.json({
      success: true,
      data: updated,
      message: 'Migration config updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const logger = createRequestLogger(c);
    logger.error('Failed to update migration config', error as Error);
    return c.json({
      success: false,
      error: 'CONFIG_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// ============================================
// 参数化路由（必须在具体路径之后）
// ============================================

// GET /paths/:encodedPath - 获取特定路径的统一配置
app.get('/paths/:encodedPath', async (c) => {
  try {
    const encodedPath = c.req.param('encodedPath');
    const path = decodeURIComponent(encodedPath);

    // 优先从统一存储获取配置
    let pathConfig = await getUnifiedPathConfig(c.env, path);

    if (!pathConfig) {
      // 注意：代理路由路径已从此处移除，应通过代理路由管理端点处理
      // 这里只处理统一路径配置
    }

    if (!pathConfig) {
      // 如果路径不存在，创建一个默认配置
      const defaultConfig: UnifiedPathConfig = {
        path,
        cache: { enabled: false },
        rateLimit: { enabled: false },
        geo: { enabled: false },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          source: 'manual'
        }
      };

      return c.json({
        success: true,
        data: defaultConfig,
        timestamp: new Date().toISOString()
      });
    }

    return c.json({
      success: true,
      data: pathConfig,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting path config:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// PUT /paths/:encodedPath - 更新特定路径的统一配置
app.put('/paths/:encodedPath', async (c) => {
  try {
    const encodedPath = c.req.param('encodedPath');
    const path = decodeURIComponent(encodedPath);
    const newConfig = await c.req.json() as Partial<UnifiedPathConfig>;

    // 验证配置
    if (newConfig.cache?.enabled !== undefined && typeof newConfig.cache.enabled !== 'boolean') {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'cache.enabled must be a boolean'
      }, 400);
    }

    if (newConfig.rateLimit?.enabled !== undefined && typeof newConfig.rateLimit.enabled !== 'boolean') {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'rateLimit.enabled must be a boolean'
      }, 400);
    }

    if (newConfig.geo?.enabled !== undefined && typeof newConfig.geo.enabled !== 'boolean') {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'geo.enabled must be a boolean'
      }, 400);
    }

    // 更新各模块的配置系统，而不是操作统一路径存储
    const updates: Promise<any>[] = [];

    // 更新缓存配置
    if (newConfig.cache !== undefined) {
      const cacheConfigPromise = (async () => {
        // 注意：由于移除了KV收集器，无法预先检查HTTP方法
        // 缓存中间件会在运行时进行方法检查并跳过不支持的请求

        const cacheConfig = await getConfig(c.env, CONFIG_TYPES.CACHE) as CacheConfig;
        if (newConfig.cache!.enabled) {
          cacheConfig.pathConfigs[path] = {
            enabled: true,
            version: newConfig.cache!.version || cacheConfig.pathConfigs[path]?.version || 1,
            ttl: newConfig.cache!.ttl,
            // 保存完整的缓存键策略配置（修复TTL更新不生效和策略丢失的问题）
            keyStrategy: newConfig.cache!.keyStrategy,
            keyHeaders: newConfig.cache!.keyHeaders,
            keyParams: newConfig.cache!.keyParams
          };
        } else {
          delete cacheConfig.pathConfigs[path];
        }
        return updateConfig(c.env, CONFIG_TYPES.CACHE, cacheConfig);
      })();
      updates.push(cacheConfigPromise);
    }

    // 更新限流配置
    if (newConfig.rateLimit !== undefined) {
      const rateLimitConfigPromise = (async () => {
        const rateLimitConfig = await getConfig(c.env, CONFIG_TYPES.RATE_LIMIT) as RateLimitConfig;
        if (newConfig.rateLimit!.enabled) {
          rateLimitConfig.pathLimits[path] = newConfig.rateLimit!.limit || 60;
        } else {
          delete rateLimitConfig.pathLimits[path];
        }
        return updateConfig(c.env, CONFIG_TYPES.RATE_LIMIT, rateLimitConfig);
      })();
      updates.push(rateLimitConfigPromise);
    }

    // 更新地域配置
    if (newConfig.geo !== undefined) {
      const geoConfigPromise = (async () => {
        const geoConfig = await getConfig(c.env, CONFIG_TYPES.GEO) as GeoConfig;
        if (newConfig.geo!.enabled) {
          geoConfig.pathOverrides[path] = newConfig.geo!.countries || [];
        } else {
          delete geoConfig.pathOverrides[path];
        }
        return updateConfig(c.env, CONFIG_TYPES.GEO, geoConfig);
      })();
      updates.push(geoConfigPromise);
    }

    // 并行执行所有更新
    await Promise.all(updates);

    // 重要：更新统一路径存储，保留现有的路径信息
    await updateUnifiedPathConfig(c.env, path, newConfig);

    return c.json({
      success: true,
      message: 'Path configuration updated successfully',
      path,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error updating path config:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Invalid JSON'
    }, 400);
  }
});

// POST /paths/batch - 批量操作路径
app.post('/paths/batch', async (c) => {
  try {
    const { operations } = await c.req.json() as { operations: UnifiedPathOperation[] };

    if (!Array.isArray(operations)) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'operations must be an array'
      }, 400);
    }

    // 处理每个操作 - 只操作旧存储系统，不操作统一路径存储
    const results: Array<{ path: string; success: boolean; error?: string }> = [];

    for (const operation of operations) {
      try {
        switch (operation.type) {
          case 'toggle-cache':
            // 切换缓存状态 - 只操作旧的缓存配置系统
            const cacheConfig = await getConfig(c.env, CONFIG_TYPES.CACHE) as CacheConfig;
            const existingCacheConfig = cacheConfig.pathConfigs[operation.path];
            const currentCacheEnabled = existingCacheConfig?.enabled || false;

            if (!currentCacheEnabled) {
              // 开启缓存：保留现有的策略配置，只切换enabled状态
              // ⚠️ 使用 ?? {} 防止 existingCacheConfig 为 undefined 时展开运算符崩溃
              cacheConfig.pathConfigs[operation.path] = {
                ...(existingCacheConfig ?? {}),
                enabled: true,
                version: existingCacheConfig?.version || 1,
                // 保留现有的策略配置（如果存在），否则使用 null（表示使用默认）
                keyStrategy: existingCacheConfig?.keyStrategy ?? null,
                keyHeaders: existingCacheConfig?.keyHeaders ?? null,
                keyParams: existingCacheConfig?.keyParams ?? null
              };
            } else {
              // 关闭缓存：保留配置，只设置enabled为false
              // ⚠️ 不要删除配置，否则 unified-paths 中的配置仍然存在导致状态不一致
              cacheConfig.pathConfigs[operation.path] = {
                ...(existingCacheConfig ?? {}),
                enabled: false,
                // 保留所有其他字段
                version: existingCacheConfig?.version || 1,
                keyStrategy: existingCacheConfig?.keyStrategy ?? null,
                keyHeaders: existingCacheConfig?.keyHeaders ?? null,
                keyParams: existingCacheConfig?.keyParams ?? null
              };
            }

            await updateConfig(c.env, CONFIG_TYPES.CACHE, cacheConfig);

            // ⚠️ 同步更新 unified-paths 配置，确保两个存储一致
            const newEnabledState = !currentCacheEnabled;
            const pathConfig = cacheConfig.pathConfigs[operation.path];
            await updateUnifiedPathConfig(c.env, operation.path, {
              cache: {
                enabled: newEnabledState,
                version: pathConfig.version,
                ttl: pathConfig.ttl,
                // null 转换为 undefined，因为 updateUnifiedPathConfig 不接受 null
                keyStrategy: pathConfig.keyStrategy ?? undefined,
                keyHeaders: pathConfig.keyHeaders ?? undefined,
                keyParams: pathConfig.keyParams ?? undefined
              }
            });

            results.push({ path: operation.path, success: true });
            break;

          case 'toggle-rate-limit':
            // 切换限流状态 - 只操作旧的限流配置系统
            const rateLimitConfig = await getConfig(c.env, CONFIG_TYPES.RATE_LIMIT) as RateLimitConfig;
            const currentLimit = rateLimitConfig.pathLimits[operation.path];

            if (!currentLimit) {
              rateLimitConfig.pathLimits[operation.path] = 60; // 默认限制
            } else {
              delete rateLimitConfig.pathLimits[operation.path];
            }

            await updateConfig(c.env, CONFIG_TYPES.RATE_LIMIT, rateLimitConfig);
            results.push({ path: operation.path, success: true });
            break;

          case 'toggle-geo':
            // 切换地域封锁状态 - 只操作旧的地域配置系统
            const geoConfig = await getConfig(c.env, CONFIG_TYPES.GEO) as GeoConfig;
            const currentGeoOverride = geoConfig.pathOverrides[operation.path];

            if (!currentGeoOverride) {
              geoConfig.pathOverrides[operation.path] = []; // 默认空数组
            } else {
              delete geoConfig.pathOverrides[operation.path];
            }

            await updateConfig(c.env, CONFIG_TYPES.GEO, geoConfig);
            results.push({ path: operation.path, success: true });
            break;

          case 'delete':
            // 删除路径的所有配置 - 操作旧的配置系统和统一路径存储
            const [delCacheConfig, delRateLimitConfig, delGeoConfig] = await Promise.all([
              getConfig(c.env, CONFIG_TYPES.CACHE) as Promise<CacheConfig>,
              getConfig(c.env, CONFIG_TYPES.RATE_LIMIT) as Promise<RateLimitConfig>,
              getConfig(c.env, CONFIG_TYPES.GEO) as Promise<GeoConfig>
            ]);

            // 删除旧配置系统中的数据
            delete delCacheConfig.pathConfigs[operation.path];
            delete delRateLimitConfig.pathLimits[operation.path];
            delete delGeoConfig.pathOverrides[operation.path];

            // 从统一路径存储中删除
            const unifiedPaths = await getUnifiedPathsFromKV(c.env);
            const updatedPaths = unifiedPaths.filter(p => p.path !== operation.path);

            // 并行执行所有删除操作
            await Promise.all([
              updateConfig(c.env, CONFIG_TYPES.CACHE, delCacheConfig),
              updateConfig(c.env, CONFIG_TYPES.RATE_LIMIT, delRateLimitConfig),
              updateConfig(c.env, CONFIG_TYPES.GEO, delGeoConfig),
              saveUnifiedPathsToKV(c.env, updatedPaths)
            ]);

            results.push({ path: operation.path, success: true });
            break;

          default:
            results.push({
              path: operation.path,
              success: false,
              error: `Unknown operation type: ${operation.type}`
            });
        }
      } catch (error) {
        results.push({
          path: operation.path,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    return c.json({
      success: true,
      message: `Batch operation completed: ${successCount} succeeded, ${failureCount} failed`,
      results,
      summary: { successCount, failureCount, total: results.length },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error processing batch operations:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Invalid JSON'
    }, 400);
  }
});

// ============================================
// 以下 DO 端点已废弃 - PathCollector DO 已下线
// ============================================

// GET /paths/do/system-stats - 获取 PathCollector DO 系统统计（已废弃）
app.get('/paths/do/system-stats', async (c) => {
  return c.json({
    success: false,
    error: 'DEPRECATED_ENDPOINT',
    message: 'PathCollector DO 已下线。请使用 GET /paths/health API 查询系统统计（基于 D1 数据）。'
  }, 410); // 410 Gone
});

// GET /paths/do/ip/:ip - 获取特定 IP 的路径统计（已废弃）
app.get('/paths/do/ip/:ip', async (c) => {
  return c.json({
    success: false,
    error: 'DEPRECATED_ENDPOINT',
    message: 'PathCollector DO 已下线。IP 级别的路径统计已不再支持，请使用 GET /paths API 查询全局路径统计。'
  }, 410); // 410 Gone
});

// POST /paths/do/batch-cleanup - 批量清理 DO 实例（已废弃）
app.post('/paths/do/batch-cleanup', async (c) => {
  return c.json({
    success: false,
    error: 'DEPRECATED_ENDPOINT',
    message: 'PathCollector DO 已下线。数据清理现由 D1 定时任务自动执行。'
  }, 410); // 410 Gone
});

// GET /paths/do/export - 导出 DO 系统数据（已废弃）
app.get('/paths/do/export', async (c) => {
  return c.json({
    success: false,
    error: 'DEPRECATED_ENDPOINT',
    message: 'PathCollector DO 已下线。数据导出功能需要重新实现（基于 D1 数据）。'
  }, 410); // 410 Gone
});

// POST /paths/cleanup-duplicates - 清理重复路径数据
app.post('/paths/cleanup-duplicates', async (c) => {
  try {
    const logger = createRequestLogger(c);
    logger.info('开始清理重复路径数据');

    const paths = await getUnifiedPathsFromKV(c.env);
    const pathMap = new Map<string, UnifiedPathConfig>();
    const duplicates: string[] = [];
    const cleaned: UnifiedPathConfig[] = [];

    // 按路径分组，合并重复数据
    for (const pathConfig of paths) {
      const key = pathConfig.path;

      if (pathMap.has(key)) {
        const existing = pathMap.get(key)!;
        duplicates.push(key);
        console.log(`[清理重复] 发现重复路径: ${key}, 现有: method=${existing.method}, 新的: method=${pathConfig.method}`);

        // 合并逻辑：优先保留有method和统计信息的记录
        const merged: UnifiedPathConfig = {
          ...existing,
          ...pathConfig,
          // 保留有值的method字段
          method: existing.method || pathConfig.method,
          // 保留更大的请求计数
          requestCount: Math.max(existing.requestCount || 0, pathConfig.requestCount || 0),
          // 保留更新的访问时间
          lastAccessed: (existing.lastAccessed && pathConfig.lastAccessed)
            ? new Date(Math.max(new Date(existing.lastAccessed).getTime(), new Date(pathConfig.lastAccessed).getTime()))
            : (existing.lastAccessed || pathConfig.lastAccessed),
          // 保留代理信息
          proxyId: existing.proxyId || pathConfig.proxyId,
          proxyPattern: existing.proxyPattern || pathConfig.proxyPattern,
          proxyTarget: existing.proxyTarget || pathConfig.proxyTarget,
          stripPrefix: existing.stripPrefix !== undefined ? existing.stripPrefix : pathConfig.stripPrefix,
          // 合并配置，优先使用手动配置
          cache: {
            enabled: pathConfig.cache?.enabled !== undefined ? pathConfig.cache.enabled : (existing.cache?.enabled || false),
            version: pathConfig.cache?.version || existing.cache?.version,
            ttl: pathConfig.cache?.ttl || existing.cache?.ttl
          },
          rateLimit: {
            enabled: pathConfig.rateLimit?.enabled !== undefined ? pathConfig.rateLimit.enabled : (existing.rateLimit?.enabled || false),
            limit: pathConfig.rateLimit?.limit || existing.rateLimit?.limit,
            window: pathConfig.rateLimit?.window || existing.rateLimit?.window
          },
          geo: {
            enabled: pathConfig.geo?.enabled !== undefined ? pathConfig.geo.enabled : (existing.geo?.enabled || false),
            mode: pathConfig.geo?.mode || existing.geo?.mode,
            countries: pathConfig.geo?.countries || existing.geo?.countries
          },
          // 元数据处理：保留最早的创建时间，最新的更新时间
          metadata: {
            createdAt: (existing.metadata?.createdAt && pathConfig.metadata?.createdAt)
              ? new Date(Math.min(new Date(existing.metadata.createdAt).getTime(), new Date(pathConfig.metadata.createdAt).getTime()))
              : (existing.metadata?.createdAt || pathConfig.metadata?.createdAt || new Date()),
            updatedAt: new Date(),
            source: pathConfig.metadata?.source === 'manual' ? 'manual' : (existing.metadata?.source || 'auto')
          }
        };

        pathMap.set(key, merged);
      } else {
        pathMap.set(key, pathConfig);
      }
    }

    // 转换回数组
    for (const [, config] of pathMap) {
      cleaned.push(config);
    }

    // 保存清理后的数据
    await saveUnifiedPathsToKV(c.env, cleaned);

    logger.info(`路径数据清理完成: 原始${paths.length}条, 清理后${cleaned.length}条, 发现${duplicates.length}个重复路径`);

    return c.json({
      success: true,
      message: '重复数据清理完成',
      result: {
        originalCount: paths.length,
        cleanedCount: cleaned.length,
        duplicatesFound: duplicates.length,
        duplicatePaths: [...new Set(duplicates)]
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('清理重复数据失败:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * 获取指定路径的所有缓存条目
 * GET /api/admin/paths/:encodedPath/cache-entries?limit=100&offset=0
 * 
 * @param encodedPath - URL编码后的路径（例如：%2Fapi%2Fuser%2Fprofile）
 * @query limit - 返回条目数量限制（1-1000，默认100）
 * @query offset - 分页偏移量（默认0）
 */
app.get('/paths/:encodedPath/cache-entries', async (c) => {
  try {
    const encodedPath = c.req.param('encodedPath');

    if (!encodedPath) {
      return c.json({
        success: false,
        error: 'PATH_REQUIRED',
        message: '必须指定路径'
      }, 400);
    }

    // 解码路径（Hono会自动解码参数，但为了明确，这里显式解码）
    const path = decodeURIComponent(encodedPath);

    // 解析并验证分页参数
    const limitParam = c.req.query('limit') || '100';
    const offsetParam = c.req.query('offset') || '0';

    const parsedLimit = parseInt(limitParam);
    const parsedOffset = parseInt(offsetParam);

    // 验证参数有效性
    if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
      return c.json({
        success: false,
        error: 'INVALID_PARAMS',
        message: 'limit 和 offset 必须是有效的数字'
      }, 400);
    }

    // 限制范围：limit 1-1000，offset >= 0
    const limit = Math.min(Math.max(parsedLimit, 1), 1000);
    const offset = Math.max(parsedOffset, 0);

    // 获取缓存条目
    const entries = await getPathCacheEntries(c.env, path, { limit, offset });

    return c.json({
      success: true,
      data: {
        path,
        entries,
        pagination: {
          limit,
          offset,
          count: entries.length
        }
      }
    });
  } catch (error) {
    console.error('获取缓存条目失败:', error);
    return c.json({
      success: false,
      error: 'FETCH_CACHE_ENTRIES_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * POST /paths/cleanup/invalid
 * 清理 D1 中不匹配当前启用代理路由的历史路径数据
 */
app.post('/paths/cleanup/invalid', async (c) => {
  try {
    const env = c.env as Env;

    // 导入清理函数
    const { cleanupInvalidPaths } = await import('../../lib/cleanup-invalid-paths');

    // 执行清理
    const result = await cleanupInvalidPaths(env);

    // 清理完成后，删除 KV snapshot 以强制重新生成
    if (result.success && result.deletedCount > 0) {
      await env.API_GATEWAY_STORAGE.delete('snapshot:config');
      await env.API_GATEWAY_STORAGE.delete('snapshot:latest');
      console.log('已删除 KV snapshot，下次读取时将自动重新生成');
    }

    return c.json({
      success: true,
      message: '路径数据清理完成',
      data: result
    });
  } catch (error) {
    console.error('清理路径数据失败:', error);
    return c.json({
      success: false,
      error: 'CLEANUP_PATHS_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * POST /paths/snapshot/refresh
 * 手动刷新路径统计快照
 * 
 * 用途：
 * - 首次部署时立即生成快照
 * - 数据异常时强制刷新
 * - 运维验证快照生成功能
 */
app.post('/paths/snapshot/refresh', async (c) => {
  try {
    const env = c.env as Env;
    const logger = createRequestLogger(c);

    logger.info('手动触发快照刷新');

    // 导入快照生成函数
    const { generateAndSaveSnapshot } = await import('../../lib/kv-snapshot');

    // 生成并保存快照（最近 24 小时，Top 100 路径）
    const config = await generateAndSaveSnapshot(env, 24, 100);

    logger.info('快照生成成功', {
      version: config.version,
      count: config.count,
      timeRange: config.timeRange
    });

    return c.json({
      success: true,
      message: '快照刷新成功',
      data: {
        version: config.version,
        count: config.count,
        timeRange: config.timeRange,
        timestamp: new Date(config.timestamp).toISOString()
      }
    });
  } catch (error) {
    console.error('快照刷新失败:', error);
    return c.json({
      success: false,
      error: 'SNAPSHOT_REFRESH_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * POST /paths/backfill-methods
 * 批量修复统一配置中的 method 字段
 * 
 * 用途：
 * - 修复历史数据中错误的 method 默认值（GET）
 * - 从 traffic_events 表查询实际使用的 HTTP method
 * - 基于路径特征推断未知路径的 method
 * 
 * 使用场景：
 * - 首次部署后一次性修复所有历史数据
 * - 发现大量路径 method 错误时批量修正
 */
app.post('/paths/backfill-methods', async (c) => {
  try {
    const env = c.env as Env;
    const logger = createRequestLogger(c);

    logger.info('开始批量修复 method 字段');

    // 步骤 1: 读取统一配置
    const stored = await env.API_GATEWAY_STORAGE.get('unified-paths:list', 'json');
    const configs = (stored as UnifiedPathConfig[]) || [];

    if (configs.length === 0) {
      return c.json({
        success: true,
        message: '没有配置需要修复',
        data: { totalPaths: 0, updatedPaths: 0 }
      });
    }

    logger.info('读取配置', { count: configs.length });

    // 步骤 2: 从 traffic_events 查询实际 method
    // ⚠️ 关键：D1/SQLite 限制绑定参数最多 999 个，需要分块查询
    const paths = configs.map(c => c.path);
    const CHUNK_SIZE = 500; // 安全余量：使用 500 而不是 999
    const pathMethodMap = new Map<string, string>();
    const since60Days = Date.now() - 60 * 24 * 60 * 60 * 1000;

    logger.info('开始分块查询', { totalPaths: paths.length, chunkSize: CHUNK_SIZE });

    // 分块查询
    for (let i = 0; i < paths.length; i += CHUNK_SIZE) {
      const chunk = paths.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(',');
      const query = `
        SELECT path, method, COUNT(*) as count
        FROM traffic_events
        WHERE path IN (${placeholders})
          AND timestamp >= ?
        GROUP BY path, method
        ORDER BY path, count DESC
      `;

      const result = await env.D1.prepare(query)
        .bind(...chunk, since60Days)
        .all<{ path: string; method: string; count: number }>();

      // 为每个路径选择最常用的 method
      let currentPath = '';
      let selectedMethod = '';

      for (const row of result.results || []) {
        if (row.path !== currentPath) {
          if (currentPath && selectedMethod) {
            pathMethodMap.set(currentPath, selectedMethod);
          }
          currentPath = row.path;
          selectedMethod = row.method;
        }
      }
      // 保存最后一个路径的结果
      if (currentPath && selectedMethod) {
        pathMethodMap.set(currentPath, selectedMethod);
      }

      logger.info(`查询分块 ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(paths.length / CHUNK_SIZE)}`, {
        chunkPaths: chunk.length,
        foundMethods: result.results?.length || 0
      });
    }

    logger.info('查询到 method', { count: pathMethodMap.size });

    // 步骤 3: 批量更新配置
    // ⚠️ 关键：只使用真实流量数据，不使用启发式推断
    // 推断可能错误且会被永久锁定（kv-snapshot不会覆盖非GET值）
    let updatedCount = 0;
    const updates: Array<{ path: string; oldMethod?: string; newMethod: string }> = [];

    for (const config of configs) {
      const oldMethod = config.method;
      const discoveredMethod = pathMethodMap.get(config.path);

      // 更新条件：
      // 1. 必须从 traffic_events 查询到真实 method
      // 2. 没有 method 或 method 是 GET（可能是错误的默认值）
      if (discoveredMethod && (!oldMethod || oldMethod === 'GET')) {
        config.method = discoveredMethod;
        config.metadata = config.metadata || {
          createdAt: new Date(),
          updatedAt: new Date(),
          source: 'auto'
        };
        config.metadata.updatedAt = new Date();

        updatedCount++;
        if (updates.length < 20) {
          updates.push({ path: config.path, oldMethod, newMethod: discoveredMethod });
        }
      }
    }

    logger.info('批量更新完成', {
      updatedCount,
      notFoundCount: paths.length - pathMethodMap.size
    });

    // 步骤 4: 写回 KV
    if (updatedCount > 0) {
      await env.API_GATEWAY_STORAGE.put('unified-paths:list', JSON.stringify(configs));
      logger.info('配置已更新', { updatedCount });
    }

    return c.json({
      success: true,
      message: `成功修复 ${updatedCount} 个路径的 method 字段`,
      data: {
        totalPaths: configs.length,
        queriedPaths: pathMethodMap.size,
        updatedPaths: updatedCount,
        samples: updates
      }
    });
  } catch (error) {
    console.error('批量修复失败:', error);
    return c.json({
      success: false,
      error: 'BACKFILL_METHODS_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default app;
