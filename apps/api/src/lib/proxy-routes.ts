import type { Env } from '../types/env';
import type { ProxyRoute } from '../types/config';
import { PROXY_ROUTES } from './constants';
import { getCacheManager, getOptimizationFlags } from './optimized-cache';

// 代理路由存储键
const PROXY_ROUTES_KEY = 'proxy-routes:list';

/**
 * 从 KV 获取代理路由列表
 * 如果KV中没有数据，则初始化为内置的默认路由
 */
export async function getProxyRoutesFromKV(env: Env): Promise<ProxyRoute[]> {
  try {
    const stored = await env.API_GATEWAY_STORAGE.get(PROXY_ROUTES_KEY, 'json');

    if (!stored || (Array.isArray(stored) && stored.length === 0)) {
      // 初始化为内置路由
      const initialRoutes: ProxyRoute[] = PROXY_ROUTES.map((route, index) => ({
        ...route,
        id: `default-${index + 1}`,
        enabled: true,
        priority: index
      }));

      // 保存到KV
      await env.API_GATEWAY_STORAGE.put(PROXY_ROUTES_KEY, JSON.stringify(initialRoutes));
      return initialRoutes;
    }

    return (stored as ProxyRoute[]) || [];
  } catch (error) {
    console.error('获取代理路由失败:', error);
    // 返回内置路由作为备用
    return PROXY_ROUTES.map((route, index) => ({
      ...route,
      id: `default-${index + 1}`,
      enabled: true,
      priority: index
    }));
  }
}

/**
 * 获取启用的代理路由列表，按优先级排序
 */
export async function getEnabledProxyRoutes(env: Env): Promise<ProxyRoute[]> {
  const allRoutes = await getProxyRoutesFromKV(env);

  return allRoutes
    .filter(route => route.enabled !== false) // 默认为启用状态
    .sort((a, b) => (a.priority || 0) - (b.priority || 0)); // 按优先级排序
}

/**
 * 根据路径查找匹配的代理路由
 * 返回第一个匹配的路由（按优先级排序）
 * 
 * 🚀 优化：使用 RouteCache 避免每次请求都查询 KV
 */
export async function findMatchingProxyRoute(env: Env, path: string): Promise<ProxyRoute | null> {
  // 检查是否启用路由缓存优化
  const flags = await getOptimizationFlags(env);

  if (flags.enableRouteCache) {
    try {
      // 使用优化的路由缓存
      const cacheManager = getCacheManager(env);
      const route = await cacheManager.routeCache.get(path);

      if (route) {
        // ✅ 缓存命中，直接返回
        console.log(`[RouteCache HIT] ${path} -> ${route.target}`);
        return route;
      }

      // ⚠️ 缓存未命中，继续走 fallback 逻辑
      console.log(`[RouteCache MISS] ${path}, falling back to KV`);
    } catch (error) {
      console.warn('[RouteCache] Failed, falling back to KV:', error);
      // Fallback 到原逻辑
    }
  }

  // Fallback: 原来的 KV 查询逻辑
  const routes = await getEnabledProxyRoutes(env);

  for (const route of routes) {
    // 确保 pattern 字段存在
    if (!route.pattern) {
      console.warn('Proxy route missing pattern field:', route.id);
      continue;
    }
    // 支持通配符模式匹配
    const pattern = route.pattern.replace('*', '');
    if (path.startsWith(pattern)) {
      return route;
    }
  }

  return null;
}

/**
 * 保存代理路由到 KV
 */
export async function saveProxyRoutesToKV(env: Env, routes: ProxyRoute[]): Promise<void> {
  await env.API_GATEWAY_STORAGE.put(PROXY_ROUTES_KEY, JSON.stringify(routes));
}