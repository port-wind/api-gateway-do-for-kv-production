/**
 * RateLimiter Durable Object 集成测试
 * 测试滑动窗口限流机制
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env, runInDurableObject, listDurableObjectIds } from 'cloudflare:test';
import {
  setupTestConfigs,
  cleanupTestData,
  getTestRateLimitConfig,
  sleep
} from '../helpers/worker-test-utils';
import { initializeD1ForTests } from './setup-d1';

describe('RateLimiter Durable Object', () => {
  initializeD1ForTests();

  beforeEach(async () => {
    await setupTestConfigs();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('Rate Limiting Logic', () => {
    it('should allow requests within limit', async () => {
      const testIP = '192.168.1.1';
      const id = env.RATE_LIMITER.idFromName(testIP);
      const rateLimiter = env.RATE_LIMITER.get(id);

      const response = await rateLimiter.fetch(
        new Request(`http://test/?ip=${testIP}&limit=5&window=60`)
      );

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4); // 5 - 1
    });

    it('should block requests when limit exceeded', async () => {
      const testIP = '192.168.1.2';
      const limit = 3;
      const id = env.RATE_LIMITER.idFromName(testIP);
      const rateLimiter = env.RATE_LIMITER.get(id);

      // 发送超出限制的请求
      for (let i = 0; i < limit; i++) {
        const response = await rateLimiter.fetch(
          new Request(`http://test/?ip=${testIP}&limit=${limit}&window=60`)
        );
        const result = await response.json();
        expect(result.allowed).toBe(true);
      }

      // 下一个请求应该被阻止
      const blockedResponse = await rateLimiter.fetch(
        new Request(`http://test/?ip=${testIP}&limit=${limit}&window=60`)
      );
      const blockedResult = await blockedResponse.json();
      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.remaining).toBe(0);
      expect(blockedResult.resetAt).toBeDefined();
    });

    it('should reset counter after time window', async () => {
      const testIP = '192.168.1.3';
      const limit = 2;
      const window = 2; // 2 秒窗口
      const id = env.RATE_LIMITER.idFromName(testIP);
      const rateLimiter = env.RATE_LIMITER.get(id);

      // 达到限制
      for (let i = 0; i < limit; i++) {
        await rateLimiter.fetch(
          new Request(`http://test/?ip=${testIP}&limit=${limit}&window=${window}`)
        );
      }

      // 验证被阻止
      const blockedResponse = await rateLimiter.fetch(
        new Request(`http://test/?ip=${testIP}&limit=${limit}&window=${window}`)
      );
      const blockedResult = await blockedResponse.json();
      expect(blockedResult.allowed).toBe(false);

      // 等待窗口重置
      await sleep(2100); // 稍微超过窗口时间

      // 应该能够重新发送请求
      const allowedResponse = await rateLimiter.fetch(
        new Request(`http://test/?ip=${testIP}&limit=${limit}&window=${window}`)
      );
      const allowedResult = await allowedResponse.json();
      expect(allowedResult.allowed).toBe(true);
    });

    it('should handle multiple IPs independently', async () => {
      const ip1 = '192.168.1.4';
      const ip2 = '192.168.1.5';
      const limit = 2;

      const id1 = env.RATE_LIMITER.idFromName(ip1);
      const id2 = env.RATE_LIMITER.idFromName(ip2);
      const rateLimiter1 = env.RATE_LIMITER.get(id1);
      const rateLimiter2 = env.RATE_LIMITER.get(id2);

      // IP1 达到限制
      for (let i = 0; i < limit; i++) {
        await rateLimiter1.fetch(
          new Request(`http://test/?ip=${ip1}&limit=${limit}&window=60`)
        );
      }

      // IP1 应该被阻止
      const ip1BlockedResponse = await rateLimiter1.fetch(
        new Request(`http://test/?ip=${ip1}&limit=${limit}&window=60`)
      );
      const ip1BlockedResult = await ip1BlockedResponse.json();
      expect(ip1BlockedResult.allowed).toBe(false);

      // IP2 应该仍然被允许
      const ip2AllowedResponse = await rateLimiter2.fetch(
        new Request(`http://test/?ip=${ip2}&limit=${limit}&window=60`)
      );
      const ip2AllowedResult = await ip2AllowedResponse.json();
      expect(ip2AllowedResult.allowed).toBe(true);
    });
  });

  describe('Durable Object State Management', () => {
    it('should persist rate limit state across requests', async () => {
      const testIP = '192.168.1.6';
      const id = env.RATE_LIMITER.idFromName(testIP);
      const rateLimiter = env.RATE_LIMITER.get(id);

      // 第一个请求
      const response1 = await rateLimiter.fetch(
        new Request(`http://test/?ip=${testIP}&limit=5&window=60`)
      );
      const result1 = await response1.json();
      expect(result1.remaining).toBe(4);

      // 第二个请求应该显示递减的剩余数量
      const response2 = await rateLimiter.fetch(
        new Request(`http://test/?ip=${testIP}&limit=5&window=60`)
      );
      const result2 = await response2.json();
      expect(result2.remaining).toBe(3);
    });

    it('should validate input parameters', async () => {
      const testIP = '192.168.1.7';
      const id = env.RATE_LIMITER.idFromName(testIP);
      const rateLimiter = env.RATE_LIMITER.get(id);

      // 缺少必需参数
      const invalidResponse = await rateLimiter.fetch(
        new Request('http://test/?limit=5&window=60') // 缺少 IP
      );

      expect(invalidResponse.status).toBe(400);
      const error = await invalidResponse.json();
      expect(error.error).toContain('IP');
    });

    it('should handle concurrent requests properly', async () => {
      const testIP = '192.168.1.8';
      const id = env.RATE_LIMITER.idFromName(testIP);
      const rateLimiter = env.RATE_LIMITER.get(id);
      const limit = 5;

      // 发送并发请求
      const promises = Array.from({ length: limit + 2 }, () =>
        rateLimiter.fetch(
          new Request(`http://test/?ip=${testIP}&limit=${limit}&window=60`)
        )
      );

      const responses = await Promise.all(promises);
      const results = await Promise.all(
        responses.map(r => r.json())
      );

      // 应该有 limit 个被允许的请求
      const allowedCount = results.filter(r => r.allowed).length;
      const blockedCount = results.filter(r => !r.allowed).length;

      expect(allowedCount).toBe(limit);
      expect(blockedCount).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed requests gracefully', async () => {
      const testIP = '192.168.1.9';
      const id = env.RATE_LIMITER.idFromName(testIP);
      const rateLimiter = env.RATE_LIMITER.get(id);

      // 无效的限制值
      const response = await rateLimiter.fetch(
        new Request(`http://test/?ip=${testIP}&limit=invalid&window=60`)
      );

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.error).toBeDefined();
    });

    it('should use default values for missing parameters', async () => {
      const testIP = '192.168.1.10';
      const id = env.RATE_LIMITER.idFromName(testIP);
      const rateLimiter = env.RATE_LIMITER.get(id);

      // 仅提供 IP，使用默认值
      const response = await rateLimiter.fetch(
        new Request(`http://test/?ip=${testIP}`)
      );

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59); // 默认限制 60 - 1
    });
  });

  describe('Internal Storage Operations', () => {
    it('should correctly manage request history in storage', async () => {
      const testIP = '192.168.1.11';
      const id = env.RATE_LIMITER.idFromName(testIP);
      const rateLimiter = env.RATE_LIMITER.get(id);

      await runInDurableObject(rateLimiter, async (instance, state) => {
        // 模拟添加请求历史记录
        const now = Date.now();
        const history = [now - 30000, now - 20000, now - 10000]; // 过去 30 秒内的请求
        await state.storage.put(`ip:${testIP}`, history);

        // 验证存储的数据
        const storedHistory = await state.storage.get(`ip:${testIP}`);
        expect(storedHistory).toEqual(history);
      });
    });

    it('should clean up old request records', async () => {
      const testIP = '192.168.1.12';
      const id = env.RATE_LIMITER.idFromName(testIP);
      const rateLimiter = env.RATE_LIMITER.get(id);
      const window = 30; // 30 秒窗口

      // 发送一个请求
      await rateLimiter.fetch(
        new Request(`http://test/?ip=${testIP}&limit=5&window=${window}`)
      );

      await runInDurableObject(rateLimiter, async (instance, state) => {
        const history = await state.storage.get(`ip:${testIP}`) as number[];
        expect(history.length).toBe(1);

        // 手动添加一个超出窗口的旧记录
        const now = Date.now();
        const oldRecord = now - (window * 1000) - 1000; // 超出窗口 1 秒
        history.unshift(oldRecord);
        await state.storage.put(`ip:${testIP}`, history);
      });

      // 发送另一个请求，应该清理旧记录
      await rateLimiter.fetch(
        new Request(`http://test/?ip=${testIP}&limit=5&window=${window}`)
      );

      await runInDurableObject(rateLimiter, async (instance, state) => {
        const history = await state.storage.get(`ip:${testIP}`) as number[];
        // 应该只有 2 个记录（旧记录被清理）
        expect(history.length).toBe(2);

        // 所有记录都应该在窗口内
        const now = Date.now();
        const windowStart = now - (window * 1000);
        history.forEach(timestamp => {
          expect(timestamp).toBeGreaterThan(windowStart);
        });
      });
    });
  });

  describe('Integration with Configuration', () => {
    it('should work with different rate limit configurations', async () => {
      // 更新配置为更严格的限制
      const strictConfig = getTestRateLimitConfig();
      strictConfig.defaultLimit = 2;
      strictConfig.windowSeconds = 30;
      await env.KV.put('config:rate-limit', JSON.stringify(strictConfig));

      const testIP = '192.168.1.13';
      const id = env.RATE_LIMITER.idFromName(testIP);
      const rateLimiter = env.RATE_LIMITER.get(id);

      // 使用配置中的值
      for (let i = 0; i < strictConfig.defaultLimit; i++) {
        const response = await rateLimiter.fetch(
          new Request(`http://test/?ip=${testIP}&limit=${strictConfig.defaultLimit}&window=${strictConfig.windowSeconds}`)
        );
        const result = await response.json();
        expect(result.allowed).toBe(true);
      }

      // 下一个请求应该被阻止
      const blockedResponse = await rateLimiter.fetch(
        new Request(`http://test/?ip=${testIP}&limit=${strictConfig.defaultLimit}&window=${strictConfig.windowSeconds}`)
      );
      const blockedResult = await blockedResponse.json();
      expect(blockedResult.allowed).toBe(false);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle high request volume efficiently', async () => {
      const testIP = '192.168.1.14';
      const id = env.RATE_LIMITER.idFromName(testIP);
      const rateLimiter = env.RATE_LIMITER.get(id);
      const requestCount = 50;

      const startTime = Date.now();

      // 发送大量请求
      const promises = Array.from({ length: requestCount }, () =>
        rateLimiter.fetch(
          new Request(`http://test/?ip=${testIP}&limit=100&window=60`)
        )
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();

      // 验证所有请求都得到了响应
      expect(responses.length).toBe(requestCount);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // 性能检查：每个请求平均处理时间应该合理
      const avgTime = (endTime - startTime) / requestCount;
      expect(avgTime).toBeLessThan(100); // 平均每个请求少于 100ms
    });
  });
});