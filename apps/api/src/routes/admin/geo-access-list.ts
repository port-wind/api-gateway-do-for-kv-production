/**
 * 地区访问监控 API
 * 
 * 功能：
 * - 查询各国家/地区的访问统计
 * - 查询单个国家的详细信息和时间线
 * - 查询国家的访问路径列表
 * 
 * 数据来源：实时聚合 traffic_events 表（MVP）
 * 性能：依赖索引 idx_traffic_events_date_country
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env } from '../../types/env';
import { createRequestLogger } from '../../lib/logger';

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /api/admin/geo/access-list
 * 
 * 查询国家访问列表（按日期 + 请求量排序）
 * 
 * 查询参数：
 * - date: 日期 (YYYY-MM-DD)，默认今天
 * - page: 页码，默认 1
 * - limit: 每页数量，默认 50，最大 200
 * - sortBy: 排序字段 (total_requests|blocked_requests|success_rate)，默认 total_requests
 * - sortOrder: 排序方向 (asc|desc)，默认 desc
 * - search: 国家代码搜索（模糊匹配）
 */
app.get('/', zValidator('query', z.object({
    date: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
    sortBy: z.enum(['total_requests', 'blocked_requests', 'success_rate']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    search: z.string().optional(),
})), async (c) => {
    const logger = createRequestLogger(c);

    try {
        const query = c.req.valid('query');
        const date = query.date || new Date().toISOString().split('T')[0];
        const page = parseInt(query.page || '1', 10);
        const limit = Math.min(parseInt(query.limit || '50', 10), 200);
        const sortBy = query.sortBy || 'total_requests';
        const sortOrder = query.sortOrder || 'desc';
        const search = query.search?.toUpperCase(); // 国家代码通常是大写
        const offset = (page - 1) * limit;

        // 参数验证
        if (page < 1 || limit < 1) {
            return c.json({ error: 'Invalid pagination parameters' }, 400);
        }

        if (!c.env.D1) {
            return c.json({ error: 'D1 not configured' }, 500);
        }

        // 构建主查询 SQL：从 traffic_events 实时聚合
        // 使用 event_date 索引，配合 idx_traffic_events_date_country
        let whereClauses = ['event_date = ?', 'country IS NOT NULL'];
        const params: any[] = [date];

        if (search) {
            whereClauses.push('country LIKE ?');
            params.push(`%${search}%`);
        }

        const whereClause = whereClauses.join(' AND ');

        // 主查询：聚合国家级统计
        // ✅ 显式计算 success_rate，支持按成功率排序
        const mainQuery = `
            SELECT 
                country,
                COUNT(*) as total_requests,
                SUM(CASE WHEN geo_action = 'blocked' THEN 1 ELSE 0 END) as blocked_requests,
                SUM(CASE WHEN geo_action = 'throttled' THEN 1 ELSE 0 END) as throttled_requests,
                SUM(CASE WHEN COALESCE(geo_action, 'allowed') = 'allowed' THEN 1 ELSE 0 END) as allowed_requests,
                SUM(CASE WHEN is_error = 1 OR (status >= 400 AND status < 500) THEN 1 ELSE 0 END) as error_4xx,
                SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) as error_5xx,
                AVG(response_time) as avg_response_time,
                COUNT(DISTINCT path) as unique_paths,
                CASE 
                    WHEN COUNT(*) > 0 THEN 
                        (COUNT(*) - COALESCE(SUM(CASE WHEN is_error = 1 OR (status >= 400 AND status < 500) THEN 1 ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END), 0)) * 100.0 / COUNT(*)
                    ELSE 0
                END as success_rate
            FROM traffic_events
            WHERE ${whereClause}
            GROUP BY country
            ORDER BY ${sortBy} ${sortOrder.toUpperCase()}
            LIMIT ? OFFSET ?
        `;

        params.push(limit, offset);

        const result = await c.env.D1.prepare(mainQuery).bind(...params).all();

        if (!result.success) {
            logger.error('查询国家列表失败', { error: result.error });
            return c.json({ error: 'Failed to query country list' }, 500);
        }

        // 统计总数
        const countQuery = `
            SELECT COUNT(DISTINCT country) as total
            FROM traffic_events
            WHERE ${whereClause}
        `;

        const countResult = await c.env.D1.prepare(countQuery).bind(...params.slice(0, params.length - 2)).first<{ total: number }>();
        const total = countResult?.total || 0;

        // 为每个国家查询 Top 5 路径（方案 A：循环查询）
        const countries = result.results || [];
        const dataWithPaths = await Promise.all(countries.map(async (country: any) => {
            const pathQuery = `
                SELECT path, COUNT(*) as count
                FROM traffic_events
                WHERE event_date = ? AND country = ?
                GROUP BY path
                ORDER BY count DESC
                LIMIT 5
            `;

            const pathResult = await c.env.D1.prepare(pathQuery).bind(date, country.country).all();
            const topPaths = (pathResult.results || []).map((p: any) => ({
                path: p.path,
                count: p.count
            }));

            // ✅ SQL 已计算 success_rate，直接使用
            const successRate = country.success_rate || 0;

            // 计算封禁率
            const blockRate = country.total_requests > 0
                ? (country.blocked_requests / country.total_requests) * 100
                : 0;

            return {
                country: country.country,
                countryName: '', // 前端通过 country-names.ts 映射
                date,
                totalRequests: country.total_requests,
                blockedRequests: country.blocked_requests,
                throttledRequests: country.throttled_requests,
                allowedRequests: country.allowed_requests,
                successRate: parseFloat(successRate.toFixed(2)),
                blockRate: parseFloat(blockRate.toFixed(2)),
                error4xx: country.error_4xx,
                error5xx: country.error_5xx,
                avgResponseTime: country.avg_response_time ? parseFloat(country.avg_response_time.toFixed(2)) : 0,
                uniquePaths: country.unique_paths,
                topPaths,
            };
        }));

        // 计算汇总统计
        const summary = {
            totalCountries: total,
            totalRequests: dataWithPaths.reduce((sum, c) => sum + c.totalRequests, 0),
            totalBlocked: dataWithPaths.reduce((sum, c) => sum + c.blockedRequests, 0),
            totalThrottled: dataWithPaths.reduce((sum, c) => sum + c.throttledRequests, 0),
            avgBlockRate: dataWithPaths.length > 0
                ? parseFloat((dataWithPaths.reduce((sum, c) => sum + c.blockRate, 0) / dataWithPaths.length).toFixed(2))
                : 0,
        };

        return c.json({
            data: dataWithPaths,
            pagination: {
                page,
                limit,
                total,
                hasMore: offset + limit < total,
            },
            summary,
        });

    } catch (error: any) {
        logger.error('查询国家访问列表异常', { error: error.message });
        return c.json({ error: 'Internal server error' }, 500);
    }
});

/**
 * GET /api/admin/geo/access-list/:country
 * 
 * 查询单个国家的详细信息
 * 
 * 包含：
 * - 基础统计
 * - 24 小时时间线（按小时聚合）
 * - 路径访问分布 Top 10
 * - 关联的地区规则
 */
app.get('/:country', zValidator('query', z.object({
    date: z.string().optional(),
})), async (c) => {
    const logger = createRequestLogger(c);

    try {
        const country = c.req.param('country').toUpperCase();
        const query = c.req.valid('query');
        const date = query.date || new Date().toISOString().split('T')[0];

        if (!c.env.D1) {
            return c.json({ error: 'D1 not configured' }, 500);
        }

        // 1. 基础统计
        const statsQuery = `
            SELECT 
                COUNT(*) as total_requests,
                SUM(CASE WHEN geo_action = 'blocked' THEN 1 ELSE 0 END) as blocked_requests,
                SUM(CASE WHEN geo_action = 'throttled' THEN 1 ELSE 0 END) as throttled_requests,
                SUM(CASE WHEN COALESCE(geo_action, 'allowed') = 'allowed' THEN 1 ELSE 0 END) as allowed_requests,
                SUM(CASE WHEN is_error = 1 OR (status >= 400 AND status < 500) THEN 1 ELSE 0 END) as error_4xx,
                SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) as error_5xx,
                AVG(response_time) as avg_response_time,
                COUNT(DISTINCT path) as unique_paths
            FROM traffic_events
            WHERE event_date = ? AND country = ?
        `;

        const statsResult = await c.env.D1.prepare(statsQuery).bind(date, country).first();

        if (!statsResult) {
            return c.json({ error: 'Country not found' }, 404);
        }

        // 计算成功率
        const totalRequests = statsResult.total_requests as number;
        const error4xx = statsResult.error_4xx as number;
        const error5xx = statsResult.error_5xx as number;
        const successCount = totalRequests - error4xx - error5xx;
        const successRate = totalRequests > 0 ? (successCount / totalRequests) * 100 : 0;

        // 2. 24 小时时间线（按小时聚合）
        const timelineQuery = `
            SELECT 
                strftime('%H:00', datetime(timestamp/1000, 'unixepoch')) as hour,
                COUNT(*) as requests,
                SUM(CASE WHEN geo_action = 'blocked' THEN 1 ELSE 0 END) as blocked,
                SUM(CASE WHEN geo_action = 'throttled' THEN 1 ELSE 0 END) as throttled
            FROM traffic_events
            WHERE event_date = ? AND country = ?
            GROUP BY hour
            ORDER BY hour ASC
        `;

        const timelineResult = await c.env.D1.prepare(timelineQuery).bind(date, country).all();

        // 3. 路径访问分布 Top 10
        const pathsQuery = `
            SELECT 
                path,
                COUNT(*) as total_requests,
                SUM(CASE WHEN geo_action = 'blocked' THEN 1 ELSE 0 END) as blocked_requests,
                SUM(CASE WHEN geo_action = 'throttled' THEN 1 ELSE 0 END) as throttled_requests,
                SUM(CASE WHEN COALESCE(geo_action, 'allowed') = 'allowed' THEN 1 ELSE 0 END) as allowed_requests,
                SUM(CASE WHEN is_error = 1 OR (status >= 400 AND status < 500) THEN 1 ELSE 0 END) as error_4xx,
                SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) as error_5xx,
                AVG(response_time) as avg_response_time
            FROM traffic_events
            WHERE event_date = ? AND country = ?
            GROUP BY path
            ORDER BY total_requests DESC
            LIMIT 10
        `;

        const pathsResult = await c.env.D1.prepare(pathsQuery).bind(date, country).all();

        const pathBreakdown = (pathsResult.results || []).map((p: any) => {
            // ✅ 正确的成功率计算：total - blocked - throttled - error4xx - error5xx
            const successCount = p.total_requests - p.blocked_requests - p.throttled_requests - p.error_4xx - p.error_5xx;
            const pathSuccessRate = p.total_requests > 0
                ? (successCount / p.total_requests) * 100
                : 0;

            return {
                path: p.path,
                totalRequests: p.total_requests,
                blockedRequests: p.blocked_requests,
                throttledRequests: p.throttled_requests,
                allowedRequests: p.allowed_requests,
                error4xx: p.error_4xx,
                error5xx: p.error_5xx,
                successRate: parseFloat(pathSuccessRate.toFixed(2)),
                avgResponseTime: p.avg_response_time ? parseFloat(p.avg_response_time.toFixed(2)) : 0,
            };
        });

        // 4. 关联的地区规则（从 KV 读取）
        let existingRules: any[] = [];
        try {
            const globalRuleSet = await c.env.API_GATEWAY_STORAGE.get<any>('geo-rule:global', 'json');
            if (globalRuleSet?.rules) {
                // ✅ 完整匹配：countries、continents、customGroups
                // 获取国家所属的洲（简化映射，生产环境应使用完整映射）
                const countryToContinentMap: Record<string, string> = {
                    'CN': 'AS', 'JP': 'AS', 'KR': 'AS', 'IN': 'AS', 'SG': 'AS', 'TH': 'AS', // 亚洲
                    'US': 'NA', 'CA': 'NA', 'MX': 'NA', // 北美
                    'GB': 'EU', 'FR': 'EU', 'DE': 'EU', 'IT': 'EU', 'ES': 'EU', // 欧洲
                    'BR': 'SA', 'AR': 'SA', 'CL': 'SA', // 南美
                    'AU': 'OC', 'NZ': 'OC', // 大洋洲
                    'ZA': 'AF', 'EG': 'AF', 'NG': 'AF', // 非洲
                };
                const continent = countryToContinentMap[country];

                existingRules = globalRuleSet.rules.filter((rule: any) => {
                    const match = rule.geoMatch;

                    // 匹配 countries
                    if (match.countries?.includes(country)) {
                        return true;
                    }

                    // 匹配 continents
                    if (continent && match.continents?.includes(continent)) {
                        return true;
                    }

                    // 匹配 customGroups（需要读取预设组）
                    if (match.customGroups && match.customGroups.length > 0) {
                        // TODO: 从 KV 或预设组中查询 customGroup 是否包含该国家
                        // MVP 阶段简化处理，假设前端会显示组名
                        return false;
                    }

                    return false;
                });
            }
        } catch (error) {
            logger.warn('读取地区规则失败', { error });
        }

        return c.json({
            country,
            countryName: '', // 前端映射
            stats: {
                country,
                countryName: '',
                date,
                totalRequests,
                blockedRequests: statsResult.blocked_requests,
                throttledRequests: statsResult.throttled_requests,
                allowedRequests: statsResult.allowed_requests,
                successRate: parseFloat(successRate.toFixed(2)),
                blockRate: totalRequests > 0
                    ? parseFloat(((statsResult.blocked_requests as number / totalRequests) * 100).toFixed(2))
                    : 0,
                error4xx,
                error5xx,
                avgResponseTime: statsResult.avg_response_time ? parseFloat((statsResult.avg_response_time as number).toFixed(2)) : 0,
                uniquePaths: statsResult.unique_paths,
                topPaths: [],
            },
            pathBreakdown,
            timeline: timelineResult.results || [],
            existingRules,
        });

    } catch (error: any) {
        logger.error('查询国家详情异常', { error: error.message });
        return c.json({ error: 'Internal server error' }, 500);
    }
});

/**
 * GET /api/admin/geo/access-list/:country/paths
 * 
 * 查询国家的访问路径列表（分页）
 */
app.get('/:country/paths', zValidator('query', z.object({
    date: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
})), async (c) => {
    const logger = createRequestLogger(c);

    try {
        const country = c.req.param('country').toUpperCase();
        const query = c.req.valid('query');
        const date = query.date || new Date().toISOString().split('T')[0];
        const page = parseInt(query.page || '1', 10);
        const limit = Math.min(parseInt(query.limit || '20', 10), 100);
        const offset = (page - 1) * limit;

        if (!c.env.D1) {
            return c.json({ error: 'D1 not configured' }, 500);
        }

        // 查询路径列表
        const pathsQuery = `
            SELECT 
                path,
                COUNT(*) as total_requests,
                SUM(CASE WHEN geo_action = 'blocked' THEN 1 ELSE 0 END) as blocked_requests,
                SUM(CASE WHEN geo_action = 'throttled' THEN 1 ELSE 0 END) as throttled_requests,
                SUM(CASE WHEN COALESCE(geo_action, 'allowed') = 'allowed' THEN 1 ELSE 0 END) as allowed_requests,
                SUM(CASE WHEN is_error = 1 OR (status >= 400 AND status < 500) THEN 1 ELSE 0 END) as error_4xx,
                SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) as error_5xx,
                AVG(response_time) as avg_response_time
            FROM traffic_events
            WHERE event_date = ? AND country = ?
            GROUP BY path
            ORDER BY total_requests DESC
            LIMIT ? OFFSET ?
        `;

        const pathsResult = await c.env.D1.prepare(pathsQuery).bind(date, country, limit, offset).all();

        // 统计总路径数
        const countQuery = `
            SELECT COUNT(DISTINCT path) as total
            FROM traffic_events
            WHERE event_date = ? AND country = ?
        `;

        const countResult = await c.env.D1.prepare(countQuery).bind(date, country).first<{ total: number }>();
        const total = countResult?.total || 0;

        const data = (pathsResult.results || []).map((p: any) => {
            // ✅ 正确的成功率计算：total - blocked - throttled - error4xx - error5xx
            const successCount = p.total_requests - p.blocked_requests - p.throttled_requests - p.error_4xx - p.error_5xx;
            const pathSuccessRate = p.total_requests > 0
                ? (successCount / p.total_requests) * 100
                : 0;

            return {
                path: p.path,
                totalRequests: p.total_requests,
                blockedRequests: p.blocked_requests,
                throttledRequests: p.throttled_requests,
                allowedRequests: p.allowed_requests,
                error4xx: p.error_4xx,
                error5xx: p.error_5xx,
                successRate: parseFloat(pathSuccessRate.toFixed(2)),
                avgResponseTime: p.avg_response_time ? parseFloat(p.avg_response_time.toFixed(2)) : 0,
            };
        });

        return c.json({
            data,
            pagination: {
                page,
                limit,
                total,
                hasMore: offset + limit < total,
            },
        });

    } catch (error: any) {
        logger.error('查询国家路径列表异常', { error: error.message });
        return c.json({ error: 'Internal server error' }, 500);
    }
});

export default app;

