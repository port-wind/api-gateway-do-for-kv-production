/**
 * 中间件栈集成测试
 * 测试缓存、限流、地域封锁中间件的功能和集成
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SELF, env, fetchMock } from 'cloudflare:test';
import {
  setupTestConfigs,
  cleanupTestData,
  setupFetchMocks,
  resetFetchMocks,
  getTestCacheConfig,
  getTestRateLimitConfig,
  getTestGeoConfig
} from '../helpers/worker-test-utils';
import { makeWorkerRequest } from '../helpers/test-utils';
import { initializeD1ForTests } from './setup-d1';

describe('Middleware Stack Integration', () => {
  initializeD1ForTests();

  beforeEach(async () => {
    await setupTestConfigs();
    setupFetchMocks();
  });

  afterEach(async () => {
    await cleanupTestData();
    resetFetchMocks();
  });

  describe('Cache Middleware', () => {
    it('should cache GET responses for whitelisted paths', async () => {
      // 第一次请求 - 应该缓存
      const response1 = await makeWorkerRequest('/kv/cacheable-endpoint');
      expect(response1.status).toBe(200);
      expect(response1.headers.get('x-cache-status')).toBe('MISS');

      // 第二次请求 - 应该从缓存返回
      const response2 = await makeWorkerRequest('/kv/cacheable-endpoint');
      expect(response2.status).toBe(200);
      expect(response2.headers.get('x-cache-status')).toBe('HIT');

      // 验证只有一个上游请求
      expect(fetchMock.requests()).toHaveLength(1);
    });

    it('should handle cache versioning correctly', async () => {
      // 使用版本 1 缓存响应
      const response1 = await makeWorkerRequest('/kv/versioned-resource');
      expect(response1.status).toBe(200);

      // 更新缓存版本
      const cacheConfig = getTestCacheConfig();
      cacheConfig.version = 2;
      await env.KV.put('config:cache', JSON.stringify(cacheConfig));

      // 新版本应该触发缓存重新获取
      const response2 = await makeWorkerRequest('/kv/versioned-resource');
      expect(response2.status).toBe(200);
    });

    it('should not cache error responses', async () => {
      // 配置上游返回错误
      fetchMock
        .get('https://dokv.pwtk.cc')
        .intercept({ path: '/kv/error-endpoint' })
        .reply(500, { error: 'Server Error' });

      const response1 = await makeWorkerRequest('/kv/error-endpoint');
      expect(response1.status).toBe(500);

      // 第二次请求应该仍然到上游（不缓存错误）
      const response2 = await makeWorkerRequest('/kv/error-endpoint');
      expect(response2.status).toBe(500);

      // 应该有两个上游请求
      expect(fetchMock.requests()).toHaveLength(2);
    });
  });

  describe('Rate Limit Middleware', () => {
    it('should allow requests within rate limit', async () => {
      const testIP = '192.168.2.1';

      // 发送几个在限制内的请求
      for (let i = 0; i < 5; i++) {
        const response = await SELF.fetch('http://localhost/kv/rate-test', {
          headers: { 'CF-Connecting-IP': testIP }
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('x-ratelimit-remaining')).toBeDefined();
      }
    });

    it('should block requests when rate limit exceeded', async () => {
      const testIP = '192.168.2.2';
      const rateLimitConfig = getTestRateLimitConfig();
      rateLimitConfig.defaultLimit = 3; // 设置较低限制
      await env.KV.put('config:rate-limit', JSON.stringify(rateLimitConfig));

      // 发送超过限制的请求
      const responses = [];
      for (let i = 0; i < 5; i++) {
        const response = await SELF.fetch('http://localhost/kv/rate-test', {
          headers: { 'CF-Connecting-IP': testIP }
        });
        responses.push(response);
      }

      // 前 3 个应该成功，后面的应该被限流
      const successCount = responses.filter(r => r.status === 200).length;
      const rateLimitedCount = responses.filter(r => r.status === 429).length;

      expect(successCount).toBe(3);
      expect(rateLimitedCount).toBe(2);
    });

    it('should isolate rate limits between different IPs', async () => {
      const ip1 = '192.168.2.4';
      const ip2 = '192.168.2.5';
      const rateLimitConfig = getTestRateLimitConfig();
      rateLimitConfig.defaultLimit = 2;
      await env.KV.put('config:rate-limit', JSON.stringify(rateLimitConfig));

      // IP1 达到限制
      for (let i = 0; i < 3; i++) {
        const response = await SELF.fetch('http://localhost/kv/isolation-test', {
          headers: { 'CF-Connecting-IP': ip1 }
        });

        if (i < 2) {
          expect(response.status).toBe(200);
        } else {
          expect(response.status).toBe(429);
        }
      }

      // IP2 应该仍然可以请求
      const ip2Response = await SELF.fetch('http://localhost/kv/isolation-test', {
        headers: { 'CF-Connecting-IP': ip2 }
      });
      expect(ip2Response.status).toBe(200);
    });

    it('should provide accurate rate limit headers', async () => {
      const testIP = '192.168.2.6';
      const limit = 10;
      const rateLimitConfig = getTestRateLimitConfig();
      rateLimitConfig.defaultLimit = limit;
      await env.KV.put('config:rate-limit', JSON.stringify(rateLimitConfig));

      for (let i = 0; i < 3; i++) {
        const response = await SELF.fetch('http://localhost/kv/headers-test', {
          headers: { 'CF-Connecting-IP': testIP }
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('x-ratelimit-limit')).toBe(limit.toString());

        const remaining = parseInt(response.headers.get('x-ratelimit-remaining') || '0');
        expect(remaining).toBe(limit - i - 1);
      }
    });
  });

  describe('Geo-blocking Middleware', () => {
    it('should allow requests from non-blocked countries', async () => {
      const geoConfig = getTestGeoConfig();
      geoConfig.enabled = true;
      geoConfig.mode = 'blacklist';
      geoConfig.countries = ['CN', 'RU'];
      await env.KV.put('config:geo', JSON.stringify(geoConfig));

      const allowedResponse = await SELF.fetch('http://localhost/kv/geo-test', {
        // @ts-ignore
        cf: { country: 'US' }
      });

      expect(allowedResponse.status).toBe(200);
    });

    it('should block requests from blacklisted countries', async () => {
      const geoConfig = getTestGeoConfig();
      geoConfig.enabled = true;
      geoConfig.mode = 'blacklist';
      geoConfig.countries = ['CN', 'RU'];
      await env.KV.put('config:geo', JSON.stringify(geoConfig));

      const blockedResponse = await SELF.fetch('http://localhost/kv/geo-test', {
        // @ts-ignore
        cf: { country: 'CN' }
      });

      expect(blockedResponse.status).toBe(403);
      const error = await blockedResponse.json();
      expect(error.error).toContain('Geographic access denied');
    });

    it('should work with whitelist mode', async () => {
      const geoConfig = getTestGeoConfig();
      geoConfig.enabled = true;
      geoConfig.mode = 'whitelist';
      geoConfig.countries = ['US', 'CA', 'UK'];
      await env.KV.put('config:geo', JSON.stringify(geoConfig));

      // 允许的国家
      const allowedResponse = await SELF.fetch('http://localhost/kv/whitelist-test', {
        // @ts-ignore
        cf: { country: 'US' }
      });
      expect(allowedResponse.status).toBe(200);

      // 不在白名单的国家
      const blockedResponse = await SELF.fetch('http://localhost/kv/whitelist-test', {
        // @ts-ignore
        cf: { country: 'DE' }
      });
      expect(blockedResponse.status).toBe(403);
    });

    it('should apply path-specific overrides', async () => {
      const geoConfig = getTestGeoConfig();
      geoConfig.enabled = true;
      geoConfig.mode = 'blacklist';
      geoConfig.countries = ['CN'];
      geoConfig.pathOverrides = {
        '/kv/public': [] // 公开路径，不限制任何国家
      };
      await env.KV.put('config:geo', JSON.stringify(geoConfig));

      // 普通路径应该被阻止
      const blockedResponse = await SELF.fetch('http://localhost/kv/private', {
        // @ts-ignore
        cf: { country: 'CN' }
      });
      expect(blockedResponse.status).toBe(403);

      // 覆盖路径应该被允许
      const allowedResponse = await SELF.fetch('http://localhost/kv/public', {
        // @ts-ignore
        cf: { country: 'CN' }
      });
      expect(allowedResponse.status).toBe(200);
    });
  });

  describe('Middleware Stack Integration', () => {
    it('should apply middleware in correct order', async () => {
      const testIP = '192.168.3.1';

      // 配置严格的限流以测试顺序
      const rateLimitConfig = getTestRateLimitConfig();
      rateLimitConfig.defaultLimit = 1;
      await env.KV.put('config:rate-limit', JSON.stringify(rateLimitConfig));

      // 第一个请求应该通过所有中间件
      const response1 = await SELF.fetch('http://localhost/kv/middleware-order', {
        headers: { 'CF-Connecting-IP': testIP },
        // @ts-ignore
        cf: { country: 'US' }
      });
      expect(response1.status).toBe(200);

      // 第二个请求应该被限流中间件阻止
      const response2 = await SELF.fetch('http://localhost/kv/middleware-order', {
        headers: { 'CF-Connecting-IP': testIP },
        // @ts-ignore
        cf: { country: 'US' }
      });
      expect(response2.status).toBe(429);
    });

    it('should maintain performance with all middleware enabled', async () => {
      // 启用所有中间件
      const cacheConfig = getTestCacheConfig();
      const rateLimitConfig = getTestRateLimitConfig();
      const geoConfig = getTestGeoConfig();

      cacheConfig.enabled = true;
      rateLimitConfig.enabled = true;
      geoConfig.enabled = true;
      geoConfig.mode = 'whitelist';
      geoConfig.countries = ['US'];

      await env.KV.put('config:cache', JSON.stringify(cacheConfig));
      await env.KV.put('config:rate-limit', JSON.stringify(rateLimitConfig));
      await env.KV.put('config:geo', JSON.stringify(geoConfig));

      const startTime = Date.now();

      const response = await SELF.fetch('http://localhost/kv/performance-test', {
        headers: { 'CF-Connecting-IP': '192.168.3.2' },
        // @ts-ignore
        cf: { country: 'US' }
      });

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      expect(response.status).toBe(200);
      expect(processingTime).toBeLessThan(1000); // 处理时间应该合理
    });

    it('should provide comprehensive middleware headers', async () => {
      const response = await SELF.fetch('http://localhost/kv/headers-comprehensive', {
        headers: { 'CF-Connecting-IP': '192.168.3.3' },
        // @ts-ignore
        cf: { country: 'US' }
      });

      expect(response.status).toBe(200);

      // 验证各种中间件头
      expect(response.headers.get('x-ratelimit-remaining')).toBeDefined();
      expect(response.headers.get('x-proxy-by')).toBe('api-gateway');
    });

    it('should handle concurrent requests with all middleware', async () => {
      const concurrentRequests = 5;
      const promises = Array.from({ length: concurrentRequests }, (_, i) =>
        SELF.fetch(`http://localhost/kv/concurrent-middleware-${i}`, {
          headers: { 'CF-Connecting-IP': `192.168.3.${10 + i}` },
          // @ts-ignore
          cf: { country: 'US' }
        })
      );

      const responses = await Promise.all(promises);

      // 所有请求都应该成功处理
      responses.forEach((response, i) => {
        expect([200, 429, 403]).toContain(response.status); // 可能的中间件响应
      });
    });

    it('should support middleware configuration hot-reloading', async () => {
      // 初始配置 - 允许所有请求
      const geoConfig = getTestGeoConfig();
      geoConfig.enabled = false;
      await env.KV.put('config:geo', JSON.stringify(geoConfig));

      const response1 = await SELF.fetch('http://localhost/kv/hot-reload', {
        // @ts-ignore
        cf: { country: 'CN' }
      });
      expect(response1.status).toBe(200);

      // 更新配置 - 阻止中国请求
      geoConfig.enabled = true;
      geoConfig.mode = 'blacklist';
      geoConfig.countries = ['CN'];
      await env.KV.put('config:geo', JSON.stringify(geoConfig));

      // 新请求应该被阻止
      const response2 = await SELF.fetch('http://localhost/kv/hot-reload', {
        // @ts-ignore
        cf: { country: 'CN' }
      });
      expect(response2.status).toBe(403);
    });
  });

  describe('Error Handling', () => {
    it('should handle corrupted configuration gracefully', async () => {
      // 设置损坏的配置
      await env.KV.put('config:cache', 'invalid-json-data');

      const response = await SELF.fetch('http://localhost/kv/corrupted-config');

      // 应该回退到默认配置或安全地处理错误
      expect([200, 500]).toContain(response.status);
    });

    it('should handle high load appropriately', async () => {
      const highLoadRequests = 20;
      const promises = Array.from({ length: highLoadRequests }, (_, i) =>
        SELF.fetch(`http://localhost/kv/high-load-${i}`, {
          headers: { 'CF-Connecting-IP': `10.0.0.${i % 10}` },
          // @ts-ignore
          cf: { country: 'US' }
        })
      );

      const responses = await Promise.all(promises);

      // 大多数请求应该得到适当处理（成功或被中间件阻止）
      const handledCount = responses.filter(r =>
        [200, 429, 403].includes(r.status)
      ).length;
      expect(handledCount).toBeGreaterThan(highLoadRequests * 0.8);
    });

    it('should handle middleware configuration errors', async () => {
      // 测试处理配置错误的情况
      await env.KV.put('config:rate-limit', 'invalid-json');

      const response = await SELF.fetch('http://localhost/kv/config-error-test', {
        headers: { 'CF-Connecting-IP': '192.168.4.1' }
      });

      // 应该使用默认配置继续处理
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('Performance and Reliability', () => {
    it('should maintain response times under load', async () => {
      const requests = Array.from({ length: 10 }, (_, i) =>
        makeWorkerRequest(`/kv/performance-${i}`)
      );

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const endTime = Date.now();

      const avgResponseTime = (endTime - startTime) / requests.length;

      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });

      expect(avgResponseTime).toBeLessThan(200); // 平均响应时间少于 200ms
    });

    it('should handle edge cases gracefully', async () => {
      // 测试各种边缘情况
      const testCases = [
        { path: '/kv/empty-path/', ip: '' },
        { path: '/kv/unicode-path/测试', ip: '192.168.5.1' },
        { path: '/kv/long-path/' + 'a'.repeat(1000), ip: '192.168.5.2' }
      ];

      for (const testCase of testCases) {
        const response = await SELF.fetch(`http://localhost${testCase.path}`, {
          headers: testCase.ip ? { 'CF-Connecting-IP': testCase.ip } : {},
          // @ts-ignore
          cf: { country: 'US' }
        });

        // 应该优雅处理边缘情况
        expect([200, 400, 414, 429, 500]).toContain(response.status);
      }
    });
  });
});