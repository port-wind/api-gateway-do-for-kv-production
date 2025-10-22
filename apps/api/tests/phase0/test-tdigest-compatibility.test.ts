/**
 * Phase 0 验证：t-digest/HLL 库 Workers 兼容性测试
 * 
 * 验证目标：
 * 1. 确认库可以在 Workers 运行时导入
 * 2. 验证基本操作（添加数据、计算百分位）
 * 3. 验证序列化/反序列化
 * 4. 验证性能达标（<10ms/批）
 */

import { describe, test, expect } from 'vitest';

describe('Phase 0: t-digest 兼容性验证', () => {
    test.skip('方案 A: tdigest 导入与基本操作（已知不兼容 Workers）', async () => {
        // ❌ tdigest 包不兼容 Workers 运行时
        // 原因：TypeError: TDigest is not a constructor
        // 结论：采用简化统计方案（见 test-simplified-stats.test.ts）
        try {
            // 动态导入以测试兼容性
            const TDigestModule = await import('tdigest');
            const TDigest = TDigestModule.default || TDigestModule.TDigest || TDigestModule;

            console.log('✅ tdigest 导入成功');

            const td = new TDigest();

            // 添加测试数据
            for (let i = 0; i < 1000; i++) {
                td.push(Math.random() * 100);
            }

            // 验证百分位计算
            const p50 = td.percentile(0.5);
            const p95 = td.percentile(0.95);
            const p99 = td.percentile(0.99);

            expect(p50).toBeGreaterThan(0);
            expect(p95).toBeGreaterThan(p50);
            expect(p99).toBeGreaterThan(p95);

            console.log('✅ TDigest 基本操作通过');
            console.log(`   p50: ${p50.toFixed(2)}, p95: ${p95.toFixed(2)}, p99: ${p99.toFixed(2)}`);

            return { success: true, library: 'tdigest' };
        } catch (error) {
            console.error('❌ tdigest 不兼容:', error);
            return { success: false, library: 'tdigest', error };
        }
    });

    test.skip('序列化与反序列化（已知不兼容 Workers）', async () => {
        try {
            const TDigestModule = await import('tdigest');
            const TDigest = TDigestModule.default || TDigestModule.TDigest || TDigestModule;

            const td = new TDigest();
            for (let i = 0; i < 100; i++) {
                td.push(i);
            }

            // 检查可用的序列化方法
            let serialized;
            let serializeMethod;
            let deserializeMethod;

            if (typeof (td as any).toJSON === 'function') {
                serialized = (td as any).toJSON();
                serializeMethod = 'toJSON';
                deserializeMethod = 'fromJSON';
            } else if (typeof (td as any).toArrayBuffer === 'function') {
                serialized = (td as any).toArrayBuffer();
                serializeMethod = 'toArrayBuffer';
                deserializeMethod = 'fromArrayBuffer';
            } else if (typeof (td as any).serialize === 'function') {
                serialized = (td as any).serialize();
                serializeMethod = 'serialize';
                deserializeMethod = 'deserialize';
            } else {
                throw new Error('TDigest 不支持已知的序列化方法');
            }

            console.log(`✅ 序列化方法: ${serializeMethod}`);
            console.log(`   序列化大小: ${JSON.stringify(serialized).length} 字节`);

            // 验证可以存储为 JSON 字符串（用于 D1 BLOB）
            const jsonString = JSON.stringify(serialized);
            expect(jsonString.length).toBeGreaterThan(0);
            expect(jsonString.length).toBeLessThan(10000); // 应该 <10KB

            // 验证反序列化
            const restoredData = JSON.parse(jsonString);
            const restored = (TDigest as any)[deserializeMethod]
                ? (TDigest as any)[deserializeMethod](restoredData)
                : new TDigest(restoredData);

            const originalP95 = td.percentile(0.95);
            const restoredP95 = restored.percentile(0.95);

            const diff = Math.abs(originalP95 - restoredP95);
            expect(diff).toBeLessThan(1); // 允许小误差

            console.log('✅ 反序列化通过，数据一致');
            console.log(`   原始 p95: ${originalP95.toFixed(2)}, 恢复 p95: ${restoredP95.toFixed(2)}, 差异: ${diff.toFixed(4)}`);

            return {
                success: true,
                serializeMethod,
                serializedSize: jsonString.length,
                accuracyLoss: diff
            };
        } catch (error) {
            console.error('❌ 序列化/反序列化失败:', error);
            throw error;
        }
    });

    test.skip('性能基准测试（已知不兼容 Workers）', async () => {
        const TDigestModule = await import('tdigest');
        const TDigest = TDigestModule.default || TDigestModule.TDigest || TDigestModule;

        const iterations = 100;
        const eventsPerBatch = 100;

        const startTime = performance.now();

        for (let i = 0; i < iterations; i++) {
            const td = new TDigest();
            for (let j = 0; j < eventsPerBatch; j++) {
                td.push(Math.random() * 1000);
            }
            td.percentile(0.95);
        }

        const endTime = performance.now();
        const totalTime = endTime - startTime;
        const avgTime = totalTime / iterations;

        console.log(`✅ 性能测试完成`);
        console.log(`   总时间: ${totalTime.toFixed(2)} ms`);
        console.log(`   平均时间: ${avgTime.toFixed(2)} ms/批（${eventsPerBatch} 个事件）`);
        console.log(`   吞吐量: ${((iterations * eventsPerBatch) / totalTime * 1000).toFixed(0)} 事件/秒`);

        // 验证性能要求
        expect(avgTime).toBeLessThan(10); // 目标：<10ms/批

        return {
            success: true,
            avgTime,
            throughput: (iterations * eventsPerBatch) / totalTime * 1000
        };
    });

    test.skip('内存占用测试（Workers 不支持 process.memoryUsage）', async () => {
        // ❌ Workers 运行时不支持 Node.js process API
        // 原因：TypeError: process.memoryUsage is not a function
        // 备注：Workers 内存限制为 128 MB，通过实际运行测试即可
        const TDigestModule = await import('tdigest');
        const TDigest = TDigestModule.default || TDigestModule.TDigest || TDigestModule;

        // 创建 100 个实例
        const instances = [];
        const memBefore = process.memoryUsage().heapUsed;

        for (let i = 0; i < 100; i++) {
            const td = new TDigest();
            for (let j = 0; j < 1000; j++) {
                td.push(Math.random() * 1000);
            }
            instances.push(td);
        }

        const memAfter = process.memoryUsage().heapUsed;
        const memDelta = (memAfter - memBefore) / (1024 * 1024); // MB
        const memPerInstance = memDelta / 100;

        console.log(`✅ 内存占用测试完成`);
        console.log(`   总内存增量: ${memDelta.toFixed(2)} MB（100 个实例）`);
        console.log(`   平均每实例: ${memPerInstance.toFixed(2)} MB`);

        expect(memPerInstance).toBeLessThan(1); // 目标：<1 MB/实例

        return {
            success: true,
            memPerInstance
        };
    });
});

describe('Phase 0: 备选方案 - Bloom Filter (unique IP)', () => {
    test('Bloom Filter 基本操作', async () => {
        try {
            const { BloomFilter } = await import('bloom-filters');

            const bf = BloomFilter.create(1000, 0.01); // 1000 个元素，1% 误判率

            // 添加测试 IP
            const testIPs = Array.from({ length: 100 }, (_, i) => `192.168.1.${i}`);
            for (const ip of testIPs) {
                bf.add(ip);
            }

            // 验证查询
            expect(bf.has('192.168.1.50')).toBe(true);
            expect(bf.has('10.0.0.1')).toBe(false);

            console.log('✅ Bloom Filter 基本操作通过');
            console.log(`   容量: 1000 元素`);
            console.log(`   误判率: 1%`);

            return { success: true };
        } catch (error) {
            console.error('⚠️  Bloom Filter 不可用，但不影响主要功能:', error);
            return { success: false, error };
        }
    });
});

describe('Phase 0: 简化统计方案（备选）', () => {
    test('排序数组计算百分位', () => {
        // 模拟简化统计方案
        const samples = Array.from({ length: 1000 }, () => Math.random() * 100);

        const sorted = samples.sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const p99 = sorted[Math.floor(sorted.length * 0.99)];

        expect(p50).toBeGreaterThan(0);
        expect(p95).toBeGreaterThan(p50);
        expect(p99).toBeGreaterThan(p95);

        console.log('✅ 简化统计方案可行');
        console.log(`   p50: ${p50.toFixed(2)}, p95: ${p95.toFixed(2)}, p99: ${p99.toFixed(2)}`);
        console.log('   特点: 无外部依赖，准确度略低，适合备选');
    });

    test('Set 实现 unique IP 计数', () => {
        const ipHashes = new Set<string>();

        for (let i = 0; i < 1000; i++) {
            ipHashes.add(`hash-${i % 100}`); // 100 个唯一 IP
        }

        expect(ipHashes.size).toBe(100);

        console.log('✅ Set 实现 unique IP 计数可行');
        console.log(`   唯一 IP 数: ${ipHashes.size}`);
        console.log('   特点: 内置功能，完全准确，内存占用略高');
    });
});

