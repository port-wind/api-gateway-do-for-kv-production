/**
 * Dashboard 数据聚合器
 * 负责从多个数据源（D1、KV、DO）聚合 Dashboard 所需指标
 */

import type { Env } from '../types/env';

/**
 * Dashboard 概览数据结构
 */
export interface DashboardOverview {
    traffic: {
        totalRequests24h: number;
        currentRpm: number;
        peakRpm: number;
        activeIPs24h: number;
        trendVsPrevDay: number; // 相比前一天的百分比变化
    };
    reliability: {
        cacheHitRate: number;
        errorRate: number;
        avgResponseTime: number | null;
        p95ResponseTime: number | null;
    };
    configuration: {
        totalPaths: number;
        pathsWithCache: number;
        pathsWithRateLimit: number;
        pathsWithGeo: number;
    };
    topPaths: Array<{
        path: string;
        requests: number;
        errors: number;
        errorRate: number;
    }>;
    timestamp: number;
    degraded?: boolean; // 是否降级
    errors?: string[];  // 错误信息
}

/**
 * 时间序列数据点
 */
export interface TimeseriesDataPoint {
    timestamp: string;
    value: number;
    label: string;
}

/**
 * 时间序列响应
 */
export interface TimeseriesResponse {
    dataPoints: TimeseriesDataPoint[];
    summary: {
        total: number;
        avg: number;
        max: number;
        min: number;
    };
    actualRange?: string;  // 实际查询范围（降级时使用）
    warning?: string;       // 警告信息
}

interface TrafficMonitorStats {
    currentRpm: number;
    peakRpm: number;
    cacheHitRate: number | null;
}

/**
 * Rate Limiter 统计（Phase 1 简化版本）
 */
export interface RateLimitStats {
    pathsWithRateLimit: number;
    globalRulesCount: number;
    placeholder?: {
        note: string;
        estimatedCompletion: string;
    };
}

/**
 * 聚合 Dashboard 概览数据
 */
export async function aggregateDashboardOverview(env: Env): Promise<DashboardOverview> {
    // 检查 KV 缓存
    const cacheKey = 'dashboard:overview:v1';
    try {
        const cached = await env.API_GATEWAY_STORAGE.get(cacheKey, 'json') as DashboardOverview | null;
        if (cached && cached.timestamp && Date.now() - cached.timestamp < 60000) {
            return cached; // 1 分钟缓存有效
        }
    } catch (error) {
        console.error('Failed to read dashboard cache:', error);
    }

    // 并行查询所有数据源（使用 Promise.allSettled 避免单点失败）
    const [pathStatsResult, cacheStatsResult, trafficMonitorResult, unifiedPathsResult] = await Promise.allSettled([
        getPathStats24h(env),
        getCacheStats(env),
        getTrafficMonitorStats(env),
        getUnifiedPathsConfig(env),
    ]);

    // 组装数据（失败时使用默认值）
    const pathStats = pathStatsResult.status === 'fulfilled' ? pathStatsResult.value : getDefaultTrafficStats();
    const trafficMonitorStats = trafficMonitorResult.status === 'fulfilled'
        ? trafficMonitorResult.value
        : { currentRpm: 0, peakRpm: 0, cacheHitRate: null };

    // ✅ 修复：合并 TrafficMonitor DO 的实时数据到 traffic 对象
    const overview: DashboardOverview = {
        traffic: {
            ...pathStats,
            currentRpm: trafficMonitorStats.currentRpm, // 覆盖为实时数据
            peakRpm: trafficMonitorStats.peakRpm,       // 覆盖为实时数据
        },
        reliability: cacheStatsResult.status === 'fulfilled' ? cacheStatsResult.value : getDefaultReliabilityStats(),
        configuration: unifiedPathsResult.status === 'fulfilled' ? unifiedPathsResult.value : getDefaultConfigStats(),
        topPaths: pathStatsResult.status === 'fulfilled' ? pathStatsResult.value.topPaths : [],
        timestamp: Date.now(),
    };

    // 若 TrafficMonitor 提供了缓存命中率，则覆盖缓存数据
    if (trafficMonitorStats.cacheHitRate !== null && !Number.isNaN(trafficMonitorStats.cacheHitRate)) {
        overview.reliability.cacheHitRate = Number(trafficMonitorStats.cacheHitRate.toFixed(2));
    }

    // 标记降级状态
    const failures = [pathStatsResult, cacheStatsResult, trafficMonitorResult, unifiedPathsResult]
        .filter(r => r.status === 'rejected');

    if (failures.length > 0) {
        overview.degraded = true;
        overview.errors = failures.map((r: any) => r.reason?.message || 'Unknown error');
    }

    // 写入缓存（忽略错误）
    try {
        await env.API_GATEWAY_STORAGE.put(cacheKey, JSON.stringify(overview), { expirationTtl: 60 });
    } catch (error) {
        console.error('Failed to write dashboard cache:', error);
    }

    return overview;
}

/**
 * 从 traffic_events 查询最近 24 小时数据
 */
async function getPathStats24h(env: Env) {
    const now = Date.now();
    const since24h = now - 86400000;   // 24 小时前（毫秒）
    const since48h = now - 172800000;  // 48 小时前（毫秒）

    // 计算日期范围（支持跨天查询）
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const dayBeforeYesterday = new Date(Date.now() - 172800000).toISOString().split('T')[0];

    // ✅ 优化：合并为单个查询，使用 event_date 索引 + timestamp 范围过滤
    const statsQuery = await env.D1.prepare(`
    SELECT 
      -- 最近 24 小时统计
      COUNT(CASE WHEN timestamp >= ? THEN 1 END) as total_requests,
      COALESCE(SUM(CASE WHEN timestamp >= ? AND is_error = 1 THEN 1 END), 0) as total_errors,
      COUNT(DISTINCT CASE WHEN timestamp >= ? THEN path END) as unique_paths,
      COUNT(DISTINCT CASE WHEN timestamp >= ? THEN client_ip_hash END) as active_ips,
      -- 前一天统计（用于趋势计算）
      COUNT(CASE WHEN timestamp >= ? AND timestamp < ? THEN 1 END) as prev_day_requests
    FROM traffic_events
    WHERE event_date IN (?, ?)
      AND timestamp >= ?
  `).bind(
        // 最近 24h
        since24h, since24h, since24h, since24h,
        // 前一天 (24-48h)
        since48h, since24h,
        // event_date 过滤（索引优化）
        today, yesterday,
        // timestamp 范围下限
        since48h
    ).first<{
        total_requests: number;
        total_errors: number;
        unique_paths: number;
        active_ips: number;
        prev_day_requests: number;
    }>();

    let topPaths: Array<{ path: string; requests: number; errors: number; errorRate: number }> = [];

    try {
        // ✅ 优化：使用 event_date 索引过滤
        const topPathsResult = await env.D1.prepare(`
      SELECT 
        path,
        COUNT(*) as requests,
        COALESCE(SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END), 0) as errors
      FROM traffic_events
      WHERE event_date IN (?, ?)
        AND timestamp >= ?
      GROUP BY path
      ORDER BY requests DESC
      LIMIT 10
    `).bind(today, yesterday, since24h).all<{ path: string; requests: number; errors: number }>();

        topPaths = topPathsResult.results.map((row) => {
            const requests = Number(row.requests) || 0;
            const errors = Number(row.errors) || 0;

            return {
                path: row.path || 'unknown',
                requests,
                errors,
                errorRate: requests > 0 ? Number((errors / requests).toFixed(4)) : 0,
            };
        });
    } catch (error) {
        console.error('Failed to query top paths from traffic_events:', error);
    }

    // 如果实时查询失败或返回为空，回退到 snapshot
    if (topPaths.length === 0) {
        try {
            const snapshot = await env.API_GATEWAY_STORAGE.get('snapshot:latest', 'json') as any;
            if (snapshot && Array.isArray(snapshot)) {
                topPaths = snapshot.slice(0, 10).map((p: any) => ({
                    path: p.path,
                    requests: p.requests || 0,
                    errors: p.errors || 0,
                    errorRate: p.error_rate || 0,
                }));
            }
        } catch (error) {
            console.error('Failed to read snapshot for top paths fallback:', error);
        }
    }

    // ✅ 使用合并查询的结果
    const currentRequests = Number(statsQuery?.total_requests) || 0;
    const prevRequests = Number(statsQuery?.prev_day_requests) || 0;
    let trend = 0;

    if (prevRequests > 0) {
        trend = ((currentRequests - prevRequests) / prevRequests) * 100;
    } else if (currentRequests > 0) {
        trend = 100;
    }

    return {
        totalRequests24h: currentRequests,
        currentRpm: 0, // 从 TrafficMonitor DO 获取
        peakRpm: 0,    // 从 TrafficMonitor DO 获取
        activeIPs24h: Number(statsQuery?.active_ips) || 0,
        trendVsPrevDay: Number(trend.toFixed(2)),
        topPaths,
    };
}

/**
 * 从 Cache KV 获取缓存统计
 */
async function getCacheStats(env: Env) {
    try {
        // ✅ 修复：cache:stats:latest 不存在，尝试从 snapshot:latest 计算
        const snapshot = await env.API_GATEWAY_STORAGE.get('snapshot:latest', 'json') as any;

        if (snapshot && Array.isArray(snapshot) && snapshot.length > 0) {
            // 从快照数据计算总体错误率
            let totalRequests = 0;
            let totalErrors = 0;

            for (const path of snapshot) {
                totalRequests += path.requests || 0;
                totalErrors += path.errors || 0;
            }

            const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

            // 注意：缓存命中率暂时无法从现有数据计算，返回 0
            // TODO: 需要在 path_stats_hourly 或其他地方记录缓存命中数据
            return {
                cacheHitRate: 0, // TODO: 需要数据源
                errorRate: Number(errorRate.toFixed(2)),
                avgResponseTime: null,
                p95ResponseTime: null,
            };
        }
    } catch (error) {
        console.error('Failed to read cache stats:', error);
    }

    return getDefaultReliabilityStats();
}

/**
 * 从 TrafficMonitor DO 获取实时流量统计
 */
async function getTrafficMonitorStats(env: Env): Promise<TrafficMonitorStats> {
    try {
        // 获取 TrafficMonitor DO 实例
        const id = env.TRAFFIC_MONITOR.idFromName('global');
        const stub = env.TRAFFIC_MONITOR.get(id);
        const response = await stub.fetch('https://traffic-monitor/stats');
        const payload = await response.json() as any;

        const stats = payload?.stats || {};

        return {
            currentRpm: Number(stats.currentRpm) || 0,
            peakRpm: Number(stats.peakRpm) || 0,
            cacheHitRate: typeof stats.cacheHitRate === 'number' ? stats.cacheHitRate : null,
        };
    } catch (error) {
        console.error('Failed to fetch TrafficMonitor stats:', error);
        return { currentRpm: 0, peakRpm: 0, cacheHitRate: null };
    }
}

/**
 * 从统一路径配置统计路径级别的功能启用情况
 * 数据源：unified-paths:list（路径级配置，而非代理路由级配置）
 */
async function getUnifiedPathsConfig(env: Env) {
    try {
        // 从 KV 读取统一路径配置
        const unifiedPaths = await env.API_GATEWAY_STORAGE.get('unified-paths:list', 'json') as any[];

        if (!unifiedPaths || !Array.isArray(unifiedPaths)) {
            console.warn('Unified paths not found or invalid');
            return getDefaultConfigStats();
        }

        // 统计路径级别的功能启用情况
        const cachePaths = unifiedPaths.filter(p => p.cache?.enabled === true);
        const rateLimitPaths = unifiedPaths.filter(p => p.rateLimit?.enabled === true);
        const geoPaths = unifiedPaths.filter(p => p.geo?.enabled === true);

        return {
            totalPaths: unifiedPaths.length,
            pathsWithCache: cachePaths.length,
            pathsWithRateLimit: rateLimitPaths.length,
            pathsWithGeo: geoPaths.length,
        };
    } catch (error) {
        console.error('Failed to read unified paths:', error);
    }

    return getDefaultConfigStats();
}

/**
 * 查询时间序列数据
 */
export async function queryTimeseries(
    env: Env,
    range: string,
    metric: 'requests' | 'cache_hit' | 'errors'
): Promise<TimeseriesResponse> {
    // 解析时间范围（支持 24h, 7d）
    const rangeHours = range === '7d' ? 168 : 24;
    const maxRangeHours = 168; // 7 天限制

    let actualRange = range;
    let warning: string | undefined;

    // 优雅降级：超过 7 天自动回退
    if (rangeHours > maxRangeHours) {
        actualRange = '7d';
        warning = `历史数据仅保留 7 天，已自动调整查询范围从 ${range} 到 7d`;
    }

    // 计算起始时间（毫秒）
    const sinceTimestamp = Date.now() - rangeHours * 3600000;

    // ✅ 优化：生成 event_date 列表用于索引过滤
    const eventDates: string[] = [];
    const now = new Date();
    for (let i = 0; i <= Math.ceil(rangeHours / 24); i++) {
        const date = new Date(now.getTime() - i * 86400000);
        eventDates.push(date.toISOString().split('T')[0]);
    }
    const dateFilter = eventDates.map(() => '?').join(', ');

    // 根据时间范围选择不同的聚合粒度
    let result: any;

    if (range === '7d') {
        // 7 天模式：按天聚合
        // ✅ 优化：先用 event_date IN (...) 过滤，再按天聚合
        result = await env.D1.prepare(`
      SELECT 
        event_date as date_bucket,
        COUNT(*) as requests,
        COALESCE(SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END), 0) as errors
      FROM traffic_events
      WHERE event_date IN (${dateFilter})
        AND timestamp >= ?
      GROUP BY event_date
      ORDER BY event_date ASC
    `).bind(...eventDates, sinceTimestamp).all<{ date_bucket: string; requests: number; errors: number }>();
    } else {
        // 24 小时模式：按小时聚合
        // ✅ 优化：先用 event_date IN (...) 过滤，再 strftime 按小时聚合
        result = await env.D1.prepare(`
      SELECT 
        strftime('%Y-%m-%dT%H', timestamp / 1000, 'unixepoch') as hour_bucket,
        COUNT(*) as requests,
        COALESCE(SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END), 0) as errors
      FROM traffic_events
      WHERE event_date IN (${dateFilter})
        AND timestamp >= ?
      GROUP BY hour_bucket
      ORDER BY hour_bucket ASC
    `).bind(...eventDates, sinceTimestamp).all<{ hour_bucket: string; requests: number; errors: number }>();
    }

    // 转换为时间序列数据点
    const rows = Array.isArray(result.results) ? result.results : [];
    const dataPoints: TimeseriesDataPoint[] = rows.map((row: any) => {
        let timestamp: string;

        if (range === '7d') {
            // 按天：date_bucket 格式为 YYYY-MM-DD，补全为当天 00:00:00
            timestamp = row.date_bucket + 'T00:00:00.000Z';
        } else {
            // 按小时：hour_bucket 格式为 YYYY-MM-DDTHH，补全为完整时间戳
            timestamp = row.hour_bucket + ':00:00.000Z';
        }

        let value = 0;

        switch (metric) {
            case 'requests':
                value = Number(row.requests) || 0;
                break;
            case 'cache_hit':
                // ⚠️ cache_hit 指标暂不支持（表中无 cache_hits 列）
                // TODO: 未来可从 KV cache:stats 或其他源计算
                value = 0;
                break;
            case 'errors':
                value = Number(row.errors) || 0;
                break;
        }

        return {
            timestamp,
            value,
            label: new Date(timestamp).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit' }),
        };
    });

    // 计算汇总统计
    const values = dataPoints.map(d => d.value);
    const summary = {
        total: values.reduce((a, b) => a + b, 0),
        avg: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
        max: values.length > 0 ? Math.max(...values) : 0,
        min: values.length > 0 ? Math.min(...values) : 0,
    };

    return {
        dataPoints,
        summary,
        actualRange,
        warning,
    };
}

/**
 * 获取 Rate Limiter 统计（Phase 1 简化版本）
 */
export async function getRateLimitStats(env: Env): Promise<RateLimitStats> {
    try {
        // 从 unified paths 统计配置
        const paths = await env.API_GATEWAY_STORAGE.get('unified:paths', 'json') as any;
        const pathsWithRateLimit = Array.isArray(paths)
            ? paths.filter((p: any) => p.rateLimit?.enabled).length
            : 0;

        // 从 ip_access_rules 统计全局规则
        // ✅ 修复：schema 使用 mode 字段，枚举值为 'block' 和 'throttle'
        const rulesCount = await env.D1.prepare(`
      SELECT COUNT(*) as count FROM ip_access_rules WHERE mode IN ('block', 'throttle') AND is_active = 1
    `).first<{ count: number }>();

        return {
            pathsWithRateLimit,
            globalRulesCount: rulesCount?.count || 0,
            placeholder: {
                note: '实时拦截统计需要 IP Monitor Pipeline 支持',
                estimatedCompletion: 'IP Monitor Phase 3 完成后升级',
            },
        };
    } catch (error) {
        console.error('Failed to get rate limit stats:', error);
        return {
            pathsWithRateLimit: 0,
            globalRulesCount: 0,
        };
    }
}

// ========== 默认值函数 ==========

function getDefaultTrafficStats() {
    return {
        totalRequests24h: 0,
        currentRpm: 0,
        peakRpm: 0,
        activeIPs24h: 0,
        trendVsPrevDay: 0,
        topPaths: [],
    };
}

function getDefaultReliabilityStats() {
    return {
        cacheHitRate: 0,
        errorRate: 0,
        avgResponseTime: null,
        p95ResponseTime: null,
    };
}

function getDefaultConfigStats() {
    return {
        totalPaths: 0,
        pathsWithCache: 0,
        pathsWithRateLimit: 0,
        pathsWithGeo: 0,
    };
}
