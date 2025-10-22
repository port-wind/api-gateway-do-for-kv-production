/**
 * 性能监控中间件
 * 
 * 功能：
 * - 详细记录各个处理阶段的耗时
 * - 识别性能瓶颈
 * - 输出结构化日志供分析
 */

import type { Context, Next } from 'hono';
import type { Env } from '../types/env';

/**
 * 性能时间线接口
 */
export interface PerformanceTimeline {
    // 请求开始
    requestStart: number;

    // 中间件阶段
    pathCollectorStart?: number;
    pathCollectorEnd?: number;

    ipGuardStart?: number;
    ipGuardEnd?: number;

    geoControlStart?: number;
    geoControlEnd?: number;

    rateLimitStart?: number;
    rateLimitEnd?: number;

    geoBlockStart?: number;
    geoBlockEnd?: number;

    cacheCheckStart?: number;
    cacheCheckEnd?: number;

    // 代理阶段
    proxyStart?: number;

    routeLookupStart?: number;
    routeLookupEnd?: number;

    upstreamRequestStart?: number;
    upstreamFirstByte?: number;
    upstreamComplete?: number;

    cacheWriteStart?: number;
    cacheWriteEnd?: number;

    // 数据库查询
    d1Queries: Array<{
        name: string;
        start: number;
        end: number;
        duration: number;
    }>;

    // 请求结束
    requestEnd?: number;
}

/**
 * 性能统计
 */
export interface PerformanceStats {
    total: number;
    breakdown: {
        pathCollector?: number;
        ipGuard?: number;
        geoControl?: number;
        rateLimit?: number;
        geoBlock?: number;
        cacheCheck?: number;
        routeLookup?: number;
        upstream?: number;
        upstreamWait?: number;  // 首字节时间
        upstreamTransfer?: number;  // 内容传输时间
        cacheWrite?: number;
        d1Total?: number;
    };
    d1Queries: Array<{
        name: string;
        duration: number;
    }>;
    percentages: {
        middleware?: string;
        upstream?: string;
        cache?: string;
        d1?: string;
    };
}

/**
 * 计算性能统计
 */
export function calculatePerformanceStats(timeline: PerformanceTimeline): PerformanceStats {
    const stats: PerformanceStats = {
        total: 0,
        breakdown: {},
        d1Queries: [],
        percentages: {}
    };

    if (!timeline.requestEnd) {
        return stats;
    }

    stats.total = timeline.requestEnd - timeline.requestStart;

    // 计算各阶段耗时
    if (timeline.pathCollectorStart && timeline.pathCollectorEnd) {
        stats.breakdown.pathCollector = timeline.pathCollectorEnd - timeline.pathCollectorStart;
    }

    if (timeline.ipGuardStart && timeline.ipGuardEnd) {
        stats.breakdown.ipGuard = timeline.ipGuardEnd - timeline.ipGuardStart;
    }

    if (timeline.geoControlStart && timeline.geoControlEnd) {
        stats.breakdown.geoControl = timeline.geoControlEnd - timeline.geoControlStart;
    }

    if (timeline.rateLimitStart && timeline.rateLimitEnd) {
        stats.breakdown.rateLimit = timeline.rateLimitEnd - timeline.rateLimitStart;
    }

    if (timeline.geoBlockStart && timeline.geoBlockEnd) {
        stats.breakdown.geoBlock = timeline.geoBlockEnd - timeline.geoBlockStart;
    }

    if (timeline.cacheCheckStart && timeline.cacheCheckEnd) {
        stats.breakdown.cacheCheck = timeline.cacheCheckEnd - timeline.cacheCheckStart;
    }

    if (timeline.routeLookupStart && timeline.routeLookupEnd) {
        stats.breakdown.routeLookup = timeline.routeLookupEnd - timeline.routeLookupStart;
    }

    if (timeline.upstreamRequestStart && timeline.upstreamComplete) {
        stats.breakdown.upstream = timeline.upstreamComplete - timeline.upstreamRequestStart;

        // 细分上游请求时间
        if (timeline.upstreamFirstByte) {
            stats.breakdown.upstreamWait = timeline.upstreamFirstByte - timeline.upstreamRequestStart;
            stats.breakdown.upstreamTransfer = timeline.upstreamComplete - timeline.upstreamFirstByte;
        }
    }

    if (timeline.cacheWriteStart && timeline.cacheWriteEnd) {
        stats.breakdown.cacheWrite = timeline.cacheWriteEnd - timeline.cacheWriteStart;
    }

    // D1 查询统计
    if (timeline.d1Queries && timeline.d1Queries.length > 0) {
        stats.d1Queries = timeline.d1Queries.map(q => ({
            name: q.name,
            duration: q.duration
        }));
        stats.breakdown.d1Total = timeline.d1Queries.reduce((sum, q) => sum + q.duration, 0);
    }

    // 计算百分比
    if (stats.total > 0) {
        const middlewareTime = (stats.breakdown.pathCollector || 0) +
            (stats.breakdown.ipGuard || 0) +
            (stats.breakdown.geoControl || 0) +
            (stats.breakdown.rateLimit || 0) +
            (stats.breakdown.geoBlock || 0);

        if (middlewareTime > 0) {
            stats.percentages.middleware = ((middlewareTime / stats.total) * 100).toFixed(1) + '%';
        }

        if (stats.breakdown.upstream) {
            stats.percentages.upstream = ((stats.breakdown.upstream / stats.total) * 100).toFixed(1) + '%';
        }

        if (stats.breakdown.cacheCheck || stats.breakdown.cacheWrite) {
            const cacheTime = (stats.breakdown.cacheCheck || 0) + (stats.breakdown.cacheWrite || 0);
            stats.percentages.cache = ((cacheTime / stats.total) * 100).toFixed(1) + '%';
        }

        if (stats.breakdown.d1Total) {
            stats.percentages.d1 = ((stats.breakdown.d1Total / stats.total) * 100).toFixed(1) + '%';
        }
    }

    return stats;
}

/**
 * 性能监控中间件
 * 使用方法：在 index.ts 中添加为第一个中间件
 */
export function performanceMonitorMiddleware(
    c: Context<{
        Bindings: Env;
        Variables: {
            pathCollected?: boolean;
            performanceTimeline?: PerformanceTimeline;
        }
    }>,
    next: Next
) {
    // 创建性能时间线
    const timeline: PerformanceTimeline = {
        requestStart: Date.now(),
        d1Queries: []
    };

    // 存储到 context 中供其他中间件使用
    c.set('performanceTimeline', timeline);

    // 生成请求 ID
    const requestId = c.req.header('x-request-id') || crypto.randomUUID();

    // 包装响应
    return next()
        .then(() => {
            // 记录请求结束时间
            timeline.requestEnd = Date.now();

            // 计算统计数据
            const stats = calculatePerformanceStats(timeline);

            // 输出性能日志
            console.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                requestId,
                event: 'performance_metrics',
                method: c.req.method,
                path: c.req.path,
                status: c.res.status,
                metrics: {
                    total_ms: stats.total,
                    breakdown_ms: stats.breakdown,
                    percentages: stats.percentages
                },
                d1_queries: stats.d1Queries.length > 0 ? stats.d1Queries : undefined
            }));

            // 添加性能头信息到响应
            c.res.headers.set('x-performance-total', stats.total.toFixed(2) + 'ms');
            if (stats.breakdown.upstream) {
                c.res.headers.set('x-performance-upstream', stats.breakdown.upstream.toFixed(2) + 'ms');
            }
            if (stats.breakdown.d1Total) {
                c.res.headers.set('x-performance-d1', stats.breakdown.d1Total.toFixed(2) + 'ms');
            }

            // 如果性能较差，输出警告
            if (stats.total > 1000) {
                console.warn(JSON.stringify({
                    timestamp: new Date().toISOString(),
                    requestId,
                    event: 'slow_request',
                    path: c.req.path,
                    total_ms: stats.total,
                    breakdown: stats.breakdown,
                    message: '请求处理时间超过 1 秒'
                }));
            }

            return c.res;
        })
        .catch((error) => {
            // 即使出错也记录性能数据
            timeline.requestEnd = Date.now();
            const stats = calculatePerformanceStats(timeline);

            console.error(JSON.stringify({
                timestamp: new Date().toISOString(),
                requestId,
                event: 'request_error',
                path: c.req.path,
                error: error instanceof Error ? error.message : 'Unknown error',
                metrics: {
                    total_ms: stats.total,
                    breakdown_ms: stats.breakdown
                }
            }));

            throw error;
        });
}

/**
 * 辅助函数：记录 D1 查询
 */
export async function measureD1Query<T>(
    c: Context<{ Variables: { performanceTimeline?: PerformanceTimeline } }>,
    queryName: string,
    queryFn: () => Promise<T>
): Promise<T> {
    const timeline = c.get('performanceTimeline');

    if (!timeline) {
        // 如果没有启用性能监控，直接执行查询
        return queryFn();
    }

    const start = Date.now();

    try {
        const result = await queryFn();
        const end = Date.now();

        timeline.d1Queries.push({
            name: queryName,
            start,
            end,
            duration: end - start
        });

        return result;
    } catch (error) {
        const end = Date.now();

        timeline.d1Queries.push({
            name: `${queryName} (failed)`,
            start,
            end,
            duration: end - start
        });

        throw error;
    }
}

/**
 * 辅助函数：记录阶段时间
 */
export function markPhaseStart(
    c: Context<{ Variables: { performanceTimeline?: PerformanceTimeline } }>,
    phase: keyof Omit<PerformanceTimeline, 'requestStart' | 'requestEnd' | 'd1Queries'>
): void {
    const timeline = c.get('performanceTimeline');
    if (timeline) {
        (timeline as any)[phase] = Date.now();
    }
}

export function markPhaseEnd(
    c: Context<{ Variables: { performanceTimeline?: PerformanceTimeline } }>,
    phase: keyof Omit<PerformanceTimeline, 'requestStart' | 'requestEnd' | 'd1Queries'>
): void {
    const timeline = c.get('performanceTimeline');
    if (timeline) {
        (timeline as any)[phase] = Date.now();
    }
}

