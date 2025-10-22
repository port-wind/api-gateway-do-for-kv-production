/**
 * IP 监控管理 API
 * 
 * 功能：
 * - 查询 IP 访问统计
 * - 查询 IP 访问路径明细
 * - 管理 IP 访问控制规则（封禁/限流）
 * - 配置数据保留策略
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env } from '../../types/env';
import {
    createIpRule,
    deleteIpRule,
    type IPAccessRule
} from '../../lib/ip-access-control';
import { createRequestLogger } from '../../lib/logger';

interface CountryStat {
    code: string;
    name: string;
    count: number;
    percentage: number;
    coordinates?: [number, number];
}

interface UserAgentStat {
    ua: string;
    count: number;
}

function flattenGroupedJson(value: unknown): unknown[] {
    if (value === null || value === undefined) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];
        try {
            const parsed = JSON.parse(trimmed);
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
            return [trimmed];
        }
    }
    return [value];
}

function normalizeCountryEntry(entry: unknown): Array<{ code: string; count: number }> {
    if (entry === null || entry === undefined) return [];

    if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (!trimmed) return [];
        try {
            return normalizeCountryEntry(JSON.parse(trimmed));
        } catch {
            return [{ code: trimmed.toUpperCase(), count: 1 }];
        }
    }

    if (Array.isArray(entry)) {
        return entry.flatMap(item => normalizeCountryEntry(item));
    }

    if (typeof entry === 'object') {
        const obj = entry as Record<string, unknown>;
        const codeRaw = obj.code ?? obj.country ?? obj.countryCode;
        if (typeof codeRaw === 'string') {
            const code = codeRaw.toUpperCase();
            const count = Number(obj.count ?? obj.value ?? obj.requests ?? obj.total ?? 0) || 1;
            return [{ code, count }];
        }
    }

    return [];
}

function accumulateCountryCounts(target: Map<string, number>, value: unknown): void {
    for (const entry of flattenGroupedJson(value)) {
        const normalized = normalizeCountryEntry(entry);
        normalized.forEach(({ code, count }) => {
            if (!code) return;
            target.set(code, (target.get(code) || 0) + count);
        });
    }
}

function mapToCountryStats(map: Map<string, number>, limit: number = 5): CountryStat[] {
    if (map.size === 0) {
        return [];
    }

    const total = Array.from(map.values()).reduce((sum, count) => sum + count, 0) || 1;

    return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([code, count]) => {
            const coords = getCountryCoords(code);
            const hasCoords = Array.isArray(coords) && coords[0] !== 0 && coords[1] !== 0;
            return {
                code,
                name: getCountryName(code),
                count,
                percentage: Number(((count / total) * 100).toFixed(1)),
                coordinates: hasCoords ? coords as [number, number] : undefined,
            };
        });
}

function aggregateCountries(value: unknown, limit: number = 5): CountryStat[] {
    const aggregated = new Map<string, number>();
    accumulateCountryCounts(aggregated, value);
    return mapToCountryStats(aggregated, limit);
}

function normalizeUserAgentEntry(entry: unknown): Array<{ ua: string; count: number }> {
    if (entry === null || entry === undefined) return [];

    if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (!trimmed) return [];
        try {
            return normalizeUserAgentEntry(JSON.parse(trimmed));
        } catch {
            return [{ ua: trimmed, count: 1 }];
        }
    }

    if (Array.isArray(entry)) {
        return entry.flatMap(item => normalizeUserAgentEntry(item));
    }

    if (typeof entry === 'object') {
        const obj = entry as Record<string, unknown>;
        const ua = typeof obj.ua === 'string' ? obj.ua : (typeof obj.userAgent === 'string' ? obj.userAgent : undefined);
        if (ua) {
            const count = Number(obj.count ?? obj.value ?? obj.requests ?? obj.total ?? 0) || 1;
            return [{ ua, count }];
        }
    }

    return [];
}

function aggregateUserAgents(value: unknown, limit: number = 5): UserAgentStat[] {
    const aggregated = new Map<string, number>();
    accumulateUserAgentCounts(aggregated, value);
    return mapToUserAgentStats(aggregated, limit);
}

function accumulateUserAgentCounts(target: Map<string, number>, value: unknown): void {
    for (const entry of flattenGroupedJson(value)) {
        const normalized = normalizeUserAgentEntry(entry);
        normalized.forEach(({ ua, count }) => {
            if (!ua) return;
            target.set(ua, (target.get(ua) || 0) + count);
        });
    }
}

function mapToUserAgentStats(map: Map<string, number>, limit: number = 5): UserAgentStat[] {
    if (map.size === 0) {
        return [];
    }

    return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([ua, count]) => ({ ua, count }));
}

function computeSuccessCount(totalRequests: number, totalErrors: number, rateLimitedCount: number): number {
    const success = totalRequests - totalErrors - rateLimitedCount;
    return success > 0 ? success : 0;
}

import { getCountryName, getCountryCoords } from '../../lib/geo-coords';
import {
    loadIpMonitorConfig,
    saveIpMonitorConfig,
    normalizeAlertConfig,
    type IpMonitorConfig,
} from '../../lib/ip-monitor-config';

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /api/admin/ip-monitor/ips
 * 
 * 查询 IP 列表（按日期 + 请求量排序）
 * 
 * 查询参数：
 * - date: 日期 (YYYY-MM-DD)，默认今天
 * - page: 页码，默认 1
 * - limit: 每页数量，默认 50，最大 1000
 * - sortBy: 排序字段 (requests|errors)，默认 requests
 * - search: IP 哈希前缀搜索（至少 3 个字符）
 * - days: 聚合最近 N 天（1-7），默认 1
 */
app.get('/ips', zValidator('query', z.object({
    date: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
    sortBy: z.enum(['requests', 'errors']).optional(),
    search: z.string().optional(),
    days: z.string().optional(),
})), async (c) => {
    const logger = createRequestLogger(c);

    try {
        const query = c.req.valid('query');
        const date = query.date || new Date().toISOString().split('T')[0];
        const page = parseInt(query.page || '1', 10);
        const limit = Math.min(parseInt(query.limit || '50', 10), 1000);
        const sortBy = query.sortBy || 'requests';
        const search = query.search;
        const days = Math.min(parseInt(query.days || '1', 10), 7);
        const offset = (page - 1) * limit;

        // 参数验证
        if (page < 1 || limit < 1) {
            return c.json({ error: 'Invalid pagination parameters' }, 400);
        }

        if (search && search.length < 3) {
            return c.json({ error: 'Search term must be at least 3 characters' }, 400);
        }

        if (!c.env.D1) {
            return c.json({ error: 'D1 not configured' }, 500);
        }

        const dateParam = date;
        const daysParam = days > 1 ? `-${days - 1} days` : '0 days';

        // 构造子查询：聚合 ip_path_daily，获取准确的 unique_paths
        // ⚠️ 使用 COUNT(DISTINCT path) 按查询范围统计唯一路径数
        //    - 避免被单个 hour_bucket 重复计数
        //    - 参数复用主查询的日期范围，确保数据一致性
        const uniquePathsSubquery = `
        SELECT ip_hash, COUNT(DISTINCT path) AS unique_paths
        FROM ip_path_daily
        WHERE date >= date(?, ?)
        GROUP BY ip_hash
      `;

        // 构造主查询：汇总 ip_traffic_daily，并关联 unique_paths
        // ⚠️ 使用 LEFT JOIN 确保即使没有路径数据的 IP 也能返回
        //    - COALESCE 兜底为 0，避免 NULL 值
        //    - 子查询与主查询使用相同的日期参数
        let sql = `
      SELECT 
        daily.ip_hash,
        MAX(daily.ip_address) AS ip_address,
        SUM(daily.total_requests) AS total_requests,
        SUM(daily.total_errors) AS total_errors,
        SUM(COALESCE(daily.blocked_requests, 0)) AS blocked_requests,
        SUM(COALESCE(daily.throttled_requests, 0)) AS throttled_requests,
        COALESCE(unique_paths.unique_paths, 0) AS unique_paths,
        MIN(daily.first_seen) AS first_seen,
        MAX(daily.last_seen) AS last_seen,
        MAX(daily.last_seen_city) AS last_seen_city,
        json_group_array(daily.countries) AS countries_json,
        json_group_array(daily.user_agents) AS user_agents_json
      FROM ip_traffic_daily daily
      LEFT JOIN (${uniquePathsSubquery}) unique_paths
        ON unique_paths.ip_hash = daily.ip_hash
      WHERE daily.date >= date(?, ?)
    `;

        // 参数顺序：子查询 (date, daysParam)，主查询 (date, daysParam)
        const params: any[] = [dateParam, daysParam, dateParam, daysParam];

        // 搜索过滤
        if (search) {
            sql += ` AND daily.ip_hash LIKE ?`;
            params.push(`${search}%`);
        }

        sql += ` GROUP BY daily.ip_hash`;

        // 排序
        if (sortBy === 'requests') {
            sql += ` ORDER BY total_requests DESC`;
        } else {
            sql += ` ORDER BY total_errors DESC`;
        }

        // 分页
        sql += ` LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        // 执行查询
        const result = await c.env.D1.prepare(sql).bind(...params).all();

        // 查询总数
        let countSql = `
      SELECT COUNT(DISTINCT ip_hash) as total
      FROM ip_traffic_daily
      WHERE date >= date(?, ?)
    `;

        const countParams: any[] = [date, days > 1 ? `-${days - 1} days` : '0 days'];

        if (search) {
            countSql += ` AND ip_hash LIKE ?`;
            countParams.push(`${search}%`);
        }

        const countResult = await c.env.D1.prepare(countSql).bind(...countParams).first();
        const total = (countResult?.total as number) || 0;

        // 标记可疑 IP
        const ips = (result.results || []).map((row: any) => {
            const totalRequests = row.total_requests as number;
            const totalErrors = row.total_errors as number;
            const blockedRequests = row.blocked_requests as number || 0;
            const throttledRequests = row.throttled_requests as number || 0;
            const rateLimitedCount = blockedRequests + throttledRequests;
            const successCount = computeSuccessCount(totalRequests, totalErrors, rateLimitedCount);

            // 计算各项指标
            const successRate = totalRequests > 0 ? (successCount / totalRequests) : 0;
            const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) : 0;
            const rateLimitRate = totalRequests > 0 ? (rateLimitedCount / totalRequests) : 0;

            const countries = aggregateCountries(row.countries_json);
            const userAgents = aggregateUserAgents(row.user_agents_json);
            const primaryCountry = countries.length > 0 ? countries[0] : undefined;
            const rawCity = row.last_seen_city || undefined; // Quick Win: 原始城市名称

            const firstSeenMs = Number(row.first_seen) || 0;
            const lastSeenMs = Number(row.last_seen) || 0;

            // 可疑标记规则
            let suspicious = false;
            let suspiciousReasons: string[] = [];

            if (totalRequests > 10000) {
                suspicious = true;
                suspiciousReasons.push('高频访问');
            }

            if (errorRate > 0.5 && totalRequests > 100) {
                suspicious = true;
                suspiciousReasons.push('高错误率');
            }

            return {
                ipHash: row.ip_hash,
                ipAddress: row.ip_address as string | null,
                totalRequests,
                totalErrors,
                blockedRequests,
                throttledRequests,
                rateLimitedCount,
                successCount,
                uniquePaths: row.unique_paths as number,
                errorCount: totalErrors,
                metrics: {
                    successRate: Math.round(successRate * 100),
                    errorRate: Math.round(errorRate * 100),
                    rateLimitRate: Math.round(rateLimitRate * 100),
                },
                successRate: Number((successRate * 100).toFixed(1)),
                errorRate: Number((errorRate * 100).toFixed(1)),
                rateLimitRate: Number((rateLimitRate * 100).toFixed(1)),
                firstSeen: firstSeenMs,
                lastSeen: lastSeenMs,
                firstSeenAt: firstSeenMs ? new Date(firstSeenMs).toISOString() : null,
                lastSeenAt: lastSeenMs ? new Date(lastSeenMs).toISOString() : null,
                countries,
                userAgents,
                primaryCountry,
                rawCity, // Quick Win: 原始城市名称
                suspicious,
                suspiciousReasons,
            };
        });

        logger.info('Query IP list', {
            date,
            days,
            page,
            limit,
            total,
            resultCount: ips.length,
        });

        return c.json({
            data: ips,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1,
            },
        });

    } catch (error) {
        logger.error('Failed to query IP list', logger.context, error as Error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

/**
 * GET /api/admin/ip-monitor/ips/:ipHash
 * 
 * 查询单个 IP 的详细信息
 */
app.get('/ips/:ipHash', async (c) => {
    const logger = createRequestLogger(c);
    const ipHash = c.req.param('ipHash');

    try {
        if (!c.env.D1) {
            return c.json({ error: 'D1 not configured' }, 500);
        }

        // 子查询：按天统计 unique_paths
        const perDayUniquePaths = `
      SELECT date, COUNT(DISTINCT path) AS unique_paths
      FROM ip_path_daily
      WHERE ip_hash = ?
        AND date >= date('now', '-7 days')
      GROUP BY date
    `;

        // 查询最近 7 天的统计，并关联每日 unique_paths
        const result = await c.env.D1.prepare(`
      SELECT 
        daily.date,
        daily.ip_address,
        daily.total_requests,
        daily.total_errors,
        COALESCE(daily.blocked_requests, 0) AS blocked_requests,
        COALESCE(daily.throttled_requests, 0) AS throttled_requests,
        COALESCE(unique_paths.unique_paths, 0) AS unique_paths,
        daily.top_paths,
        daily.countries,
        daily.user_agents,
        daily.first_seen,
        daily.last_seen
      FROM ip_traffic_daily daily
      LEFT JOIN (${perDayUniquePaths}) unique_paths
        ON unique_paths.date = daily.date
      WHERE daily.ip_hash = ?
        AND daily.date >= date('now', '-7 days')
      ORDER BY daily.date DESC
    `).bind(ipHash, ipHash).all();

        if (!result.results || result.results.length === 0) {
            return c.json({ error: 'IP not found' }, 404);
        }

        // 聚合统计
        let totalRequests = 0;
        let totalErrors = 0;
        let totalBlocked = 0;
        let totalThrottled = 0;
        const dailyStats: Array<{
            date: string;
            requests: number;
            errors: number;
            blocked: number;
            throttled: number;
            uniquePaths: number;
        }> = [];
        const allTopPaths = new Map<string, number>();
        const countryTotals = new Map<string, number>();
        const userAgentTotals = new Map<string, number>();

        for (const row of result.results) {
            const requests = Number(row.total_requests) || 0;
            const errors = Number(row.total_errors) || 0;
            const blocked = Number(row.blocked_requests ?? 0) || 0;
            const throttled = Number(row.throttled_requests ?? 0) || 0;

            totalRequests += requests;
            totalErrors += errors;
            totalBlocked += blocked;
            totalThrottled += throttled;

            dailyStats.push({
                date: String(row.date),
                requests,
                errors,
                blocked,
                throttled,
                uniquePaths: Number(row.unique_paths) || 0,
            });

            // 聚合 Top Paths
            if (row.top_paths) {
                const paths = JSON.parse(row.top_paths as string) as { path: string; count: number }[];
                for (const { path, count } of paths) {
                    allTopPaths.set(path, (allTopPaths.get(path) || 0) + count);
                }
            }

            // 聚合国家
            if (row.countries) {
                accumulateCountryCounts(countryTotals, row.countries);
            }

            // 聚合 UA
            if (row.user_agents) {
                accumulateUserAgentCounts(userAgentTotals, row.user_agents);
            }
        }

        // Top 20 路径
        const topPaths = Array.from(allTopPaths.entries())
            .map(([path, count]) => ({ path, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 20);

        // 获取 IP 地址（从第一条记录中）
        const ipAddress = result.results.find(r => r.ip_address)?.ip_address || null;

        const rateLimitedCount = totalBlocked + totalThrottled;
        const successCount = computeSuccessCount(totalRequests, totalErrors, rateLimitedCount);
        const countries = mapToCountryStats(countryTotals);
        const userAgents = mapToUserAgentStats(userAgentTotals);

        const firstSeenMs = Number(result.results[result.results.length - 1].first_seen) || 0;
        const lastSeenMs = Number(result.results[0].last_seen) || 0;

        logger.info('Query IP detail', { ipHash, ipAddress, days: dailyStats.length, totalRequests });

        return c.json({
            ipHash,
            ipAddress,  // 添加真实 IP 地址
            totalRequests,
            totalErrors,
            errorRate: totalRequests > 0 ? Math.round((totalErrors / totalRequests) * 100) : 0,
            successCount,
            rateLimitedCount,
            blockedRequests: totalBlocked,
            throttledRequests: totalThrottled,
            dailyStats,
            topPaths,
            countries,
            userAgents,
            firstSeen: firstSeenMs,
            lastSeen: lastSeenMs,
            firstSeenAt: firstSeenMs ? new Date(firstSeenMs).toISOString() : null,
            lastSeenAt: lastSeenMs ? new Date(lastSeenMs).toISOString() : null,
        });

    } catch (error) {
        logger.error('Failed to query IP detail', logger.context, error as Error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

/**
 * GET /api/admin/ip-monitor/ips/:ipHash/paths
 * 
 * 查询 IP 访问路径明细（实时查询 traffic_events 表）
 */
app.get('/ips/:ipHash/paths', zValidator('query', z.object({
    date: z.string().optional(),  // YYYY-MM-DD 格式，可选
    page: z.string().optional(),
    limit: z.string().optional(),
})), async (c) => {
    const logger = createRequestLogger(c);
    const ipHash = c.req.param('ipHash');
    const query = c.req.valid('query');
    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '50', 10), 500);
    const offset = (page - 1) * limit;
    const dateFilter = query.date;  // 可选的日期过滤

    try {
        if (!c.env.D1) {
            return c.json({ error: 'D1 not configured' }, 500);
        }

        // 构建日期过滤条件
        let dateCondition = "AND event_date >= date('now', '-3 days')";
        const params: any[] = [ipHash];

        if (dateFilter) {
            // 如果指定了日期，只查询该日期的数据
            dateCondition = "AND event_date = ?";
            params.push(dateFilter);
        }

        // 查询明细事件
        const result = await c.env.D1.prepare(`
      SELECT path, method, status, response_time, timestamp, event_date
      FROM traffic_events
      WHERE client_ip_hash = ?
        ${dateCondition}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

        // 查询总数
        const countResult = await c.env.D1.prepare(`
      SELECT COUNT(*) as total
      FROM traffic_events
      WHERE client_ip_hash = ?
        ${dateCondition}
    `).bind(...params).first();

        const total = (countResult?.total as number) || 0;

        logger.info('Query IP path details', { ipHash, page, limit, total });

        return c.json({
            data: result.results || [],
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1,
            },
            notice: '仅显示最近 3 天的明细数据，更早的数据已归档到 R2',
        });

    } catch (error) {
        logger.error('Failed to query IP path details', logger.context, error as Error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

/**
 * GET /api/admin/ip-monitor/rules
 * 
 * 查询所有活跃规则
 */
app.get('/rules', zValidator('query', z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
})), async (c) => {
    const logger = createRequestLogger(c);
    const query = c.req.valid('query');
    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '50', 10), 1000);
    const offset = (page - 1) * limit;

    try {
        if (!c.env.D1) {
            return c.json({ error: 'D1 not configured' }, 500);
        }

        const now = Math.floor(Date.now() / 1000);

        // 查询活跃规则
        const result = await c.env.D1.prepare(`
      SELECT 
        id, ip_pattern, mode, "limit", "window", 
        reason, created_by, created_at, expires_at
      FROM ip_access_rules
      WHERE is_active = 1
        AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(now, limit, offset).all();

        // 查询总数
        const countResult = await c.env.D1.prepare(`
      SELECT COUNT(*) as total
      FROM ip_access_rules
      WHERE is_active = 1
        AND (expires_at IS NULL OR expires_at > ?)
    `).bind(now).first();

        const total = (countResult?.total as number) || 0;

        logger.info('Query IP rules', { page, limit, total });

        return c.json({
            data: result.results || [],
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1,
            },
        });

    } catch (error) {
        logger.error('Failed to query IP rules', logger.context, error as Error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

/**
 * POST /api/admin/ip-monitor/rules
 * 
 * 创建 IP 访问规则
 */
app.post('/rules', zValidator('json', z.object({
    ipPattern: z.string().min(7),  // 最短 IP: "1.1.1.1" = 7 个字符
    mode: z.enum(['block', 'throttle']),
    limit: z.number().optional(),
    window: z.number().optional(),
    reason: z.string().optional(),
    expiresAt: z.number().optional(),
})), async (c) => {
    const logger = createRequestLogger(c);
    const body = c.req.valid('json');

    try {
        // 验证 throttle 模式参数
        if (body.mode === 'throttle') {
            if (!body.limit || !body.window) {
                return c.json({
                    error: 'throttle 模式必须提供 limit 和 window 参数'
                }, 400);
            }

            if (body.limit <= 0 || body.window <= 0) {
                return c.json({
                    error: 'limit 和 window 必须大于 0'
                }, 400);
            }
        }

        // 检查规则数量限制
        const countResult = await c.env.D1!.prepare(`
      SELECT COUNT(*) as total
      FROM ip_access_rules
      WHERE is_active = 1
    `).first();

        const currentCount = (countResult?.total as number) || 0;

        if (currentCount >= 1000) {
            return c.json({
                error: '已达到规则数量上限（1000 条）',
                currentCount
            }, 400);
        }

        // 创建规则
        const ruleId = await createIpRule(c.env, {
            ipPattern: body.ipPattern,
            mode: body.mode,
            limit: body.limit,
            window: body.window,
            reason: body.reason,
            expiresAt: body.expiresAt,
        });

        logger.info('Created IP rule', { ruleId, ipPattern: body.ipPattern, mode: body.mode });

        return c.json({
            success: true,
            ruleId,
            message: `IP 规则已创建: ${body.ipPattern} (${body.mode})`,
        });

    } catch (error) {
        logger.error('Failed to create IP rule', logger.context, error as Error);

        if (error instanceof Error) {
            return c.json({ error: error.message }, 400);
        }

        return c.json({ error: 'Internal server error' }, 500);
    }
});

/**
 * DELETE /api/admin/ip-monitor/rules/:ruleId
 * 
 * 删除（软删除）IP 访问规则
 */
app.delete('/rules/:ruleId', async (c) => {
    const logger = createRequestLogger(c);
    const ruleId = parseInt(c.req.param('ruleId'), 10);

    try {
        if (isNaN(ruleId)) {
            return c.json({ error: 'Invalid rule ID' }, 400);
        }

        await deleteIpRule(c.env, ruleId);

        logger.info('Deleted IP rule', { ruleId });

        return c.json({
            success: true,
            message: `IP 规则已删除: ID=${ruleId}`,
        });

    } catch (error) {
        logger.error('Failed to delete IP rule', logger.context, error as Error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

/**
 * GET /api/admin/ip-monitor/config
 * 
 * 获取 IP 监控配置
 */
app.get('/config', async (c) => {
    const logger = createRequestLogger(c);

    try {
        const config = await loadIpMonitorConfig(c.env);
        logger.info('Query IP monitor config');

        return c.json({
            success: true,
            config,
        });

    } catch (error) {
        logger.error('Failed to query IP monitor config', logger.context, error as Error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

/**
 * PUT /api/admin/ip-monitor/config
 * 
 * 更新 IP 监控配置
 */
app.put('/config', zValidator('json', z.object({
    retentionDays: z.number().min(1).max(30),
    alerts: z.object({
        webhookUrl: z.string().url('请输入合法的 Webhook 地址').optional().or(z.literal('').optional()),
        cooldownMinutes: z.number().min(1).max(60).optional(),
        globalRps: z.object({
            enabled: z.boolean(),
            threshold: z.number().min(0),
        }).optional(),
        ipSpike: z.object({
            enabled: z.boolean(),
            threshold: z.number().min(0),
        }).optional(),
    }).optional(),
})), async (c) => {
    const logger = createRequestLogger(c);
    const body = c.req.valid('json');

    try {
        const currentConfig = await loadIpMonitorConfig(c.env);
        const updatedConfig: IpMonitorConfig = {
            retentionDays: body.retentionDays,
            alerts: normalizeAlertConfig(body.alerts ?? currentConfig.alerts),
        };

        await saveIpMonitorConfig(c.env, updatedConfig);

        logger.info('Updated IP monitor config', {
            retentionDays: updatedConfig.retentionDays,
            alerts: updatedConfig.alerts,
        });

        return c.json({
            success: true,
            message: 'IP 监控配置已更新',
            config: updatedConfig,
        });

    } catch (error) {
        logger.error('Failed to update IP monitor config', logger.context, error as Error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

export default app;
