import type { Context, Next } from 'hono';
import type { Env } from '../types/env';
import type { CacheEntry, PathCacheConfig } from '../types/config';
import { getConfig } from '../lib/config';
import { getCacheKey, getFromCache, saveToCache, isCacheEntryValid, getCacheRemainingTTL, isCacheExpired, isCacheValid, refreshCacheInBackground } from '../lib/cache-manager';
import { createRequestLogger } from '../lib/logger';
import { timeAsync, recordCacheHit, recordCacheMiss } from '../lib/metrics';
import { recordTraffic } from '../lib/analytics-engine';
import { findMatchingProxyRoute } from '../lib/proxy-routes';

/**
 * 辅助函数：添加缓存策略相关的调试 headers
 */
function addCacheStrategyHeaders(headers: Headers, pathConfig: PathCacheConfig | null) {
  if (!pathConfig || !pathConfig.keyStrategy) {
    return;
  }

  // 添加缓存策略
  headers.set('X-Cache-Strategy', pathConfig.keyStrategy);

  // 添加 keyHeaders 信息
  if (pathConfig.keyHeaders) {
    if (pathConfig.keyHeaders === 'all') {
      headers.set('X-Cache-Key-Headers', 'all');
    } else if (Array.isArray(pathConfig.keyHeaders)) {
      headers.set('X-Cache-Key-Headers', pathConfig.keyHeaders.join(','));
    }
  }

  // 添加 keyParams 信息
  if (pathConfig.keyParams) {
    if (pathConfig.keyParams === 'all') {
      headers.set('X-Cache-Key-Params', 'all');
    } else if (Array.isArray(pathConfig.keyParams)) {
      headers.set('X-Cache-Key-Params', pathConfig.keyParams.join(','));
    }
  }
}

export async function cacheMiddleware(c: Context<{ Bindings: Env; Variables: { pathCollected?: boolean } }>, next: Next) {
  const startTime = performance.now();
  const logger = createRequestLogger(c);

  try {
    // 获取缓存配置
    const config = await timeAsync('cache_config_fetch', async () => {
      return await getConfig(c.env, 'cache');
    }, logger.context);

    const url = new URL(c.req.url);
    const path = url.pathname;
    const method = c.req.method;

    // 路径收集已由 pathCollectorDOMiddleware 全局处理，无需重复收集

    // 只缓存 GET、HEAD 和 POST 请求
    if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') {
      logger.debug('Skipping cache for non-cacheable request', { method });
      return next();
    }

    // 缓存决策逻辑（三层优先级：单个路径 > 代理路由 > 全局）
    let shouldCache = false;
    let pathConfig = null;
    let proxyRouteConfig = null;
    let cacheVersion = config.version;
    let cacheTTL: number | undefined = config.defaultTtl || 300; // 使用全局默认TTL，默认5分钟

    // 1. 全局配置（基础层）
    if (!config.enabled) {
      shouldCache = false;
      logger.debug('Global cache disabled', { path });
    } else {
      shouldCache = true;
      logger.debug('Global cache enabled', { path });
    }

    // 2. 代理路由配置（中间层）
    // 检查当前路径是否匹配任何代理路由
    const matchingRoute = await findMatchingProxyRoute(c.env, path);
    if (matchingRoute) {
      proxyRouteConfig = matchingRoute;
      if (matchingRoute.cacheEnabled !== undefined) {
        shouldCache = matchingRoute.cacheEnabled;
        logger.debug('Proxy route cache config applied', {
          path,
          route: matchingRoute.pattern,
          enabled: matchingRoute.cacheEnabled
        });
      }
    }

    // 3. 单个路径配置（最高优先级）
    pathConfig = config.pathConfigs[path];
    if (pathConfig) {
      shouldCache = pathConfig.enabled;
      cacheVersion = pathConfig.version;
      // 只有当路径配置显式设置了 TTL 时才覆盖，否则继承之前的值（代理路由或全局）
      if (pathConfig.ttl !== undefined) {
        cacheTTL = pathConfig.ttl;
      }
      logger.debug('Exact path config overrides all', {
        path,
        enabled: pathConfig.enabled,
        version: pathConfig.version,
        ttl: cacheTTL,
        pathConfigTtl: pathConfig.ttl
      });
    }

    if (!shouldCache) {
      logger.debug('Caching disabled, proceeding without cache', { path });
      return next();
    }

    // 确定缓存版本 (特定路径或全局)
    const version = cacheVersion;

    // 准备缓存键生成所需的参数
    let params: Record<string, any> = Object.fromEntries(url.searchParams.entries());

    // 如果是 POST 请求，尝试读取 body 参数
    if (method === 'POST') {
      try {
        const contentType = c.req.header('content-type');
        if (contentType?.includes('application/json')) {
          // 检查 body 大小限制（10MB）
          const contentLength = c.req.header('content-length');
          const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB

          if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
            logger.warn('POST body too large for cache key generation', {
              size: contentLength,
              maxSize: MAX_BODY_SIZE
            });
            // Body 过大，继续使用 query params
          } else {
            // 读取 body 但不消耗它（克隆请求）
            const body = await c.req.raw.clone().json();
            // 验证 body 是对象类型
            if (body && typeof body === 'object' && !Array.isArray(body)) {
              params = body as Record<string, any>;
              const bodyKeys = Object.keys(body);
              logger.debug('POST body parsed for cache key', { bodyKeys });
            } else {
              logger.warn('POST body is not a valid object', { bodyType: typeof body });
            }
          }
        }
      } catch (error) {
        if (error instanceof SyntaxError) {
          logger.warn('Invalid JSON in POST body', { error: error.message });
        } else {
          logger.warn('Failed to parse POST body for cache key', { error });
        }
        // 如果解析失败，继续使用 query params
      }
    }

    // 根据路径、查询参数/Body、版本和策略生成缓存键
    const cacheKey = await timeAsync('cache_key_generation', async () => {
      // 如果有路径配置且配置了策略，使用新 API
      if (pathConfig && pathConfig.keyStrategy) {
        logger.debug('Using flexible cache key strategy', {
          strategy: pathConfig.keyStrategy,
          keyHeaders: pathConfig.keyHeaders,
          keyParams: pathConfig.keyParams
        });

        // 只在需要时收集 headers（优化性能）
        let requestHeaders: Record<string, string> | undefined;
        if (pathConfig.keyStrategy === 'path-headers' ||
          pathConfig.keyStrategy === 'path-params-headers') {
          requestHeaders = {};
          c.req.raw.headers.forEach((value, key) => {
            requestHeaders![key.toLowerCase()] = value;
          });
        }

        return await getCacheKey(path, {
          version,
          strategy: pathConfig.keyStrategy,
          params,
          headers: requestHeaders || {},
          keyHeaders: pathConfig.keyHeaders,
          keyParams: pathConfig.keyParams
        });
      } else {
        // 使用默认方式（向后兼容）
        logger.debug('Using default cache key generation (path-params)');
        return await getCacheKey(path, params, version);
      }
    }, logger.context);

    // 尝试从缓存中获取
    const cachedEntry = await getFromCache(c.env, cacheKey);

    // 检查缓存是否存在且版本匹配
    if (cachedEntry && isCacheValid(cachedEntry, version)) {
      const isExpired = isCacheExpired(cachedEntry);

      if (!isExpired) {
        // 缓存未过期，直接返回
        const remainingTTL = getCacheRemainingTTL(cachedEntry);
        logger.info('Cache hit', {
          path,
          cacheKey,
          version,
          cacheAge: Date.now() - cachedEntry.createdAt,
          remainingTTL,
          ttl: cachedEntry.ttl
        });

        // 记录缓存命中
        recordCacheHit();

        // 记录流量分析数据
        const responseTime = performance.now() - startTime;
        await recordTraffic(c.env, c.executionCtx, {
          path,
          clientIP: c.req.header('cf-connecting-ip') || '',
          country: c.req.raw.cf?.country as string,
          city: c.req.raw.cf?.city as string, // Quick Win
          isCacheHit: true,
          responseTime,
          method: c.req.method,
          statusCode: 200
        });

        // 从缓存中重建响应
        const headers = new Headers(cachedEntry.headers);
        headers.set('X-Cache-Status', 'HIT');
        headers.set('X-Cache-Version', version.toString());
        headers.set('X-Cache-Created', new Date(cachedEntry.createdAt).toISOString());
        headers.set('X-Cache-Key', cacheKey.substring(0, 32) + '...');

        // 计算缓存年龄（秒）- 符合 RFC 7234 标准
        const cacheAge = Math.floor((Date.now() - cachedEntry.createdAt) / 1000);
        headers.set('Age', cacheAge.toString());

        // 添加TTL相关头信息
        if (cachedEntry.ttl) {
          headers.set('X-Cache-TTL', cachedEntry.ttl.toString());
        }
        if (remainingTTL !== null) {
          headers.set('X-Cache-Remaining-TTL', remainingTTL.toString());
        }
        if (cachedEntry.expiresAt) {
          headers.set('X-Cache-Expires', new Date(cachedEntry.expiresAt).toISOString());
        }

        // 添加缓存策略相关的调试 headers
        addCacheStrategyHeaders(headers, pathConfig);

        // 记录性能指标
        const totalTime = performance.now() - startTime;
        logger.info('Cache middleware completed (HIT)', {
          duration: Math.round(totalTime),
          path
        });

        const response = new Response(cachedEntry.data, {
          status: 200,
          headers
        });

        // 设置响应到上下文中，确保代理路由处理器可以正确返回
        c.res = response;
        return response;
      } else {
        // 缓存已过期，使用 Stale-While-Revalidate 策略
        logger.info('Cache expired, using stale-while-revalidate', {
          path,
          cacheKey,
          version,
          expiredAt: cachedEntry.expiresAt,
          cacheAge: Date.now() - cachedEntry.createdAt
        });

        // 检查是否正在更新中（使用简单的键名标记）
        const updatingKey = `${cacheKey}:updating`;
        const isUpdating = await c.env.API_GATEWAY_STORAGE.get(updatingKey);

        if (!isUpdating && proxyRouteConfig) {
          // 标记正在更新，避免重复请求
          c.executionCtx.waitUntil(
            (async () => {
              try {
                // 设置更新标记，5分钟过期
                await c.env.API_GATEWAY_STORAGE.put(updatingKey, 'updating', {
                  expirationTtl: 300
                });

                logger.info('Starting background cache refresh', { path, cacheKey });

                // 构建目标URL
                const url = new URL(c.req.url);
                let targetPath = path;

                if (proxyRouteConfig.stripPrefix) {
                  const pattern = proxyRouteConfig.pattern.replace('*', '');
                  targetPath = path.substring(pattern.length);
                  if (!targetPath.startsWith('/')) {
                    targetPath = '/' + targetPath;
                  }
                }

                const targetUrl = `${proxyRouteConfig.target}${targetPath}${url.search}`;

                // 准备请求头
                const upstreamHeaders = new Headers(c.req.raw.headers);
                const hopByHopHeaders = [
                  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
                  'te', 'trailers', 'transfer-encoding', 'upgrade', 'cf-connecting-ip',
                  'cf-ray', 'cf-visitor', 'cf-cache-status'
                ];

                hopByHopHeaders.forEach(header => {
                  upstreamHeaders.delete(header);
                });

                const targetHostname = new URL(proxyRouteConfig.target).host;
                upstreamHeaders.set('host', targetHostname);
                upstreamHeaders.set('x-forwarded-for',
                  c.req.header('x-forwarded-for') ||
                  c.req.header('cf-connecting-ip') ||
                  'unknown'
                );
                upstreamHeaders.set('x-forwarded-proto', url.protocol.slice(0, -1));
                upstreamHeaders.set('x-forwarded-host', url.host);

                // 准备请求体
                let body: BodyInit | null = null;
                if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
                  try {
                    body = await c.req.raw.clone().arrayBuffer();
                  } catch (error) {
                    logger.warn('Failed to clone request body for refresh', { error });
                  }
                }

                // 使用后台刷新函数
                const success = await refreshCacheInBackground(
                  c.env,
                  cacheKey,
                  path,
                  version,
                  targetUrl,
                  upstreamHeaders,
                  c.req.method,
                  body || undefined,
                  cacheTTL,
                  pathConfig
                );

                if (success) {
                  logger.info('Background cache refresh completed', { path, cacheKey });
                } else {
                  logger.warn('Background cache refresh failed', { path, cacheKey });
                }

              } catch (refreshError) {
                logger.error('Background cache refresh failed', logger.context, refreshError as Error);
              } finally {
                // 清除更新标记
                await c.env.API_GATEWAY_STORAGE.delete(updatingKey);
              }
            })()
          );
        }

        // 立即返回过期的缓存数据
        const remainingTTL = getCacheRemainingTTL(cachedEntry);
        logger.info('Cache stale hit (expired)', {
          path,
          cacheKey,
          version,
          cacheAge: Date.now() - cachedEntry.createdAt,
          remainingTTL,
          ttl: cachedEntry.ttl,
          isUpdating: !!isUpdating
        });

        // 记录缓存命中（虽然是过期的）
        recordCacheHit();

        // 记录流量分析数据
        const responseTime = performance.now() - startTime;
        await recordTraffic(c.env, c.executionCtx, {
          path,
          clientIP: c.req.header('cf-connecting-ip') || '',
          country: c.req.raw.cf?.country as string,
          city: c.req.raw.cf?.city as string, // Quick Win
          isCacheHit: true,
          responseTime,
          method: c.req.method,
          statusCode: 200
        });

        // 从过期缓存中重建响应
        const headers = new Headers(cachedEntry.headers);
        headers.set('X-Cache-Status', 'STALE');
        headers.set('X-Cache-Version', version.toString());
        headers.set('X-Cache-Created', new Date(cachedEntry.createdAt).toISOString());
        headers.set('X-Cache-Key', cacheKey.substring(0, 32) + '...');

        // 计算缓存年龄（秒）- 符合 RFC 7234 标准
        const staleAge = Math.floor((Date.now() - cachedEntry.createdAt) / 1000);
        headers.set('Age', staleAge.toString());

        // 添加TTL相关头信息
        if (cachedEntry.ttl) {
          headers.set('X-Cache-TTL', cachedEntry.ttl.toString());
        }
        if (remainingTTL !== null) {
          headers.set('X-Cache-Remaining-TTL', remainingTTL.toString());
        }

        // 添加缓存策略相关的调试 headers
        addCacheStrategyHeaders(headers, pathConfig);
        if (cachedEntry.expiresAt) {
          headers.set('X-Cache-Expires', new Date(cachedEntry.expiresAt).toISOString());
        }

        // 标记这是过期缓存
        headers.set('X-Cache-Stale', 'true');
        headers.set('X-Cache-Updating', isUpdating ? 'true' : 'false');

        // 记录性能指标
        const totalTime = performance.now() - startTime;
        logger.info('Cache middleware completed (STALE)', {
          duration: Math.round(totalTime),
          path
        });

        const response = new Response(cachedEntry.data, {
          status: 200,
          headers
        });

        // 设置响应到上下文中，确保代理路由处理器可以正确返回
        c.res = response;
        return response;
      }
    }

    logger.info('Cache miss', {
      path,
      cacheKey,
      version,
      entryExists: !!cachedEntry,
      versionMatch: cachedEntry?.version === version,
      expired: cachedEntry ? isCacheExpired(cachedEntry) : false
    });

    // 记录缓存未命中
    recordCacheMiss();

    // 缓存未命中，执行请求
    await next();

    // 为 HEAD 和 GET 请求添加缓存状态头
    c.res.headers.set('X-Cache-Status', 'MISS');
    c.res.headers.set('X-Cache-Version', version.toString());
    c.res.headers.set('X-Cache-Key', cacheKey.substring(0, 32) + '...');

    // 检查响应是否应该被缓存 (缓存 GET 和 POST 请求的成功响应)
    if ((method === 'GET' || method === 'POST') && c.res.ok && c.res.status === 200) {
      try {
        // 使用 ctx.waitUntil() 异步保存缓存，不阻塞响应
        c.executionCtx.waitUntil(
          timeAsync('cache_save_operation', async () => {
            // 克隆响应以读取主体而不消耗它
            const responseClone = c.res.clone();
            const responseText = await responseClone.text();

            // 检查是否为空响应
            const isEmpty = !responseText || responseText.trim().length === 0;

            // 空响应也缓存，但设置较短的 TTL（30秒），防止缓存击穿攻击
            let effectiveTTL = cacheTTL;
            if (isEmpty) {
              effectiveTTL = 30; // 空响应只缓存 30 秒
              logger.warn('Caching empty response with short TTL', {
                path,
                cacheKey,
                ttl: effectiveTTL
              });
            }

            // 准备缓存头信息 (只排除真正不应该缓存的技术性headers)
            const headersToCache: Record<string, string> = {};
            const excludedHeaders = [
              // Cloudflare特定的headers
              'cf-ray',
              'cf-cache-status',

              // 请求追踪相关（每次请求都不同）
              'x-request-id',
              'server-timing',

              // 编码相关（因为我们保存的是解压后的内容）
              'content-encoding',  // 重要：必须排除，否则会导致解码错误
              'transfer-encoding', // 分块传输编码

              // 内容长度（会被自动计算，如果保留可能导致数据截断）
              'content-length',    // 关键：必须排除，否则会导致响应被截断

              // 连接相关的hop-by-hop headers
              'connection',
              'keep-alive',
              'proxy-authenticate',
              'proxy-authorization',
              'te',
              'trailer',
              'upgrade'

              // 重要：不要排除以下headers，它们对透明代理很重要：
              // 'set-cookie' - 必须保留，否则会话无法工作
              // 'authorization' - 可能包含重要的认证信息
            ];

            for (const [key, value] of c.res.headers.entries()) {
              if (!excludedHeaders.includes(key.toLowerCase())) {
                headersToCache[key] = value;
              }
            }

            // 添加缓存元数据
            headersToCache['X-Cache-Status'] = 'MISS';
            headersToCache['X-Cache-Version'] = version.toString();
            headersToCache['X-Cache-Stored'] = new Date().toISOString();

            // 添加缓存策略信息（用于下次从缓存读取时展示）
            if (pathConfig && pathConfig.keyStrategy) {
              headersToCache['X-Cache-Strategy'] = pathConfig.keyStrategy;

              if (pathConfig.keyHeaders) {
                if (pathConfig.keyHeaders === 'all') {
                  headersToCache['X-Cache-Key-Headers'] = 'all';
                } else if (Array.isArray(pathConfig.keyHeaders)) {
                  headersToCache['X-Cache-Key-Headers'] = pathConfig.keyHeaders.join(',');
                }
              }

              if (pathConfig.keyParams) {
                if (pathConfig.keyParams === 'all') {
                  headersToCache['X-Cache-Key-Params'] = 'all';
                } else if (Array.isArray(pathConfig.keyParams)) {
                  headersToCache['X-Cache-Key-Params'] = pathConfig.keyParams.join(',');
                }
              }
            }

            // 保存到缓存（使用 effectiveTTL，空响应使用短 TTL）
            const success = await saveToCache(
              c.env,
              cacheKey,
              responseText,
              version,
              path,
              headersToCache,
              effectiveTTL
            );

            if (success) {
              logger.info('Response cached successfully', {
                path,
                cacheKey,
                responseSize: responseText.length,
                ttl: effectiveTTL,
                isEmpty
              });
            } else {
              logger.warn('Failed to cache response', { path, cacheKey });
            }
          }, logger.context)
        );
      } catch (cacheError) {
        logger.error('Error initiating cache save', logger.context, cacheError as Error);
      }
    }

    // 记录流量分析数据（缓存未命中）
    const totalTime = performance.now() - startTime;
    await recordTraffic(c.env, c.executionCtx, {
      path,
      clientIP: c.req.header('cf-connecting-ip') || '',
      country: c.req.raw.cf?.country as string,
      city: c.req.raw.cf?.city as string, // Quick Win
      isCacheHit: false,
      responseTime: totalTime,
      method: c.req.method,
      statusCode: c.res.status
    });

    // 记录性能指标
    logger.info('Cache middleware completed (MISS)', {
      duration: Math.round(totalTime),
      path
    });

    return;
  } catch (error) {
    logger.error('Cache middleware error', logger.context, error as Error);
    // 在错误时，允许请求继续但记录问题
    return next();
  }
}

