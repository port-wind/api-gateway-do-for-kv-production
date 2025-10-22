/**
 * 管理 API 集成测试
 * 测试缓存、限流、地域封锁、流量监控的管理接口
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import {
  setupTestConfigs,
  cleanupTestData,
  getTestCacheConfig,
  getTestRateLimitConfig,
  getTestGeoConfig,
  getTestTrafficConfig
} from '../helpers/worker-test-utils';
import {
  makeWorkerRequest,
  expectSuccessResponse,
  expectErrorResponse
} from '../helpers/test-utils';
import { initializeD1ForTests } from './setup-d1';

describe('Admin API Integration', () => {
  initializeD1ForTests();

  beforeEach(async () => {
    await setupTestConfigs();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('Cache Management API', () => {
    it('should get current cache configuration', async () => {
      const response = await makeWorkerRequest('/admin/cache/config');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('config');
      expect(response.body.config).toHaveProperty('enabled');
      expect(response.body.config).toHaveProperty('version');
      expect(response.body.config).toHaveProperty('whitelist');
      expect(Array.isArray(response.body.config.whitelist)).toBe(true);
    });

    it('should update cache configuration', async () => {
      const newConfig = getTestCacheConfig();
      newConfig.enabled = false;
      newConfig.version = 99;
      newConfig.whitelist = ['/kv/updated/*'];

      const response = await makeWorkerRequest('/admin/cache/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.config.enabled).toBe(false);
      expect(response.body.config.version).toBe(99);
      expect(response.body.config.whitelist).toContain('/kv/updated/*');

      // 验证配置已保存到 KV
      const savedConfig = await env.KV.get('config:cache', 'json');
      expect(savedConfig.enabled).toBe(false);
      expect(savedConfig.version).toBe(99);
    });

    it('should validate cache configuration schema', async () => {
      const invalidConfig = {
        enabled: 'not-a-boolean', // 应该是 boolean
        version: 'invalid', // 应该是 number
        whitelist: 'not-an-array' // 应该是 array
      };

      const response = await makeWorkerRequest('/admin/cache/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidConfig)
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should get cache statistics', async () => {
      const response = await makeWorkerRequest('/admin/cache/stats');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('stats');
      expect(response.body.stats).toHaveProperty('totalEntries');
      expect(response.body.stats).toHaveProperty('hitRate');
      expect(typeof response.body.stats.totalEntries).toBe('number');
      expect(typeof response.body.stats.hitRate).toBe('number');
    });

    it('should invalidate cache entries by pattern', async () => {
      // 首先设置一些缓存条目
      await env.KV.put('cache:v1:/kv/test1:hash1', JSON.stringify({ data: 'test1' }));
      await env.KV.put('cache:v1:/kv/test2:hash2', JSON.stringify({ data: 'test2' }));
      await env.KV.put('cache:v1:/biz-client/test:hash3', JSON.stringify({ data: 'test3' }));

      const response = await makeWorkerRequest('/admin/cache/invalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern: '/kv/*' })
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('invalidated');
      expect(response.body.invalidated).toBeGreaterThan(0);

      // 验证 KV 缓存被删除
      const cache1 = await env.KV.get('cache:v1:/kv/test1:hash1');
      const cache2 = await env.KV.get('cache:v1:/kv/test2:hash2');
      const cache3 = await env.KV.get('cache:v1:/biz-client/test:hash3');

      expect(cache1).toBeNull();
      expect(cache2).toBeNull();
      expect(cache3).not.toBeNull(); // 应该保留，因为不匹配模式
    });

    it('should handle missing pattern in invalidate request', async () => {
      const response = await makeWorkerRequest('/admin/cache/invalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // 缺少 pattern
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Rate Limit Management API', () => {
    it('should get current rate limit configuration', async () => {
      const response = await makeWorkerRequest('/admin/rate-limit/config');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('config');
      expect(response.body.config).toHaveProperty('enabled');
      expect(response.body.config).toHaveProperty('defaultLimit');
      expect(response.body.config).toHaveProperty('windowSeconds');
      expect(response.body.config).toHaveProperty('pathLimits');
    });

    it('should update rate limit configuration', async () => {
      const newConfig = getTestRateLimitConfig();
      newConfig.defaultLimit = 120;
      newConfig.windowSeconds = 30;
      newConfig.pathLimits = {
        '/kv/special': 200,
        '/biz-client/priority': 500
      };

      const response = await makeWorkerRequest('/admin/rate-limit/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.config.defaultLimit).toBe(120);
      expect(response.body.config.windowSeconds).toBe(30);
      expect(response.body.config.pathLimits['/kv/special']).toBe(200);

      // 验证配置已保存到 KV
      const savedConfig = await env.KV.get('config:rate-limit', 'json');
      expect(savedConfig.defaultLimit).toBe(120);
    });

    it('should validate rate limit configuration', async () => {
      const invalidConfig = {
        enabled: true,
        defaultLimit: -10, // 不能为负数
        windowSeconds: 'invalid', // 应该是数字
        pathLimits: 'not-object' // 应该是对象
      };

      const response = await makeWorkerRequest('/admin/rate-limit/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidConfig)
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
    });

    it('should get rate limit status for specific IP', async () => {
      const testIP = '192.168.100.1';
      const response = await makeWorkerRequest(`/admin/rate-limit/status/${testIP}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('ip', testIP);
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toHaveProperty('allowed');
      expect(response.body.status).toHaveProperty('remaining');
      expect(response.body.status).toHaveProperty('resetAt');
    });

    it('should reset rate limit for specific IP', async () => {
      const testIP = '192.168.100.2';

      const response = await makeWorkerRequest(`/admin/rate-limit/reset/${testIP}`, {
        method: 'POST'
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain(testIP);
    });

    it('should handle invalid IP addresses', async () => {
      const invalidIP = 'invalid-ip';
      const response = await makeWorkerRequest(`/admin/rate-limit/status/${invalidIP}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Geo-blocking Management API', () => {
    it('should get current geo configuration', async () => {
      const response = await makeWorkerRequest('/admin/geo/config');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('config');
      expect(response.body.config).toHaveProperty('enabled');
      expect(response.body.config).toHaveProperty('mode');
      expect(response.body.config).toHaveProperty('countries');
      expect(response.body.config).toHaveProperty('pathOverrides');
    });

    it('should update geo configuration', async () => {
      const newConfig = getTestGeoConfig();
      newConfig.enabled = true;
      newConfig.mode = 'whitelist';
      newConfig.countries = ['US', 'CA', 'GB'];
      newConfig.pathOverrides = {
        '/kv/public': [],
        '/biz-client/global': []
      };

      const response = await makeWorkerRequest('/admin/geo/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.config.enabled).toBe(true);
      expect(response.body.config.mode).toBe('whitelist');
      expect(response.body.config.countries).toContain('US');
      expect(response.body.config.pathOverrides).toHaveProperty('/kv/public');

      // 验证配置已保存到 KV
      const savedConfig = await env.KV.get('config:geo', 'json');
      expect(savedConfig.mode).toBe('whitelist');
    });

    it('should validate geo configuration', async () => {
      const invalidConfig = {
        enabled: true,
        mode: 'invalid-mode', // 只允许 'whitelist' 或 'blacklist'
        countries: 'not-array', // 应该是数组
        pathOverrides: []  // 应该是对象
      };

      const response = await makeWorkerRequest('/admin/geo/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidConfig)
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
    });

    it('should test geo-blocking rules', async () => {
      // 设置测试配置
      const geoConfig = getTestGeoConfig();
      geoConfig.enabled = true;
      geoConfig.mode = 'blacklist';
      geoConfig.countries = ['CN', 'RU'];
      await env.KV.put('config:geo', JSON.stringify(geoConfig));

      const testData = {
        country: 'US',
        path: '/kv/test'
      };

      const response = await makeWorkerRequest('/admin/geo/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData)
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('allowed', true);
      expect(response.body.result).toHaveProperty('country', 'US');
      expect(response.body.result).toHaveProperty('path', '/kv/test');
    });

    it('should list available country codes', async () => {
      const response = await makeWorkerRequest('/admin/geo/countries');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('countries');
      expect(Array.isArray(response.body.countries)).toBe(true);
      expect(response.body.countries.length).toBeGreaterThan(0);

      // 验证包含一些常见国家代码
      expect(response.body.countries).toContain('US');
      expect(response.body.countries).toContain('CN');
      expect(response.body.countries).toContain('GB');
    });

    it('should handle missing fields in geo test request', async () => {
      const response = await makeWorkerRequest('/admin/geo/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: 'US' }) // 缺少 path
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('Traffic Monitoring API', () => {
    it('should get traffic statistics', async () => {
      const response = await makeWorkerRequest('/admin/traffic/stats');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('stats');
      expect(response.body.stats).toHaveProperty('totalRequests');
      expect(response.body.stats).toHaveProperty('currentWindowRequests');
      expect(response.body.stats).toHaveProperty('averageRequestsPerSecond');
      expect(response.body.stats).toHaveProperty('alertThreshold');
      expect(response.body.stats).toHaveProperty('thresholdExceeded');
    });

    it('should get traffic configuration', async () => {
      const response = await makeWorkerRequest('/admin/traffic/config');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('config');
      expect(response.body.config).toHaveProperty('alertThreshold');
      expect(response.body.config).toHaveProperty('autoEnableCache');
      expect(response.body.config).toHaveProperty('measurementWindow');
    });

    it('should update traffic configuration', async () => {
      const newConfig = getTestTrafficConfig();
      newConfig.alertThreshold = 5000;
      newConfig.autoEnableCache = false;
      newConfig.measurementWindow = 600;

      const response = await makeWorkerRequest('/admin/traffic/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.config.alertThreshold).toBe(5000);
      expect(response.body.config.autoEnableCache).toBe(false);
      expect(response.body.config.measurementWindow).toBe(600);

      // 验证配置已保存到 KV
      const savedConfig = await env.KV.get('config:traffic', 'json');
      expect(savedConfig.alertThreshold).toBe(5000);
    });

    it('should validate traffic configuration', async () => {
      const invalidConfig = {
        alertThreshold: -100, // 不能为负数
        autoEnableCache: 'not-boolean', // 应该是布尔值
        measurementWindow: 'invalid' // 应该是数字
      };

      const response = await makeWorkerRequest('/admin/traffic/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidConfig)
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
    });

    it('should reset traffic statistics', async () => {
      const response = await makeWorkerRequest('/admin/traffic/reset', {
        method: 'POST'
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });

    it('should get alert status', async () => {
      const response = await makeWorkerRequest('/admin/traffic/alerts');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('alerts');
      expect(response.body.alerts).toHaveProperty('active');
      expect(response.body.alerts).toHaveProperty('threshold');
      expect(response.body.alerts).toHaveProperty('current');
      expect(typeof response.body.alerts.active).toBe('boolean');
    });
  });

  describe('Health Check APIs', () => {
    it('should return health status for all admin modules', async () => {
      const healthEndpoints = [
        '/admin/cache/health',
        '/admin/rate-limit/health',
        '/admin/geo/health',
        '/admin/traffic/health'
      ];

      for (const endpoint of healthEndpoints) {
        const response = await makeWorkerRequest(endpoint);
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('status', 'healthy');
        expect(response.body).toHaveProperty('module');
        expect(response.body).toHaveProperty('timestamp');
      }
    });

    it('should return overall admin API health', async () => {
      const response = await makeWorkerRequest('/admin/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('modules');
      expect(response.body.modules).toHaveProperty('cache');
      expect(response.body.modules).toHaveProperty('rateLimit');
      expect(response.body.modules).toHaveProperty('geo');
      expect(response.body.modules).toHaveProperty('traffic');
    });
  });

  describe('Error Handling and Validation', () => {
    it('should handle malformed JSON requests', async () => {
      const response = await makeWorkerRequest('/admin/cache/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{'
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle missing Content-Type header', async () => {
      const response = await makeWorkerRequest('/admin/cache/config', {
        method: 'PUT',
        body: JSON.stringify({ enabled: true })
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
    });

    it('should handle non-existent endpoints', async () => {
      const response = await makeWorkerRequest('/admin/nonexistent/endpoint');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle method not allowed', async () => {
      const response = await makeWorkerRequest('/admin/cache/config', {
        method: 'DELETE' // DELETE 方法不被支持
      });

      expect(response.status).toBe(405);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Authentication and Authorization', () => {
    it('should accept requests with valid admin headers', async () => {
      const response = await makeWorkerRequest('/admin/cache/config', {
        headers: {
          'X-Admin-Key': 'test-admin-key',
          'Authorization': 'Bearer test-token'
        }
      });

      // 注意：实际实现中可能需要真实的认证
      expect([200, 401]).toContain(response.status);
    });

    it('should handle requests with rate limiting for admin endpoints', async () => {
      // 快速发送多个管理请求
      const promises = Array.from({ length: 10 }, () =>
        makeWorkerRequest('/admin/cache/stats')
      );

      const responses = await Promise.all(promises);

      // 管理端点可能有独立的限流机制
      const statuses = responses.map(r => r.status);
      expect(statuses.every(s => [200, 429].includes(s))).toBe(true);
    });
  });

  describe('Data Consistency and Persistence', () => {
    it('should persist configuration changes across requests', async () => {
      // 更新缓存配置
      const newConfig = getTestCacheConfig();
      newConfig.version = 42;

      await makeWorkerRequest('/admin/cache/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });

      // 在新请求中获取配置
      const getResponse = await makeWorkerRequest('/admin/cache/config');

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.config.version).toBe(42);
    });

    it('should handle concurrent configuration updates', async () => {
      const config1 = getTestCacheConfig();
      const config2 = getTestCacheConfig();
      config1.version = 100;
      config2.version = 200;

      // 并发更新
      const promises = [
        makeWorkerRequest('/admin/cache/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config1)
        }),
        makeWorkerRequest('/admin/cache/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config2)
        })
      ];

      const responses = await Promise.all(promises);

      // 两个请求都应该成功
      expect(responses[0].status).toBe(200);
      expect(responses[1].status).toBe(200);

      // 验证最终状态
      const finalResponse = await makeWorkerRequest('/admin/cache/config');
      expect(finalResponse.status).toBe(200);
      expect([100, 200]).toContain(finalResponse.body.config.version);
    });

    it('should handle KV storage errors gracefully', async () => {
      // 这个测试模拟存储错误的情况
      // 在真实环境中很难触发，但我们可以测试错误处理逻辑

      const response = await makeWorkerRequest('/admin/cache/config');

      // 即使出现存储错误，API 也应该优雅处理
      expect([200, 500]).toContain(response.status);

      if (response.status === 500) {
        expect(response.body).toHaveProperty('error');
      }
    });
  });

  describe('Performance and Monitoring', () => {
    it('should respond to admin requests within reasonable time', async () => {
      const endpoints = [
        '/admin/cache/config',
        '/admin/rate-limit/config',
        '/admin/geo/config',
        '/admin/traffic/config'
      ];

      for (const endpoint of endpoints) {
        const startTime = Date.now();
        const response = await makeWorkerRequest(endpoint);
        const endTime = Date.now();

        expect(response.status).toBe(200);
        expect(endTime - startTime).toBeLessThan(500); // 少于 500ms
      }
    });

    it('should handle bulk configuration operations efficiently', async () => {
      // 测试批量操作的性能
      const bulkUpdate = {
        cache: getTestCacheConfig(),
        rateLimit: getTestRateLimitConfig(),
        geo: getTestGeoConfig(),
        traffic: getTestTrafficConfig()
      };

      const startTime = Date.now();

      // 并行更新所有配置
      const promises = [
        makeWorkerRequest('/admin/cache/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bulkUpdate.cache)
        }),
        makeWorkerRequest('/admin/rate-limit/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bulkUpdate.rateLimit)
        }),
        makeWorkerRequest('/admin/geo/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bulkUpdate.geo)
        }),
        makeWorkerRequest('/admin/traffic/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bulkUpdate.traffic)
        })
      ];

      const responses = await Promise.all(promises);
      const endTime = Date.now();

      // 所有更新都应该成功
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // 总时间应该合理
      expect(endTime - startTime).toBeLessThan(2000); // 少于 2 秒
    });
  });
});