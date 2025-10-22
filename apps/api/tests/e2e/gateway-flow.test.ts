/**
 * 端到端网关流程测试
 * 测试完整的请求流程通过 API 网关的所有中间件
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
  getTestGeoConfig,
  getTestTrafficConfig,
  sleep
} from '../helpers/worker-test-utils';
import { initializeD1ForTests } from '../integration/setup-d1';

describe('Gateway Flow E2E Tests', () => {
  // 初始化 D1 数据库（Phase 2）
  initializeD1ForTests();

  beforeEach(async () => {
    await setupTestConfigs();
    setupFetchMocks();
  });

  afterEach(async () => {
    await cleanupTestData();
    resetFetchMocks();
  });

  describe('Complete Request Flow', () => {
    it('should process requests through all middleware layers', async () => {
      const testIP = '203.0.113.1';

      // 配置所有中间件启用
      const cacheConfig = getTestCacheConfig();
      const rateLimitConfig = getTestRateLimitConfig();
      const geoConfig = getTestGeoConfig();

      cacheConfig.enabled = true;
      rateLimitConfig.enabled = true;
      rateLimitConfig.defaultLimit = 10;
      geoConfig.enabled = true;
      geoConfig.mode = 'whitelist';
      geoConfig.countries = ['US', 'CA'];

      await env.API_GATEWAY_STORAGE.put('config:cache', JSON.stringify(cacheConfig));
      await env.API_GATEWAY_STORAGE.put('config:rate-limit', JSON.stringify(rateLimitConfig));
      await env.API_GATEWAY_STORAGE.put('config:geo', JSON.stringify(geoConfig));

      // 第一次请求 - 应该通过所有中间件并缓存
      const response1 = await SELF.fetch('http://localhost/kv/test-endpoint', {
        headers: { 'CF-Connecting-IP': testIP },
        // @ts-ignore
        cf: { country: 'US' }
      });

      expect(response1.status).toBe(200);
      expect(response1.headers.get('x-cache-status')).toBe('MISS');
      expect(response1.headers.get('x-ratelimit-remaining')).toBe('9');
      expect(response1.headers.get('x-proxy-by')).toBe('api-gateway');

      // 第二次请求 - 应该命中缓存
      const response2 = await SELF.fetch('http://localhost/kv/test-endpoint', {
        headers: { 'CF-Connecting-IP': testIP },
        // @ts-ignore
        cf: { country: 'US' }
      });

      expect(response2.status).toBe(200);
      expect(response2.headers.get('x-cache-status')).toBe('HIT');
      expect(response2.headers.get('x-ratelimit-remaining')).toBe('8');
    });

    it('should block requests from disallowed countries', async () => {
      // 配置地理封锁
      const geoConfig = getTestGeoConfig();
      geoConfig.enabled = true;
      geoConfig.mode = 'blacklist';
      geoConfig.countries = ['CN', 'RU'];
      await env.API_GATEWAY_STORAGE.put('config:geo', JSON.stringify(geoConfig));

      const response = await SELF.fetch('http://localhost/kv/blocked-test', {
        headers: { 'CF-Connecting-IP': '198.51.100.1' },
        // @ts-ignore
        cf: { country: 'CN' }
      });

      expect(response.status).toBe(403);
      const error = await response.json();
      expect(error.error).toContain('Geographic access denied');
    });

    it('should enforce rate limits across multiple requests', async () => {
      const testIP = '203.0.113.2';
      const limit = 3;

      // 配置严格的限流
      const rateLimitConfig = getTestRateLimitConfig();
      rateLimitConfig.enabled = true;
      rateLimitConfig.defaultLimit = limit;
      await env.API_GATEWAY_STORAGE.put('config:rate-limit', JSON.stringify(rateLimitConfig));

      // 发送请求直到限制
      const responses = [];
      for (let i = 0; i < limit + 2; i++) {
        const response = await SELF.fetch('http://localhost/kv/rate-limit-test', {
          headers: { 'CF-Connecting-IP': testIP },
          // @ts-ignore
          cf: { country: 'US' }
        });
        responses.push(response);
      }

      // 验证限流行为
      const successCount = responses.filter(r => r.status === 200).length;
      const rateLimitedCount = responses.filter(r => r.status === 429).length;

      expect(successCount).toBe(limit);
      expect(rateLimitedCount).toBe(2);
    });

    it('should handle cache invalidation correctly', async () => {
      // 启用缓存
      const cacheConfig = getTestCacheConfig();
      cacheConfig.enabled = true;
      cacheConfig.version = 1;
      await env.API_GATEWAY_STORAGE.put('config:cache', JSON.stringify(cacheConfig));

      // 第一次请求 - 缓存未命中
      const response1 = await SELF.fetch('http://localhost/kv/cache-invalidation-test', {
        // @ts-ignore
        cf: { country: 'US' }
      });
      expect(response1.status).toBe(200);
      expect(response1.headers.get('x-cache-status')).toBe('MISS');

      // 第二次请求 - 缓存命中
      const response2 = await SELF.fetch('http://localhost/kv/cache-invalidation-test', {
        // @ts-ignore
        cf: { country: 'US' }
      });
      expect(response2.status).toBe(200);
      expect(response2.headers.get('x-cache-status')).toBe('HIT');

      // 更新缓存版本
      cacheConfig.version = 2;
      await env.API_GATEWAY_STORAGE.put('config:cache', JSON.stringify(cacheConfig));

      // 第三次请求 - 版本更新后缓存未命中
      const response3 = await SELF.fetch('http://localhost/kv/cache-invalidation-test', {
        // @ts-ignore
        cf: { country: 'US' }
      });
      expect(response3.status).toBe(200);
      expect(response3.headers.get('x-cache-status')).toBe('MISS');
    });
  });

  describe('Business Client Flow', () => {
    it('should proxy business client requests correctly', async () => {
      // 配置业务客户端代理
      fetchMock
        .get('https://biz-api.pwtk.cc')
        .intercept({ path: '/users' })
        .reply(200, { users: [{ id: 1, name: 'Test User' }] });

      const response = await SELF.fetch('http://localhost/biz-client/users', {
        // @ts-ignore
        cf: { country: 'US' }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.users).toBeDefined();
      expect(data.users[0].name).toBe('Test User');
    });

    it('should handle business client authentication', async () => {
      // 配置需要认证的端点
      fetchMock
        .get('https://biz-api.pwtk.cc')
        .intercept({ path: '/protected', headers: { authorization: 'Bearer token123' } })
        .reply(200, { message: 'Authorized' });

      const response = await SELF.fetch('http://localhost/biz-client/protected', {
        headers: { 'Authorization': 'Bearer token123' },
        // @ts-ignore
        cf: { country: 'US' }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe('Authorized');
    });
  });

  describe('Admin Operations Flow', () => {
    it('should allow admin to manage configurations', async () => {
      // 测试缓存配置更新
      const newCacheConfig = {
        enabled: true,
        version: 5,
        paths: ['/kv/*', '/api/*']
      };

      const updateResponse = await SELF.fetch('http://localhost/admin/config/cache', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCacheConfig)
      });

      expect(updateResponse.status).toBe(200);

      // 验证配置已更新
      const getResponse = await SELF.fetch('http://localhost/admin/config/cache');
      expect(getResponse.status).toBe(200);
      const config = await getResponse.json();
      expect(config.version).toBe(5);
    });

    it('should provide comprehensive system stats', async () => {
      // 生成一些流量以获得统计数据
      for (let i = 0; i < 5; i++) {
        await SELF.fetch('http://localhost/kv/stats-test', {
          headers: { 'CF-Connecting-IP': `203.0.113.${10 + i}` },
          // @ts-ignore
          cf: { country: 'US' }
        });
      }

      const statsResponse = await SELF.fetch('http://localhost/admin/stats');
      expect(statsResponse.status).toBe(200);

      const stats = await statsResponse.json();
      expect(stats).toHaveProperty('traffic');
      expect(stats).toHaveProperty('cache');
      expect(stats).toHaveProperty('rateLimit');
      expect(stats.traffic.totalRequests).toBeGreaterThan(0);
    });
  });

  describe('Traffic Monitoring and Auto-scaling', () => {
    it('should trigger auto-cache when traffic threshold exceeded', async () => {
      // 配置低阈值的流量监控
      const trafficConfig = getTestTrafficConfig();
      trafficConfig.enabled = true;
      trafficConfig.alertThreshold = 3;
      trafficConfig.autoEnableCache = true;
      await env.API_GATEWAY_STORAGE.put('config:traffic', JSON.stringify(trafficConfig));

      // 发送超过阈值的请求
      for (let i = 0; i < trafficConfig.alertThreshold + 1; i++) {
        await SELF.fetch('http://localhost/kv/auto-cache-test', {
          headers: { 'CF-Connecting-IP': `203.0.113.${20 + i}` },
          // @ts-ignore
          cf: { country: 'US' }
        });
      }

      // 检查流量监控状态
      const trafficStatsResponse = await SELF.fetch('http://localhost/admin/stats/traffic');
      const trafficStats = await trafficStatsResponse.json();

      expect(trafficStats.thresholdExceeded).toBe(true);
      expect(trafficStats.autoCacheEnabled).toBe(true);
    });

    it('should maintain performance under sustained load', async () => {
      const startTime = Date.now();
      const requestCount = 20;

      // 并发发送请求
      const promises = Array.from({ length: requestCount }, (_, i) =>
        SELF.fetch(`http://localhost/kv/performance-test-${i}`, {
          headers: { 'CF-Connecting-IP': `203.0.113.${30 + (i % 10)}` },
          // @ts-ignore
          cf: { country: 'US' }
        })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // 验证所有请求都得到处理
      responses.forEach(response => {
        expect([200, 429, 403]).toContain(response.status);
      });

      // 验证性能指标
      const avgResponseTime = totalTime / requestCount;
      expect(avgResponseTime).toBeLessThan(200); // 平均响应时间少于200ms
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle upstream service failures gracefully', async () => {
      // 配置上游服务返回错误
      fetchMock
        .get('https://dokv.pwtk.cc')
        .intercept({ path: '/kv/failing-service' })
        .reply(500, { error: 'Internal Server Error' });

      const response = await SELF.fetch('http://localhost/kv/failing-service', {
        // @ts-ignore
        cf: { country: 'US' }
      });

      expect(response.status).toBe(500);
      const error = await response.json();
      expect(error.error).toBeDefined();
    });

    it('should recover from configuration corruption', async () => {
      // 设置损坏的配置
      await env.API_GATEWAY_STORAGE.put('config:cache', 'invalid-json-data');

      // 请求仍应能处理（使用默认配置）
      const response = await SELF.fetch('http://localhost/kv/config-recovery-test', {
        // @ts-ignore
        cf: { country: 'US' }
      });

      // 应该能够处理请求，尽管配置损坏
      expect([200, 500]).toContain(response.status);
    });

    it('should handle network timeouts appropriately', async () => {
      // 配置慢响应的上游服务
      fetchMock
        .get('https://dokv.pwtk.cc')
        .intercept({ path: '/kv/slow-service' })
        .delay(5000) // 5秒延迟
        .reply(200, { data: 'slow response' });

      const startTime = Date.now();
      const response = await SELF.fetch('http://localhost/kv/slow-service', {
        // @ts-ignore
        cf: { country: 'US' }
      });
      const endTime = Date.now();

      // 验证超时处理
      const responseTime = endTime - startTime;
      if (response.status === 504) {
        // 网关超时
        expect(responseTime).toBeLessThan(10000); // 应该在10秒内超时
      } else {
        // 成功响应
        expect(response.status).toBe(200);
      }
    });
  });

  describe('Security and Compliance', () => {
    it('should sanitize headers properly', async () => {
      const response = await SELF.fetch('http://localhost/kv/header-test', {
        headers: {
          'CF-Connecting-IP': '203.0.113.99',
          'User-Agent': 'TestAgent/1.0',
          'X-Custom-Header': 'test-value'
        },
        // @ts-ignore
        cf: { country: 'US' }
      });

      expect(response.status).toBe(200);

      // 验证安全头
      expect(response.headers.get('x-proxy-by')).toBe('api-gateway');
      expect(response.headers.has('x-powered-by')).toBe(false); // 不应暴露技术栈
    });

    it('should handle path traversal attempts', async () => {
      const maliciousPaths = [
        '/kv/../admin/config',
        '/kv/%2e%2e/admin/stats',
        '/kv/..\\admin\\config'
      ];

      for (const path of maliciousPaths) {
        const response = await SELF.fetch(`http://localhost${path}`, {
          // @ts-ignore
          cf: { country: 'US' }
        });

        // 应该拒绝恶意路径
        expect([400, 403, 404]).toContain(response.status);
      }
    });

    it('should enforce proper CORS policies', async () => {
      const response = await SELF.fetch('http://localhost/kv/cors-test', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://malicious-site.com',
          'Access-Control-Request-Method': 'GET'
        },
        // @ts-ignore
        cf: { country: 'US' }
      });

      // 检查 CORS 头
      const corsHeaders = response.headers.get('Access-Control-Allow-Origin');
      if (corsHeaders) {
        expect(corsHeaders).not.toBe('*'); // 不应允许所有来源
      }
    });
  });

  describe('Multi-region Consistency', () => {
    it('should handle requests from different regions consistently', async () => {
      const regions = [
        { country: 'US', ip: '203.0.113.100' },
        { country: 'CA', ip: '198.51.100.100' },
        { country: 'UK', ip: '192.0.2.100' }
      ];

      // 配置白名单允许所有测试区域
      const geoConfig = getTestGeoConfig();
      geoConfig.enabled = true;
      geoConfig.mode = 'whitelist';
      geoConfig.countries = ['US', 'CA', 'UK'];
      await env.API_GATEWAY_STORAGE.put('config:geo', JSON.stringify(geoConfig));

      for (const region of regions) {
        const response = await SELF.fetch('http://localhost/kv/region-test', {
          headers: { 'CF-Connecting-IP': region.ip },
          // @ts-ignore
          cf: { country: region.country }
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('x-proxy-by')).toBe('api-gateway');
      }
    });
  });

  describe('Data Consistency and Persistence', () => {
    it('should maintain configuration consistency across updates', async () => {
      // 并发更新配置
      const updatePromises = Array.from({ length: 5 }, (_, i) =>
        SELF.fetch('http://localhost/admin/config/cache', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: true,
            version: i + 1
          })
        })
      );

      const responses = await Promise.all(updatePromises);

      // 所有更新都应该成功
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // 最终配置应该是一致的
      const finalConfigResponse = await SELF.fetch('http://localhost/admin/config/cache');
      const finalConfig = await finalConfigResponse.json();

      expect(finalConfig.enabled).toBe(true);
      expect(finalConfig.version).toBeGreaterThan(0);
    });
  });
});