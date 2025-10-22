/**
 * 测试工具函数
 * 兼容 Hono app 测试和 Cloudflare Workers 测试
 */
import { SELF } from 'cloudflare:test';

export interface TestResponse {
  status: number;
  headers: Headers;
  body: any;
}

/**
 * 创建请求并发送到 Hono app (传统方式)
 */
export async function makeRequest(
  app: any, 
  path: string, 
  options: RequestInit = {}
): Promise<TestResponse> {
  const response = await app.request(path, options);
  let body;
  
  try {
    body = await response.json();
  } catch {
    try {
      body = await response.text();
    } catch {
      body = null;
    }
  }

  return {
    status: response.status,
    headers: response.headers,
    body
  };
}

/**
 * 创建请求并发送到 Worker (使用 SELF)
 */
export async function makeWorkerRequest(
  path: string, 
  options: RequestInit = {}
): Promise<TestResponse> {
  const url = `http://localhost${path.startsWith('/') ? path : '/' + path}`;
  const response = await SELF.fetch(url, options);
  let body;
  
  try {
    body = await response.json();
  } catch {
    try {
      body = await response.text();
    } catch {
      body = null;
    }
  }

  return {
    status: response.status,
    headers: response.headers,
    body
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 发送多个请求到 Hono app
 */
export async function makeMultipleRequests(
  app: any,
  path: string,
  count: number,
  interval = 10
): Promise<TestResponse[]> {
  const results: TestResponse[] = [];
  
  for (let i = 0; i < count; i++) {
    const response = await makeRequest(app, path);
    results.push(response);
    if (i < count - 1) {
      await sleep(interval);
    }
  }
  
  return results;
}

/**
 * 发送多个请求到 Worker
 */
export async function makeMultipleWorkerRequests(
  path: string,
  count: number,
  interval = 10
): Promise<TestResponse[]> {
  const results: TestResponse[] = [];
  
  for (let i = 0; i < count; i++) {
    const response = await makeWorkerRequest(path);
    results.push(response);
    if (i < count - 1) {
      await sleep(interval);
    }
  }
  
  return results;
}

/**
 * 验证代理响应头
 */
export function expectValidProxyHeaders(headers: Headers) {
  expect(headers.get('x-proxy-by')).toBe('api-gateway');
  expect(headers.get('x-proxy-route')).toBeDefined();
  expect(headers.get('x-proxy-target')).toBeDefined();
}

/**
 * 验证限流响应头
 */
export function expectValidRateLimitHeaders(headers: Headers) {
  expect(headers.get('x-ratelimit-limit')).toBeDefined();
  expect(headers.get('x-ratelimit-remaining')).toBeDefined();
}

/**
 * 验证缓存响应头
 */
export function expectValidCacheHeaders(headers: Headers, status: 'HIT' | 'MISS') {
  expect(headers.get('x-cache-status')).toBe(status);
  if (status === 'HIT') {
    expect(headers.get('x-cache-created')).toBeDefined();
  }
}

/**
 * 验证错误响应格式
 */
export function expectErrorResponse(response: TestResponse, expectedStatus: number) {
  expect(response.status).toBe(expectedStatus);
  expect(response.body).toHaveProperty('error');
  expect(typeof response.body.error).toBe('string');
}

/**
 * 验证成功响应格式
 */
export function expectSuccessResponse(response: TestResponse, expectedData?: any) {
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('application/json');
  
  if (expectedData) {
    expect(response.body).toMatchObject(expectedData);
  }
}

/**
 * 生成测试用的随机 IP 地址
 */
export function generateTestIP(): string {
  return `192.168.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
}

/**
 * 生成测试用的随机用户代理
 */
export function generateTestUserAgent(): string {
  const agents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}