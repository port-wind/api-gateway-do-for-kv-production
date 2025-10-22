import type { Context, Next } from 'hono';
import type { Env } from '../types/env';
import { getConfig } from '../lib/config';
import { createRequestLogger } from '../lib/logger';
import { recordRateLimitHit } from '../lib/metrics';
import { findMatchingProxyRoute } from '../lib/proxy-routes';

export async function rateLimitMiddleware(c: Context<{ Bindings: Env; Variables: { pathCollected?: boolean } }>, next: Next) {
  try {
    // 获取限流配置
    const config = await getConfig(c.env, 'rate-limit');

    // 限流决策逻辑（两层优先级：单个路径 > 代理路由）
    // ⚠️ 已移除全局限流，只有明确配置的路径或代理路由才会限流
    const path = new URL(c.req.url).pathname;
    let rateLimitEnabled = false;
    let rateLimit: number | undefined;

    // 1. 代理路由配置（基础层）
    const matchingRoute = await findMatchingProxyRoute(c.env, path);
    if (matchingRoute) {
      if (matchingRoute.rateLimitEnabled !== undefined) {
        rateLimitEnabled = matchingRoute.rateLimitEnabled;
      }
      if (matchingRoute.rateLimit !== undefined) {
        rateLimit = matchingRoute.rateLimit;
      }
    }

    // 2. 单个路径配置（最高优先级）
    const pathLimit = config.pathLimits[path];
    if (pathLimit !== undefined) {
      rateLimitEnabled = true; // 如果配置了路径限制，则启用
      rateLimit = pathLimit;
    }

    // 如果未启用限流或未配置限流值，跳过
    if (!rateLimitEnabled || !rateLimit) {
      return next();
    }

    // 从请求中提取客户端 IP，增强本地开发环境支持
    let clientIP = c.req.header('CF-Connecting-IP') ||
      c.req.header('X-Real-IP') ||
      c.req.header('X-Forwarded-For')?.split(',')[0].trim();

    // 本地开发环境处理
    if (!clientIP || clientIP === 'unknown') {
      // 检查是否为本地开发环境
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
          hash = hash & hash; // 转换为 32 位整数
        }

        // 将哈希转换为 IP 格式 (192.168.x.x 用于本地开发)
        const ip1 = 192;
        const ip2 = 168;
        const ip3 = Math.abs(hash >> 8) & 255;
        const ip4 = Math.abs(hash) & 255;

        clientIP = `${ip1}.${ip2}.${ip3}.${ip4}`;

        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'local_dev_ip_generated',
          originalIP: c.req.header('CF-Connecting-IP') || 'none',
          generatedIP: clientIP,
          hostname,
          isLocalDev
        }));
      } else {
        console.warn(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'ip_detection_failed',
          hostname,
          headers: {
            'cf-connecting-ip': c.req.header('CF-Connecting-IP'),
            'x-real-ip': c.req.header('X-Real-IP'),
            'x-forwarded-for': c.req.header('X-Forwarded-For')
          }
        }));

        // 生产环境中如果无法确定 IP，跳过限流但记录警告
        return next();
      }
    }

    // 使用已确定的限流值
    const limit = rateLimit;
    const windowSeconds = config.windowSeconds;

    // 路径收集已由 pathCollectorDOMiddleware 全局处理，无需重复收集

    // 获取 RateLimiter Durable Object 实例
    const id = c.env.RATE_LIMITER.idFromName(clientIP);
    const rateLimiter = c.env.RATE_LIMITER.get(id);

    // 检查限流
    const checkUrl = new URL('http://dummy/check');
    checkUrl.searchParams.set('ip', clientIP);
    checkUrl.searchParams.set('limit', limit.toString());
    checkUrl.searchParams.set('window', windowSeconds.toString());

    const response = await rateLimiter.fetch(checkUrl.toString());
    const result = await response.json() as {
      allowed: boolean;
      remaining: number;
      resetAt?: number;
    };

    const logger = createRequestLogger(c);

    // 添加限流头信息
    c.header('X-RateLimit-Limit', limit.toString());
    c.header('X-RateLimit-Remaining', result.remaining.toString());
    c.header('X-RateLimit-Client-IP', clientIP);

    if (result.resetAt) {
      c.header('X-RateLimit-Reset', new Date(result.resetAt).toISOString());
      c.header('X-RateLimit-Reset-Seconds', Math.ceil((result.resetAt - Date.now()) / 1000).toString());
    }

    if (!result.allowed) {
      // 记录限流事件
      recordRateLimitHit();

      const retryAfter = result.resetAt ? Math.ceil((result.resetAt - Date.now()) / 1000) : windowSeconds;

      logger.warn('Rate limit exceeded', {
        clientIP,
        path,
        limit,
        windowSeconds,
        remaining: result.remaining,
        retryAfter
      });

      // 添加 Retry-After 头信息
      c.header('Retry-After', retryAfter.toString());

      return c.json({
        error: 'Rate limit exceeded',
        message: `Too many requests. Limit: ${limit} per ${windowSeconds} seconds`,
        retryAfter,
        limit,
        remaining: result.remaining,
        resetAt: result.resetAt ? new Date(result.resetAt).toISOString() : null
      }, 429);
    }

    logger.debug('Rate limit check passed', {
      clientIP,
      path,
      limit,
      remaining: result.remaining,
      windowSeconds
    });

    return next();
  } catch (error) {
    const logger = createRequestLogger(c);
    logger.error('Rate limit middleware error', logger.context, error as Error);

    // 在错误时，允许请求继续但记录问题
    return next();
  }
}