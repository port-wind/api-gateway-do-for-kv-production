/**
 * 代理路由集成测试
 * 测试 API 网关的代理功能，包括请求转发、错误处理和性能
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SELF, fetchMock, env } from 'cloudflare:test';
import {
  setupTestConfigs,
  cleanupTestData,
  setupFetchMocks,
  resetFetchMocks,
  createTestRequest,
  createRequestFromIP
} from '../helpers/worker-test-utils';
import {
  makeWorkerRequest,
  expectValidProxyHeaders,
  expectSuccessResponse,
  expectErrorResponse
} from '../helpers/test-utils';
import { initializeD1ForTests } from './setup-d1';

describe('Proxy Routes Integration', () => {
  initializeD1ForTests();

  beforeEach(async () => {
    await setupTestConfigs();
    setupFetchMocks();
  });

  afterEach(async () => {
    await cleanupTestData();
    resetFetchMocks();
  });

  describe('Health Check Endpoints', () => {
    it('should return healthy status for main health endpoint', async () => {
      const response = await makeWorkerRequest('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
    });

    it('should return proxy configuration health', async () => {
      const response = await makeWorkerRequest('/health/proxy');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('routes');
      expect(response.body.routes).toHaveLength(2);

      const kvRoute = response.body.routes.find((r: any) => r.path === '/kv');
      const bizRoute = response.body.routes.find((r: any) => r.path === '/biz-client');

      expect(kvRoute).toBeDefined();
      expect(kvRoute.target).toBe('https://dokv.pwtk.cc');
      expect(kvRoute.cacheEnabled).toBe(true);

      expect(bizRoute).toBeDefined();
      expect(bizRoute.target).toBe('https://biz-client.pwtk.cc');
      expect(bizRoute.cacheEnabled).toBe(true);
    });
  });

  describe('KV Route Proxy (/kv/*)', () => {
    it('should successfully proxy GET requests to dokv.pwtk.cc', async () => {
      const response = await makeWorkerRequest('/kv/suppart-image-service/meta/generations-list');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('source', 'dokv');

      // 验证请求被正确代理
      expect(fetchMock.requests()).toHaveLength(1);
      const proxiedRequest = fetchMock.requests()[0];
      expect(proxiedRequest.url).toContain('https://dokv.pwtk.cc/kv/');
    });

    it('should preserve query parameters in proxy requests', async () => {
      const response = await makeWorkerRequest('/kv/test?param=value&foo=bar');

      expect(response.status).toBe(200);

      const proxiedRequest = fetchMock.requests()[0];
      expect(proxiedRequest.url).toContain('param=value');
      expect(proxiedRequest.url).toContain('foo=bar');
    });

    it('should handle POST requests with body', async () => {
      const testData = { test: 'data', id: 123 };
      const response = await SELF.fetch('http://localhost/kv/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testData)
      });

      expect(response.status).toBe(200);

      const proxiedRequest = fetchMock.requests()[0];
      expect(proxiedRequest.method).toBe('POST');
      expect(proxiedRequest.headers.get('content-type')).toBe('application/json');
    });

    it('should handle PUT and DELETE requests', async () => {
      // PUT 请求
      const putResponse = await SELF.fetch('http://localhost/kv/update/123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'updated' })
      });
      expect(putResponse.status).toBe(200);

      // DELETE 请求
      const deleteResponse = await SELF.fetch('http://localhost/kv/delete/123', {
        method: 'DELETE'
      });
      expect(deleteResponse.status).toBe(200);

      // 验证两个请求都被代理
      expect(fetchMock.requests()).toHaveLength(2);
      expect(fetchMock.requests()[0].method).toBe('PUT');
      expect(fetchMock.requests()[1].method).toBe('DELETE');
    });

    it('should preserve request headers', async () => {
      const customHeaders = {
        'X-Custom-Header': 'test-value',
        'Authorization': 'Bearer test-token',
        'User-Agent': 'test-agent/1.0'
      };

      await SELF.fetch('http://localhost/kv/test', {
        headers: customHeaders
      });

      const proxiedRequest = fetchMock.requests()[0];
      expect(proxiedRequest.headers.get('x-custom-header')).toBe('test-value');
      expect(proxiedRequest.headers.get('authorization')).toBe('Bearer test-token');
      expect(proxiedRequest.headers.get('user-agent')).toBe('test-agent/1.0');
    });
  });

  describe('Biz-Client Route Proxy (/biz-client/*)', () => {
    it('should successfully proxy requests to biz-client.pwtk.cc', async () => {
      const response = await makeWorkerRequest('/biz-client/api/status');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('source', 'biz-client');

      const proxiedRequest = fetchMock.requests()[0];
      expect(proxiedRequest.url).toContain('https://biz-client.pwtk.cc/biz-client/');
    });

    it('should handle nested paths correctly', async () => {
      const response = await makeWorkerRequest('/biz-client/api/v1/users/profile');

      expect(response.status).toBe(200);

      const proxiedRequest = fetchMock.requests()[0];
      expect(proxiedRequest.url).toContain('/biz-client/api/v1/users/profile');
    });

    it('should support different HTTP methods', async () => {
      const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

      for (const method of methods) {
        await SELF.fetch('http://localhost/biz-client/api/test', {
          method,
          body: method !== 'GET' ? JSON.stringify({ test: true }) : undefined,
          headers: method !== 'GET' ? { 'Content-Type': 'application/json' } : undefined
        });
      }

      expect(fetchMock.requests()).toHaveLength(methods.length);
      methods.forEach((method, index) => {
        expect(fetchMock.requests()[index].method).toBe(method);
      });
    });
  });

  describe('Request Processing and Middleware Integration', () => {
    it('should apply rate limiting before proxying', async () => {
      const testIP = '192.168.1.100';

      // 发送多个请求以触发限流
      for (let i = 0; i < 65; i++) { // 超过默认限制 60
        await SELF.fetch('http://localhost/kv/test', {
          headers: { 'CF-Connecting-IP': testIP }
        });
      }

      // 最后一个请求应该被限流
      const lastResponse = await SELF.fetch('http://localhost/kv/test', {
        headers: { 'CF-Connecting-IP': testIP }
      });

      expect(lastResponse.status).toBe(429);
      const error = await lastResponse.json();
      expect(error.error).toContain('Rate limit exceeded');
    });

    it('should apply geo-blocking when configured', async () => {
      // 更新地域配置以阻止某个国家
      const geoConfig = {
        enabled: true,
        mode: 'blacklist' as const,
        countries: ['CN'],
        pathOverrides: {}
      };
      await env.KV.put('config:geo', JSON.stringify(geoConfig));

      const blockedResponse = await SELF.fetch('http://localhost/kv/test', {
        // 模拟来自中国的请求
        // @ts-ignore
        cf: { country: 'CN' }
      });

      expect(blockedResponse.status).toBe(403);
      const error = await blockedResponse.json();
      expect(error.error).toContain('Geographic access denied');
    });

    it('should cache responses when configured', async () => {
      // 第一次请求
      const response1 = await makeWorkerRequest('/kv/cacheable-resource');
      expect(response1.status).toBe(200);

      // 第二次请求应该从缓存返回
      const response2 = await makeWorkerRequest('/kv/cacheable-resource');
      expect(response2.status).toBe(200);

      // 验证缓存头
      expect(response2.headers.get('x-cache-status')).toBe('HIT');
    });
  });

  describe('Error Handling', () => {
    it('should handle upstream server errors gracefully', async () => {
      // 配置 mock 返回 500 错误
      fetchMock
        .get('https://dokv.pwtk.cc')
        .intercept({ path: '/kv/error' })
        .reply(500, { error: 'Internal Server Error' });

      const response = await makeWorkerRequest('/kv/error');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle upstream timeout', async () => {
      // 配置一个非常慢的响应
      fetchMock
        .get('https://dokv.pwtk.cc')
        .intercept({ path: '/kv/slow' })
        .delay(10000) // 10 秒延迟
        .reply(200, { status: 'ok' });

      const response = await makeWorkerRequest('/kv/slow');

      // 应该超时或返回错误
      expect(response.status).not.toBe(200);
    });

    it('should handle malformed upstream responses', async () => {
      fetchMock
        .get('https://dokv.pwtk.cc')
        .intercept({ path: '/kv/malformed' })
        .reply(200, 'invalid-json{');

      const response = await makeWorkerRequest('/kv/malformed');

      // 应该仍然返回响应，但可能有警告头
      expect(response.status).toBe(200);
    });

    it('should handle network connection errors', async () => {
      // 配置网络错误
      fetchMock
        .get('https://dokv.pwtk.cc')
        .intercept({ path: '/kv/network-error' })
        .networkError();

      const response = await makeWorkerRequest('/kv/network-error');

      expect(response.status).toBe(502); // Bad Gateway
      const error = await response.json();
      expect(error.error).toContain('upstream');
    });
  });

  describe('Route Matching and Path Resolution', () => {
    it('should not match non-proxy routes', async () => {
      const response = await makeWorkerRequest('/admin/cache/config');

      // 管理路由应该被直接处理，而不是代理
      expect(response.status).toBe(200);
      expect(fetchMock.requests()).toHaveLength(0); // 没有代理请求
    });

    it('should handle root proxy paths correctly', async () => {
      const kvRootResponse = await makeWorkerRequest('/kv');
      const bizRootResponse = await makeWorkerRequest('/biz-client');

      expect(kvRootResponse.status).toBe(200);
      expect(bizRootResponse.status).toBe(200);
      expect(fetchMock.requests()).toHaveLength(2);
    });

    it('should preserve exact path structure in upstream requests', async () => {
      const testPath = '/kv/very/deep/nested/path/with/file.json';
      await makeWorkerRequest(testPath);

      const proxiedRequest = fetchMock.requests()[0];
      expect(proxiedRequest.url).toContain(testPath);
    });

    it('should handle special characters in paths', async () => {
      const testPath = '/kv/path with spaces/special@chars/file.json?query=test%20value';
      await makeWorkerRequest(testPath);

      const proxiedRequest = fetchMock.requests()[0];
      expect(proxiedRequest.url).toContain('path%20with%20spaces');
      expect(proxiedRequest.url).toContain('special@chars');
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle multiple concurrent requests', async () => {
      const concurrentRequests = 10;
      const promises = Array.from({ length: concurrentRequests }, (_, i) =>
        makeWorkerRequest(`/kv/concurrent-test-${i}`)
      );

      const responses = await Promise.all(promises);

      // 所有请求都应该成功
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // 所有请求都应该被代理
      expect(fetchMock.requests()).toHaveLength(concurrentRequests);
    });

    it('should handle mixed route requests concurrently', async () => {
      const kvRequests = Array.from({ length: 5 }, (_, i) =>
        makeWorkerRequest(`/kv/test-${i}`)
      );

      const bizRequests = Array.from({ length: 5 }, (_, i) =>
        makeWorkerRequest(`/biz-client/test-${i}`)
      );

      const allResponses = await Promise.all([...kvRequests, ...bizRequests]);

      allResponses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // 验证请求被发送到正确的上游
      const proxiedRequests = fetchMock.requests();
      const kvProxied = proxiedRequests.filter(req => req.url.includes('dokv.pwtk.cc'));
      const bizProxied = proxiedRequests.filter(req => req.url.includes('biz-client.pwtk.cc'));

      expect(kvProxied).toHaveLength(5);
      expect(bizProxied).toHaveLength(5);
    });

    it('should maintain reasonable response times', async () => {
      const startTime = Date.now();

      const response = await makeWorkerRequest('/kv/performance-test');

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(1000); // 少于 1 秒
    });
  });

  describe('Request and Response Headers', () => {
    it('should add proxy identification headers', async () => {
      const response = await SELF.fetch('http://localhost/kv/test');

      expect(response.headers.get('x-proxy-by')).toBe('api-gateway');
      expect(response.headers.get('x-proxy-route')).toBeDefined();
      expect(response.headers.get('x-proxy-target')).toBeDefined();
    });

    it('should preserve upstream response headers', async () => {
      fetchMock
        .get('https://dokv.pwtk.cc')
        .intercept({ path: '/kv/with-headers' })
        .reply(200, { data: 'test' }, {
          'X-Custom-Header': 'upstream-value',
          'Cache-Control': 'max-age=3600'
        });

      const response = await SELF.fetch('http://localhost/kv/with-headers');

      expect(response.headers.get('x-custom-header')).toBe('upstream-value');
      expect(response.headers.get('cache-control')).toBe('max-age=3600');
    });

    it('should handle CORS headers appropriately', async () => {
      const response = await SELF.fetch('http://localhost/kv/cors-test', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://example.com',
          'Access-Control-Request-Method': 'POST'
        }
      });

      // 验证 CORS 预检请求处理
      expect(response.headers.get('access-control-allow-origin')).toBeDefined();
      expect(response.headers.get('access-control-allow-methods')).toBeDefined();
    });
  });

  describe('Security and Validation', () => {
    it('should not expose sensitive headers from upstream', async () => {
      fetchMock
        .get('https://dokv.pwtk.cc')
        .intercept({ path: '/kv/sensitive' })
        .reply(200, { data: 'test' }, {
          'Server': 'nginx/1.0',
          'X-Powered-By': 'PHP/7.4'
        });

      const response = await SELF.fetch('http://localhost/kv/sensitive');

      // 某些服务器头应该被过滤或替换
      expect(response.headers.get('server')).toBe('api-gateway');
    });

    it('should validate and sanitize proxy requests', async () => {
      // 尝试包含恶意内容的请求
      const response = await SELF.fetch('http://localhost/kv/../../../etc/passwd');

      // 应该被正确处理，不允许路径遍历
      expect(response.status).toBe(200);

      const proxiedRequest = fetchMock.requests()[0];
      expect(proxiedRequest.url).not.toContain('../');
    });

    it('should handle extremely large requests appropriately', async () => {
      const largeBody = 'x'.repeat(1024 * 1024); // 1MB body

      const response = await SELF.fetch('http://localhost/kv/large-request', {
        method: 'POST',
        body: largeBody,
        headers: { 'Content-Type': 'text/plain' }
      });

      // 应该处理大请求或返回适当错误
      expect([200, 413]).toContain(response.status); // 200 OK 或 413 Payload Too Large
    });
  });
});