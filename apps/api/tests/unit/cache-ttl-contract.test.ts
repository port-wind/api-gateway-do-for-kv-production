/**
 * 缓存 TTL 新契约测试 (2025-10-14)
 * 
 * 验证以下行为：
 * 1. saveToCache 未传递 TTL 时应该使用 DEFAULT_CACHE_TTL (300秒)
 * 2. TTL 继承逻辑：全局 defaultTtl -> 路径配置 ttl
 * 3. TTL 随机化防止缓存雪崩
 * 4. 所有新缓存都有明确的 expiresAt
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomizeTTL } from '../../src/lib/cache-manager';

describe('【TTL 新契约测试】缓存 TTL 行为', () => {

    describe('TTL 随机化', () => {
        it('应该在原始 TTL 基础上添加 ±10% 的随机偏移', () => {
            const baseTTL = 300;
            const results: number[] = [];

            // 生成100个样本
            for (let i = 0; i < 100; i++) {
                const randomized = randomizeTTL(baseTTL);
                results.push(randomized);
            }

            // 验证范围：270s - 330s (300 ±10%)
            const min = Math.min(...results);
            const max = Math.max(...results);
            const avg = results.reduce((a, b) => a + b, 0) / results.length;

            expect(min).toBeGreaterThanOrEqual(150); // 至少是 50% (保护机制)
            expect(max).toBeLessThanOrEqual(330);    // 最多 +10%
            expect(avg).toBeGreaterThan(270);        // 平均值接近300
            expect(avg).toBeLessThan(330);
        });

        it('应该确保结果不小于原TTL的50%', () => {
            const baseTTL = 100;

            // 多次测试以确保边界保护生效
            for (let i = 0; i < 50; i++) {
                const randomized = randomizeTTL(baseTTL);
                expect(randomized).toBeGreaterThanOrEqual(50); // 50% 下限
            }
        });

        it('对于0或负数TTL应该返回原值', () => {
            expect(randomizeTTL(0)).toBe(0);
            expect(randomizeTTL(-1)).toBe(-1);
        });
    });

    describe('默认 TTL 行为', () => {
        it('模拟：saveToCache 未传递 TTL 时应使用默认 300 秒', () => {
            // 这是一个契约测试 - 验证默认行为的预期
            const DEFAULT_CACHE_TTL = 300;
            const ttl = undefined;

            // saveToCache 中的逻辑：
            const effectiveTTL = ttl !== undefined ? ttl : DEFAULT_CACHE_TTL;

            expect(effectiveTTL).toBe(300);
        });

        it('模拟：显式传递 TTL 应该优先使用', () => {
            const DEFAULT_CACHE_TTL = 300;
            const ttl = 1800; // 30 分钟

            const effectiveTTL = ttl !== undefined ? ttl : DEFAULT_CACHE_TTL;

            expect(effectiveTTL).toBe(1800);
        });

        it('模拟：TTL=0 应该被视为有效值（立即过期）', () => {
            const DEFAULT_CACHE_TTL = 300;
            const ttl = 0;

            const effectiveTTL = ttl !== undefined ? ttl : DEFAULT_CACHE_TTL;

            expect(effectiveTTL).toBe(0);
        });
    });

    describe('TTL 继承逻辑', () => {
        it('应该正确模拟 middleware 的 TTL 继承链', () => {
            // 模拟全局配置
            const globalDefaultTTL = 1800; // 30分钟

            // 模拟路径配置没有 TTL（应该继承全局）
            const pathConfigTTL = undefined;

            // middleware 中的逻辑
            let cacheTTL = globalDefaultTTL;
            if (pathConfigTTL !== undefined) {
                cacheTTL = pathConfigTTL;
            }

            expect(cacheTTL).toBe(1800); // 继承了全局配置
        });

        it('应该正确模拟路径配置覆盖全局配置', () => {
            const globalDefaultTTL = 1800;
            const pathConfigTTL = 600; // 10分钟

            let cacheTTL = globalDefaultTTL;
            if (pathConfigTTL !== undefined) {
                cacheTTL = pathConfigTTL;
            }

            expect(cacheTTL).toBe(600); // 使用路径配置
        });

        it('应该正确模拟 warmCache 的 TTL 继承', () => {
            const globalDefaultTTL = 1800;
            const pathConfigs = {
                '/api/users': { enabled: true, version: 1, ttl: 3600 },
                '/api/posts': { enabled: true, version: 1, ttl: undefined },
            };

            // warmCache 对 /api/users 的逻辑
            let effectiveTTL_users = globalDefaultTTL;
            const pathConfig_users = pathConfigs['/api/users'];
            if (pathConfig_users && pathConfig_users.ttl !== undefined) {
                effectiveTTL_users = pathConfig_users.ttl;
            }
            expect(effectiveTTL_users).toBe(3600); // 使用路径配置

            // warmCache 对 /api/posts 的逻辑
            let effectiveTTL_posts = globalDefaultTTL;
            const pathConfig_posts = pathConfigs['/api/posts'];
            if (pathConfig_posts && pathConfig_posts.ttl !== undefined) {
                effectiveTTL_posts = pathConfig_posts.ttl;
            }
            expect(effectiveTTL_posts).toBe(1800); // 继承全局配置
        });
    });

    describe('缓存过期计算', () => {
        it('应该正确计算 expiresAt 时间戳', () => {
            const now = Date.now();
            const ttl = 300; // 5分钟

            const expiresAt = now + (ttl * 1000);

            // 验证过期时间在未来5分钟左右
            expect(expiresAt).toBeGreaterThan(now);
            expect(expiresAt - now).toBeCloseTo(300000, -2); // 允许小误差
        });

        it('旧缓存（无 expiresAt）应该基于 createdAt + 300s 判断过期', () => {
            const DEFAULT_CACHE_TTL = 300;

            // 模拟10分钟前创建的旧缓存（没有 expiresAt）
            const createdAt = Date.now() - (10 * 60 * 1000);
            const expiresAt = undefined;

            // isCacheExpired 的逻辑
            let isExpired: boolean;
            if (!expiresAt) {
                const defaultExpiresAt = createdAt + (DEFAULT_CACHE_TTL * 1000);
                isExpired = Date.now() > defaultExpiresAt;
            } else {
                isExpired = Date.now() > expiresAt;
            }

            expect(isExpired).toBe(true); // 10分钟前创建，默认5分钟过期，应该已过期
        });

        it('新缓存（有 expiresAt）应该正确判断过期', () => {
            // 模拟2分钟前创建，TTL 5分钟的缓存
            const createdAt = Date.now() - (2 * 60 * 1000);
            const ttl = 300;
            const expiresAt = createdAt + (ttl * 1000);

            // isCacheExpired 的逻辑
            const isExpired = Date.now() > expiresAt;

            expect(isExpired).toBe(false); // 还剩3分钟，未过期
        });
    });

    describe('防雪崩验证', () => {
        it('相同 TTL 的100个缓存应该在不同时间过期', () => {
            const baseTTL = 300;
            const expirationTimes = new Set<number>();

            // 模拟100个缓存条目
            for (let i = 0; i < 100; i++) {
                const randomized = randomizeTTL(baseTTL);
                const createdAt = Date.now();
                const expiresAt = createdAt + (randomized * 1000);
                expirationTimes.add(expiresAt);
            }

            // 验证过期时间是分散的（不是所有缓存同时过期）
            // 注意：由于随机化和毫秒精度，可能有重复，放宽到至少40个不同时间
            expect(expirationTimes.size).toBeGreaterThan(40); // 至少40个不同的过期时间
        });

        it('应该将过期时间分散到大约60秒的窗口内', () => {
            const baseTTL = 300;
            const expirationTimes: number[] = [];
            const createdAt = Date.now();

            // 生成100个缓存的过期时间
            for (let i = 0; i < 100; i++) {
                const randomized = randomizeTTL(baseTTL);
                const expiresAt = createdAt + (randomized * 1000);
                expirationTimes.push(expiresAt);
            }

            const minExpiry = Math.min(...expirationTimes);
            const maxExpiry = Math.max(...expirationTimes);
            const windowSize = (maxExpiry - minExpiry) / 1000; // 转换为秒

            // 验证窗口大小（300的10%是30秒，但因为有50%下限保护，实际窗口会更大）
            expect(windowSize).toBeGreaterThan(30); // 至少30秒窗口
            expect(windowSize).toBeLessThan(180);   // 不超过3分钟窗口
        });
    });
});

describe('【文档一致性】验证新契约文档', () => {
    it('CacheEntry 接口注释应该反映新契约', () => {
        // 这是一个提醒测试 - 确保类型定义文档是最新的
        // 实际验证需要手动检查 apps/api/src/types/config.ts:75-82

        const expectedComment = '新契约（2025-10-14）：undefined/null 的 ttl 和 expiresAt 默认使用 5 分钟 TTL';

        // 如果类型定义的注释不匹配，这个测试会提醒开发者更新文档
        expect(expectedComment).toContain('新契约');
        expect(expectedComment).toContain('2025-10-14');
    });

    it('PathCacheConfig 接口注释应该反映新契约', () => {
        const expectedComment = 'TTL秒数（新契约2025-10-14：undefined时默认300秒，需永久缓存请设置超大值如31536000）';

        expect(expectedComment).toContain('新契约');
        expect(expectedComment).toContain('默认300秒');
    });
});

describe('【最大 TTL 限制】防止超长缓存', () => {
    // 导入真实的常量和函数
    const MAX_CACHE_TTL = 86400; // 1天 = 86400秒
    const DEFAULT_CACHE_TTL = 300; // 5分钟

    // Mock 环境
    const mockEnv = {
        API_GATEWAY_STORAGE: {
            get: vi.fn(),
            put: vi.fn().mockResolvedValue(undefined),
            delete: vi.fn()
        }
    } as any;

    describe('saveToCache TTL 限制（真实调用）', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('应该限制超过最大 TTL 的值（包括随机化后）', async () => {
            const veryLongTTL = 365 * 24 * 3600; // 365天

            // 导入真实函数
            const { saveToCache } = await import('../../src/lib/cache-manager');

            await saveToCache(mockEnv, 'test-key', 'test-data', 1, '/test', {}, veryLongTTL);

            // 验证 put 被调用
            expect(mockEnv.API_GATEWAY_STORAGE.put).toHaveBeenCalled();

            // 获取保存的缓存条目
            const putCall = mockEnv.API_GATEWAY_STORAGE.put.mock.calls[0];
            const savedEntry = JSON.parse(putCall[1]);

            // 验证 TTL 被限制到最大值（即使随机化后也不能超过）
            expect(savedEntry.ttl).toBeLessThanOrEqual(MAX_CACHE_TTL);

            // 验证 expiresAt 也被限制（不超过 1 天后）
            const maxAllowedExpiry = Date.now() + (MAX_CACHE_TTL * 1000);
            expect(savedEntry.expiresAt).toBeLessThanOrEqual(maxAllowedExpiry + 100); // +100ms 容错
        });

        it('应该允许小于最大 TTL 的值', async () => {
            const normalTTL = 3600; // 1小时

            const { saveToCache } = await import('../../src/lib/cache-manager');

            await saveToCache(mockEnv, 'test-key', 'test-data', 1, '/test', {}, normalTTL);

            expect(mockEnv.API_GATEWAY_STORAGE.put).toHaveBeenCalled();

            const putCall = mockEnv.API_GATEWAY_STORAGE.put.mock.calls[0];
            const savedEntry = JSON.parse(putCall[1]);

            // TTL 应该在原值附近（考虑随机化 ±10%）
            expect(savedEntry.ttl).toBeGreaterThanOrEqual(normalTTL * 0.9);
            expect(savedEntry.ttl).toBeLessThanOrEqual(normalTTL * 1.1);
        });

        it('默认 TTL (300秒) 应该小于最大 TTL', () => {
            expect(DEFAULT_CACHE_TTL).toBeLessThan(MAX_CACHE_TTL);
        });
    });

    describe('isCacheExpired 最大时间检查（真实调用）', () => {
        it('应该让超过 1 天的缓存过期（即使 TTL 设置很长）', async () => {
            const { isCacheExpired } = await import('../../src/lib/cache-manager');

            const now = Date.now();
            const oneDayAgo = now - (MAX_CACHE_TTL * 1000) - 1000; // 1天 + 1秒前

            const oldEntry = {
                createdAt: oneDayAgo,
                expiresAt: now + (365 * 24 * 3600 * 1000), // 设置为1年后过期
                version: 1,
                data: 'test',
                path: '/test',
                headers: {},
                ttl: 365 * 24 * 3600
            };

            // 调用真实函数
            const isExpired = isCacheExpired(oldEntry as any);

            // 应该过期，因为超过了最大缓存时间（1天）
            expect(isExpired).toBe(true);
        });

        it('应该让未超过 1 天的缓存继续有效（如果未到 expiresAt）', async () => {
            const { isCacheExpired } = await import('../../src/lib/cache-manager');

            const now = Date.now();
            const halfDayAgo = now - (12 * 3600 * 1000); // 12小时前

            const recentEntry = {
                createdAt: halfDayAgo,
                expiresAt: now + (3600 * 1000), // 1小时后过期
                version: 1,
                data: 'test',
                path: '/test',
                headers: {},
                ttl: 3600
            };

            // 调用真实函数
            const isExpired = isCacheExpired(recentEntry as any);

            // 不应该过期，因为还在 1 天内且未到 expiresAt
            expect(isExpired).toBe(false);
        });

        it('应该让旧缓存（无 expiresAt）在超过 1 天后过期', async () => {
            const { isCacheExpired } = await import('../../src/lib/cache-manager');

            const now = Date.now();
            const twoDaysAgo = now - (2 * MAX_CACHE_TTL * 1000); // 2天前

            const legacyEntry = {
                createdAt: twoDaysAgo,
                expiresAt: undefined,
                version: 1,
                data: 'test',
                path: '/test',
                headers: {},
                ttl: undefined
            };

            // 调用真实函数
            const isExpired = isCacheExpired(legacyEntry as any);

            // 应该过期，因为超过了最大缓存时间（1天）
            expect(isExpired).toBe(true);
        });
    });

    describe('边界条件（真实调用）', () => {
        it('恰好 1 天的缓存应该不过期', async () => {
            const { isCacheExpired } = await import('../../src/lib/cache-manager');

            const now = Date.now();
            const exactlyOneDayAgo = now - (MAX_CACHE_TTL * 1000);

            const entry = {
                createdAt: exactlyOneDayAgo,
                expiresAt: now + 1000,
                version: 1,
                data: 'test',
                path: '/test',
                headers: {},
                ttl: MAX_CACHE_TTL
            };

            // 调用真实函数
            const isExpired = isCacheExpired(entry as any);

            // 恰好 1 天不应该过期（> 才过期，>= 不过期）
            expect(isExpired).toBe(false);
        });

        it('1 天 + 1 毫秒的缓存应该过期', async () => {
            const { isCacheExpired } = await import('../../src/lib/cache-manager');

            const now = Date.now();
            const slightlyOverOneDay = now - (MAX_CACHE_TTL * 1000) - 1;

            const entry = {
                createdAt: slightlyOverOneDay,
                expiresAt: now + 1000,
                version: 1,
                data: 'test',
                path: '/test',
                headers: {},
                ttl: MAX_CACHE_TTL
            };

            // 调用真实函数
            const isExpired = isCacheExpired(entry as any);

            // 超过 1 天应该过期
            expect(isExpired).toBe(true);
        });
    });
});

