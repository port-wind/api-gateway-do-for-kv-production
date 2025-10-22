/**
 * 优化管理 API
 * 
 * 功能：
 * 1. Feature Flags 控制
 * 2. 手动刷新缓存
 * 3. 即时封禁 IP
 * 4. 监控统计
 */

import { Hono } from 'hono';
import type { Env } from '../../types/env';
import { getCacheManager, getOptimizationFlags, type OptimizationFlags } from '../../lib/optimized-cache';
import { AsyncRecorder } from '../../lib/async-recording';

const app = new Hono<{ Bindings: Env }>();

/**
 * 获取优化配置
 */
app.get('/optimization/flags', async (c) => {
    try {
        const flags = await getOptimizationFlags(c.env);

        return c.json({
            success: true,
            flags
        });
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
    }
});

/**
 * 更新优化配置（Feature Flags）
 */
app.put('/optimization/flags', async (c) => {
    try {
        const body = await c.req.json<Partial<OptimizationFlags>>();

        // 获取当前配置
        const currentFlags = await getOptimizationFlags(c.env);

        // 合并更新
        const newFlags: OptimizationFlags = {
            ...currentFlags,
            ...body
        };

        // 保存到 KV
        await c.env.API_GATEWAY_STORAGE.put(
            'optimization_flags',
            JSON.stringify(newFlags)
        );

        // 应用到缓存管理器
        const cacheManager = getCacheManager(c.env);
        await cacheManager.applyFlags(newFlags);

        return c.json({
            success: true,
            message: 'Optimization flags updated',
            flags: newFlags
        });
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
    }
});

/**
 * 手动刷新所有缓存
 */
app.post('/optimization/cache/refresh', async (c) => {
    try {
        const cacheManager = getCacheManager(c.env);
        await cacheManager.refreshAll();

        return c.json({
            success: true,
            message: 'All caches refreshed successfully'
        });
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
    }
});

/**
 * 刷新路由缓存
 */
app.post('/optimization/cache/routes/refresh', async (c) => {
    try {
        const cacheManager = getCacheManager(c.env);
        await cacheManager.routeCache.forceRefresh();

        return c.json({
            success: true,
            message: 'Route cache refreshed successfully'
        });
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
    }
});

/**
 * 刷新地区规则缓存
 */
app.post('/optimization/cache/geo-rules/refresh', async (c) => {
    try {
        const cacheManager = getCacheManager(c.env);
        await cacheManager.geoRulesCache.forceRefresh();

        return c.json({
            success: true,
            message: 'Geo rules cache refreshed successfully'
        });
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
    }
});

/**
 * 即时封禁 IP
 */
app.post('/optimization/ip/ban', async (c) => {
    try {
        const { ip, reason } = await c.req.json<{ ip: string; reason?: string }>();

        if (!ip) {
            return c.json({
                success: false,
                error: 'IP address is required'
            }, 400);
        }

        // 立即封禁
        const cacheManager = getCacheManager(c.env);
        await cacheManager.ipBlacklistCache.banIpImmediately(ip);

        console.log(`[Admin] IP banned immediately: ${ip}, reason: ${reason || 'N/A'}`);

        return c.json({
            success: true,
            message: `IP ${ip} banned successfully`,
            bannedAt: new Date().toISOString()
        });
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
    }
});

/**
 * 获取缓存统计
 */
app.get('/optimization/stats', async (c) => {
    try {
        const cacheManager = getCacheManager(c.env);

        // 这里可以添加更多统计信息
        const stats = {
            timestamp: new Date().toISOString(),
            caches: {
                routes: {
                    enabled: true, // 从 flags 读取
                    status: 'active'
                },
                ipBlacklist: {
                    enabled: true,
                    status: 'active'
                },
                geoRules: {
                    enabled: true,
                    status: 'active'
                }
            }
        };

        return c.json({
            success: true,
            stats
        });
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
    }
});

/**
 * 获取异步记录统计
 */
app.get('/optimization/recording/stats', async (c) => {
    try {
        // 这里需要从某个地方获取 AsyncRecorder 实例
        // 实际实现中，可以将 recorder 存储在全局变量或 Context 中

        const mockStats = {
            total: 0,
            success: 0,
            failed: 0,
            fallback: 0,
            successRate: '0%',
            failedQueueSize: 0
        };

        return c.json({
            success: true,
            stats: mockStats
        });
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
    }
});

/**
 * 健康检查（包含优化状态）
 */
app.get('/optimization/health', async (c) => {
    try {
        const flags = await getOptimizationFlags(c.env);

        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            optimization: {
                enabled: true,
                flags,
                version: '1.0.0'
            }
        };

        return c.json(health);
    } catch (error) {
        return c.json({
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
    }
});

/**
 * 预热缓存（启动时调用）
 */
app.post('/optimization/warmup', async (c) => {
    try {
        const cacheManager = getCacheManager(c.env);
        await cacheManager.warmupAll();

        return c.json({
            success: true,
            message: 'Caches warmed up successfully'
        });
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
    }
});

export default app;

