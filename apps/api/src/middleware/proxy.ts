import type { Context, Next } from 'hono';
import type { Env } from '../types/env';
import type { ProxyRoute } from '../types/config';
import { ERROR_MESSAGES } from '../lib/constants';
import { getProxyRoutesFromKV } from '../lib/proxy-routes';

// 统一路径存储键
const UNIFIED_PATHS_KEY = 'unified-paths:list'

/**
 * 从统一路径配置获取代理路由
 */
async function getUnifiedPathsFromKV(env: Env): Promise<any[]> {
  try {
    const stored = await env.API_GATEWAY_STORAGE.get(UNIFIED_PATHS_KEY, 'json')
    return (stored as any[]) || []
  } catch (error) {
    console.error('获取统一路径配置失败:', error)
    return []
  }
}

// 注意：移除了请求合并功能以符合 Worker 无状态原则
// 每个 Worker 实例都有自己的内存空间，全局 Map 无法在实例间共享

// 性能计时工具
interface ProxyTiming {
  start: number;
  dnsLookup?: number;
  tcpConnect?: number;
  tlsHandshake?: number;
  firstByte?: number;
  responseComplete?: number;
}

export function proxyMiddleware(
  route: ProxyRoute
) {
  return async (c: Context<{ Bindings: Env; Variables: { pathCollected?: boolean } }>, next: Next) => {
    const timing: ProxyTiming = { start: performance.now() };
    const requestId = c.req.header('x-request-id') || crypto.randomUUID();
    
    try {
      const url = new URL(c.req.url);
      const path = url.pathname;

      // 检查路径是否匹配路由模式
      if (!route.pattern) {
        console.warn('Proxy route missing pattern:', route.id || 'unknown');
        return next();
      }
      const pattern = route.pattern.replace('*', '');
      if (!path.startsWith(pattern)) {
        return next();
      }

      // 构造目标 URL
      let targetPath = path;

      if (route.stripPrefix) {
        // 移除路由前缀
        targetPath = path.substring(pattern.length);
        if (!targetPath.startsWith('/')) {
          targetPath = '/' + targetPath;
        }
      }

      const targetUrl = `${route.target}${targetPath}${url.search}`;

      // 结构化日志记录
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        requestId,
        event: 'proxy_start',
        method: c.req.method,
        path,
        targetUrl,
        route: route.pattern,
        userAgent: c.req.header('user-agent')?.substring(0, 100)
      }));

      // 直接执行代理请求（移除了请求合并以符合 Worker 无状态原则）
      return await executeProxyRequest(c, route, targetUrl, timing, requestId);

    } catch (error) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        requestId,
        event: 'proxy_error',
        error: error instanceof Error ? error.message : 'Unknown error',
        route: route.pattern,
        duration: performance.now() - timing.start
      }));

      return c.json({
        error: ERROR_MESSAGES.PROXY_ERROR,
        message: `Failed to proxy request to ${route.target}`,
        details: error instanceof Error ? error.message : 'Unknown error',
        route: route.pattern,
        requestId
      }, 502);
    }
  };
}

async function executeProxyRequest(
  c: Context<{ Bindings: Env; Variables: { pathCollected?: boolean } }>,
  route: ProxyRoute,
  targetUrl: string,
  timing: ProxyTiming,
  requestId: string
): Promise<Response> {
  // 准备上游请求头信息
  const upstreamHeaders = new Headers(c.req.raw.headers);

  // 移除不应该被转发的 hop-by-hop 头信息
  const hopByHopHeaders = [
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
    'cf-connecting-ip',
    'cf-ray',
    'cf-visitor',
    'cf-cache-status'
  ];

  hopByHopHeaders.forEach(header => {
    upstreamHeaders.delete(header);
  });

  // 设置/更新上游重要头信息
  const targetHostname = new URL(route.target).host;
  upstreamHeaders.set('host', targetHostname);
  upstreamHeaders.set('x-forwarded-for',
    c.req.header('x-forwarded-for') ||
    c.req.header('cf-connecting-ip') ||
    'unknown'
  );
  upstreamHeaders.set('x-forwarded-proto', new URL(c.req.url).protocol.slice(0, -1));
  upstreamHeaders.set('x-forwarded-host', new URL(c.req.url).host);
  upstreamHeaders.set('x-request-id', requestId);

  // 添加性能优化头信息
  if (!upstreamHeaders.has('connection')) {
    upstreamHeaders.set('connection', 'keep-alive');
  }
  if (!upstreamHeaders.has('accept-encoding')) {
    upstreamHeaders.set('accept-encoding', 'br, gzip, deflate');
  }

  // 克隆请求以保留主体用于非 GET 请求
  let body: BodyInit | null = null;
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    try {
      body = await c.req.raw.clone().arrayBuffer();
    } catch (error) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        requestId,
        event: 'body_read_error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }

  // 发送上游请求 (带重试机制)
  let upstreamResponse: Response | undefined;
  let attempt = 0;
  const maxRetries = 2;

  while (attempt <= maxRetries) {
    try {
      timing.firstByte = performance.now();
      
      upstreamResponse = await fetch(targetUrl, {
        method: c.req.method,
        headers: upstreamHeaders,
        body,
        // Cloudflare Workers 优化配置
        // @ts-ignore - cf property is Cloudflare-specific
        cf: {
          cacheEverything: false,
          // 使用连接池优化
          keepAlive: true,
          timeout: 30000, // 30秒超时
          // 启用 HTTP/2
          // minify 已删除，使用默认值
        }
      });

      timing.responseComplete = performance.now();
      break;

    } catch (error) {
      attempt++;
      if (attempt > maxRetries) {
        throw error;
      }
      
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        requestId,
        event: 'proxy_retry',
        attempt,
        error: error instanceof Error ? error.message : 'Unknown error',
        targetUrl
      }));
      
      // 指数退避重试
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
    }
  }

  // 检查是否成功获取响应
  if (!upstreamResponse) {
    throw new Error('Failed to get response from upstream after all retries');
  }

  // 准备响应头信息
  const responseHeaders = new Headers(upstreamResponse.headers);

  // 移除响应中的 hop-by-hop 头信息
  hopByHopHeaders.forEach(header => {
    responseHeaders.delete(header);
  });

  // 添加代理识别和性能头信息
  responseHeaders.set('x-proxy-by', 'api-gateway');
  responseHeaders.set('x-proxy-route', route.pattern);
  responseHeaders.set('x-proxy-target', route.target);
  responseHeaders.set('x-request-id', requestId);
  responseHeaders.set('x-proxy-timing', JSON.stringify({
    total: Math.round((timing.responseComplete || performance.now()) - timing.start),
    upstream: Math.round((timing.responseComplete || performance.now()) - (timing.firstByte || timing.start))
  }));

  // 处理压缩响应
  let responseBody = upstreamResponse.body;
  
  // 记录性能指标
  const totalTime = (timing.responseComplete || performance.now()) - timing.start;
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    requestId,
    event: 'proxy_complete',
    status: upstreamResponse.status,
    contentLength: responseHeaders.get('content-length'),
    contentType: responseHeaders.get('content-type'),
    timing: {
      total: Math.round(totalTime),
      upstream: Math.round((timing.responseComplete || performance.now()) - (timing.firstByte || timing.start))
    },
    compressed: responseHeaders.has('content-encoding')
  }));

  // 创建响应
  const response = new Response(responseBody, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders
  });

  // 设置响应在上下文中用于其他中间件
  c.res = response;
  return response;
}

// 创建代理中间件的辅助函数（现在从 KV 读取）
export async function createProxyMiddlewares(env: Env) {
  const routes = await getProxyRoutesFromKV(env);
  return routes.map(route => ({
    route,
    middleware: proxyMiddleware(route)
  }));
}

// 查找匹配的代理路由（优先从统一路径配置读取）
export async function findProxyRoute(env: Env, path: string): Promise<ProxyRoute | null> {
  // 先从统一路径配置查找
  try {
    const unifiedPaths = await getUnifiedPathsFromKV(env);
    const unifiedPath = unifiedPaths.find((p: any) => p.proxyTarget && path.startsWith(p.path));
    
    if (unifiedPath) {
      return {
        id: 'unified-' + unifiedPath.path,
        pattern: unifiedPath.path + '*',
        target: unifiedPath.proxyTarget,
        stripPrefix: unifiedPath.stripPrefix !== undefined ? unifiedPath.stripPrefix : false,
        enabled: true,
        priority: 0,
        cacheEnabled: unifiedPath.cache?.enabled || false
      };
    }
  } catch (error) {
    console.warn('Failed to load unified paths from KV:', error);
  }
  
  // 回退到旧的代理路由系统
  try {
    const routes = await getProxyRoutesFromKV(env);
    const route = routes.find(route => {
      if (!route.pattern) {
        console.warn('Proxy route missing pattern field:', route.id);
        return false;
      }
      const pattern = route.pattern.replace('*', '');
      return path.startsWith(pattern);
    });
    if (route) {
      return route;
    }
  } catch (error) {
    console.warn('Failed to load proxy routes from KV:', error);
  }
  
  // 没有找到匹配的路由
  return null;
}

