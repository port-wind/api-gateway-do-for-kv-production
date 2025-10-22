/**
 * 简化统计实现验证测试
 */

import { describe, test, expect } from 'vitest';
import {
    aggregateEvents,
    calculatePercentiles,
    generateStatsSummary,
    mergeStats,
    serializeStats,
    deserializeStats,
    type TrafficEvent,
    type SimplifiedStats,
} from '../../src/lib/simplified-stats';

describe('Phase 0: 简化统计实现验证', () => {
    test('聚合事件', () => {
        const events: TrafficEvent[] = [
            {
                path: '/api/test',
                method: 'GET',
                status: 200,
                responseTime: 100,
                clientIpHash: 'hash1',
                timestamp: Date.now(),
            },
            {
                path: '/api/test',
                method: 'GET',
                status: 500,
                responseTime: 200,
                clientIpHash: 'hash2',
                timestamp: Date.now(),
            },
            {
                path: '/api/test',
                method: 'GET',
                status: 200,
                responseTime: 150,
                clientIpHash: 'hash1', // 重复 IP
                timestamp: Date.now(),
            },
        ];

        const stats = aggregateEvents(events, null);

        expect(stats.requests).toBe(3);
        expect(stats.errors).toBe(1); // status >= 400
        expect(stats.response_samples).toHaveLength(3);
        expect(stats.ip_hashes).toHaveLength(2); // hash1, hash2（去重）
        expect(stats.unique_ips_seen).toBe(2); // 水库中有 2 个不同 IP
        expect(stats.sum_response_time).toBe(450);

        console.log('✅ 聚合事件测试通过');
        console.log(`   请求数: ${stats.requests}, 错误数: ${stats.errors}, 水库中唯一 IP: ${stats.unique_ips_seen}`);
    });

    test('增量聚合（基于现有统计）', () => {
        const existing: SimplifiedStats = {
            path: '/api/test',
            hour_bucket: '2025-10-15T10',
            requests: 100,
            errors: 10,
            sum_response_time: 5000,
            count_response_time: 100,
            response_samples: Array.from({ length: 50 }, (_, i) => i * 10),
            ip_hashes: ['hash1', 'hash2'],
            unique_ips_seen: 2,
        };

        const newEvents: TrafficEvent[] = [
            {
                path: '/api/test',
                method: 'GET',
                status: 200,
                responseTime: 120,
                clientIpHash: 'hash3', // 新 IP
                timestamp: Date.now(),
            },
        ];

        const stats = aggregateEvents(newEvents, existing);

        expect(stats.requests).toBe(101);
        expect(stats.errors).toBe(10);
        expect(stats.response_samples).toHaveLength(51); // 50 + 1
        expect(stats.ip_hashes).toHaveLength(3); // hash1, hash2, hash3
        expect(stats.unique_ips_seen).toBe(3); // 水库中有 3 个不同 IP
        expect(stats.sum_response_time).toBe(5120);

        console.log('✅ 增量聚合测试通过');
        console.log(`   新请求数: ${stats.requests}, 新样本数: ${stats.response_samples.length}, 水库中唯一 IP: ${stats.unique_ips_seen}`);
    });

    test('采样限制（最多 1000 个）+ 水库采样验证', () => {
        const existing: SimplifiedStats = {
            path: '/api/test',
            hour_bucket: '2025-10-15T10',
            requests: 1000,
            errors: 0,
            sum_response_time: 100000,
            count_response_time: 1000,
            response_samples: Array.from({ length: 1000 }, (_, i) => i), // 已满
            ip_hashes: Array.from({ length: 1000 }, (_, i) => `hash${i}`), // 已满
            unique_ips_seen: 1000, // 已见过 1000 个不同 IP
        };

        const newEvents: TrafficEvent[] = [
            {
                path: '/api/test',
                method: 'GET',
                status: 200,
                responseTime: 999,
                clientIpHash: 'new-hash', // 第 1001 个唯一 IP
                timestamp: Date.now(),
            },
        ];

        const stats = aggregateEvents(newEvents, existing);

        // 样本和 IP 哈希数量不应超过 1000
        expect(stats.response_samples).toHaveLength(1000);
        expect(stats.ip_hashes).toHaveLength(1000);
        expect(stats.unique_ips_seen).toBe(1000); // 水库中保持 1000 个 IP

        // 但请求计数应该继续增加
        expect(stats.requests).toBe(1001);

        console.log('✅ 采样限制测试通过');
        console.log(`   样本数: ${stats.response_samples.length}（最大 1000）`);
        console.log(`   IP 数: ${stats.ip_hashes.length}（最大 1000）`);
        console.log(`   水库中唯一 IP: ${stats.unique_ips_seen}（固定 1000）`);
    });

    test('计算百分位', () => {
        const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

        const percentiles = calculatePercentiles(samples);

        expect(percentiles.min).toBe(10);
        expect(percentiles.max).toBe(100);
        expect(percentiles.avg).toBe(55);
        expect(percentiles.p50).toBe(50);
        expect(percentiles.p95).toBe(90);
        expect(percentiles.p99).toBe(100);

        console.log('✅ 百分位计算测试通过');
        console.log(`   p50: ${percentiles.p50}, p95: ${percentiles.p95}, p99: ${percentiles.p99}`);
        console.log(`   avg: ${percentiles.avg}, min: ${percentiles.min}, max: ${percentiles.max}`);
    });

    test('空数据处理', () => {
        const percentiles = calculatePercentiles([]);

        expect(percentiles.p50).toBe(0);
        expect(percentiles.p95).toBe(0);
        expect(percentiles.p99).toBe(0);

        console.log('✅ 空数据处理测试通过');
    });

    test('序列化与反序列化', () => {
        const original: SimplifiedStats = {
            path: '/api/test',
            hour_bucket: '2025-10-15T10',
            requests: 100,
            errors: 10,
            sum_response_time: 5000,
            count_response_time: 100,
            response_samples: [10, 20, 30],
            ip_hashes: ['hash1', 'hash2'],
            unique_ips_seen: 2,
        };

        // 序列化
        const serialized = serializeStats(original);
        expect(serialized.response_samples).toBe('[10,20,30]');
        expect(serialized.ip_hashes).toBe('["hash1","hash2"]');

        // 反序列化
        const deserialized = deserializeStats(serialized);
        expect(deserialized).toEqual(original);

        console.log('✅ 序列化/反序列化测试通过');
    });

    test('生成统计摘要', () => {
        const stats: SimplifiedStats = {
            path: '/api/test',
            hour_bucket: '2025-10-15T10',
            requests: 100,
            errors: 5,
            sum_response_time: 10000,
            count_response_time: 100,
            response_samples: Array.from({ length: 100 }, (_, i) => i * 10),
            ip_hashes: Array.from({ length: 50 }, (_, i) => `hash${i}`),
            unique_ips_seen: 50,
        };

        const summary = generateStatsSummary(stats);

        expect(summary.requests).toBe(100);
        expect(summary.errors).toBe(5);
        expect(summary.error_rate).toBe(0.05);
        expect(summary.unique_ips_min).toBe(50); // 至少有 50 个唯一 IP
        expect(summary.accuracy_note).toBe('完全采样 50 个唯一 IP，准确度 100%');

        console.log('✅ 统计摘要生成测试通过');
        console.log(`   错误率: ${(summary.error_rate * 100).toFixed(2)}%`);
        console.log(`   唯一 IP (下界): ${summary.unique_ips_min}`);
        console.log(`   准确度: ${summary.accuracy_note}`);
    });

    test('水库采样下界估计', () => {
        // 低流量：完全采样
        const lowTraffic: SimplifiedStats = {
            path: '/api/test',
            hour_bucket: '2025-10-15T10',
            requests: 500,
            errors: 0,
            sum_response_time: 50000,
            count_response_time: 500,
            response_samples: Array.from({ length: 500 }, () => 100),
            ip_hashes: Array.from({ length: 500 }, (_, i) => `hash${i}`),
            unique_ips_seen: 500, // 水库中有 500 个 IP
        };

        const lowSummary = generateStatsSummary(lowTraffic);
        expect(lowSummary.unique_ips_min).toBe(500); // 至少 500 个
        expect(lowSummary.accuracy_note).toBe('完全采样 500 个唯一 IP，准确度 100%');

        // 高流量：水库已满
        const highTraffic: SimplifiedStats = {
            path: '/api/test',
            hour_bucket: '2025-10-15T10',
            requests: 5000,
            errors: 0,
            sum_response_time: 500000,
            count_response_time: 5000,
            response_samples: Array.from({ length: 1000 }, () => 100), // 最多 1000
            ip_hashes: Array.from({ length: 1000 }, (_, i) => `hash${i}`), // 最多 1000
            unique_ips_seen: 1000, // 水库中保持 1000 个 IP
        };

        const highSummary = generateStatsSummary(highTraffic);
        expect(highSummary.unique_ips_min).toBe(1000); // 至少 1000 个
        expect(highSummary.accuracy_note).toContain('≥ 1000'); // 下界估计

        console.log('✅ 水库采样下界估计测试通过');
        console.log(`   低流量唯一 IP (下界): ${lowSummary.unique_ips_min}`);
        console.log(`   高流量唯一 IP (下界): ${highSummary.unique_ips_min}`);
    });

    test('合并多个小时桶', () => {
        const stats1: SimplifiedStats = {
            path: '/api/test',
            hour_bucket: '2025-10-15T10',
            requests: 100,
            errors: 5,
            sum_response_time: 10000,
            count_response_time: 100,
            response_samples: [100, 200, 300],
            ip_hashes: ['hash1', 'hash2'],
            unique_ips_seen: 2,
        };

        const stats2: SimplifiedStats = {
            path: '/api/test',
            hour_bucket: '2025-10-15T11',
            requests: 150,
            errors: 10,
            sum_response_time: 15000,
            count_response_time: 150,
            response_samples: [150, 250, 350],
            ip_hashes: ['hash2', 'hash3'], // hash2 重复
            unique_ips_seen: 2,
        };

        const merged = mergeStats([stats1, stats2]);

        expect(merged.requests).toBe(250); // 100 + 150
        expect(merged.errors).toBe(15); // 5 + 10
        expect(merged.sum_response_time).toBe(25000); // 10000 + 15000
        expect(merged.response_samples).toHaveLength(6); // 3 + 3
        expect(merged.ip_hashes).toHaveLength(3); // hash1, hash2, hash3（去重）
        expect(merged.unique_ips_seen).toBe(3); // 合并后水库中的唯一 IP 数

        console.log('✅ 合并统计测试通过');
        console.log(`   合并后请求数: ${merged.requests}, 水库中唯一 IP: ${merged.unique_ips_seen}`);
    });

    test.skip('水库轮转导致重复计数（已知限制）', () => {
        // ⚠️ 已知限制：被驱逐的 IP 再次出现时会被误判为"新IP"
        // 这是标准水库采样的固有限制（无法维护完整的历史记录）
        // Phase 5 可使用 HyperLogLog 解决此问题

        // 场景：1000 个唯一 IP → IP#1 被驱逐 → IP#1 再次出现
        // 结果：IP#1 会被误判为"新IP"
        // 导致：unique_ips_seen 可能大于真实唯一 IP 数

        console.log('⏭ 跳过：水库采样无法避免重复计数（Phase 5 使用 HyperLogLog）');
    });

    test('性能基准测试', () => {
        const iterations = 100;
        const eventsPerBatch = 100;

        const startTime = performance.now();

        for (let i = 0; i < iterations; i++) {
            const events: TrafficEvent[] = Array.from({ length: eventsPerBatch }, (_, j) => ({
                path: '/api/test',
                method: 'GET',
                status: Math.random() > 0.95 ? 500 : 200,
                responseTime: Math.random() * 1000,
                clientIpHash: `hash${j}`,
                timestamp: Date.now(),
            }));

            const stats = aggregateEvents(events, null);
            const summary = generateStatsSummary(stats);
        }

        const endTime = performance.now();
        const totalTime = endTime - startTime;
        const avgTime = totalTime / iterations;

        console.log('✅ 性能基准测试完成');
        console.log(`   总时间: ${totalTime.toFixed(2)} ms`);
        console.log(`   平均时间: ${avgTime.toFixed(2)} ms/批（${eventsPerBatch} 个事件）`);
        console.log(`   吞吐量: ${((iterations * eventsPerBatch) / totalTime * 1000).toFixed(0)} 事件/秒`);

        // 验证性能要求
        expect(avgTime).toBeLessThan(10); // 目标：<10ms/批
    });
});

