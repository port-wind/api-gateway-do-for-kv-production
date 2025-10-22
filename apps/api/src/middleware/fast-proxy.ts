/**
 * 快速代理中间件 - 最小化延迟
 * 
 * 用于纯代理请求，跳过大部分重量级中间件
 * 仅保留必要的验证和缓存检查
 */

import type { Context, Next } from 'hono';
import type { Env } from '../types/env';
import type { ProxyRoute } from '../types/config';

/**
 * 快速代理中间件
 * 
 * 策略：
 * 1. 跳过 D1 查询（路径配置、IP 检查等）
 * 2. 使用内存缓存的路由规则
 * 3. 流式转发，不缓冲响应体
 * 4. 异步记录日志，不阻塞请求
 */
export async function fastProxyMiddleware(
    c: Context<{ Bindings: Env }>,
    route: ProxyRoute
) {
    const startTime = Date.now();
    const requestId = c.req.header('x-request-id') || crypto.randomUUID();

    try {
        // 1. 快速构建目标 URL
        const url = new URL(c.req.url);
        const path = url.pathname;

        let targetPath = path;
        if (route.stripPrefix && route.pattern) {
            const pattern = route.pattern.replace('*', '');
            targetPath = path.substring(pattern.length);
            if (!targetPath.startsWith('/')) {
                targetPath = '/' + targetPath;
            }
        }

        const targetUrl = `${route.target}${targetPath}${url.search}`;

        // 2. 准备上游请求头（最小化处理）
        const upstreamHeaders = new Headers(c.req.raw.headers);

        // 移除 hop-by-hop 头
        const hopByHopHeaders = [
            'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
            'te', 'trailers', 'transfer-encoding', 'upgrade',
            'cf-connecting-ip', 'cf-ray', 'cf-visitor', 'cf-cache-status'
        ];
        hopByHopHeaders.forEach(h => upstreamHeaders.delete(h));

        // 设置必要的转发头
        const targetHostname = new URL(route.target).host;
        upstreamHeaders.set('host', targetHostname);
        upstreamHeaders.set('x-forwarded-for',
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-forwarded-for') ||
            'unknown'
        );
        upstreamHeaders.set('x-request-id', requestId);

        // 3. 获取请求体（仅对非 GET/HEAD）
        let body: BodyInit | null = null;
        if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
            // 流式读取，不等待完整 body
            body = c.req.raw.body;
        }

        // 4. 立即发起上游请求（不等待其他操作）
        const upstreamPromise = fetch(targetUrl, {
            method: c.req.method,
            headers: upstreamHeaders,
            body,
            // @ts-ignore - Cloudflare Workers 特定配置
            cf: {
                cacheEverything: false,
                cacheTtl: route.cacheEnabled ? 60 : undefined,
                timeout: 30000,
            }
        });

        // 5. 并行执行：上游请求 + 可选的异步任务
        const [upstreamResponse] = await Promise.allSettled([
            upstreamPromise,
            // 异步记录访问（不阻塞）
            recordAccessAsync(c, {
                path,
                method: c.req.method,
                targetUrl,
                requestId,
                startTime
            })
        ]);

        if (upstreamResponse.status === 'rejected') {
            throw upstreamResponse.reason;
        }

        const response = upstreamResponse.value;
        const duration = Date.now() - startTime;

        // 6. 准备响应头（最小化处理）
        const responseHeaders = new Headers(response.headers);
        hopByHopHeaders.forEach(h => responseHeaders.delete(h));

        // 添加代理标识和性能头
        responseHeaders.set('x-proxy-by', 'api-gateway-fast');
        responseHeaders.set('x-proxy-timing', `${duration}ms`);
        responseHeaders.set('x-request-id', requestId);

        // 7. 流式返回响应（不缓冲 body）
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders
        });

    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(JSON.stringify({
            timestamp: new Date().toISOString(),
            requestId,
            event: 'fast_proxy_error',
            error: error instanceof Error ? error.message : 'Unknown error',
            duration
        }));

        return c.json({
            error: 'Proxy Error',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        }, 502);
    }
}

/**
 * 异步记录访问（不阻塞主请求）
 */
async function recordAccessAsync(
    c: Context<{ Bindings: Env }>,
    data: {
        path: string;
        method: string;
        targetUrl: string;
        requestId: string;
        startTime: number;
    }
): Promise<void> {
    try {
        // 使用 Queue 异步记录（如果配置了）
        if (c.env.TRAFFIC_QUEUE) {
            await c.env.TRAFFIC_QUEUE.send({
                type: 'traffic_event',
                timestamp: Date.now(),
                path: data.path,
                method: data.method,
                target: data.targetUrl,
                request_id: data.requestId,
                duration: Date.now() - data.startTime,
                // 轻量级数据，不包含完整请求/响应
            });
        }
    } catch (error) {
        // 记录失败不影响主请求
        console.warn('Failed to record access:', error);
    }
}

/**
 * 路由缓存（内存中）
 * 避免每次请求都查询 KV
 */
class RouteCache {
    private cache = new Map<string, { route: ProxyRoute | null, expires: number }>();
    private ttl = 60000; // 1 分钟

    get(path: string): ProxyRoute | null | undefined {
        const cached = this.cache.get(path);
        if (!cached) return undefined;

        if (Date.now() > cached.expires) {
            this.cache.delete(path);
            return undefined;
        }

        return cached.route;
    }

    set(path: string, route: ProxyRoute | null): void {
        this.cache.set(path, {
            route,
            expires: Date.now() + this.ttl
        });
    }

    // 定期清理过期缓存
    cleanup(): void {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now > value.expires) {
                this.cache.delete(key);
            }
        }
    }
}

// 全局路由缓存（跨请求共享）
export const routeCache = new RouteCache();

// 每 5 分钟清理一次
setInterval(() => routeCache.cleanup(), 5 * 60 * 1000);

/**
 * 带缓存的路由查找
 */
export async function findProxyRouteWithCache(
    env: Env,
    path: string
): Promise<ProxyRoute | null> {
    // 1. 检查内存缓存
    const cached = routeCache.get(path);
    if (cached !== undefined) {
        return cached;
    }

    // 2. 从 KV 加载
    try {
        const routes = await env.API_GATEWAY_STORAGE.get('proxy_routes', 'json') as ProxyRoute[];
        if (!routes) {
            routeCache.set(path, null);
            return null;
        }

        // 3. 查找匹配路由
        const route = routes.find(r => {
            if (!r.pattern || !r.enabled) return false;
            const pattern = r.pattern.replace('*', '');
            return path.startsWith(pattern);
        });

        // 4. 缓存结果
        routeCache.set(path, route || null);

        return route || null;
    } catch (error) {
        console.warn('Failed to load routes:', error);
        return null;
    }
}

