/**
 * 全局 IP 访问控制中间件
 * 
 * 功能：
 * - 检查 IP 是否被全局封禁（返回 403）
 * - 检查 IP 是否被全局限流（返回 429）
 * - 必须在 rate-limit 中间件之前执行
 * 
 * 优先级：
 * 1. 全局封禁（block）
 * 2. 全局限流（throttle）
 * 3. 路径/代理限流（rate-limit 中间件）
 */

import type { Context, Next } from 'hono';
import type { Env } from '../types/env';
import { checkIpAccess } from '../lib/ip-access-control';
import { hashIP } from '../lib/idempotency';
import { createRequestLogger } from '../lib/logger';

/**
 * 全局 IP Guard 中间件
 * 
 * @param c Hono Context
 * @param next 下一个中间件
 */
export async function globalIpGuardMiddleware(
    c: Context<{ Bindings: Env; Variables: { pathCollected?: boolean } }>,
    next: Next
) {
    try {
        // 解析客户端 IP（复用 rate-limit 逻辑）
        let clientIP = c.req.header('CF-Connecting-IP') ||
            c.req.header('X-Real-IP') ||
            c.req.header('X-Forwarded-For')?.split(',')[0].trim();

        // 本地开发环境处理
        if (!clientIP || clientIP === 'unknown') {
            const hostname = new URL(c.req.url).hostname;
            const isLocalDev = hostname === 'localhost' ||
                hostname === '127.0.0.1' ||
                hostname.includes('.localhost') ||
                hostname.includes('workers.dev');

            if (isLocalDev) {
                // 为本地开发生成一个基于请求特征的唯一 IP
                const userAgent = c.req.header('user-agent') || '';
                const acceptLanguage = c.req.header('accept-language') || '';
                const signature = `${hostname}-${userAgent.substring(0, 50)}-${acceptLanguage.substring(0, 20)}`;

                // 使用简单哈希来生成一个模拟 IP
                let hash = 0;
                for (let i = 0; i < signature.length; i++) {
                    const char = signature.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash;
                }

                const ip1 = 192;
                const ip2 = 168;
                const ip3 = Math.abs(hash >> 8) & 255;
                const ip4 = Math.abs(hash) & 255;
                clientIP = `${ip1}.${ip2}.${ip3}.${ip4}`;

                console.log(JSON.stringify({
                    timestamp: new Date().toISOString(),
                    event: 'local_dev_ip_generated',
                    generatedIP: clientIP,
                    hostname,
                }));
            } else {
                // 生产环境中如果无法确定 IP，记录警告但跳过检查
                console.warn(JSON.stringify({
                    timestamp: new Date().toISOString(),
                    event: 'ip_detection_failed',
                    hostname,
                    path: new URL(c.req.url).pathname,
                }));

                return next();
            }
        }

        // 计算 IP 哈希值
        const clientIpHash = await hashIP(clientIP);

        // 检查 IP 访问规则
        const { allowed, rule } = await checkIpAccess(c.env, clientIP, clientIpHash);

        if (!allowed && rule) {
            const logger = createRequestLogger(c);
            const path = new URL(c.req.url).pathname;

            // 添加响应头
            c.header('X-IP-Rule-Mode', rule.mode);
            c.header('X-IP-Rule-Pattern', rule.ipPattern);
            c.header('X-Client-IP-Hash', clientIpHash);

            if (rule.mode === 'block') {
                // 全局封禁：返回 403
                logger.warn('Global IP blocked', {
                    clientIP: clientIpHash, // 记录哈希值，保护隐私
                    path,
                    ruleId: rule.id,
                    rulePattern: rule.ipPattern,
                    reason: rule.reason,
                });

                return c.json({
                    error: 'Forbidden',
                    message: 'Access denied by IP access control',
                    reason: rule.reason || 'Your IP has been blocked',
                    rulePattern: rule.ipPattern,
                }, 403);
            }

            if (rule.mode === 'throttle') {
                // 全局限流：调用 RateLimiter DO
                const limit = rule.limit!;
                const window = rule.window!;

                // 使用全局限流键：global:{ipHash}
                const rateLimiterId = c.env.RATE_LIMITER.idFromName(`global:${clientIpHash}`);
                const rateLimiter = c.env.RATE_LIMITER.get(rateLimiterId);

                // 检查限流
                const checkUrl = new URL('http://dummy/check');
                checkUrl.searchParams.set('ip', clientIpHash);
                checkUrl.searchParams.set('limit', limit.toString());
                checkUrl.searchParams.set('window', window.toString());

                const response = await rateLimiter.fetch(checkUrl.toString());
                const result = await response.json() as {
                    allowed: boolean;
                    remaining: number;
                    resetAt?: number;
                };

                // 添加限流头信息
                c.header('X-Global-RateLimit-Limit', limit.toString());
                c.header('X-Global-RateLimit-Remaining', result.remaining.toString());

                if (result.resetAt) {
                    c.header('X-Global-RateLimit-Reset', new Date(result.resetAt).toISOString());
                }

                if (!result.allowed) {
                    // 超过全局限流
                    const retryAfter = result.resetAt ? Math.ceil((result.resetAt - Date.now()) / 1000) : window;

                    logger.warn('Global IP rate limit exceeded', {
                        clientIP: clientIpHash,
                        path,
                        ruleId: rule.id,
                        rulePattern: rule.ipPattern,
                        limit,
                        window,
                        remaining: result.remaining,
                        retryAfter,
                    });

                    c.header('Retry-After', retryAfter.toString());

                    return c.json({
                        error: 'Rate limit exceeded',
                        message: 'Global IP rate limit exceeded',
                        reason: rule.reason || 'Too many requests from your IP',
                        limit,
                        window,
                        remaining: result.remaining,
                        retryAfter,
                        resetAt: result.resetAt ? new Date(result.resetAt).toISOString() : null,
                    }, 429);
                }

                // 全局限流通过，记录日志
                logger.debug('Global IP throttle passed', {
                    clientIP: clientIpHash,
                    path,
                    limit,
                    remaining: result.remaining,
                });
            }
        }

        // 没有匹配规则或检查通过，继续下一个中间件
        return next();

    } catch (error) {
        const logger = createRequestLogger(c);
        logger.error('Global IP guard middleware error', logger.context, error as Error);

        // 出错时放行请求，但记录错误
        return next();
    }
}

