/**
 * IP 黑名单增量同步测试
 * 
 * 验证：
 * 1. 封禁 IP 正确添加到缓存
 * 2. 解封 IP 正确从缓存移除
 * 3. 时间戳格式正确（SQLite 格式）
 * 4. 增量同步正确工作
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IpBlacklistCache } from '../src/lib/optimized-cache';

describe('IpBlacklistCache 增量同步', () => {
    let cache: IpBlacklistCache;
    let mockEnv: any;

    beforeEach(() => {
        // Mock D1 database
        const mockD1Results: any[] = [];

        mockEnv = {
            D1: {
                prepare: vi.fn((query: string) => ({
                    bind: vi.fn((...args: any[]) => ({
                        all: vi.fn(async () => ({ results: mockD1Results })),
                        run: vi.fn(async () => ({ success: true })),
                        first: vi.fn(async () => mockD1Results[0] || null)
                    })),
                    all: vi.fn(async () => ({ results: mockD1Results })),
                    run: vi.fn(async () => ({ success: true }))
                }))
            }
        };

        cache = new IpBlacklistCache(mockEnv);
    });

    it('应该正确添加封禁 IP 到缓存', async () => {
        // 模拟首次同步：返回 2 个被封禁的 IP
        const mockResults = [
            { ip: '1.2.3.4', status: 'banned', updated_at: '2025-10-19 12:00:00' },
            { ip: '5.6.7.8', status: 'banned', updated_at: '2025-10-19 12:01:00' }
        ];

        // 修改 mock 返回
        mockEnv.D1.prepare = vi.fn(() => ({
            bind: vi.fn(() => ({
                all: vi.fn(async () => ({ results: mockResults }))
            })),
            all: vi.fn(async () => ({ results: mockResults }))
        }));

        // 触发同步
        await cache.warmup();

        // 验证：两个 IP 都应该被封禁
        expect(await cache.isBanned('1.2.3.4')).toBe(true);
        expect(await cache.isBanned('5.6.7.8')).toBe(true);
        expect(await cache.isBanned('9.9.9.9')).toBe(false);
    });

    it('应该正确从缓存移除解封的 IP', async () => {
        // 首次同步：1.2.3.4 被封禁
        const initialResults = [
            { ip: '1.2.3.4', status: 'banned', updated_at: '2025-10-19 12:00:00' }
        ];

        mockEnv.D1.prepare = vi.fn(() => ({
            all: vi.fn(async () => ({ results: initialResults }))
        }));

        await cache.warmup();
        expect(await cache.isBanned('1.2.3.4')).toBe(true);

        // 增量同步：1.2.3.4 被解封
        const deltaResults = [
            { ip: '1.2.3.4', status: 'active', updated_at: '2025-10-19 12:05:00' }
        ];

        mockEnv.D1.prepare = vi.fn(() => ({
            bind: vi.fn(() => ({
                all: vi.fn(async () => ({ results: deltaResults }))
            }))
        }));

        // 手动触发同步（使用 warmup 重新同步）
        await cache.warmup();

        // 验证：IP 应该被解封
        expect(await cache.isBanned('1.2.3.4')).toBe(false);
    });

    it('应该使用 SQLite 格式的时间戳进行增量同步', async () => {
        // 首次同步
        const initialResults = [
            { ip: '1.2.3.4', status: 'banned', updated_at: '2025-10-19 12:00:00' }
        ];

        mockEnv.D1.prepare = vi.fn(() => ({
            all: vi.fn(async () => ({ results: initialResults }))
        }));

        await cache.warmup();

        // 准备增量同步的 mock
        const deltaResults = [
            { ip: '5.6.7.8', status: 'banned', updated_at: '2025-10-19 12:05:00' }
        ];

        let capturedQuery = '';
        let capturedBindArgs: any[] = [];

        mockEnv.D1.prepare = vi.fn((query: string) => {
            capturedQuery = query;
            return {
                bind: vi.fn((...args: any[]) => {
                    capturedBindArgs = args;
                    return {
                        all: vi.fn(async () => ({ results: deltaResults }))
                    };
                }),
                all: vi.fn(async () => ({ results: deltaResults }))
            };
        });

        // 再次调用 warmup 触发增量同步（因为 lastSyncTimestamp 已设置）
        await cache.warmup();

        // 验证：
        // 1. 增量查询应该使用 datetime(?)
        expect(capturedQuery).toContain('datetime(?)');

        // 2. bind 参数应该是 SQLite 格式（YYYY-MM-DD HH:MM:SS）
        expect(capturedBindArgs.length).toBeGreaterThan(0);
        const timestamp = capturedBindArgs[0];

        // 验证格式：不应该包含 'T' 或 'Z'（ISO 格式特征）
        expect(timestamp).not.toContain('T');
        expect(timestamp).not.toContain('Z');
        // 应该符合 SQLite 格式
        expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('应该正确处理封禁和解封的混合变更', async () => {
        // 首次同步：两个 IP 被封禁
        const initialResults = [
            { ip: '1.2.3.4', status: 'banned', updated_at: '2025-10-19 12:00:00' },
            { ip: '5.6.7.8', status: 'banned', updated_at: '2025-10-19 12:01:00' }
        ];

        mockEnv.D1.prepare = vi.fn(() => ({
            all: vi.fn(async () => ({ results: initialResults }))
        }));

        await cache.warmup();

        // 验证初始状态
        expect(await cache.isBanned('1.2.3.4')).toBe(true);
        expect(await cache.isBanned('5.6.7.8')).toBe(true);

        // 增量同步：混合变更
        // - 1.2.3.4 解封
        // - 5.6.7.8 保持封禁（不在增量结果中）
        // - 9.9.9.9 新封禁
        const deltaResults = [
            { ip: '1.2.3.4', status: 'active', updated_at: '2025-10-19 12:05:00' },
            { ip: '9.9.9.9', status: 'banned', updated_at: '2025-10-19 12:06:00' }
        ];

        mockEnv.D1.prepare = vi.fn(() => ({
            bind: vi.fn(() => ({
                all: vi.fn(async () => ({ results: deltaResults }))
            }))
        }));

        // 手动触发同步
        await cache.warmup();

        // 验证最终状态
        expect(await cache.isBanned('1.2.3.4')).toBe(false); // 已解封
        expect(await cache.isBanned('5.6.7.8')).toBe(true);  // 仍封禁
        expect(await cache.isBanned('9.9.9.9')).toBe(true);  // 新封禁
    });

    it('即时封禁应该立即生效', async () => {
        // 即时封禁一个 IP
        await cache.banIpImmediately('1.2.3.4');

        // 立即验证（不需要等待同步）
        expect(await cache.isBanned('1.2.3.4')).toBe(true);

        // 验证 D1 写入被调用
        expect(mockEnv.D1.prepare).toHaveBeenCalledWith(
            expect.stringContaining('INSERT OR REPLACE INTO ip_monitor')
        );
    });

    it('应该正确处理同一秒内的多次状态变更（游标测试）', async () => {
        // 首次同步：获取两个封禁的 IP（同一秒内）
        const initialResults = [
            { ip: '1.1.1.1', status: 'banned', updated_at: '2025-10-19 12:00:00' },
            { ip: '2.2.2.2', status: 'banned', updated_at: '2025-10-19 12:00:00' }
        ];

        mockEnv.D1.prepare = vi.fn(() => ({
            all: vi.fn(async () => ({ results: initialResults }))
        }));

        await cache.warmup();

        // 验证初始状态
        expect(await cache.isBanned('1.1.1.1')).toBe(true);
        expect(await cache.isBanned('2.2.2.2')).toBe(true);

        // 第二次同步：同一秒内，3.3.3.3 被封禁，4.4.4.4 也被封禁
        // 使用 (timestamp, ip) 游标，应该只查询 ip > '2.2.2.2' 的记录
        const deltaResults = [
            { ip: '3.3.3.3', status: 'banned', updated_at: '2025-10-19 12:00:00' },
            { ip: '4.4.4.4', status: 'banned', updated_at: '2025-10-19 12:00:00' }
        ];

        let bindArgs: any[] = [];
        mockEnv.D1.prepare = vi.fn(() => ({
            bind: vi.fn((...args: any[]) => {
                bindArgs = args;
                return {
                    all: vi.fn(async () => ({ results: deltaResults }))
                };
            })
        }));

        // 手动触发增量同步
        await cache.warmup();

        // 验证查询使用了正确的游标
        // 应该查询: WHERE updated_at > ? OR (updated_at = ? AND ip > ?)
        // 参数: ['2025-10-19 12:00:00', '2025-10-19 12:00:00', '2.2.2.2']
        expect(bindArgs).toEqual(['2025-10-19 12:00:00', '2025-10-19 12:00:00', '2.2.2.2']);

        // 验证新的 IP 被正确加入缓存
        expect(await cache.isBanned('3.3.3.3')).toBe(true);
        expect(await cache.isBanned('4.4.4.4')).toBe(true);
    });

    it('同一秒内的解封操作不应该被跳过', async () => {
        // 首次同步：两个 IP 在同一秒内被封禁
        const initialResults = [
            { ip: '1.1.1.1', status: 'banned', updated_at: '2025-10-19 12:00:00' },
            { ip: '2.2.2.2', status: 'banned', updated_at: '2025-10-19 12:00:00' }
        ];

        mockEnv.D1.prepare = vi.fn(() => ({
            all: vi.fn(async () => ({ results: initialResults }))
        }));

        await cache.warmup();

        expect(await cache.isBanned('1.1.1.1')).toBe(true);
        expect(await cache.isBanned('2.2.2.2')).toBe(true);

        // 第二次同步：同一秒内，3.3.3.3 被封禁，然后立即被解封
        // 如果使用错误的去重逻辑，解封操作会被跳过
        const deltaResults = [
            { ip: '3.3.3.3', status: 'banned', updated_at: '2025-10-19 12:00:00' },
            { ip: '3.3.3.3', status: 'active', updated_at: '2025-10-19 12:00:00' }
        ];

        mockEnv.D1.prepare = vi.fn(() => ({
            bind: vi.fn(() => ({
                all: vi.fn(async () => ({ results: deltaResults }))
            }))
        }));

        await cache.warmup();

        // 关键：3.3.3.3 应该是未封禁状态（最后一次状态生效）
        expect(await cache.isBanned('3.3.3.3')).toBe(false);
    });
});

/**
 * 测试场景：时间戳格式问题
 */
describe('IpBlacklistCache 时间戳格式', () => {
    it('应该正确比较 SQLite 时间戳', () => {
        const sqliteTime1 = '2025-10-19 12:00:00';
        const sqliteTime2 = '2025-10-19 12:05:00';

        // SQLite 格式的字符串比较应该正常工作
        expect(sqliteTime2 > sqliteTime1).toBe(true);
    });

    it('ISO 格式与 SQLite 格式比较会失败', () => {
        const isoTime = '2025-10-19T12:00:00.000Z';
        const sqliteTime = '2025-10-19 12:05:00';

        // 这个比较会失败（'T' < ' ' in ASCII）
        // 这就是 bug 的根本原因
        expect(sqliteTime > isoTime).toBe(false);

        // 正确的方式：使用相同格式
        const sqliteTime2 = '2025-10-19 12:00:00';
        const sqliteTime3 = '2025-10-19 12:05:00';
        expect(sqliteTime3 > sqliteTime2).toBe(true);
    });
});

