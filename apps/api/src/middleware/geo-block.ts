import type { Context, Next } from 'hono';
import type { Env } from '../types/env';
import { getConfig } from '../lib/config';
import { createRequestLogger } from '../lib/logger';
import { findMatchingProxyRoute } from '../lib/proxy-routes';

export async function geoBlockMiddleware(c: Context<{ Bindings: Env; Variables: { pathCollected?: boolean } }>, next: Next) {
  const logger = createRequestLogger(c);

  try {
    // 获取地域封锁配置
    const config = await getConfig(c.env, 'geo');

    const path = new URL(c.req.url).pathname;

    // 地域封锁决策逻辑（三层优先级：单个路径 > 代理路由 > 全局）
    let geoEnabled = false;
    let geoMode = config.mode;
    let allowedCountries = config.countries;

    // 1. 全局配置（基础层）
    geoEnabled = config.enabled;

    // 2. 代理路由配置（中间层）
    const matchingRoute = await findMatchingProxyRoute(c.env, path);
    if (matchingRoute) {
      if (matchingRoute.geoEnabled !== undefined) {
        geoEnabled = matchingRoute.geoEnabled;
      }
      if (matchingRoute.geoCountries !== undefined) {
        allowedCountries = matchingRoute.geoCountries;
      }
    }

    // 3. 单个路径配置（最高优先级）
    const pathOverride = config.pathOverrides[path];
    if (pathOverride !== undefined) {
      geoEnabled = true; // 如果配置了路径覆盖，则启用地域封锁
      allowedCountries = pathOverride;
    }

    if (!geoEnabled) {
      return next();
    }

    // 从 Cloudflare 请求对象获取国家
    // @ts-ignore - 忽略 cf 属性是由 Cloudflare 添加的
    const country = c.req.raw.cf?.country as string | undefined;

    if (!country) {
      // 只在非测试环境中记录警告，避免测试中的噪音
      const isTestEnv = new URL(c.req.url).hostname.includes('localhost') ||
        new URL(c.req.url).hostname.includes('127.0.0.1');

      if (!isTestEnv) {
        logger.debug('Country information not available for geo-blocking', {
          hasCloudflareHeaders: !!c.req.raw.cf,
          cfKeys: c.req.raw.cf ? Object.keys(c.req.raw.cf) : []
        });
      }

      return next();
    }

    // 路径收集已由 pathCollectorDOMiddleware 全局处理，无需重复收集

    let isAllowed: boolean;

    if (geoMode === 'whitelist') {
      // 只允许列表中的国家
      isAllowed = allowedCountries.includes(country);
    } else {
      // 阻止列表中的国家 (黑名单模式)
      isAllowed = !allowedCountries.includes(country);
    }

    if (!isAllowed) {
      logger.warn('Geo-blocked request', {
        country,
        path,
        mode: geoMode,
        allowedCountries
      });

      // 添加地域封锁头信息用于调试
      c.header('X-Geo-Country', country);
      c.header('X-Geo-Blocked', 'true');
      c.header('X-Geo-Mode', geoMode);

      return c.json({
        error: 'Access denied',
        message: `Access from your location (${country}) is not permitted`,
        country,
        path,
        mode: geoMode
      }, 403);
    }

    // 添加国家头信息用于成功的请求 (用于调试)
    c.header('X-Geo-Country', country);
    c.header('X-Geo-Allowed', 'true');
    c.header('X-Geo-Mode', geoMode);

    logger.debug('Geo-blocking check passed', {
      country,
      path,
      mode: geoMode
    });

    return next();
  } catch (error) {
    logger.error('Geo-blocking middleware error', logger.context, error as Error);
    // 在错误时，允许请求继续但记录问题
    return next();
  }
}