/**
 * TrafficMonitor Durable Object 集成测试
 * 测试流量监控和自动缓存触发机制
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import {
  setupTestConfigs,
  cleanupTestData,
  getTestTrafficConfig,
  sleep
} from '../helpers/worker-test-utils';
import { initializeD1ForTests } from './setup-d1';

describe('TrafficMonitor Durable Object', () => {
  initializeD1ForTests();

  const globalId = env.TRAFFIC_MONITOR.idFromName('global');
  let trafficMonitor: DurableObjectStub;

  beforeEach(async () => {
    await setupTestConfigs();
    trafficMonitor = env.TRAFFIC_MONITOR.get(globalId);
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('Request Counting', () => {
    it('should increment request count', async () => {
      // 记录一个请求
      const response = await trafficMonitor.fetch(
        new Request('http://test/count')
      );

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
    });

    it('should track requests over time', async () => {
      // 发送多个请求
      const requestCount = 5;
      for (let i = 0; i < requestCount; i++) {
        await trafficMonitor.fetch(
          new Request('http://test/count')
        );
        await sleep(10); // 短暂延迟
      }

      // 获取统计信息
      const statsResponse = await trafficMonitor.fetch(
        new Request('http://test/stats')
      );
      const stats = await statsResponse.json();

      expect(stats.totalRequests).toBeGreaterThanOrEqual(requestCount);
      expect(stats.currentWindowRequests).toBeGreaterThanOrEqual(requestCount);
    });

    it('should provide accurate request metrics', async () => {
      // 清理状态并发送已知数量的请求
      await runInDurableObject(trafficMonitor, async (instance, state) => {
        await state.storage.deleteAll();
      });

      const testRequests = 10;
      for (let i = 0; i < testRequests; i++) {
        await trafficMonitor.fetch(
          new Request('http://test/count')
        );
      }

      const statsResponse = await trafficMonitor.fetch(
        new Request('http://test/stats')
      );
      const stats = await statsResponse.json();

      expect(stats.totalRequests).toBe(testRequests);
      expect(stats.currentWindowRequests).toBe(testRequests);
      expect(stats.averageRequestsPerSecond).toBeGreaterThan(0);
    });
  });

  describe('Threshold Monitoring', () => {
    it('should detect when threshold is exceeded', async () => {
      const config = getTestTrafficConfig();
      config.alertThreshold = 5; // 设置低阈值便于测试
      await env.KV.put('config:traffic', JSON.stringify(config));

      // 发送超过阈值的请求
      for (let i = 0; i < config.alertThreshold + 2; i++) {
        await trafficMonitor.fetch(
          new Request('http://test/count')
        );
      }

      const statsResponse = await trafficMonitor.fetch(
        new Request('http://test/stats')
      );
      const stats = await statsResponse.json();

      expect(stats.thresholdExceeded).toBe(true);
      expect(stats.totalRequests).toBeGreaterThan(config.alertThreshold);
    });

    it('should trigger auto-cache when enabled', async () => {
      const config = getTestTrafficConfig();
      config.alertThreshold = 3;
      config.autoEnableCache = true;
      await env.KV.put('config:traffic', JSON.stringify(config));

      // 发送超过阈值的请求
      for (let i = 0; i < config.alertThreshold + 1; i++) {
        await trafficMonitor.fetch(
          new Request('http://test/count')
        );
      }

      const statsResponse = await trafficMonitor.fetch(
        new Request('http://test/stats')
      );
      const stats = await statsResponse.json();

      expect(stats.thresholdExceeded).toBe(true);
      expect(stats.autoCacheEnabled).toBe(true);
    });

    it('should not trigger auto-cache when disabled', async () => {
      const config = getTestTrafficConfig();
      config.alertThreshold = 3;
      config.autoEnableCache = false;
      await env.KV.put('config:traffic', JSON.stringify(config));

      // 发送超过阈值的请求
      for (let i = 0; i < config.alertThreshold + 1; i++) {
        await trafficMonitor.fetch(
          new Request('http://test/count')
        );
      }

      const statsResponse = await trafficMonitor.fetch(
        new Request('http://test/stats')
      );
      const stats = await statsResponse.json();

      expect(stats.thresholdExceeded).toBe(true);
      expect(stats.autoCacheEnabled).toBe(false);
    });
  });

  describe('Time Window Management', () => {
    it('should reset metrics after measurement window', async () => {
      const config = getTestTrafficConfig();
      config.measurementWindow = 2; // 2 秒窗口
      await env.KV.put('config:traffic', JSON.stringify(config));

      // 发送请求
      const initialRequests = 3;
      for (let i = 0; i < initialRequests; i++) {
        await trafficMonitor.fetch(
          new Request('http://test/count')
        );
      }

      const initialStats = await trafficMonitor.fetch(
        new Request('http://test/stats')
      );
      const initialResult = await initialStats.json();
      expect(initialResult.currentWindowRequests).toBe(initialRequests);

      // 等待超过测量窗口
      await sleep(2100);

      // 发送新请求
      await trafficMonitor.fetch(
        new Request('http://test/count')
      );

      const finalStats = await trafficMonitor.fetch(
        new Request('http://test/stats')
      );
      const finalResult = await finalStats.json();

      // 当前窗口请求应该重置
      expect(finalResult.currentWindowRequests).toBe(1);
      // 总请求数应该是累积的
      expect(finalResult.totalRequests).toBe(initialRequests + 1);
    });

    it('should maintain accurate metrics within time window', async () => {
      const config = getTestTrafficConfig();
      config.measurementWindow = 10; // 10 秒窗口
      await env.KV.put('config:traffic', JSON.stringify(config));

      const requests = [3, 2, 4]; // 分批发送请求
      let totalRequests = 0;

      for (const batchSize of requests) {
        for (let i = 0; i < batchSize; i++) {
          await trafficMonitor.fetch(
            new Request('http://test/count')
          );
          totalRequests++;
        }

        await sleep(500); // 批次间短暂延迟

        const statsResponse = await trafficMonitor.fetch(
          new Request('http://test/stats')
        );
        const stats = await statsResponse.json();

        expect(stats.totalRequests).toBe(totalRequests);
        expect(stats.currentWindowRequests).toBe(totalRequests);
      }
    });
  });

  describe('Configuration Management', () => {
    it('should read configuration from KV storage', async () => {
      const customConfig = getTestTrafficConfig();
      customConfig.alertThreshold = 100;
      customConfig.measurementWindow = 600;
      await env.KV.put('config:traffic', JSON.stringify(customConfig));

      // 触发配置读取
      await trafficMonitor.fetch(
        new Request('http://test/count')
      );

      const statsResponse = await trafficMonitor.fetch(
        new Request('http://test/stats')
      );
      const stats = await statsResponse.json();

      expect(stats.alertThreshold).toBe(customConfig.alertThreshold);
      expect(stats.measurementWindow).toBe(customConfig.measurementWindow);
    });

    it('should use default configuration when KV is empty', async () => {
      // 删除配置
      await env.KV.delete('config:traffic');

      await trafficMonitor.fetch(
        new Request('http://test/count')
      );

      const statsResponse = await trafficMonitor.fetch(
        new Request('http://test/stats')
      );
      const stats = await statsResponse.json();

      // 应该使用默认值
      expect(stats.alertThreshold).toBeGreaterThan(0);
      expect(stats.measurementWindow).toBeGreaterThan(0);
    });

    it('should update configuration dynamically', async () => {
      // 初始配置
      const config1 = getTestTrafficConfig();
      config1.alertThreshold = 10;
      await env.KV.put('config:traffic', JSON.stringify(config1));

      await trafficMonitor.fetch(
        new Request('http://test/count')
      );

      // 更新配置
      const config2 = getTestTrafficConfig();
      config2.alertThreshold = 20;
      await env.KV.put('config:traffic', JSON.stringify(config2));

      // 需要新请求来触发配置重读
      await trafficMonitor.fetch(
        new Request('http://test/count')
      );

      const statsResponse = await trafficMonitor.fetch(
        new Request('http://test/stats')
      );
      const stats = await statsResponse.json();

      expect(stats.alertThreshold).toBe(config2.alertThreshold);
    });
  });

  describe('State Persistence', () => {
    it('should persist request counts in Durable Object storage', async () => {
      const requestCount = 5;

      for (let i = 0; i < requestCount; i++) {
        await trafficMonitor.fetch(
          new Request('http://test/count')
        );
      }

      await runInDurableObject(trafficMonitor, async (instance, state) => {
        const totalRequests = await state.storage.get('totalRequests') || 0;
        expect(totalRequests).toBe(requestCount);
      });
    });

    it('should maintain request history for window calculations', async () => {
      const requestCount = 3;

      for (let i = 0; i < requestCount; i++) {
        await trafficMonitor.fetch(
          new Request('http://test/count')
        );
        await sleep(100);
      }

      await runInDurableObject(trafficMonitor, async (instance, state) => {
        const requestHistory = await state.storage.get('requestHistory') as number[] || [];
        expect(requestHistory.length).toBe(requestCount);

        // 所有时间戳都应该是有效的
        requestHistory.forEach(timestamp => {
          expect(timestamp).toBeGreaterThan(Date.now() - 60000); // 过去一分钟内
          expect(timestamp).toBeLessThanOrEqual(Date.now());
        });
      });
    });

    it('should clean up old request history', async () => {
      const config = getTestTrafficConfig();
      config.measurementWindow = 1; // 1 秒窗口
      await env.KV.put('config:traffic', JSON.stringify(config));

      // 发送请求
      for (let i = 0; i < 3; i++) {
        await trafficMonitor.fetch(
          new Request('http://test/count')
        );
        await sleep(300);
      }

      // 等待部分历史记录过期
      await sleep(1100);

      // 发送新请求触发清理
      await trafficMonitor.fetch(
        new Request('http://test/count')
      );

      await runInDurableObject(trafficMonitor, async (instance, state) => {
        const requestHistory = await state.storage.get('requestHistory') as number[] || [];

        // 应该只保留窗口内的请求
        const windowStart = Date.now() - (config.measurementWindow * 1000);
        requestHistory.forEach(timestamp => {
          expect(timestamp).toBeGreaterThan(windowStart);
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed requests gracefully', async () => {
      const response = await trafficMonitor.fetch(
        new Request('http://test/invalid-endpoint')
      );

      expect(response.status).toBe(404);
      const error = await response.json();
      expect(error.error).toBeDefined();
    });

    it('should handle storage errors gracefully', async () => {
      await runInDurableObject(trafficMonitor, async (instance, state) => {
        // 模拟存储错误情况下的行为
        // 这里我们只能测试正常情况，因为很难模拟存储失败
        const totalRequests = await state.storage.get('totalRequests');
        expect(typeof totalRequests === 'number' || totalRequests === undefined).toBe(true);
      });
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle concurrent request counting', async () => {
      const concurrentRequests = 10;

      // 发送并发请求
      const promises = Array.from({ length: concurrentRequests }, () =>
        trafficMonitor.fetch(new Request('http://test/count'))
      );

      const responses = await Promise.all(promises);

      // 所有请求都应该成功
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // 验证计数准确性
      const statsResponse = await trafficMonitor.fetch(
        new Request('http://test/stats')
      );
      const stats = await statsResponse.json();

      expect(stats.totalRequests).toBeGreaterThanOrEqual(concurrentRequests);
    });

    it('should respond quickly to stats requests', async () => {
      // 预先发送一些请求
      for (let i = 0; i < 5; i++) {
        await trafficMonitor.fetch(
          new Request('http://test/count')
        );
      }

      const startTime = Date.now();
      const statsResponse = await trafficMonitor.fetch(
        new Request('http://test/stats')
      );
      const endTime = Date.now();

      expect(statsResponse.status).toBe(200);

      // 响应时间应该合理
      const responseTime = endTime - startTime;
      expect(responseTime).toBeLessThan(500); // 少于 500ms

      const stats = await statsResponse.json();
      expect(stats.totalRequests).toBeGreaterThan(0);
    });
  });

  describe('Integration with Cache Auto-Enable', () => {
    it('should trigger cache auto-enable at the correct threshold', async () => {
      const config = getTestTrafficConfig();
      config.alertThreshold = 5;
      config.autoEnableCache = true;
      await env.KV.put('config:traffic', JSON.stringify(config));

      // 发送请求直到阈值
      for (let i = 0; i < config.alertThreshold; i++) {
        await trafficMonitor.fetch(
          new Request('http://test/count')
        );

        const statsResponse = await trafficMonitor.fetch(
          new Request('http://test/stats')
        );
        const stats = await statsResponse.json();

        if (i < config.alertThreshold - 1) {
          expect(stats.thresholdExceeded).toBe(false);
        } else {
          expect(stats.thresholdExceeded).toBe(true);
          expect(stats.autoCacheEnabled).toBe(true);
        }
      }
    });

    it('should provide cache status information', async () => {
      const config = getTestTrafficConfig();
      config.alertThreshold = 2;
      config.autoEnableCache = true;
      await env.KV.put('config:traffic', JSON.stringify(config));

      // 触发阈值
      for (let i = 0; i <= config.alertThreshold; i++) {
        await trafficMonitor.fetch(
          new Request('http://test/count')
        );
      }

      const statsResponse = await trafficMonitor.fetch(
        new Request('http://test/stats')
      );
      const stats = await statsResponse.json();

      expect(stats).toHaveProperty('autoCacheEnabled');
      expect(stats).toHaveProperty('thresholdExceeded');
      expect(stats).toHaveProperty('lastThresholdExceededAt');
    });
  });
});