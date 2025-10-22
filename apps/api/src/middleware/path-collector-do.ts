import { Context, Next } from 'hono';
import type { Env } from '../types/env';
import { safeSendToQueue } from '../lib/queue-helper';
import { generateIdempotentId, hashIP } from '../lib/idempotency';
import type { TrafficEvent } from '../lib/d1-writer';
import { PathMatcher } from '../lib/path-matcher';

// 路由配置缓存（降低 KV 读取频率）
interface ProxyRoutesCache {
  routes: Array<{ id: string; pattern: string }>;
  timestamp: number;
}

let proxyRoutesCache: ProxyRoutesCache | null = null;
const CACHE_TTL_MS = 60 * 1000; // 1分钟缓存

/**
 * 获取代理路由配置（带缓存）
 * 
 * @param env 环境变量
 * @returns 代理路由列表
 */
async function getProxyRoutes(env: Env): Promise<Array<{ id: string; pattern: string }>> {
  const now = Date.now();

  // 检查缓存是否有效
  if (proxyRoutesCache && (now - proxyRoutesCache.timestamp) < CACHE_TTL_MS) {
    return proxyRoutesCache.routes;
  }

  // 从 KV 读取
  try {
    const PROXY_ROUTES_KEY = 'proxy-routes:list';
    const stored = await env.API_GATEWAY_STORAGE.get(PROXY_ROUTES_KEY, 'json');

    // 🔥 关键修复：只选择启用的路由（enabled: true）
    const routes = ((stored as any[]) || [])
      .filter(r => r.enabled === true)
      .map(r => ({
        id: r.id,
        pattern: r.pattern
      }));

    // 更新缓存
    proxyRoutesCache = {
      routes,
      timestamp: now
    };

    return routes;
  } catch (error) {
    console.error('获取代理路由失败:', error);
    return [];
  }
}

/**
 * 检查路径是否匹配任何代理路由
 * 只有匹配代理路由的请求才应该被统计（白名单策略）
 * 
 * @param env 环境变量
 * @param path 请求路径
 * @returns true 表示匹配代理路由，应该统计
 */
async function shouldCollectPath(env: Env, path: string): Promise<boolean> {
  try {
    const proxyRoutes = await getProxyRoutes(env);

    // 检查路径是否匹配任何代理路由
    for (const route of proxyRoutes) {
      if (PathMatcher.isPathMatchingPattern(path, route.pattern)) {
        return true; // 匹配代理路由，应该统计
      }
    }

    return false; // 不匹配任何代理路由，跳过统计
  } catch (error) {
    console.error('检查代理路由失败:', error);
    return false; // 出错时默认不统计
  }
}

/**
 * PathCollector DO 中间件
 * 
 * Phase 1: 降级策略
 * - 优先发送到 Workers Queue（新路径）
 * - Queue 失败时降级到 PathCollector DO（旧路径兜底）
 * 
 * 注意：只统计匹配代理路由的请求（白名单策略）
 */
export async function pathCollectorDOMiddleware(
  c: Context<{
    Bindings: Env;
    Variables: {
      pathCollected?: boolean;
      geoAction?: 'allowed' | 'blocked' | 'throttled';  // ✅ 地区访问控制动作
    }
  }>,
  next: Next
) {
  // 检查路径收集是否启用
  if (c.env.PATH_COLLECTION_ENABLED !== 'true') {
    return next();
  }

  // 检查是否已收集（避免重复）
  if (c.get('pathCollected')) {
    return next();
  }

  c.set('pathCollected', true);

  const clientIP = c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Real-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0] ||
    'unknown';

  const path = new URL(c.req.url).pathname;
  const method = c.req.method;

  // 白名单策略：只统计匹配代理路由的请求
  const shouldCollect = await shouldCollectPath(c.env, path);
  if (!shouldCollect) {
    return next();
  }

  const requestId = c.req.header('CF-Ray') || crypto.randomUUID();
  const startTime = Date.now();

  // 等待请求处理完成
  await next();

  // 计算响应时间和状态
  const responseTime = Date.now() - startTime;
  const status = c.res.status;
  const isError = status >= 400;

  // 检查是否为缓存命中（从响应头获取）
  const cacheHit = c.res.headers.get('X-Cache-Status') === 'HIT';

  // ✅ 读取地区访问控制动作（从 context 中获取）
  const geoAction = c.get('geoAction') as 'allowed' | 'blocked' | 'throttled' | undefined;

  // Phase 2: 异步发送（Queue 优先 + DO 降级），不阻塞响应返回
  c.executionCtx.waitUntil(
    Promise.allSettled([
      // 1. 记录到队列/D1（路径统计）
      recordPathWithFallback(c.env, {
        ip: clientIP,
        path,
        method,
        requestId,
        userAgent: c.req.header('user-agent'),
        country: c.req.raw.cf?.country as string,
        city: c.req.raw.cf?.city as string, // Quick Win: Cloudflare 返回的城市
        edgeColo: c.req.raw.cf?.colo as string, // ✨ Cloudflare 边缘节点代码
        responseTime,
        status,
        isError,
        cacheHit,
        geoAction  // ✅ 传递地区访问控制动作
      }),
      // 2. 记录到 TrafficMonitor DO（实时 RPM 和缓存命中率）
      recordToTrafficMonitor(c.env, {
        path,
        cacheHit
      })
    ]).catch(error => {
      // 路径收集失败不应影响正常请求处理
      console.error('路径收集失败:', error);
    })
  );
}

/**
 * 记录请求到 TrafficMonitor DO
 * 用于实时 RPM 和缓存命中率统计
 * 
 * @param env 环境变量
 * @param data 请求数据
 */
async function recordToTrafficMonitor(
  env: Env,
  data: {
    path: string;
    cacheHit: boolean;
  }
): Promise<void> {
  try {
    const id = env.TRAFFIC_MONITOR.idFromName('global');
    const trafficMonitor = env.TRAFFIC_MONITOR.get(id);

    const recordUrl = new URL('http://dummy/record');
    recordUrl.searchParams.set('path', data.path);
    recordUrl.searchParams.set('cache_hit', data.cacheHit.toString());

    await trafficMonitor.fetch(recordUrl.toString());
  } catch (error) {
    console.error('TrafficMonitor 记录失败:', error);
    // 不抛出错误，避免影响主流程
  }
}

/**
 * Phase 2: 记录路径访问（降级策略）
 * 
 * 策略：
 * 1. 优先发送到 Workers Queue（新路径）
 * 2. Queue 失败时降级到 PathCollector DO（旧路径兜底）
 * 
 * @param env 环境变量
 * @param data 请求数据
 */
async function recordPathWithFallback(
  env: Env,
  data: {
    ip: string;
    path: string;
    method: string;
    requestId: string;
    status: number;
    responseTime: number;
    isError: boolean;
    cacheHit: boolean;  // ✨ 添加缓存命中标记
    userAgent?: string;
    country?: string;
    city?: string; // Quick Win: Cloudflare 城市信息
    edgeColo?: string; // ✨ Cloudflare 边缘节点代码
    geoAction?: 'allowed' | 'blocked' | 'throttled'; // ✅ 地区访问控制动作
  }
): Promise<void> {
  const timestamp = Date.now();

  // 生成幂等 ID（防止双写重复计数）
  const idempotentId = await generateIdempotentId(
    timestamp,
    data.ip,
    data.path,
    data.requestId
  );

  // 构造队列事件
  const event: TrafficEvent = {
    idempotentId,
    timestamp,
    path: data.path,
    method: data.method,
    status: data.status,
    responseTime: data.responseTime,
    clientIpHash: await hashIP(data.ip),
    clientIp: data.ip,              // 添加真实 IP
    userAgent: data.userAgent,
    country: data.country,
    city: data.city,                // Quick Win: 城市信息
    isError: data.isError,
    edgeColo: data.edgeColo,        // ✨ 边缘节点代码
    geoAction: data.geoAction,      // ✅ 地区访问控制动作
  };

  // 优先尝试发送到队列
  const queueSuccess = await safeSendToQueue(env, event);

  if (queueSuccess) {
    // 队列发送成功
    console.log(`✅ Queue sent: ${idempotentId} | Path: ${data.path}`);
    return;
  }

  // 队列失败或不可用，降级到 D1 直接写入
  console.warn(`⚠️ Queue failed/unavailable, fallback to D1: ${idempotentId}`);
  await recordPathToD1Fallback(env, event);
}

/**
 * D1 直接写入 fallback（Queue 失败时）
 * 
 * 注意：这是同步写入，会增加请求延迟，仅作为 Queue 失败时的兜底
 */
async function recordPathToD1Fallback(
  env: Env,
  event: TrafficEvent
): Promise<void> {
  try {
    // 导入 D1 writer 函数
    const { insertEvents, getExistingStats, batchUpsertStats, getHourBucket } = await import('../lib/d1-writer');
    const { aggregateEvents } = await import('../lib/simplified-stats');

    // Step 1: 插入事件到 D1
    const insertedIds = await insertEvents(env, [event]);

    if (insertedIds.size === 0) {
      console.log(`⚠️ D1 fallback: Event already exists (idempotent): ${event.idempotentId}`);
      return;
    }

    // Step 2: 聚合统计
    const hourBucket = getHourBucket(event.timestamp);
    const existingStats = await getExistingStats(env, event.path, hourBucket);
    const newStats = await aggregateEvents([event], existingStats);

    // Step 3: 更新聚合统计
    await batchUpsertStats(env, [newStats]);

    console.log(`✅ D1 fallback success: ${event.idempotentId} | Path: ${event.path}`);
  } catch (error) {
    console.error(`❌ D1 fallback failed: ${event.idempotentId}`, error);
    // D1 fallback 失败时，记录错误但不抛出（避免影响用户请求）
  }
}

// ============================================
// 以下函数已废弃 - PathCollector DO 已被 Queue + D1 替代
// ============================================

/**
 * @deprecated 已废弃：PathCollector DO 已下线，所有路径统计现在通过 D1 查询
 * 使用 GET /admin/paths API 替代此功能
 */
export async function getIPPathStats(env: Env, ip: string): Promise<any> {
  throw new Error('getIPPathStats 已废弃：PathCollector DO 已下线。请使用 GET /admin/paths API 查询路径统计。');
}

/**
 * @deprecated 已废弃：PathCollector DO 已下线，所有路径统计现在通过 D1 查询
 * 使用 GET /admin/paths API 替代此功能
 */
export async function getIPPathDetails(env: Env, ip: string): Promise<any> {
  throw new Error('getIPPathDetails 已废弃：PathCollector DO 已下线。请使用 GET /admin/paths API 查询路径详情。');
}

/**
 * @deprecated 已废弃：PathCollector DO 已下线
 */
export async function getIPHealthStatus(env: Env, ip: string): Promise<any> {
  throw new Error('getIPHealthStatus 已废弃：PathCollector DO 已下线。');
}

/**
 * @deprecated 已废弃：PathCollector DO 已下线，数据存储在 D1 中
 */
export async function cleanupIPPaths(env: Env, ip: string): Promise<any> {
  throw new Error('cleanupIPPaths 已废弃：PathCollector DO 已下线。D1 数据由定时任务自动清理。');
}
