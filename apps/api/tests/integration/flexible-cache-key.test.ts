/**
 * 灵活缓存键策略集成测试
 * 测试不同缓存策略的实际工作效果
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env, fetchMock } from 'cloudflare:test';
import {
    setupTestConfigs,
    cleanupTestData,
    setupFetchMocks,
    resetFetchMocks
} from '../helpers/worker-test-utils';
import { makeWorkerRequest } from '../helpers/test-utils';
import { initializeD1ForTests } from './setup-d1';

describe('灵活缓存键策略集成测试', () => {
    initializeD1ForTests();

    beforeEach(async () => {
        await setupTestConfigs();
        setupFetchMocks();
    });

    afterEach(async () => {
        await cleanupTestData();
        resetFetchMocks();
    });

    describe('path-only 策略', () => {
        it('应该忽略参数和headers，为所有请求返回相同缓存', async () => {
            // 配置路径使用 path-only 策略
            const cacheConfig = {
                enabled: true,
                version: 1,
                pathConfigs: {
                    '/api/static-content': {
                        enabled: true,
                        version: 1,
                        ttl: 300,
                        keyStrategy: 'path-only'
                    }
                }
            };
            await env.API_GATEWAY_STORAGE.put('config:cache', JSON.stringify(cacheConfig));

            // 配置 mock 响应
            fetchMock
                .get('https://dokv.pwtk.cc')
                .intercept({ path: '/api/static-content' })
                .reply(200, { message: 'Static content', timestamp: Date.now() });

            // 第一次请求（参数1，header1）
            const response1 = await makeWorkerRequest('/api/static-content?user=alice', {
                headers: { 'authorization': 'token1' }
            });
            expect(response1.status).toBe(200);
            expect(response1.headers.get('x-cache-status')).toBe('MISS');
            const data1 = await response1.json();

            // 第二次请求（不同参数，不同header）
            const response2 = await makeWorkerRequest('/api/static-content?user=bob', {
                headers: { 'authorization': 'token2' }
            });
            expect(response2.status).toBe(200);
            expect(response2.headers.get('x-cache-status')).toBe('HIT'); // 应该命中缓存
            const data2 = await response2.json();

            // 应该返回相同内容（相同时间戳）
            expect(data2.timestamp).toBe(data1.timestamp);

            // 只应该有一个上游请求
            expect(fetchMock.requests().length).toBe(1);
        });
    });

    describe('path-params 策略', () => {
        it('应该根据所有参数区分缓存', async () => {
            // 配置路径使用 path-params 策略
            const cacheConfig = {
                enabled: true,
                version: 1,
                pathConfigs: {
                    '/api/list': {
                        enabled: true,
                        version: 1,
                        ttl: 300,
                        keyStrategy: 'path-params',
                        keyParams: 'all'
                    }
                }
            };
            await env.API_GATEWAY_STORAGE.put('config:cache', JSON.stringify(cacheConfig));

            // 配置 mock 响应
            fetchMock
                .get('https://dokv.pwtk.cc')
                .intercept({ path: '/api/list' })
                .reply(200, (req) => {
                    const url = new URL(req.url);
                    return {
                        page: url.searchParams.get('page'),
                        timestamp: Date.now()
                    };
                });

            // 第一次请求（参数 page=1）
            const response1 = await makeWorkerRequest('/api/list?page=1');
            expect(response1.status).toBe(200);
            expect(response1.headers.get('x-cache-status')).toBe('MISS');
            const data1 = await response1.json();
            expect(data1.page).toBe('1');

            // 第二次请求（相同参数）
            const response2 = await makeWorkerRequest('/api/list?page=1');
            expect(response2.headers.get('x-cache-status')).toBe('HIT');
            const data2 = await response2.json();
            expect(data2.timestamp).toBe(data1.timestamp); // 相同时间戳

            // 第三次请求（不同参数 page=2）
            const response3 = await makeWorkerRequest('/api/list?page=2');
            expect(response3.headers.get('x-cache-status')).toBe('MISS'); // 新缓存
            const data3 = await response3.json();
            expect(data3.page).toBe('2');
            expect(data3.timestamp).not.toBe(data1.timestamp); // 不同时间戳

            // 应该有2个上游请求
            expect(fetchMock.requests().length).toBe(2);
        });

        it('应该支持指定参数列表', async () => {
            // 配置路径使用 path-params 策略，只关注特定参数
            const cacheConfig = {
                enabled: true,
                version: 1,
                pathConfigs: {
                    '/api/filtered-list': {
                        enabled: true,
                        version: 1,
                        ttl: 300,
                        keyStrategy: 'path-params',
                        keyParams: ['page', 'limit'] // 只关注这两个参数
                    }
                }
            };
            await env.API_GATEWAY_STORAGE.put('config:cache', JSON.stringify(cacheConfig));

            // 配置 mock 响应
            fetchMock
                .get('https://dokv.pwtk.cc')
                .intercept({ path: '/api/filtered-list' })
                .reply(200, { timestamp: Date.now() });

            // 第一次请求
            const response1 = await makeWorkerRequest('/api/filtered-list?page=1&limit=10&sort=desc');
            expect(response1.headers.get('x-cache-status')).toBe('MISS');
            const data1 = await response1.json();

            // 第二次请求（page和limit相同，sort不同）
            const response2 = await makeWorkerRequest('/api/filtered-list?page=1&limit=10&sort=asc');
            expect(response2.headers.get('x-cache-status')).toBe('HIT'); // 应该命中缓存
            const data2 = await response2.json();
            expect(data2.timestamp).toBe(data1.timestamp);

            // 第三次请求（page不同）
            const response3 = await makeWorkerRequest('/api/filtered-list?page=2&limit=10&sort=desc');
            expect(response3.headers.get('x-cache-status')).toBe('MISS'); // 新缓存

            // 应该有2个上游请求
            expect(fetchMock.requests().length).toBe(2);
        });
    });

    describe('path-headers 策略', () => {
        it('应该根据指定headers区分缓存（用户隔离）', async () => {
            // 配置路径使用 path-headers 策略
            const cacheConfig = {
                enabled: true,
                version: 1,
                pathConfigs: {
                    '/api/user/profile': {
                        enabled: true,
                        version: 1,
                        ttl: 300,
                        keyStrategy: 'path-headers',
                        keyHeaders: ['authorization']
                    }
                }
            };
            await env.API_GATEWAY_STORAGE.put('config:cache', JSON.stringify(cacheConfig));

            // 配置 mock 响应
            fetchMock
                .get('https://dokv.pwtk.cc')
                .intercept({ path: '/api/user/profile' })
                .reply(200, (req) => {
                    const token = req.headers.get('authorization');
                    return {
                        user: token === 'token-alice' ? 'alice' : 'bob',
                        timestamp: Date.now()
                    };
                });

            // 用户 Alice 第一次请求
            const response1 = await makeWorkerRequest('/api/user/profile', {
                headers: { 'authorization': 'token-alice' }
            });
            expect(response1.headers.get('x-cache-status')).toBe('MISS');
            const data1 = await response1.json();
            expect(data1.user).toBe('alice');

            // 用户 Alice 第二次请求
            const response2 = await makeWorkerRequest('/api/user/profile', {
                headers: { 'authorization': 'token-alice' }
            });
            expect(response2.headers.get('x-cache-status')).toBe('HIT');
            const data2 = await response2.json();
            expect(data2.timestamp).toBe(data1.timestamp); // 相同时间戳

            // 用户 Bob 请求
            const response3 = await makeWorkerRequest('/api/user/profile', {
                headers: { 'authorization': 'token-bob' }
            });
            expect(response3.headers.get('x-cache-status')).toBe('MISS'); // 新缓存
            const data3 = await response3.json();
            expect(data3.user).toBe('bob');
            expect(data3.timestamp).not.toBe(data1.timestamp); // 不同时间戳

            // 应该有2个上游请求
            expect(fetchMock.requests().length).toBe(2);
        });

        it('header 名称应该不区分大小写', async () => {
            const cacheConfig = {
                enabled: true,
                version: 1,
                pathConfigs: {
                    '/api/case-test': {
                        enabled: true,
                        version: 1,
                        keyStrategy: 'path-headers',
                        keyHeaders: ['authorization']
                    }
                }
            };
            await env.API_GATEWAY_STORAGE.put('config:cache', JSON.stringify(cacheConfig));

            fetchMock
                .get('https://dokv.pwtk.cc')
                .intercept({ path: '/api/case-test' })
                .reply(200, { timestamp: Date.now() });

            // 第一次请求（小写header）
            const response1 = await makeWorkerRequest('/api/case-test', {
                headers: { 'authorization': 'token123' }
            });
            expect(response1.headers.get('x-cache-status')).toBe('MISS');
            const data1 = await response1.json();

            // 第二次请求（大写header）
            const response2 = await makeWorkerRequest('/api/case-test', {
                headers: { 'Authorization': 'token123' }
            });
            expect(response2.headers.get('x-cache-status')).toBe('HIT');
            const data2 = await response2.json();
            expect(data2.timestamp).toBe(data1.timestamp);

            // 只应该有1个上游请求
            expect(fetchMock.requests().length).toBe(1);
        });
    });

    describe('path-params-headers 策略', () => {
        it('应该同时基于参数和headers区分缓存', async () => {
            // 配置路径使用组合策略
            const cacheConfig = {
                enabled: true,
                version: 1,
                pathConfigs: {
                    '/api/user/orders': {
                        enabled: true,
                        version: 1,
                        ttl: 300,
                        keyStrategy: 'path-params-headers',
                        keyHeaders: ['authorization'],
                        keyParams: ['status', 'page']
                    }
                }
            };
            await env.API_GATEWAY_STORAGE.put('config:cache', JSON.stringify(cacheConfig));

            // 配置 mock 响应
            fetchMock
                .get('https://dokv.pwtk.cc')
                .intercept({ path: '/api/user/orders' })
                .reply(200, (req) => {
                    const url = new URL(req.url);
                    const token = req.headers.get('authorization');
                    return {
                        user: token === 'token-alice' ? 'alice' : 'bob',
                        status: url.searchParams.get('status'),
                        page: url.searchParams.get('page'),
                        timestamp: Date.now()
                    };
                });

            // Alice, status=pending, page=1
            const response1 = await makeWorkerRequest('/api/user/orders?status=pending&page=1', {
                headers: { 'authorization': 'token-alice' }
            });
            expect(response1.headers.get('x-cache-status')).toBe('MISS');
            const data1 = await response1.json();

            // Alice, status=pending, page=1 (相同) - 应该命中缓存
            const response2 = await makeWorkerRequest('/api/user/orders?status=pending&page=1', {
                headers: { 'authorization': 'token-alice' }
            });
            expect(response2.headers.get('x-cache-status')).toBe('HIT');
            const data2 = await response2.json();
            expect(data2.timestamp).toBe(data1.timestamp);

            // Alice, status=pending, page=2 (不同page) - 新缓存
            const response3 = await makeWorkerRequest('/api/user/orders?status=pending&page=2', {
                headers: { 'authorization': 'token-alice' }
            });
            expect(response3.headers.get('x-cache-status')).toBe('MISS');

            // Bob, status=pending, page=1 (不同user) - 新缓存
            const response4 = await makeWorkerRequest('/api/user/orders?status=pending&page=1', {
                headers: { 'authorization': 'token-bob' }
            });
            expect(response4.headers.get('x-cache-status')).toBe('MISS');

            // 应该有3个上游请求
            expect(fetchMock.requests().length).toBe(3);
        });
    });

    describe('POST 请求的 body 参数缓存', () => {
        it('应该使用 POST body 作为缓存键的一部分', async () => {
            // 配置路径支持 POST 请求缓存
            const cacheConfig = {
                enabled: true,
                version: 1,
                pathConfigs: {
                    '/api/search': {
                        enabled: true,
                        version: 1,
                        ttl: 300,
                        keyStrategy: 'path-params',
                        keyParams: 'all'
                    }
                }
            };
            await env.API_GATEWAY_STORAGE.put('config:cache', JSON.stringify(cacheConfig));

            // 配置 mock 响应
            fetchMock
                .post('https://dokv.pwtk.cc')
                .intercept({ path: '/api/search' })
                .reply(200, (req) => {
                    return {
                        results: req.body,
                        timestamp: Date.now()
                    };
                });

            // 第一次 POST 请求
            const response1 = await makeWorkerRequest('/api/search', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ keyword: 'test', page: 1 })
            });
            expect(response1.headers.get('x-cache-status')).toBe('MISS');
            const data1 = await response1.json();

            // 第二次 POST 请求（相同body）
            const response2 = await makeWorkerRequest('/api/search', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ keyword: 'test', page: 1 })
            });
            expect(response2.headers.get('x-cache-status')).toBe('HIT');
            const data2 = await response2.json();
            expect(data2.timestamp).toBe(data1.timestamp);

            // 第三次 POST 请求（不同body）
            const response3 = await makeWorkerRequest('/api/search', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ keyword: 'test', page: 2 })
            });
            expect(response3.headers.get('x-cache-status')).toBe('MISS');

            // 应该有2个上游请求
            expect(fetchMock.requests().length).toBe(2);
        });
    });

    describe('缓存条目 API', () => {
        it('应该能够获取路径的所有缓存条目', async () => {
            // 先创建一些缓存
            const cacheConfig = {
                enabled: true,
                version: 1,
                pathConfigs: {
                    '/api/items': {
                        enabled: true,
                        version: 1,
                        keyStrategy: 'path-params',
                        keyParams: ['id']
                    }
                }
            };
            await env.API_GATEWAY_STORAGE.put('config:cache', JSON.stringify(cacheConfig));

            fetchMock
                .get('https://dokv.pwtk.cc')
                .intercept({ path: '/api/items' })
                .reply(200, { data: 'test' });

            // 创建多个缓存条目
            await makeWorkerRequest('/api/items?id=1');
            await makeWorkerRequest('/api/items?id=2');
            await makeWorkerRequest('/api/items?id=3');

            // 查询缓存条目
            const response = await makeWorkerRequest('/admin/paths//api/items/cache-entries?limit=10');
            expect(response.status).toBe(200);

            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.data.path).toBe('/api/items');
            expect(result.data.entries).toBeDefined();
            expect(Array.isArray(result.data.entries)).toBe(true);
            // 应该有至少3个缓存条目
            expect(result.data.entries.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe('向后兼容性', () => {
        it('没有配置策略的路径应该使用默认行为', async () => {
            // 配置路径但不指定策略
            const cacheConfig = {
                enabled: true,
                version: 1,
                pathConfigs: {
                    '/api/legacy': {
                        enabled: true,
                        version: 1
                        // 没有 keyStrategy
                    }
                }
            };
            await env.API_GATEWAY_STORAGE.put('config:cache', JSON.stringify(cacheConfig));

            fetchMock
                .get('https://dokv.pwtk.cc')
                .intercept({ path: '/api/legacy' })
                .reply(200, { timestamp: Date.now() });

            // 第一次请求
            const response1 = await makeWorkerRequest('/api/legacy?param=value1');
            expect(response1.headers.get('x-cache-status')).toBe('MISS');
            const data1 = await response1.json();

            // 第二次请求（相同参数）
            const response2 = await makeWorkerRequest('/api/legacy?param=value1');
            expect(response2.headers.get('x-cache-status')).toBe('HIT');
            const data2 = await response2.json();
            expect(data2.timestamp).toBe(data1.timestamp);

            // 第三次请求（不同参数）
            const response3 = await makeWorkerRequest('/api/legacy?param=value2');
            expect(response3.headers.get('x-cache-status')).toBe('MISS');

            // 应该有2个上游请求（默认 path-params 行为）
            expect(fetchMock.requests().length).toBe(2);
        });
    });
});

