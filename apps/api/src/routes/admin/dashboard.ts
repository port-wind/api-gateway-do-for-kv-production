/**
 * Dashboard API 路由
 * 提供 Dashboard 所需的聚合数据接口
 */

import { Hono } from 'hono';
import type { Env } from '../../types/env';
import {
    aggregateDashboardOverview,
    queryTimeseries,
    getRateLimitStats,
} from '../../lib/dashboard-aggregator';
import { getCountryCoords, getColoCoords } from '../../lib/geo-coords';
import { loadIpMonitorConfig, getAlertWebhook, getAlertCooldownSeconds } from '../../lib/ip-monitor-config';
import { sendAlertNotification } from '../../lib/alert-notifier';

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /api/admin/dashboard/overview
 * 获取 Dashboard 概览数据（聚合所有核心指标）
 * 
 * 优先读取 KV 快照（10 分钟刷新），降级到实时计算
 */
app.get('/overview', async (c) => {
    try {
        // ✅ 优先从 KV 快照读取（10 分钟缓存）
        const cached = await c.env.API_GATEWAY_STORAGE.get('dashboard:snapshot:latest', 'json') as {
            data: any;
            timestamp: number;
            version: string;
        } | null;

        const now = Date.now();
        const cacheValid = cached && cached.timestamp && (now - cached.timestamp) < 600000; // 10 分钟有效

        if (cacheValid) {
            // 快照有效，直接返回
            return c.json({
                success: true,
                data: cached.data,
                cached: true,
                cacheAge: Math.round((now - cached.timestamp) / 1000), // 秒
            });
        }

        // ⚠️ 降级：快照不可用，实时计算
        console.warn('Dashboard snapshot not available, falling back to real-time calculation');
        const overview = await aggregateDashboardOverview(c.env);

        return c.json({
            success: true,
            data: overview,
            cached: false,
            warning: 'Using real-time calculation (snapshot unavailable)',
        });
    } catch (error) {
        console.error('Failed to fetch dashboard overview:', error);
        return c.json({
            success: false,
            error: 'Failed to fetch dashboard overview',
            message: error instanceof Error ? error.message : 'Unknown error',
        }, 500);
    }
});

/**
 * GET /api/admin/dashboard/timeseries
 * 获取时间序列数据（用于趋势图表）
 * 
 * Query Params:
 *   - range: 24h | 7d（默认 24h）
 *   - metric: requests | cache_hit | errors（默认 requests）
 */
app.get('/timeseries', async (c) => {
    try {
        const range = c.req.query('range') || '24h';
        const metric = (c.req.query('metric') || 'requests') as 'requests' | 'cache_hit' | 'errors';

        // 验证参数
        if (!['24h', '7d'].includes(range)) {
            return c.json({
                success: false,
                error: 'Invalid range parameter',
                message: 'Range must be one of: 24h, 7d',
            }, 400);
        }

        if (!['requests', 'cache_hit', 'errors'].includes(metric)) {
            return c.json({
                success: false,
                error: 'Invalid metric parameter',
                message: 'Metric must be one of: requests, cache_hit, errors',
            }, 400);
        }

        const data = await queryTimeseries(c.env, range, metric);

        return c.json({
            success: true,
            data,
        });
    } catch (error) {
        console.error('Failed to fetch timeseries data:', error);
        return c.json({
            success: false,
            error: 'Failed to fetch timeseries data',
            message: error instanceof Error ? error.message : 'Unknown error',
        }, 500);
    }
});

/**
 * GET /api/admin/dashboard/rate-limit/stats
 * 获取 Rate Limiter 统计（Phase 1 简化版本）
 */
app.get('/rate-limit/stats', async (c) => {
    try {
        const stats = await getRateLimitStats(c.env);
        return c.json({
            success: true,
            data: stats,
        });
    } catch (error) {
        console.error('Failed to fetch rate limit stats:', error);
        return c.json({
            success: false,
            error: 'Failed to fetch rate limit stats',
            message: error instanceof Error ? error.message : 'Unknown error',
        }, 500);
    }
});

/**
 * GET /api/admin/dashboard/realtime/recent
 * 获取实时地图数据（客户端国家 → 边缘节点飞线）
 * 
 * Query Params:
 *   - limit: 返回条数，默认 50，最大 100
 * 
 * 数据源：
 *   - 优先从 KV 快照读取（5 分钟缓存）
 *   - 降级到 D1 实时查询（最近 30 分钟数据）
 */
app.get('/realtime/recent', async (c) => {
    try {
        // 增加 limit 上限到 100，默认 50
        const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

        // ✅ 优先从 KV 快照读取（5 分钟缓存）
        const cached = await c.env.API_GATEWAY_STORAGE.get('geo:traffic:latest', 'json') as any;

        if (cached && cached.timestamp && Date.now() - cached.timestamp < 300000) {
            // 快照有效，直接返回
            const edges = (cached.edges || []).slice(0, limit).map((edge: any) => ({
                clientCountry: edge.country || 'Unknown',
                clientCoords: getCountryCoords(edge.country),
                edgeColo: edge.edge_colo || 'UNKNOWN',
                edgeCoords: getColoCoords(edge.edge_colo),
                requestCount: edge.request_count || 0,
                errorCount: edge.error_count || 0,
                isError: (edge.error_count || 0) > 0,
            }));

            // 统计活跃边缘节点
            const edgeNodeMap = new Map<string, number>();
            edges.forEach((e: any) => {
                if (e.edgeColo !== 'UNKNOWN') {
                    edgeNodeMap.set(e.edgeColo, (edgeNodeMap.get(e.edgeColo) || 0) + e.requestCount);
                }
            });

            const edgeNodes = Array.from(edgeNodeMap.entries()).map(([colo, count]) => ({
                colo,
                coords: getColoCoords(colo),
                requestCount: count,
            }));

            return c.json({
                success: true,
                events: edges,
                edgeNodes,
                timestamp: cached.timestamp,
                dataSource: 'cache', // 标记数据来源
            });
        }

        // ⚠️ 降级：KV 快照不可用，从 D1 实时查询
        // 时间跨度：30 分钟（提供更丰富的数据展示）
        const since = Date.now() - 1800000; // 30 分钟

        const result = await c.env.D1.prepare(`
      SELECT 
        country,
        edge_colo,
        COUNT(*) as request_count,
        SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END) as error_count
      FROM traffic_events
      WHERE timestamp > ?
      GROUP BY country, edge_colo
      ORDER BY request_count DESC
      LIMIT ?
    `).bind(since, limit).all<{ country: string; edge_colo: string; request_count: number; error_count: number }>();

        const events = result.results.map((row: { country: string; edge_colo: string; request_count: number; error_count: number }) => ({
            clientCountry: row.country || 'Unknown',
            clientCoords: getCountryCoords(row.country),
            edgeColo: row.edge_colo || 'UNKNOWN',
            edgeCoords: getColoCoords(row.edge_colo),
            requestCount: row.request_count,
            errorCount: row.error_count,
            isError: row.error_count > 0,
        }));

        // 统计活跃边缘节点
        const edgeNodeMap = new Map<string, number>();
        events.forEach((e: { edgeColo: string; requestCount: number }) => {
            if (e.edgeColo !== 'UNKNOWN') {
                edgeNodeMap.set(e.edgeColo, (edgeNodeMap.get(e.edgeColo) || 0) + e.requestCount);
            }
        });

        const edgeNodes = Array.from(edgeNodeMap.entries()).map(([colo, count]) => ({
            colo,
            coords: getColoCoords(colo),
            requestCount: count,
        }));

        return c.json({
            success: true,
            events,
            edgeNodes,
            timestamp: Date.now(),
            dataSource: 'realtime', // 标记降级查询
        });
    } catch (error) {
        console.error('Failed to fetch realtime events:', error);
        return c.json({
            success: false,
            error: 'Failed to fetch realtime events',
            message: error instanceof Error ? error.message : 'Unknown error',
        }, 500);
    }
});

/**
 * GET /api/admin/dashboard/alerts
 * 获取当前活跃的告警
 * 
 * 基于现有指标计算告警：
 * - 错误率过高（>5%）
 * - 缓存命中率过低（<60%，且有实际数据）
 * - 流量突增（增长 >100%）
 * - RPM 接近峰值（当前 RPM > 峰值的 80%）
 */
app.get('/alerts', async (c) => {
    try {
        // 获取 overview 数据（优先从快照读取）
        const cached = await c.env.API_GATEWAY_STORAGE.get('dashboard:snapshot:latest', 'json') as {
            data: any;
            timestamp: number;
        } | null;

        let overview: any;
        const now = Date.now();

        if (cached && cached.timestamp && (now - cached.timestamp) < 600000) {
            overview = cached.data;
        } else {
            // 降级到实时计算
            overview = await aggregateDashboardOverview(c.env);
        }

        const ipMonitorConfig = await loadIpMonitorConfig(c.env);
        const alertsConfig = ipMonitorConfig.alerts;
        const webhookUrl = getAlertWebhook(ipMonitorConfig);
        const alertCooldownSeconds = getAlertCooldownSeconds(ipMonitorConfig);

        const alerts: Array<{
            id: string;
            severity: 'critical' | 'warning' | 'info';
            title: string;
            message: string;
            value: string | number;
            timestamp: number;
            link?: string;
        }> = [];

        // 告警规则 1：错误率过高
        if (overview.reliability.errorRate > 5) {
            alerts.push({
                id: 'high-error-rate',
                severity: overview.reliability.errorRate > 10 ? 'critical' : 'warning',
                title: '错误率过高',
                message: `当前错误率为 ${overview.reliability.errorRate.toFixed(2)}%，超过正常阈值（5%）`,
                value: `${overview.reliability.errorRate.toFixed(2)}%`,
                timestamp: Date.now(),
                link: '/dashboard' // 可以跳转到具体页面
            });
        }

        // 告警规则 2：缓存命中率过低（仅在有实际数据时）
        if (overview.traffic.totalRequests24h > 100 && overview.reliability.cacheHitRate > 0 && overview.reliability.cacheHitRate < 60) {
            alerts.push({
                id: 'low-cache-hit-rate',
                severity: overview.reliability.cacheHitRate < 40 ? 'critical' : 'warning',
                title: '缓存命中率偏低',
                message: `当前缓存命中率为 ${overview.reliability.cacheHitRate.toFixed(2)}%，建议检查缓存配置`,
                value: `${overview.reliability.cacheHitRate.toFixed(2)}%`,
                timestamp: Date.now(),
                link: '/cache'
            });
        }

        // 告警规则 3：流量突增
        if (overview.traffic.trendVsPrevDay > 100) {
            alerts.push({
                id: 'traffic-spike',
                severity: overview.traffic.trendVsPrevDay > 200 ? 'critical' : 'warning',
                title: '流量突增',
                message: `流量较昨日同期增长 ${overview.traffic.trendVsPrevDay.toFixed(1)}%`,
                value: `+${overview.traffic.trendVsPrevDay.toFixed(1)}%`,
                timestamp: Date.now(),
                link: '/dashboard'
            });
        }

        // 告警规则 4：流量骤降（可能是服务异常）
        if (overview.traffic.trendVsPrevDay < -50 && overview.traffic.totalRequests24h > 0) {
            alerts.push({
                id: 'traffic-drop',
                severity: overview.traffic.trendVsPrevDay < -80 ? 'critical' : 'warning',
                title: '流量骤降',
                message: `流量较昨日同期下降 ${Math.abs(overview.traffic.trendVsPrevDay).toFixed(1)}%，请检查服务状态`,
                value: `${overview.traffic.trendVsPrevDay.toFixed(1)}%`,
                timestamp: Date.now(),
                link: '/dashboard'
            });
        }

        // 告警规则 5：RPM 接近峰值
        if (overview.traffic.currentRpm > 0 && overview.traffic.peakRpm > 0) {
            const rpmRatio = (overview.traffic.currentRpm / overview.traffic.peakRpm) * 100;
            if (rpmRatio > 80) {
                alerts.push({
                    id: 'high-rpm',
                    severity: rpmRatio > 95 ? 'critical' : 'warning',
                    title: 'RPM 接近峰值',
                    message: `当前 RPM (${overview.traffic.currentRpm}) 已达峰值的 ${rpmRatio.toFixed(1)}%`,
                    value: `${overview.traffic.currentRpm} RPM`,
                    timestamp: Date.now(),
                    link: '/dashboard'
                });
            }
        }

        // 新增告警：全站 RPS 超过阈值
        if (alertsConfig?.globalRps?.enabled && alertsConfig.globalRps.threshold > 0) {
            const currentRps = overview.traffic.currentRpm / 60;
            if (currentRps >= alertsConfig.globalRps.threshold) {
                const severity: 'critical' | 'warning' = currentRps >= alertsConfig.globalRps.threshold * 1.2 ? 'critical' : 'warning';
                alerts.push({
                    id: 'global-rps-threshold',
                    severity,
                    title: '全站流量告警',
                    message: `当前 RPS 为 ${currentRps.toFixed(1)}，已超过阈值 ${alertsConfig.globalRps.threshold}`,
                    value: `${currentRps.toFixed(1)} RPS`,
                    timestamp: Date.now(),
                    link: '/dashboard',
                });

                await sendAlertNotification(c.env, {
                    dedupeKey: 'global-rps',
                    webhookUrl,
                    message: `【全站流量告警】当前 RPS ${currentRps.toFixed(1)}，超过阈值 ${alertsConfig.globalRps.threshold}`,
                    cooldownSeconds: alertCooldownSeconds,
                });
            }
        }

        // 新增告警：单 IP 请求突增
        if (alertsConfig?.ipSpike?.enabled && alertsConfig.ipSpike.threshold > 0 && c.env.D1) {
            const topIp = await c.env.D1.prepare(`
                SELECT 
                  ip_hash,
                  MAX(ip_address) AS ip_address,
                  SUM(total_requests) AS total_requests,
                  SUM(total_errors) AS total_errors
                FROM ip_traffic_daily
                WHERE date >= date('now', '-0 days')
                GROUP BY ip_hash
                ORDER BY total_requests DESC
                LIMIT 1
            `).first<{ ip_hash: string; ip_address: string | null; total_requests: number; total_errors: number }>();

            if (topIp && topIp.total_requests >= alertsConfig.ipSpike.threshold) {
                const label = topIp.ip_address || (topIp.ip_hash ? `${topIp.ip_hash.slice(0, 12)}...` : '未知 IP');
                const errorRate = topIp.total_requests > 0
                    ? Number(((topIp.total_errors / topIp.total_requests) * 100).toFixed(1))
                    : 0;

                alerts.push({
                    id: `ip-traffic-spike-${topIp.ip_hash}`,
                    severity: errorRate >= 10 ? 'critical' : 'warning',
                    title: '可疑 IP 访问告警',
                    message: `IP ${label} 今日请求 ${topIp.total_requests.toLocaleString()} 次，超过阈值 ${alertsConfig.ipSpike.threshold}`,
                    value: `${topIp.total_requests.toLocaleString()} 次`,
                    timestamp: Date.now(),
                    link: `/ip-monitor?search=${encodeURIComponent(topIp.ip_hash ?? '')}`,
                });

                await sendAlertNotification(c.env, {
                    dedupeKey: `ip-spike-${topIp.ip_hash}`,
                    webhookUrl,
                    message: `【可疑 IP 告警】IP ${label} 今日请求 ${topIp.total_requests} 次，超过阈值 ${alertsConfig.ipSpike.threshold}`,
                    cooldownSeconds: alertCooldownSeconds,
                });
            }
        }
        

        // 按严重程度排序：critical > warning > info
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

        return c.json({
            success: true,
            alerts,
            summary: {
                total: alerts.length,
                critical: alerts.filter(a => a.severity === 'critical').length,
                warning: alerts.filter(a => a.severity === 'warning').length,
                info: alerts.filter(a => a.severity === 'info').length
            },
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('Failed to fetch alerts:', error);
        return c.json({
            success: false,
            error: 'Failed to fetch alerts',
            message: error instanceof Error ? error.message : 'Unknown error',
        }, 500);
    }
});

export default app;
