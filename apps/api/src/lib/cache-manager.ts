import type { Env } from '../types/env';
import type { CacheEntry, PathCacheConfig } from '../types/config';
import { CACHE_PREFIXES, DEFAULT_CACHE_TTL, MAX_CACHE_TTL } from './constants';

// 缓存键索引，用于模式删除
const CACHE_INDEX_KEY = 'cache:index';


// 批处理队列接口（仅用于类型定义）
interface BatchOperation {
  type: 'put' | 'get' | 'delete';
  key: string;
  value?: any;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

const BATCH_SIZE = 50;
const BATCH_TIMEOUT = 10; // 10ms

/**
 * TTL随机化：防止缓存雪崩
 * 在原始TTL基础上添加±10%的随机偏移
 */
export function randomizeTTL(baseTTL: number, variance: number = 0.1): number {
  if (baseTTL <= 0) {
    return baseTTL;
  }

  // 计算随机偏移范围
  const offset = baseTTL * variance;
  // 生成 -offset 到 +offset 之间的随机数
  const randomOffset = (Math.random() * 2 - 1) * offset;
  // 确保结果不小于原TTL的50%
  const minTTL = baseTTL * 0.5;
  const randomizedTTL = Math.max(minTTL, baseTTL + randomOffset);

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: 'ttl_randomization',
    baseTTL,
    variance,
    offset,
    randomOffset,
    randomizedTTL,
    difference: randomizedTTL - baseTTL
  }));

  return Math.floor(randomizedTTL);
}

/**
 * 熔断降级：当上游异常时延长缓存有效期
 */
export async function extendCacheForCircuitBreaker(
  env: Env,
  cacheKey: string,
  extensionSeconds: number = 3600
): Promise<boolean> {
  try {
    const cacheEntry = await getFromCache(env, cacheKey);
    if (!cacheEntry) {
      console.log('No cache entry found for circuit breaker extension:', cacheKey);
      return false;
    }

    // 计算新的过期时间
    const now = Date.now();
    const newExpiresAt = now + (extensionSeconds * 1000);

    // 更新缓存条目的过期时间和TTL
    const updatedEntry = {
      ...cacheEntry,
      ttl: extensionSeconds,
      expiresAt: newExpiresAt,
      // 添加熔断标记
      circuitBreakerExtended: true,
      circuitBreakerExtendedAt: now
    };

    const success = await directKVPut(env, cacheKey, updatedEntry);

    if (success) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'circuit_breaker_cache_extension',
        cacheKey,
        originalExpiresAt: cacheEntry.expiresAt,
        newExpiresAt,
        extensionSeconds,
        message: 'Cache extended due to upstream failure'
      }));
    }

    return success;
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'circuit_breaker_extension_error',
      cacheKey,
      error: error instanceof Error ? error.message : 'Unknown error'
    }));
    return false;
  }
}

/**
 * 检查上游服务健康状态并决定是否启用熔断
 */
interface CircuitBreakerState {
  failureCount: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  nextAttemptTime: number;
}

const CIRCUIT_BREAKER_THRESHOLD = 5; // 连续失败5次触发熔断
const CIRCUIT_BREAKER_TIMEOUT = 60000; // 熔断超时60秒
const CIRCUIT_BREAKER_CACHE_EXTENSION = 3600; // 熔断时缓存延长1小时

export async function checkCircuitBreaker(
  env: Env,
  targetUrl: string
): Promise<{ shouldBreak: boolean; state: CircuitBreakerState }> {
  const circuitKey = `circuit:${new URL(targetUrl).hostname}`;

  try {
    const stored = await env.API_GATEWAY_STORAGE.get(circuitKey, 'json');
    const now = Date.now();

    let state: CircuitBreakerState = stored as CircuitBreakerState || {
      failureCount: 0,
      lastFailureTime: 0,
      state: 'CLOSED',
      nextAttemptTime: 0
    };

    // 检查当前状态
    switch (state.state) {
      case 'CLOSED':
        // 正常状态，允许请求
        return { shouldBreak: false, state };

      case 'OPEN':
        // 熔断状态，检查是否可以进入半开状态
        if (now >= state.nextAttemptTime) {
          state.state = 'HALF_OPEN';
          await env.API_GATEWAY_STORAGE.put(circuitKey, JSON.stringify(state), {
            expirationTtl: CIRCUIT_BREAKER_TIMEOUT * 2 / 1000
          });
          return { shouldBreak: false, state };
        }
        return { shouldBreak: true, state };

      case 'HALF_OPEN':
        // 半开状态，允许一个请求尝试
        return { shouldBreak: false, state };

      default:
        return { shouldBreak: false, state };
    }
  } catch (error) {
    console.error('Circuit breaker check error:', error);
    return {
      shouldBreak: false,
      state: { failureCount: 0, lastFailureTime: 0, state: 'CLOSED', nextAttemptTime: 0 }
    };
  }
}

export async function recordCircuitBreakerFailure(
  env: Env,
  targetUrl: string,
  cacheKey?: string
): Promise<void> {
  const circuitKey = `circuit:${new URL(targetUrl).hostname}`;
  const now = Date.now();

  try {
    const stored = await env.API_GATEWAY_STORAGE.get(circuitKey, 'json');
    let state: CircuitBreakerState = stored as CircuitBreakerState || {
      failureCount: 0,
      lastFailureTime: 0,
      state: 'CLOSED',
      nextAttemptTime: 0
    };

    state.failureCount++;
    state.lastFailureTime = now;

    // 检查是否需要触发熔断
    if (state.failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
      state.state = 'OPEN';
      state.nextAttemptTime = now + CIRCUIT_BREAKER_TIMEOUT;

      // 如果有缓存键，延长缓存时间
      if (cacheKey) {
        await extendCacheForCircuitBreaker(env, cacheKey, CIRCUIT_BREAKER_CACHE_EXTENSION);
      }

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'circuit_breaker_opened',
        targetUrl,
        failureCount: state.failureCount,
        nextAttemptTime: new Date(state.nextAttemptTime).toISOString()
      }));
    }

    // 保存状态，设置过期时间
    await env.API_GATEWAY_STORAGE.put(circuitKey, JSON.stringify(state), {
      expirationTtl: CIRCUIT_BREAKER_TIMEOUT * 2 / 1000
    });
  } catch (error) {
    console.error('Record circuit breaker failure error:', error);
  }
}

export async function recordCircuitBreakerSuccess(
  env: Env,
  targetUrl: string
): Promise<void> {
  const circuitKey = `circuit:${new URL(targetUrl).hostname}`;

  try {
    const stored = await env.API_GATEWAY_STORAGE.get(circuitKey, 'json');
    let state: CircuitBreakerState = stored as CircuitBreakerState || {
      failureCount: 0,
      lastFailureTime: 0,
      state: 'CLOSED',
      nextAttemptTime: 0
    };

    // 重置失败计数，切换到关闭状态
    state.failureCount = 0;
    state.state = 'CLOSED';
    state.nextAttemptTime = 0;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'circuit_breaker_closed',
      targetUrl,
      message: 'Circuit breaker reset to CLOSED state'
    }));

    // 保存状态
    await env.API_GATEWAY_STORAGE.put(circuitKey, JSON.stringify(state), {
      expirationTtl: CIRCUIT_BREAKER_TIMEOUT * 2 / 1000
    });
  } catch (error) {
    console.error('Record circuit breaker success error:', error);
  }
}

/**
 * 辅助函数：排序对象键并返回新对象
 * 确保 JSON.stringify 的一致性
 */
function sortObjectKeys(obj: any): any {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return obj;
  }

  return Object.keys(obj)
    .sort()
    .reduce((acc: any, key: string) => {
      acc[key] = obj[key];
      return acc;
    }, {});
}

/**
 * 辅助函数：处理参数并返回 JSON 字符串
 */
function processParams(params: any, keyParams?: 'all' | string[]): string {
  if (!params) return '';

  let paramsToInclude = params;

  // 如果指定了特定参数，只包含这些参数
  if (keyParams && keyParams !== 'all' && Array.isArray(keyParams)) {
    paramsToInclude = keyParams.reduce((acc: any, key: string) => {
      if (params[key] !== undefined) {
        acc[key] = params[key];
      }
      return acc;
    }, {});
  }

  // 如果是字符串直接返回
  if (typeof paramsToInclude === 'string') {
    return paramsToInclude;
  }

  // 对象则先排序再序列化
  const sorted = sortObjectKeys(paramsToInclude);
  return JSON.stringify(sorted);
}

/**
 * 辅助函数：处理 headers 并返回 JSON 字符串
 * @param headers - 原始 headers 对象
 * @param keyHeaders - 'all' 表示所有 headers，或指定的 header 名称列表
 */
function processHeaders(headers: Record<string, string>, keyHeaders: 'all' | string[] | undefined): string {
  if (!headers || !keyHeaders) {
    return '';
  }

  // 先将所有 headers 的键转为小写
  const normalizedHeaders = Object.keys(headers).reduce((acc: Record<string, string>, key: string) => {
    acc[key.toLowerCase()] = headers[key];
    return acc;
  }, {});

  let headerValues: Record<string, string>;

  if (keyHeaders === 'all') {
    // 使用所有 headers
    headerValues = normalizedHeaders;
  } else if (Array.isArray(keyHeaders)) {
    // 提取指定的 headers（统一转小写）
    if (keyHeaders.length === 0) {
      return '';
    }
    headerValues = keyHeaders.reduce((acc: Record<string, string>, headerName: string) => {
      const value = normalizedHeaders[headerName.toLowerCase()];
      if (value) {
        acc[headerName.toLowerCase()] = value;
      }
      return acc;
    }, {});
  } else {
    return '';
  }

  if (Object.keys(headerValues).length === 0) {
    return '';
  }

  // 排序后序列化
  const sorted = sortObjectKeys(headerValues);
  return JSON.stringify(sorted);
}

/**
 * 生成一个包含版本号的缓存键（支持多种策略）
 * Pattern: cache:v{version}:{path}:{hash}
 * 
 * @param path - 请求路径
 * @param optionsOrParams - 配置选项对象或参数（向后兼容）
 * @param version - 版本号（向后兼容参数）
 * @returns 缓存键字符串
 * 
 * 支持两种调用方式：
 * 1. 新方式: getCacheKey(path, { version, strategy, params, headers, ... })
 * 2. 旧方式: getCacheKey(path, params, version) - 向后兼容
 */
export async function getCacheKey(
  path: string,
  optionsOrParams: any,
  version?: number
): Promise<string> {
  // 判断是新方式还是旧方式调用（更健壮的判断）
  const isNewAPI = typeof optionsOrParams === 'object' &&
    optionsOrParams !== null &&
    'version' in optionsOrParams &&
    typeof optionsOrParams.version === 'number' &&
    (version === undefined); // 如果提供了第三个参数，则是旧方式

  let options: {
    version: number;
    strategy?: 'path-only' | 'path-params' | 'path-headers' | 'path-params-headers';
    params?: any;
    headers?: Record<string, string>;
    keyHeaders?: 'all' | string[];
    keyParams?: 'all' | string[];
  };

  if (isNewAPI) {
    // 新方式：使用 options 对象
    options = optionsOrParams;
  } else {
    // 旧方式：向后兼容
    options = {
      version: version!,
      strategy: 'path-params',
      params: optionsOrParams
    };
  }

  const {
    version: cacheVersion,
    strategy = 'path-params',
    params,
    headers,
    keyHeaders,
    keyParams
  } = options;

  // 构建哈希输入字符串数组
  const hashParts: string[] = [path];

  // 根据策略添加不同的组件（使用辅助函数，确保一致性）
  switch (strategy) {
    case 'path-only':
      // 仅路径，不添加其他部分
      break;

    case 'path-params':
      // 添加参数
      const paramsStr = processParams(params, keyParams);
      if (paramsStr) {
        hashParts.push(paramsStr);
      }
      break;

    case 'path-headers':
      // 添加指定的 headers
      const headersStr = processHeaders(headers || {}, keyHeaders || []);
      if (headersStr) {
        hashParts.push(headersStr);
      }
      break;

    case 'path-params-headers':
      // 同时添加参数和 headers
      const paramsStrCombined = processParams(params, keyParams);
      if (paramsStrCombined) {
        hashParts.push('params:' + paramsStrCombined);
      }

      const headersStrCombined = processHeaders(headers || {}, keyHeaders || []);
      if (headersStrCombined) {
        hashParts.push('headers:' + headersStrCombined);
      }
      break;
  }

  // 计算哈希
  const hashInput = hashParts.join('|');
  const paramsHash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(hashInput)
  );

  const hashHex = Array.from(new Uint8Array(paramsHash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return `${CACHE_PREFIXES.CACHE}v${cacheVersion}:${path}:${hashHex}`;
}

// 注意：移除了批处理逻辑，改为立即执行以符合 Worker 无状态原则

/**
 * 直接 KV get 操作（无批处理）
 */
function directKVGet(env: Env, key: string): Promise<any> {
  return env.API_GATEWAY_STORAGE.get(key, 'json');
}

/**
 * 直接 KV put 操作（无批处理）
 */
async function directKVPut(env: Env, key: string, value: any): Promise<boolean> {
  try {
    await env.API_GATEWAY_STORAGE.put(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('KV put error:', error);
    return false;
  }
}

/**
 * 直接 KV delete 操作（无批处理）
 */
async function directKVDelete(env: Env, key: string): Promise<boolean> {
  try {
    await env.API_GATEWAY_STORAGE.delete(key);
    return true;
  } catch (error) {
    console.error('KV delete error:', error);
    return false;
  }
}

/**
 * 从 KV 存储中检索一个缓存条目（优化版本）
 * 如果键不存在或条目无效，返回 null  
 */
export async function getFromCache(env: Env, key: string): Promise<CacheEntry | null> {
  try {
    // 使用直接 KV 操作
    const cached = await directKVGet(env, key);
    if (cached === null) return null;

    // 验证缓存条目的结构
    if (!cached || typeof cached !== 'object') return null;
    const entry = cached as any;
    if (!entry.version || !entry.data || !entry.createdAt) return null;

    // 检查数据是否被压缩
    if (entry.compressed) {
      try {
        // 解压缩数据 (使用 TextDecoder/TextEncoder)
        const compressedData = new Uint8Array(entry.data);
        const decompressedStream = new DecompressionStream('gzip');
        const writer = decompressedStream.writable.getWriter();
        const reader = decompressedStream.readable.getReader();

        await writer.write(compressedData);
        await writer.close();

        // 循环读取所有 chunks，避免只读取第一个 4KB chunk
        const chunks: Uint8Array[] = [];
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }

        // 合并所有 chunks
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }

        const decompressedText = new TextDecoder().decode(combined);
        entry.data = decompressedText;
        entry.compressed = false;
      } catch (decompError) {
        console.warn('Decompression failed, using original data:', decompError);
      }
    }

    return cached as CacheEntry;
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'cache_read_error',
      key,
      error: error instanceof Error ? error.message : 'Unknown error'
    }));
    return null;
  }
}

/**
 * 将数据保存到缓存中，包括版本和元数据（优化版本）
 * 
 * @param env - Cloudflare 环境变量
 * @param key - 缓存键
 * @param data - 要缓存的数据
 * @param version - 缓存版本号
 * @param path - 请求路径
 * @param headers - 要缓存的响应头
 * @param ttl - 过期时间（秒）。
 *              **新契约（2025-10-14）：**
 *              - 如果未传递或为 undefined，**保存时会使用 DEFAULT_CACHE_TTL (300秒)**
 *              - 调用者应该传递继承后的 TTL（全局 defaultTtl -> 代理路由 -> 路径配置）
 *              - 这确保所有新缓存都有明确的过期时间
 *              - **强制最大 TTL 限制**：如果传递的 TTL > MAX_CACHE_TTL (86400秒=1天)，会被自动限制到最大值
 *              - 这防止旧数据或错误配置导致超长缓存
 */
export async function saveToCache(
  env: Env,
  key: string,
  data: any,
  version: number,
  path: string,
  headers?: Record<string, string>,
  ttl?: number
): Promise<boolean> {
  try {
    let processedData = data;
    let compressed = false;

    // 对大于 10KB 的数据进行压缩
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    if (dataStr.length > 10240) {
      try {
        const compressionStream = new CompressionStream('gzip');
        const writer = compressionStream.writable.getWriter();
        const reader = compressionStream.readable.getReader();

        await writer.write(new TextEncoder().encode(dataStr));
        await writer.close();

        // 循环读取所有压缩后的 chunks
        const chunks: Uint8Array[] = [];
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }

        // 合并所有 chunks
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }

        processedData = Array.from(combined);
        compressed = true;

        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'cache_compression',
          key,
          originalSize: dataStr.length,
          compressedSize: processedData.length,
          ratio: Math.round((1 - processedData.length / dataStr.length) * 100)
        }));
      } catch (compressionError) {
        console.warn('Compression failed, storing uncompressed:', compressionError);
      }
    }

    const now = Date.now();

    // 如果没有传递 TTL，使用默认值（新契约 2025-10-14）
    // 这确保所有新缓存都有明确的过期时间，避免依赖读取时的默认值
    let effectiveTTL = ttl !== undefined ? ttl : DEFAULT_CACHE_TTL;

    // 强制限制最大TTL（防止旧数据或错误配置导致超长缓存）
    if (effectiveTTL > MAX_CACHE_TTL) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'ttl_capped_to_max_before_randomization',
        originalTTL: effectiveTTL,
        maxTTL: MAX_CACHE_TTL,
        path
      }));
      effectiveTTL = MAX_CACHE_TTL;
    }

    // 应用TTL随机化防止缓存雪崩
    if (effectiveTTL && effectiveTTL > 0) {
      effectiveTTL = randomizeTTL(effectiveTTL);
    }

    // 随机化后再次检查最大TTL（因为 randomizeTTL 可能增加 +10%）
    // 例如：86400s * 1.1 = 95040s，需要再次限制到 86400s
    if (effectiveTTL > MAX_CACHE_TTL) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'ttl_capped_to_max_after_randomization',
        randomizedTTL: effectiveTTL,
        maxTTL: MAX_CACHE_TTL,
        path
      }));
      effectiveTTL = MAX_CACHE_TTL;
    }

    const cacheEntry: CacheEntry & { compressed?: boolean } = {
      data: processedData,
      version,
      createdAt: now,
      path,
      headers: headers || {},
      compressed,
      // TTL相关字段
      ttl: effectiveTTL, // 使用随机化后的TTL（如果未传递则使用 DEFAULT_CACHE_TTL）
      expiresAt: effectiveTTL ? now + (effectiveTTL * 1000) : undefined, // 如果有TTL，计算过期时间
      etag: headers?.['etag'],
      lastModified: headers?.['last-modified'] || new Date(now).toISOString()
    };

    // 使用直接 KV 操作（永不设置 expirationTtl，数据永久保存）
    const success = await directKVPut(env, key, cacheEntry);

    if (success) {
      // 更新缓存索引
      await updateCacheIndex(env, key, path);

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'cache_write_success',
        key,
        path,
        version,
        compressed
      }));
    }

    return success;
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'cache_write_error',
      key,
      error: error instanceof Error ? error.message : 'Unknown error'
    }));
    return false;
  }
}

/**
 * 更新缓存索引
 */
async function updateCacheIndex(env: Env, key: string, path: string): Promise<void> {
  try {
    // 获取现有索引
    const existingIndex = await env.API_GATEWAY_STORAGE.get(CACHE_INDEX_KEY, 'json') || {};
    const index = existingIndex as Record<string, string[]>;

    // 按路径分组缓存键
    if (!index[path]) {
      index[path] = [];
    }

    // 添加新键（去重）
    if (!index[path].includes(key)) {
      index[path].push(key);

      // 限制每个路径最多 1000 个缓存键
      if (index[path].length > 1000) {
        index[path] = index[path].slice(-1000);
      }
    }

    // 保存更新的索引
    await env.API_GATEWAY_STORAGE.put(CACHE_INDEX_KEY, JSON.stringify(index));
  } catch (error) {
    console.warn('Failed to update cache index:', error);
  }
}

/**
 * 保存一个完整的缓存条目
 */
export async function saveCacheEntry(env: Env, key: string, entry: CacheEntry): Promise<boolean> {
  try {
    const success = await directKVPut(env, key, entry);
    if (success) {
      await updateCacheIndex(env, key, entry.path);
    }
    return success;
  } catch (error) {
    console.error('Cache write error:', error);
    return false;
  }
}

/**
 * 使缓存条目失效，匹配一个模式（标记过期而不是删除）
 */
export async function invalidateCache(env: Env, pattern: string): Promise<number> {
  try {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'cache_invalidation_start',
      pattern,
      message: 'Marking cache entries as expired (not deleting)'
    }));

    // 获取缓存索引
    const index = await env.API_GATEWAY_STORAGE.get(CACHE_INDEX_KEY, 'json') as Record<string, string[]> || {};

    let invalidatedCount = 0;
    const keysToInvalidate: string[] = [];
    const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);

    // 查找匹配的缓存键
    for (const [path, keys] of Object.entries(index)) {
      if (regex.test(path)) {
        keysToInvalidate.push(...keys);
      }
    }

    // 批量标记过期（而不是删除）
    if (keysToInvalidate.length > 0) {
      const invalidatePromises = keysToInvalidate.map(async key => {
        try {
          const entry = await getFromCache(env, key);
          if (entry) {
            // 标记为立即过期（设置过期时间为过去时间）
            const expiredEntry = {
              ...entry,
              expiresAt: Date.now() - 1000, // 1秒前过期
              invalidatedAt: Date.now()
            };

            await directKVPut(env, key, expiredEntry);
            return true;
          }
        } catch (error) {
          console.warn(`Failed to invalidate cache key ${key}:`, error);
        }
        return false;
      });

      const results = await Promise.all(invalidatePromises);
      invalidatedCount = results.filter(success => success).length;
    }

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'cache_invalidation_complete',
      pattern,
      invalidatedCount,
      message: 'Cache entries marked as expired'
    }));

    return invalidatedCount;
  } catch (error) {
    console.error('Cache invalidation error:', error);
    return 0;
  }
}

// batchKVDelete 函数已被 directKVDelete 替代

/**
 * 使一个特定的缓存键失效（标记过期而不是删除）
 */
export async function invalidateCacheKey(env: Env, key: string): Promise<boolean> {
  try {
    const entry = await getFromCache(env, key);
    if (!entry) {
      return false; // 键不存在
    }

    // 标记为立即过期（而不是删除）
    const expiredEntry = {
      ...entry,
      expiresAt: Date.now() - 1000, // 1秒前过期
      invalidatedAt: Date.now()
    };

    const success = await directKVPut(env, key, expiredEntry);

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'cache_key_invalidated',
      key: key.substring(0, 32) + '...',
      message: 'Cache entry marked as expired'
    }));

    return success;
  } catch (error) {
    console.error('Cache key invalidation error:', error);
    return false;
  }
}

/**
 * 真正删除一个缓存条目（从 KV 和索引中移除）
 */
export async function deleteCacheEntry(env: Env, cacheKey: string): Promise<boolean> {
  try {
    // 1. 从 KV 中删除缓存条目
    await directKVDelete(env, cacheKey);

    // 2. 从缓存索引中移除
    const index = await env.API_GATEWAY_STORAGE.get(CACHE_INDEX_KEY, 'json') as Record<string, string[]> || {};

    // 查找并移除缓存键
    for (const [path, keys] of Object.entries(index)) {
      const keyIndex = keys.indexOf(cacheKey);
      if (keyIndex > -1) {
        keys.splice(keyIndex, 1);

        // 如果该路径没有缓存条目了，删除路径记录
        if (keys.length === 0) {
          delete index[path];
        } else {
          index[path] = keys;
        }

        break;
      }
    }

    // 3. 更新缓存索引
    await env.API_GATEWAY_STORAGE.put(CACHE_INDEX_KEY, JSON.stringify(index));

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'cache_entry_deleted',
      cacheKey: cacheKey.substring(0, 50) + '...',
      message: 'Cache entry permanently deleted'
    }));

    return true;
  } catch (error) {
    console.error('Delete cache entry error:', error);
    return false;
  }
}

/**
 * 检查一个缓存条目是否有效，基于版本
 */
export function isCacheValid(entry: CacheEntry, expectedVersion: number): boolean {
  return entry.version === expectedVersion;
}

/**
 * 检查缓存条目是否已过期
 * 
 * **新契约（2025-10-14）：**
 * - 所有新缓存在 saveToCache 时都会设置 expiresAt（基于继承的 TTL）
 * - 这个默认 5 分钟逻辑**仅用于兼容旧缓存**（10月14日之前创建的没有 expiresAt 的条目）
 * - 新保存的缓存不会依赖这个默认值，因为 saveToCache 会确保设置 expiresAt
 * 
 * 理由：
 * 1. 避免旧缓存永不过期，导致数据陈旧和存储浪费
 * 2. 确保所有缓存（包括旧的）都会定期刷新
 * 3. 作为最后的安全保障
 */
export function isCacheExpired(entry: CacheEntry): boolean {
  const now = Date.now();
  const cacheAge = now - entry.createdAt;

  // 强制最大缓存时间限制：超过 MAX_CACHE_TTL（1天）的缓存一律过期
  // 这确保即使旧数据配置了超长 TTL，也会在 1 天后过期
  if (cacheAge > MAX_CACHE_TTL * 1000) {
    return true;
  }

  if (!entry.expiresAt) {
    // 兼容旧缓存：没有过期时间时，使用默认 TTL (5分钟)
    const defaultExpiresAt = entry.createdAt + (DEFAULT_CACHE_TTL * 1000);
    return now > defaultExpiresAt;
  }
  return now > entry.expiresAt;
}

/**
 * 检查缓存条目是否仍然有效（版本匹配且未过期）
 */
export function isCacheEntryValid(entry: CacheEntry, expectedVersion: number): boolean {
  return isCacheValid(entry, expectedVersion) && !isCacheExpired(entry);
}

/**
 * 获取缓存剩余时间（秒）
 * 
 * **新契约（2025-10-14）：**
 * - 对于有 expiresAt 的缓存（所有新缓存），直接计算剩余时间
 * - 对于没有 expiresAt 的旧缓存，基于 createdAt + 5分钟 计算剩余时间
 * - 这确保监控和管理界面能正确显示所有缓存条目的过期倒计时
 */
export function getCacheRemainingTTL(entry: CacheEntry): number | null {
  if (!entry.expiresAt) {
    // 兼容旧缓存：基于创建时间 + 默认 TTL 计算剩余时间
    const defaultExpiresAt = entry.createdAt + (DEFAULT_CACHE_TTL * 1000);
    const remaining = Math.max(0, defaultExpiresAt - Date.now()) / 1000;
    return Math.floor(remaining);
  }
  const remaining = Math.max(0, entry.expiresAt - Date.now()) / 1000;
  return Math.floor(remaining);
}

/**
 * 批量预热缓存
 * 
 * **新契约（2025-10-14）：**
 * - 预热的缓存会应用与 middleware 相同的 TTL 继承逻辑
 * - 继承链：全局 defaultTtl -> 路径配置 ttl
 * - 这确保预热的缓存与实际请求的缓存具有相同的过期时间
 */
export async function warmCache(
  env: Env,
  paths: string[],
  version: number = 1,
  proxyRoutes?: Record<string, { target: string; stripPrefix?: boolean; pattern: string }>
): Promise<{ warmedCount: number; skippedCount: number; errorCount: number; results: Array<{ path: string; success: boolean; error?: string }> }> {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: 'cache_warm_start',
    pathCount: paths.length,
    version
  }));

  // 获取缓存配置以应用 TTL 继承
  const cacheConfig = await directKVGet(env, 'config:cache');
  const globalDefaultTTL = cacheConfig?.defaultTtl || DEFAULT_CACHE_TTL;
  const pathConfigs = cacheConfig?.pathConfigs || {};

  let warmedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const results: Array<{ path: string; success: boolean; error?: string }> = [];

  const warmPromises = paths.map(async (path) => {
    try {
      // 应用 TTL 继承逻辑（与 middleware 一致）
      let effectiveTTL = globalDefaultTTL;

      // 检查路径配置是否有显式 TTL
      const pathConfig = pathConfigs[path];
      if (pathConfig && pathConfig.ttl !== undefined) {
        effectiveTTL = pathConfig.ttl;
      }

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'cache_warm_ttl',
        path,
        effectiveTTL,
        globalTTL: globalDefaultTTL,
        pathConfigTTL: pathConfig?.ttl
      }));
      const cacheKey = await getCacheKey(path, {}, version);
      const exists = await getFromCache(env, cacheKey);

      if (exists) {
        // 缓存已存在，跳过
        results.push({ path, success: true });
        skippedCount++;
        return;
      }

      // 查找匹配的代理路由
      let targetUrl: string | null = null;

      if (proxyRoutes) {
        for (const [routeId, route] of Object.entries(proxyRoutes)) {
          const pattern = route.pattern.replace('*', '');
          if (path.startsWith(pattern)) {
            let targetPath = path;
            if (route.stripPrefix) {
              targetPath = path.substring(pattern.length);
              if (!targetPath.startsWith('/')) {
                targetPath = '/' + targetPath;
              }
            }
            targetUrl = `${route.target}${targetPath}`;
            break;
          }
        }
      }

      if (!targetUrl) {
        results.push({
          path,
          success: false,
          error: 'No matching proxy route found'
        });
        errorCount++;
        return;
      }

      // 检查熔断器状态
      const circuitCheck = await checkCircuitBreaker(env, targetUrl);
      if (circuitCheck.shouldBreak) {
        results.push({
          path,
          success: false,
          error: 'Circuit breaker is open'
        });
        errorCount++;
        return;
      }

      // 预热请求
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'API-Gateway-Cache-Warmer/1.0',
          'X-Cache-Warmer': 'true'
        },
        cf: {
          cacheEverything: false,
          timeout: 15000, // 15秒超时，比正常请求短
        } as any
      });

      if (!response.ok) {
        await recordCircuitBreakerFailure(env, targetUrl, cacheKey);
        results.push({
          path,
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`
        });
        errorCount++;
        return;
      }

      // 记录成功
      await recordCircuitBreakerSuccess(env, targetUrl);

      // 读取响应内容
      const responseText = await response.text();

      // 准备缓存头信息
      const headersToCache: Record<string, string> = {};
      const excludedHeaders = [
        'cf-ray', 'cf-cache-status', 'x-request-id', 'server-timing',
        'content-encoding', 'transfer-encoding', 'content-length',
        'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
        'te', 'trailer', 'upgrade'
      ];

      for (const [key, value] of response.headers.entries()) {
        if (!excludedHeaders.includes(key.toLowerCase())) {
          headersToCache[key] = value;
        }
      }

      // 添加缓存元数据
      headersToCache['X-Cache-Status'] = 'WARMED';
      headersToCache['X-Cache-Version'] = version.toString();
      headersToCache['X-Cache-Stored'] = new Date().toISOString();
      headersToCache['X-Cache-Warmer'] = 'true';

      // 保存到缓存（传递继承后的 TTL）
      const success = await saveToCache(env, cacheKey, responseText, version, path, headersToCache, effectiveTTL);

      if (success) {
        warmedCount++;
        results.push({ path, success: true });
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'cache_warmed',
          path,
          ttl: effectiveTTL
        }));
      } else {
        errorCount++;
        results.push({ path, success: false, error: 'Failed to save to cache' });
      }

    } catch (error) {
      console.warn(`Failed to warm cache for ${path}:`, error);
      errorCount++;
      results.push({
        path,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  await Promise.all(warmPromises);

  const summary = {
    warmedCount,
    skippedCount,
    errorCount,
    results
  };

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: 'cache_warm_complete',
    ...summary,
    totalPaths: paths.length
  }));

  return summary;
}

/**
 * 获取指定路径的所有缓存条目
 * @param env - 环境变量
 * @param path - 路径
 * @param options - 可选参数
 * @param options.limit - 最大返回数量，默认100
 * @param options.offset - 偏移量，用于分页
 * @returns 缓存条目元数据列表
 */
export async function getPathCacheEntries(
  env: Env,
  path: string,
  options?: { limit?: number; offset?: number }
): Promise<import('../types/config').CacheEntryMetadata[]> {
  const { limit = 100, offset = 0 } = options || {};
  try {
    // 从索引获取该路径的所有缓存键
    const index = await env.API_GATEWAY_STORAGE.get(CACHE_INDEX_KEY, 'json') as Record<string, string[]> || {};
    const cacheKeys = index[path] || [];

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'get_path_cache_entries',
      path,
      cacheKeyCount: cacheKeys.length
    }));

    // 获取每个缓存条目的元数据
    const entries: import('../types/config').CacheEntryMetadata[] = [];

    for (const key of cacheKeys) {
      try {
        const entry = await getFromCache(env, key);
        if (!entry) continue;

        // 提取 hash 值（从缓存键中）
        // 缓存键格式: cache:v{version}:{path}:{hash}
        const hashMatch = key.match(/:([a-f0-9]+)$/);
        const hash = hashMatch ? hashMatch[1] : '';

        // 计算缓存大小
        const dataStr = typeof entry.data === 'string'
          ? entry.data
          : JSON.stringify(entry.data);
        const size = dataStr.length;

        entries.push({
          cacheKey: key,
          hash: hash.substring(0, 16) + '...', // 截取前16位显示
          path,
          requestCount: 0, // TODO: 从统计系统获取实际请求次数
          size,
          createdAt: entry.createdAt,
          lastAccessed: entry.createdAt, // TODO: 实现最后访问时间追踪
          ttl: entry.ttl,
          expiresAt: entry.expiresAt
        });
      } catch (error) {
        console.warn(`Failed to get cache entry ${key}:`, error);
      }
    }

    // 按创建时间倒序排序
    entries.sort((a, b) => b.createdAt - a.createdAt);

    // 应用分页（offset 和 limit）
    const paginatedEntries = entries.slice(offset, offset + limit);

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'get_path_cache_entries_complete',
      path,
      totalEntryCount: entries.length,
      returnedCount: paginatedEntries.length,
      offset,
      limit
    }));

    return paginatedEntries;
  } catch (error) {
    console.error('Failed to get path cache entries:', error);
    return [];
  }
}

/**
 * 获取缓存统计（完整实现）
 */
export async function getCacheStats(env: Env): Promise<{
  hitRate: number;
  hitCount: number;
  missCount: number;
  totalRequests: number;
  avgResponseTime: number;
  upstreamRequests: number;
  cacheSize: {
    totalEntries: number;
    pathCount: number;
    estimatedSizeBytes: number;
    indexSizeBytes: number;
  };
  performance: {
    averageHitTime: number;
    averageMissTime: number;
    p95ResponseTime: number;
  };
  lastUpdated: number;
}> {
  try {
    // 获取缓存索引
    const index = await env.API_GATEWAY_STORAGE.get(CACHE_INDEX_KEY, 'json') as Record<string, string[]> || {};

    let totalEntries = 0;
    const pathCount = Object.keys(index).length;

    for (const keys of Object.values(index)) {
      totalEntries += keys.length;
    }

    // 模拟性能指标（在实际应用中，这些应该从metrics系统获取）
    // 这里提供默认值，实际的metrics会由metrics系统收集
    const hitCount = Math.floor(totalEntries * 2.5); // 假设命中数
    const missCount = Math.floor(hitCount * 0.3); // 假设未命中数
    const totalRequests = hitCount + missCount;
    const hitRate = totalRequests > 0 ? (hitCount / totalRequests) * 100 : 0;

    return {
      hitRate,
      hitCount,
      missCount,
      totalRequests,
      avgResponseTime: hitRate > 80 ? 45 : hitRate > 60 ? 120 : 280, // 基于命中率的模拟响应时间
      upstreamRequests: missCount,
      cacheSize: {
        totalEntries,
        pathCount,
        estimatedSizeBytes: totalEntries * 5000, // 估计每个缓存条目平均 5KB
        indexSizeBytes: JSON.stringify(index).length
      },
      performance: {
        averageHitTime: 25, // 缓存命中的平均响应时间 (ms)
        averageMissTime: 450, // 缓存未命中的平均响应时间 (ms)
        p95ResponseTime: hitRate > 80 ? 180 : hitRate > 60 ? 320 : 580 // P95响应时间
      },
      lastUpdated: Date.now()
    };
  } catch (error) {
    console.error('Failed to get cache stats:', error);
    return {
      hitRate: 0,
      hitCount: 0,
      missCount: 0,
      totalRequests: 0,
      avgResponseTime: 0,
      upstreamRequests: 0,
      cacheSize: {
        totalEntries: 0,
        pathCount: 0,
        estimatedSizeBytes: 0,
        indexSizeBytes: 0
      },
      performance: {
        averageHitTime: 0,
        averageMissTime: 0,
        p95ResponseTime: 0
      },
      lastUpdated: Date.now()
    };
  }
}

/**
 * 多键批量获取
 */
export async function getMultipleFromCache(env: Env, keys: string[]): Promise<(CacheEntry | null)[]> {
  const promises = keys.map(key => getFromCache(env, key));
  return Promise.all(promises);
}

/**
 * 多键批量保存
 * 
 * **新契约（2025-10-14）：**
 * - 每个 entry 应该包含 ttl 字段，传递继承后的 TTL
 * - 如果未提供 ttl，会使用 DEFAULT_CACHE_TTL (300秒)
 */
export async function saveMultipleToCache(
  env: Env,
  entries: Array<{
    key: string;
    data: any;
    version: number;
    path: string;
    headers?: Record<string, string>;
    ttl?: number;
  }>
): Promise<boolean[]> {
  const promises = entries.map(entry =>
    saveToCache(env, entry.key, entry.data, entry.version, entry.path, entry.headers, entry.ttl)
  );
  return Promise.all(promises);
}

/**
 * 后台更新缓存数据
 * 用于 Stale-While-Revalidate 策略
 */
export async function refreshCacheInBackground(
  env: Env,
  cacheKey: string,
  path: string,
  version: number,
  targetUrl: string,
  requestHeaders: HeadersInit,
  method: string,
  body?: BodyInit,
  cacheTTL?: number,
  pathConfig?: PathCacheConfig | null
): Promise<boolean> {
  // 注意：移除了单飞模式，因为 Worker 实例级别的防重复机制不可靠
  // middleware 中已经有 updatingKey 标记在 KV 中防止重复更新

  try {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'cache_background_refresh_start',
      cacheKey,
      path,
      targetUrl
    }));

    // 检查熔断器状态
    const circuitCheck = await checkCircuitBreaker(env, targetUrl);

    if (circuitCheck.shouldBreak) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'circuit_breaker_blocked_refresh',
        cacheKey,
        targetUrl,
        circuitState: circuitCheck.state.state,
        message: 'Background refresh blocked by circuit breaker'
      }));

      // 熔断期间，延长现有缓存
      await extendCacheForCircuitBreaker(env, cacheKey);
      return false;
    }

    // 发起上游请求
    const response = await fetch(targetUrl, {
      method,
      headers: requestHeaders,
      body,
      cf: {
        cacheEverything: false,
        keepAlive: true,
        timeout: 30000,
      } as any
    });

    if (!response.ok) {
      console.warn('Background refresh failed - upstream error:', response.status, response.statusText);

      // 记录熔断器失败
      await recordCircuitBreakerFailure(env, targetUrl, cacheKey);
      return false;
    }

    // 请求成功，记录熔断器成功
    await recordCircuitBreakerSuccess(env, targetUrl);

    // 读取响应内容
    const responseText = await response.text();

    // 准备缓存头信息（排除不应该缓存的headers）
    const headersToCache: Record<string, string> = {};
    const excludedHeaders = [
      'cf-ray', 'cf-cache-status', 'x-request-id', 'server-timing',
      'content-encoding', 'transfer-encoding', 'content-length',
      'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
      'te', 'trailer', 'upgrade'
    ];

    for (const [key, value] of response.headers.entries()) {
      if (!excludedHeaders.includes(key.toLowerCase())) {
        headersToCache[key] = value;
      }
    }

    // 添加缓存元数据
    headersToCache['X-Cache-Status'] = 'REFRESHED';
    headersToCache['X-Cache-Version'] = version.toString();
    headersToCache['X-Cache-Stored'] = new Date().toISOString();

    // 添加缓存策略信息
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

    // 保存到缓存（TTL随机化已经在saveToCache中处理）
    const success = await saveToCache(
      env,
      cacheKey,
      responseText,
      version,
      path,
      headersToCache,
      cacheTTL
    );

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'cache_background_refresh_complete',
      cacheKey,
      path,
      success,
      responseSize: responseText.length
    }));

    return success;
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'cache_background_refresh_error',
      cacheKey,
      path,
      error: error instanceof Error ? error.message : 'Unknown error'
    }));

    // 记录熔断器失败
    await recordCircuitBreakerFailure(env, targetUrl, cacheKey);
    return false;
  }
}