import { describe, it, expect } from 'vitest';
import { getCacheKey } from '../../src/lib/cache-manager';

describe('getCacheKey - Flexible Cache Key Strategy', () => {
  const testPath = '/api/test';
  const testVersion = 1;

  describe('向后兼容性测试', () => {
    it('应该支持旧的函数签名 getCacheKey(path, params, version)', async () => {
      const params = { page: 1, size: 10 };
      const key = await getCacheKey(testPath, params, testVersion);

      expect(key).toContain('cache:v1');
      expect(key).toContain(testPath);
      expect(key).toMatch(/:[a-f0-9]{64}$/); // SHA-256 hash
    });

    it('旧方式调用应该默认使用 path-params 策略', async () => {
      const params1 = { page: 1 };
      const params2 = { page: 2 };

      const key1 = await getCacheKey(testPath, params1, testVersion);
      const key2 = await getCacheKey(testPath, params2, testVersion);

      expect(key1).not.toBe(key2); // 参数不同，缓存键不同
    });
  });

  describe('path-only 策略', () => {
    it('应该只基于路径生成缓存键', async () => {
      const key1 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-only',
        params: { a: 1 }
      });

      const key2 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-only',
        params: { a: 2 }
      });

      expect(key1).toBe(key2); // 参数不同但缓存键相同
    });

    it('应该忽略 headers 参数', async () => {
      const key1 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-only',
        headers: { authorization: 'token1' }
      });

      const key2 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-only',
        headers: { authorization: 'token2' }
      });

      expect(key1).toBe(key2); // headers 不同但缓存键相同
    });

    it('不同路径应该生成不同的缓存键', async () => {
      const key1 = await getCacheKey('/api/user', {
        version: testVersion,
        strategy: 'path-only'
      });

      const key2 = await getCacheKey('/api/post', {
        version: testVersion,
        strategy: 'path-only'
      });

      expect(key1).not.toBe(key2);
    });
  });

  describe('path-params 策略', () => {
    it('应该基于路径和参数生成不同缓存键', async () => {
      const key1 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params',
        params: { page: 1 }
      });

      const key2 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params',
        params: { page: 2 }
      });

      expect(key1).not.toBe(key2); // 参数不同，缓存键不同
    });

    it('相同参数应该生成相同的缓存键', async () => {
      const params = { page: 1, size: 10 };

      const key1 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params',
        params
      });

      const key2 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params',
        params: { ...params }
      });

      expect(key1).toBe(key2);
    });

    it('应该支持指定特定参数', async () => {
      const key1 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params',
        params: { page: 1, userId: '123', timestamp: Date.now() },
        keyParams: ['page', 'userId'] // 只使用 page 和 userId
      });

      const key2 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params',
        params: { page: 1, userId: '123', timestamp: Date.now() + 1000 },
        keyParams: ['page', 'userId']
      });

      expect(key1).toBe(key2); // timestamp 不同但未包含在 keyParams 中
    });

    it('keyParams 为 all 时应该包含所有参数', async () => {
      const key1 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params',
        params: { a: 1, b: 2 },
        keyParams: 'all'
      });

      const key2 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params',
        params: { a: 1, b: 3 },
        keyParams: 'all'
      });

      expect(key1).not.toBe(key2);
    });

    it('应该处理空参数', async () => {
      const key = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params'
      });

      expect(key).toContain('cache:v1');
      expect(key).toContain(testPath);
    });
  });

  describe('path-headers 策略', () => {
    it('应该基于指定 header 生成不同缓存键', async () => {
      const key1 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-headers',
        headers: { authorization: 'token1', 'x-other': 'value' },
        keyHeaders: ['authorization']
      });

      const key2 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-headers',
        headers: { authorization: 'token2', 'x-other': 'value' },
        keyHeaders: ['authorization']
      });

      expect(key1).not.toBe(key2); // token 不同，缓存键不同
    });

    it('应该忽略未指定的 headers', async () => {
      const key1 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-headers',
        headers: { authorization: 'token1', 'x-other': 'value1' },
        keyHeaders: ['authorization']
      });

      const key2 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-headers',
        headers: { authorization: 'token1', 'x-other': 'value2' },
        keyHeaders: ['authorization']
      });

      expect(key1).toBe(key2); // x-other 未指定，不影响缓存键
    });

    it('header 名称应该不区分大小写', async () => {
      const key1 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-headers',
        headers: { 'Authorization': 'token1' },
        keyHeaders: ['authorization']
      });

      const key2 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-headers',
        headers: { 'authorization': 'token1' },
        keyHeaders: ['authorization']
      });

      expect(key1).toBe(key2); // 大小写不同但应该生成相同的缓存键
    });

    it('应该支持多个 headers', async () => {
      const key1 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-headers',
        headers: { authorization: 'token1', 'x-user-id': 'user1' },
        keyHeaders: ['authorization', 'x-user-id']
      });

      const key2 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-headers',
        headers: { authorization: 'token1', 'x-user-id': 'user2' },
        keyHeaders: ['authorization', 'x-user-id']
      });

      expect(key1).not.toBe(key2); // x-user-id 不同，缓存键不同
    });

    it('keyHeaders 为 all 时应该包含所有 headers', async () => {
      const key1 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-headers',
        headers: { authorization: 'token1', 'x-user-id': 'user1', 'x-custom': 'value1' },
        keyHeaders: 'all'
      });

      const key2 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-headers',
        headers: { authorization: 'token1', 'x-user-id': 'user1', 'x-custom': 'value2' },
        keyHeaders: 'all'
      });

      expect(key1).not.toBe(key2); // 任何 header 不同都会导致缓存键不同
    });

    it('keyHeaders 为 all 时相同 headers 应生成相同缓存键', async () => {
      const headers = { authorization: 'token1', 'x-user-id': 'user1', 'x-tenant': 'tenant1' };

      const key1 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-headers',
        headers,
        keyHeaders: 'all'
      });

      const key2 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-headers',
        headers: { ...headers },
        keyHeaders: 'all'
      });

      expect(key1).toBe(key2);
    });

    it('应该处理空 keyHeaders', async () => {
      const key = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-headers',
        headers: { authorization: 'token1' },
        keyHeaders: []
      });

      expect(key).toContain('cache:v1');
      expect(key).toContain(testPath);
    });
  });

  describe('path-params-headers 策略', () => {
    it('应该同时基于参数和 headers 生成缓存键', async () => {
      const key1 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params-headers',
        params: { page: 1 },
        headers: { authorization: 'token1' },
        keyHeaders: ['authorization'],
        keyParams: 'all'
      });

      const key2 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params-headers',
        params: { page: 2 },
        headers: { authorization: 'token1' },
        keyHeaders: ['authorization'],
        keyParams: 'all'
      });

      expect(key1).not.toBe(key2); // 参数不同，缓存键不同
    });

    it('header 不同应该生成不同的缓存键', async () => {
      const key1 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params-headers',
        params: { page: 1 },
        headers: { authorization: 'token1' },
        keyHeaders: ['authorization'],
        keyParams: 'all'
      });

      const key2 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params-headers',
        params: { page: 1 },
        headers: { authorization: 'token2' },
        keyHeaders: ['authorization'],
        keyParams: 'all'
      });

      expect(key1).not.toBe(key2); // header 不同，缓存键不同
    });

    it('应该支持指定参数和指定 headers', async () => {
      const key1 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params-headers',
        params: { page: 1, userId: '123', timestamp: Date.now() },
        headers: { authorization: 'token1', 'x-other': 'value' },
        keyHeaders: ['authorization'],
        keyParams: ['page', 'userId']
      });

      const key2 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params-headers',
        params: { page: 1, userId: '123', timestamp: Date.now() + 1000 },
        headers: { authorization: 'token1', 'x-other': 'different' },
        keyHeaders: ['authorization'],
        keyParams: ['page', 'userId']
      });

      expect(key1).toBe(key2); // 未指定的参数和 headers 不影响缓存键
    });

    it('应该支持 keyHeaders 为 all 和 keyParams 为 all', async () => {
      const key1 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params-headers',
        params: { page: 1, size: 10 },
        headers: { authorization: 'token1', 'x-user-id': 'user1' },
        keyHeaders: 'all',
        keyParams: 'all'
      });

      const key2 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params-headers',
        params: { page: 1, size: 10 },
        headers: { authorization: 'token1', 'x-user-id': 'user2' },
        keyHeaders: 'all',
        keyParams: 'all'
      });

      expect(key1).not.toBe(key2); // 任何 header 不同都会导致缓存键不同
    });

    it('keyHeaders 为 all 但 keyParams 指定特定参数', async () => {
      const key1 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params-headers',
        params: { page: 1, timestamp: Date.now() },
        headers: { authorization: 'token1', 'x-user-id': 'user1' },
        keyHeaders: 'all',
        keyParams: ['page'] // 只使用 page 参数
      });

      const key2 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params-headers',
        params: { page: 1, timestamp: Date.now() + 1000 },
        headers: { authorization: 'token1', 'x-user-id': 'user1' },
        keyHeaders: 'all',
        keyParams: ['page']
      });

      expect(key1).toBe(key2); // timestamp 不同但未包含在 keyParams 中
    });
  });

  describe('版本号测试', () => {
    it('不同版本应该生成不同的缓存键', async () => {
      const key1 = await getCacheKey(testPath, {
        version: 1,
        strategy: 'path-only'
      });

      const key2 = await getCacheKey(testPath, {
        version: 2,
        strategy: 'path-only'
      });

      expect(key1).not.toBe(key2);
      expect(key1).toContain('cache:v1');
      expect(key2).toContain('cache:v2');
    });
  });

  describe('参数排序一致性', () => {
    it('不同顺序的参数应该生成相同的缓存键', async () => {
      const key1 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params',
        params: { a: 1, b: 2, c: 3 }
      });

      const key2 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params',
        params: { c: 3, a: 1, b: 2 }
      });

      expect(key1).toBe(key2); // 参数顺序不同但应该生成相同的缓存键
    });

    it('header 顺序不同应该生成相同的缓存键', async () => {
      const key1 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-headers',
        headers: { 'x-header-a': 'value1', 'x-header-b': 'value2' },
        keyHeaders: ['x-header-b', 'x-header-a']
      });

      const key2 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-headers',
        headers: { 'x-header-b': 'value2', 'x-header-a': 'value1' },
        keyHeaders: ['x-header-a', 'x-header-b']
      });

      expect(key1).toBe(key2); // header 顺序不同但应该生成相同的缓存键
    });
  });

  describe('边界情况', () => {
    it('应该处理特殊字符', async () => {
      const key = await getCacheKey('/api/test/特殊字符路径', {
        version: testVersion,
        strategy: 'path-params',
        params: { query: '搜索关键词' }
      });

      expect(key).toContain('cache:v1');
    });

    it('应该处理深层嵌套的参数', async () => {
      const params = {
        user: {
          profile: {
            name: 'Test',
            age: 30
          }
        }
      };

      const key = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params',
        params
      });

      expect(key).toContain('cache:v1');
    });

    it('应该处理 null 和 undefined', async () => {
      const key1 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params',
        params: { value: null }
      });

      const key2 = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params',
        params: { value: undefined }
      });

      expect(key1).not.toBe(key2);
    });

    it('应该处理空对象', async () => {
      const key = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-params',
        params: {}
      });

      expect(key).toContain('cache:v1');
    });
  });

  describe('缓存键格式验证', () => {
    it('缓存键应该包含正确的前缀', async () => {
      const key = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-only'
      });

      expect(key).toMatch(/^cache:v\d+:/);
    });

    it('缓存键应该包含路径', async () => {
      const key = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-only'
      });

      expect(key).toContain(testPath);
    });

    it('缓存键应该以 SHA-256 hash 结尾', async () => {
      const key = await getCacheKey(testPath, {
        version: testVersion,
        strategy: 'path-only'
      });

      expect(key).toMatch(/:[a-f0-9]{64}$/);
    });
  });
});

