/**
 * Cloudflare Workers 测试工具集
 * 提供创建测试请求、模拟数据和测试辅助函数
 */
import { env, fetchMock } from 'cloudflare:test';
import type { 
  CacheConfig, 
  RateLimitConfig, 
  GeoConfig, 
  TrafficConfig 
} from '../../src/types/config';

/**
 * 创建测试用的 Request 对象
 */
export function createTestRequest(
  url: string, 
  options: RequestInit = {},
  cf?: any
): Request {
  const request = new Request(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'test-agent',
      ...options.headers
    },
    ...options
  });

  // 模拟 Cloudflare 的 cf 对象
  if (cf) {
    // @ts-ignore - cf 是 Cloudflare 特有的属性
    request.cf = {
      country: 'US',
      colo: 'SJC',
      asn: 13335,
      ...cf
    };
  }

  return request;
}

/**
 * 创建带有特定国家的测试请求
 */
export function createRequestFromCountry(
  url: string, 
  country: string, 
  options: RequestInit = {}
): Request {
  return createTestRequest(url, options, { country });
}

/**
 * 创建带有特定 IP 的测试请求
 */
export function createRequestFromIP(
  url: string, 
  ip: string, 
  options: RequestInit = {}
): Request {
  const headers = new Headers(options.headers);
  headers.set('CF-Connecting-IP', ip);
  
  return createTestRequest(url, { ...options, headers });
}

/**
 * 获取测试用的缓存配置
 */
export function getTestCacheConfig(): CacheConfig {
  return {
    version: 1,
    enabled: true,
    whitelist: ['/kv/*', '/biz-client/*'],
    pathConfigs: {
      '/kv/test': { enabled: true, version: 1 },
      '/biz-client/api': { enabled: true, version: 1 }
    }
  };
}

/**
 * 获取测试用的限流配置
 */
export function getTestRateLimitConfig(): RateLimitConfig {
  return {
    enabled: true,
    defaultLimit: 60,
    windowSeconds: 60,
    pathLimits: {
      '/kv/*': 100,
      '/biz-client/*': 50
    }
  };
}

/**
 * 获取测试用的地域配置
 */
export function getTestGeoConfig(): GeoConfig {
  return {
    enabled: true,
    mode: 'blacklist',
    countries: ['CN', 'RU'],
    pathOverrides: {
      '/kv/public': []  // 公开路径不受地域限制
    }
  };
}

/**
 * 获取测试用的流量配置
 */
export function getTestTrafficConfig(): TrafficConfig {
  return {
    alertThreshold: 1000,
    autoEnableCache: true,
    measurementWindow: 300
  };
}

/**
 * 在 KV 中设置测试配置
 */
export async function setupTestConfigs() {
  await env.API_GATEWAY_STORAGE.put('config:cache', JSON.stringify(getTestCacheConfig()));
  await env.API_GATEWAY_STORAGE.put('config:rate-limit', JSON.stringify(getTestRateLimitConfig()));
  await env.API_GATEWAY_STORAGE.put('config:geo', JSON.stringify(getTestGeoConfig()));
  await env.API_GATEWAY_STORAGE.put('config:traffic', JSON.stringify(getTestTrafficConfig()));
}

/**
 * 清理测试数据
 */
export async function cleanupTestData() {
  // 清理配置
  await env.API_GATEWAY_STORAGE.delete('config:cache');
  await env.API_GATEWAY_STORAGE.delete('config:rate-limit');
  await env.API_GATEWAY_STORAGE.delete('config:geo');
  await env.API_GATEWAY_STORAGE.delete('config:traffic');

  // 清理缓存数据
  const cacheKeys = await env.API_GATEWAY_STORAGE.list({ prefix: 'cache:' });
  for (const key of cacheKeys.keys) {
    await env.API_GATEWAY_STORAGE.delete(key.name);
  }
}

/**
 * 设置 fetch 模拟
 */
export function setupFetchMocks() {
  fetchMock.activate();
  fetchMock.disableNetConnect();

  // 模拟上游 dokv.pwtk.cc
  fetchMock
    .get('https://dokv.pwtk.cc')
    .intercept({ path: /^\/kv\/.*/ })
    .reply(200, { status: 'ok', source: 'dokv' });

  // 模拟上游 biz-client.pwtk.cc
  fetchMock
    .get('https://biz-client.pwtk.cc')
    .intercept({ path: /^\/biz-client\/.*/ })
    .reply(200, { status: 'ok', source: 'biz-client' });

  // 模拟错误响应
  fetchMock
    .get('https://dokv.pwtk.cc')
    .intercept({ path: '/kv/error' })
    .reply(500, { error: 'Internal Server Error' });
}

/**
 * 重置 fetch 模拟
 */
export function resetFetchMocks() {
  fetchMock.removeAllListeners();
  fetchMock.resetHistory();
}

/**
 * 创建多个连续请求以测试限流
 */
export async function sendMultipleRequests(
  url: string,
  count: number,
  ip: string = '192.168.1.1'
): Promise<Response[]> {
  const promises: Promise<Response>[] = [];
  
  for (let i = 0; i < count; i++) {
    const request = createRequestFromIP(url, ip);
    promises.push(fetch(request));
  }
  
  return Promise.all(promises);
}

/**
 * 等待指定毫秒数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 验证响应是否符合预期
 */
export async function expectJsonResponse(
  response: Response, 
  expectedStatus: number,
  expectedData?: any
): Promise<any> {
  expect(response.status).toBe(expectedStatus);
  expect(response.headers.get('content-type')).toContain('application/json');
  
  const data = await response.json();
  
  if (expectedData) {
    expect(data).toMatchObject(expectedData);
  }
  
  return data;
}

/**
 * 验证缓存响应头
 */
export function expectCacheHeaders(response: Response, shouldBeCached: boolean) {
  if (shouldBeCached) {
    expect(response.headers.get('X-Cache-Status')).toBe('HIT');
  } else {
    expect(response.headers.get('X-Cache-Status')).toBe('MISS');
  }
}