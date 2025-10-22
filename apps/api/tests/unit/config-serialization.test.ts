/**
 * 配置序列化/反序列化测试
 * 
 * 本测试专门验证配置在存储和读取过程中的完整性：
 * 
 * 【关键问题】
 * - JSON.stringify() 会丢弃 undefined 字段
 * - 必须使用 null 而非 undefined 来表示"使用默认值"
 * - KV存储的往返过程必须保留所有字段
 * 
 * 【测试策略】
 * - 测试真实的 JSON.stringify/JSON.parse 流程
 * - 验证 null 字段在序列化后仍然存在
 * - 验证 undefined 字段会被丢弃（负面测试）
 */
import { describe, it, expect } from 'vitest';
import type { PathCacheConfig, CacheConfig } from '../../src/types/config';

describe('配置序列化/反序列化测试', () => {
    describe('【关键测试】JSON.stringify 行为验证', () => {
        it('应该保留 null 值字段', () => {
            const config: PathCacheConfig = {
                enabled: true,
                version: 1,
                ttl: 300,
                keyStrategy: null,  // null 应该被保留
                keyHeaders: null,
                keyParams: null
            };

            // 模拟 KV 存储的序列化
            const serialized = JSON.stringify(config);
            const deserialized = JSON.parse(serialized) as PathCacheConfig;

            // ✅ 验证 null 字段存在
            expect(deserialized).toHaveProperty('keyStrategy');
            expect(deserialized).toHaveProperty('keyHeaders');
            expect(deserialized).toHaveProperty('keyParams');

            // ✅ 验证值为 null
            expect(deserialized.keyStrategy).toBeNull();
            expect(deserialized.keyHeaders).toBeNull();
            expect(deserialized.keyParams).toBeNull();
        });

        it('应该丢弃 undefined 值字段（负面测试）', () => {
            const configWithUndefined = {
                enabled: true,
                version: 1,
                ttl: 300,
                keyStrategy: undefined,  // undefined 会被丢弃
                keyHeaders: undefined,
                keyParams: undefined
            };

            // 模拟 KV 存储的序列化
            const serialized = JSON.stringify(configWithUndefined);
            const deserialized = JSON.parse(serialized);

            // ❌ undefined 字段不存在（这是问题所在！）
            expect(deserialized).not.toHaveProperty('keyStrategy');
            expect(deserialized).not.toHaveProperty('keyHeaders');
            expect(deserialized).not.toHaveProperty('keyParams');

            // 这就是为什么我们必须使用 null 而不是 undefined
        });
    });

    describe('【回归测试】完整配置的序列化往返', () => {
        it('PUT请求保存的配置应该在往返后保持完整', () => {
            // 模拟前端发送的完整配置
            const newConfig = {
                cache: {
                    enabled: true,
                    version: 1,
                    ttl: 300,
                    keyStrategy: 'path-params-headers' as const,
                    keyHeaders: ['cid', 'token', 'x-client-id'],
                    keyParams: 'all' as const
                }
            };

            // 模拟后端保存逻辑（修复后的代码）
            const savedConfig: PathCacheConfig = {
                enabled: newConfig.cache.enabled,
                version: newConfig.cache.version,
                ttl: newConfig.cache.ttl,
                keyStrategy: newConfig.cache.keyStrategy,
                keyHeaders: newConfig.cache.keyHeaders,
                keyParams: newConfig.cache.keyParams
            };

            // ⚠️ 关键：模拟 KV 存储往返
            const serialized = JSON.stringify(savedConfig);
            const deserialized = JSON.parse(serialized) as PathCacheConfig;

            // 验证所有字段都被保留
            expect(deserialized).toEqual({
                enabled: true,
                version: 1,
                ttl: 300,
                keyStrategy: 'path-params-headers',
                keyHeaders: ['cid', 'token', 'x-client-id'],
                keyParams: 'all'
            });

            // 验证关键字段存在且正确
            expect(deserialized.keyStrategy).toBe('path-params-headers');
            expect(deserialized.keyHeaders).toEqual(['cid', 'token', 'x-client-id']);
            expect(deserialized.keyParams).toBe('all');
        });

        it('Flush操作创建的新配置应该在往返后包含 null 字段', () => {
            // 模拟 flush 操作创建新配置（修复后的代码）
            const newConfig: PathCacheConfig = {
                enabled: true,
                version: 2,
                // ⚠️ 使用 null 而非 undefined
                keyStrategy: null,
                keyHeaders: null,
                keyParams: null
            };

            // ⚠️ 关键：模拟 KV 存储往返
            const serialized = JSON.stringify(newConfig);
            const deserialized = JSON.parse(serialized) as PathCacheConfig;

            // 验证配置结构完整
            expect(deserialized).toHaveProperty('keyStrategy');
            expect(deserialized).toHaveProperty('keyHeaders');
            expect(deserialized).toHaveProperty('keyParams');

            // 验证值为 null
            expect(deserialized.keyStrategy).toBeNull();
            expect(deserialized.keyHeaders).toBeNull();
            expect(deserialized.keyParams).toBeNull();
        });

        it('Toggle操作保留的配置应该在往返后保持完整', () => {
            const existingConfig: PathCacheConfig = {
                enabled: false,
                version: 1,
                ttl: 300,
                keyStrategy: 'path-headers',
                keyHeaders: ['authorization', 'x-user-id'],
                keyParams: null
            };

            // 模拟 toggle 操作（修复后的代码）
            const toggledConfig: PathCacheConfig = {
                ...existingConfig,
                enabled: true
            };

            // ⚠️ 关键：模拟 KV 存储往返
            const serialized = JSON.stringify(toggledConfig);
            const deserialized = JSON.parse(serialized) as PathCacheConfig;

            // 验证策略配置被保留
            expect(deserialized.enabled).toBe(true);
            expect(deserialized.keyStrategy).toBe('path-headers');
            expect(deserialized.keyHeaders).toEqual(['authorization', 'x-user-id']);
            expect(deserialized.keyParams).toBeNull();
            expect(deserialized.ttl).toBe(300);
        });
    });

    describe('【边界测试】CacheConfig 完整往返', () => {
        it('完整的 CacheConfig 对象应该在往返后保持完整', () => {
            const config: CacheConfig = {
                version: 1,
                enabled: true,
                defaultTtl: 300,
                whitelist: ['/api/public'],
                pathConfigs: {
                    '/api/user': {
                        enabled: true,
                        version: 1,
                        ttl: 600,
                        keyStrategy: 'path-params-headers',
                        keyHeaders: ['authorization'],
                        keyParams: 'all'
                    },
                    '/api/public': {
                        enabled: true,
                        version: 1,
                        ttl: 300,
                        keyStrategy: null,  // 使用默认策略
                        keyHeaders: null,
                        keyParams: null
                    }
                }
            };

            // ⚠️ 关键：模拟 KV 存储往返（这是 updateConfig 做的事情）
            const serialized = JSON.stringify(config);
            const deserialized = JSON.parse(serialized) as CacheConfig;

            // 验证顶层结构
            expect(deserialized.version).toBe(1);
            expect(deserialized.enabled).toBe(true);
            expect(deserialized.defaultTtl).toBe(300);

            // 验证第一个路径配置（有完整策略）
            const userConfig = deserialized.pathConfigs['/api/user'];
            expect(userConfig.keyStrategy).toBe('path-params-headers');
            expect(userConfig.keyHeaders).toEqual(['authorization']);
            expect(userConfig.keyParams).toBe('all');

            // 验证第二个路径配置（null 策略）
            const publicConfig = deserialized.pathConfigs['/api/public'];
            expect(publicConfig).toHaveProperty('keyStrategy');
            expect(publicConfig).toHaveProperty('keyHeaders');
            expect(publicConfig).toHaveProperty('keyParams');
            expect(publicConfig.keyStrategy).toBeNull();
            expect(publicConfig.keyHeaders).toBeNull();
            expect(publicConfig.keyParams).toBeNull();
        });
    });

    describe('【回归保护】历史Bug验证（带序列化）', () => {
        it('Bug修复验证：PUT请求保存的字段必须在往返后存在', () => {
            const config = {
                cache: {
                    enabled: true,
                    version: 1,
                    ttl: 300,
                    keyStrategy: 'path-params-headers' as const,
                    keyHeaders: ['cid', 'token'],
                    keyParams: 'all' as const
                }
            };

            // 模拟修复后的保存逻辑
            const saved: PathCacheConfig = {
                enabled: config.cache.enabled,
                version: config.cache.version,
                ttl: config.cache.ttl,
                keyStrategy: config.cache.keyStrategy,
                keyHeaders: config.cache.keyHeaders,
                keyParams: config.cache.keyParams
            };

            // ⚠️ 关键：模拟真实的 KV 存储（JSON.stringify）
            const serialized = JSON.stringify(saved);
            const deserialized = JSON.parse(serialized) as PathCacheConfig;

            // 如果这个测试失败，说明字段在序列化过程中丢失
            expect(deserialized).toHaveProperty('keyStrategy');
            expect(deserialized).toHaveProperty('keyHeaders');
            expect(deserialized).toHaveProperty('keyParams');
            expect(deserialized.keyStrategy).toBeDefined();
            expect(deserialized.keyHeaders).toBeDefined();
            expect(deserialized.keyParams).toBeDefined();
        });

        it('Bug修复验证：Flush创建的配置必须使用 null 而非 undefined', () => {
            // ❌ 错误做法：使用 undefined
            const wrongConfig = {
                enabled: true,
                version: 2,
                keyStrategy: undefined,
                keyHeaders: undefined,
                keyParams: undefined
            };

            // ✅ 正确做法：使用 null
            const correctConfig: PathCacheConfig = {
                enabled: true,
                version: 2,
                keyStrategy: null,
                keyHeaders: null,
                keyParams: null
            };

            // 序列化往返
            const wrongSerialized = JSON.stringify(wrongConfig);
            const wrongDeserialized = JSON.parse(wrongSerialized);

            const correctSerialized = JSON.stringify(correctConfig);
            const correctDeserialized = JSON.parse(correctSerialized) as PathCacheConfig;

            // ❌ undefined 版本：字段丢失
            expect(wrongDeserialized).not.toHaveProperty('keyStrategy');
            expect(wrongDeserialized).not.toHaveProperty('keyHeaders');
            expect(wrongDeserialized).not.toHaveProperty('keyParams');

            // ✅ null 版本：字段保留
            expect(correctDeserialized).toHaveProperty('keyStrategy');
            expect(correctDeserialized).toHaveProperty('keyHeaders');
            expect(correctDeserialized).toHaveProperty('keyParams');
            expect(correctDeserialized.keyStrategy).toBeNull();
        });
    });

    describe('【运行时安全】展开运算符测试', () => {
        it('展开 undefined 配置应该使用默认值而非崩溃', () => {
            // 模拟 toggle-cache 操作：路径从未配置过
            const existingCacheConfig = undefined;  // 路径不存在

            // ❌ 错误做法：直接展开会崩溃
            // const config = { ...existingCacheConfig };  // TypeError!

            // ✅ 正确做法：使用 ?? {} 防止崩溃
            const config = {
                ...(existingCacheConfig ?? {}),
                enabled: true,
                version: existingCacheConfig?.version || 1,
                keyStrategy: existingCacheConfig?.keyStrategy ?? null,
                keyHeaders: existingCacheConfig?.keyHeaders ?? null,
                keyParams: existingCacheConfig?.keyParams ?? null
            };

            // 验证不会崩溃且创建了正确的配置
            expect(config.enabled).toBe(true);
            expect(config.version).toBe(1);
            expect(config.keyStrategy).toBeNull();
            expect(config.keyHeaders).toBeNull();
            expect(config.keyParams).toBeNull();
        });

        it('展开现有配置应该保留所有字段', () => {
            // 模拟 toggle-cache 操作：路径已有配置
            const existingCacheConfig = {
                enabled: false,
                version: 5,
                ttl: 600,
                keyStrategy: 'path-headers' as const,
                keyHeaders: ['authorization'],
                keyParams: null
            };

            // 展开现有配置
            const config = {
                ...(existingCacheConfig ?? {}),
                enabled: true,  // 只修改这个字段
                version: existingCacheConfig?.version || 1,
                keyStrategy: existingCacheConfig?.keyStrategy ?? null,
                keyHeaders: existingCacheConfig?.keyHeaders ?? null,
                keyParams: existingCacheConfig?.keyParams ?? null
            };

            // 验证其他字段被保留
            expect(config.enabled).toBe(true);  // 新值
            expect(config.version).toBe(5);     // 保留
            expect(config.ttl).toBe(600);       // 保留
            expect(config.keyStrategy).toBe('path-headers');  // 保留
            expect(config.keyHeaders).toEqual(['authorization']);  // 保留
        });
    });

    describe('【性能测试】序列化性能', () => {
        it('大型配置对象的序列化应该快速完成', () => {
            // 创建一个有100个路径配置的大型对象
            const largeConfig: CacheConfig = {
                version: 1,
                enabled: true,
                whitelist: [],
                pathConfigs: {}
            };

            for (let i = 0; i < 100; i++) {
                largeConfig.pathConfigs[`/api/path${i}`] = {
                    enabled: true,
                    version: 1,
                    ttl: 300,
                    keyStrategy: i % 2 === 0 ? 'path-params-headers' : null,
                    keyHeaders: i % 2 === 0 ? ['header1', 'header2'] : null,
                    keyParams: i % 2 === 0 ? 'all' : null
                };
            }

            const start = performance.now();
            const serialized = JSON.stringify(largeConfig);
            const deserialized = JSON.parse(serialized) as CacheConfig;
            const end = performance.now();

            // 应该在10ms内完成
            expect(end - start).toBeLessThan(10);

            // 验证数据完整性
            expect(Object.keys(deserialized.pathConfigs)).toHaveLength(100);
            expect(deserialized.pathConfigs['/api/path0'].keyStrategy).toBe('path-params-headers');
            expect(deserialized.pathConfigs['/api/path1'].keyStrategy).toBeNull();
        });
    });
});

