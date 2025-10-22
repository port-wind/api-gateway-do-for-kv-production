/**
 * Scheduled Handler
 * 
 * 处理 Cron Triggers 定时任务：
 * - 每日归档（3 天前的明细事件）
 * - 每日清理（已归档的数据）
 * - IP 数据清理（超过保留期的 IP 统计和过期规则）
 * - 容量监控（D1 存储统计）
 * - KV 快照清理（保留最近 N 个版本）
 */

import type { Env } from './types/env';
import { getDatesToArchive, archiveEventsForDate } from './lib/r2-archiver';
import { cleanupAllArchivedDates, printStorageReport } from './lib/d1-cleaner';
import { cleanupOldSnapshots, generateAndSaveSnapshot } from './lib/kv-snapshot';
import { loadIpMonitorConfig } from './lib/ip-monitor-config';

/**
 * Scheduled Handler
 * 
 * 根据 cron 表达式触发不同的任务
 */
export async function handleScheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
): Promise<void> {
    const cron = event.cron;
    console.log(`========================================`);
    console.log(`⏰ Cron Triggered: ${cron}`);
    console.log(`   Time: ${new Date(event.scheduledTime).toISOString()}`);
    console.log(`========================================`);

    try {
        switch (cron) {
            case '*/5 * * * *': // 每 5 分钟：聚合地理流量数据（实时地图）
                await handleGeoTrafficAggregation(env, ctx);
                break;

            case '*/10 * * * *': // 每 10 分钟：生成 Dashboard 快照
                await handleDashboardSnapshot(env, ctx);
                break;

            case '0 * * * *': // 每小时：生成路径统计快照
                await handleHourlySnapshotGeneration(env, ctx);
                break;

            case '0 2 * * *': // 每天凌晨 2 点：归档 + 数据清理
                await handleDailyArchive(env, ctx);
                await handleTrafficEventsCleanup(env, ctx); // 清理 traffic_events 明细
                await handleIpDataCleanup(env, ctx); // 清理 IP 聚合表
                break;

            case '0 3 * * *': // 每天凌晨 3 点：清理
                await handleDailyCleanup(env, ctx);
                break;

            case '0 4 * * *': // 每天凌晨 4 点：容量监控
                await handleCapacityMonitoring(env, ctx);
                break;

            case '0 5 * * 0': // 每周日凌晨 5 点：KV 快照清理
                await handleWeeklySnapshotCleanup(env, ctx);
                break;

            default:
                console.log(`⚠️ Unknown cron expression: ${cron}`);
        }
    } catch (error) {
        console.error(`❌ Scheduled task failed:`, error);
        throw error;
    }

    console.log(`========================================`);
    console.log(`✅ Cron Task Completed: ${cron}`);
    console.log(`========================================\n`);
}

/**
 * 每日归档任务
 * 
 * 归档 3 天前的明细事件到 R2
 */
async function handleDailyArchive(env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`========================================`);
    console.log(`📦 每日归档任务`);
    console.log(`========================================`);

    // 获取需要归档的日期列表
    const dates = await getDatesToArchive(env, 3);

    if (dates.length === 0) {
        console.log(`✅ 无需归档的数据`);
        return;
    }

    console.log(`📅 需要归档 ${dates.length} 个日期: ${dates.join(', ')}`);

    // 逐个归档（避免并发）
    for (const date of dates) {
        const result = await archiveEventsForDate(env, date);

        if (result.status === 'success') {
            console.log(`✅ 归档成功: ${date} (${result.recordCount} 条记录)`);
        } else {
            console.error(`❌ 归档失败: ${date}`, result.error);
        }
    }

    console.log(`========================================`);
    console.log(`✅ 每日归档任务完成`);
    console.log(`========================================\n`);
}

/**
 * 每日清理任务
 * 
 * 删除已归档的明细事件（释放 D1 存储空间）
 */
async function handleDailyCleanup(env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`========================================`);
    console.log(`🧹 每日清理任务`);
    console.log(`========================================`);

    const results = await cleanupAllArchivedDates(env);

    if (results.length === 0) {
        console.log(`✅ 无需清理的数据`);
        return;
    }

    // 统计
    const successCount = results.filter(r => r.status === 'success').length;
    const totalDeleted = results.reduce((sum, r) => sum + r.deletedCount, 0);

    console.log(`========================================`);
    console.log(`✅ 每日清理任务完成`);
    console.log(`   成功: ${successCount}/${results.length}`);
    console.log(`   总删除: ${totalDeleted} 条记录`);
    console.log(`========================================\n`);
}

/**
 * 容量监控任务
 * 
 * 打印 D1 存储统计报告
 */
async function handleCapacityMonitoring(env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`========================================`);
    console.log(`📊 容量监控任务`);
    console.log(`========================================`);

    await printStorageReport(env);

    console.log(`✅ 容量监控任务完成\n`);
}

/**
 * Traffic Events 明细数据清理任务
 * 
 * 清理超过保留期的流量明细数据（统一保留策略）
 * 
 * 保留策略：
 * - 默认保留 30 天
 * - 容量紧张时可调整为 7 天
 * - 配置来源：KV (traffic:retention-days) 或默认值
 * 
 * 影响范围：
 * - traffic_events 表（路径/IP/地区统计的数据源）
 * - 聚合表（path_stats_hourly、ip_traffic_daily、geo_traffic_stats）单独清理
 */
async function handleTrafficEventsCleanup(env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`========================================`);
    console.log(`🧹 流量明细数据清理任务`);
    console.log(`========================================`);

    if (!env.D1) {
        console.warn(`⚠️ D1 未配置，跳过流量明细清理`);
        return;
    }

    try {
        // 1. 获取保留期配置（默认 30 天，可调整为 7 天）
        const retentionDaysStr = await env.API_GATEWAY_STORAGE.get('traffic:retention-days');
        const retentionDays = retentionDaysStr ? parseInt(retentionDaysStr, 10) : 30;

        console.log(`📅 流量明细保留期: ${retentionDays} 天`);
        console.log(`💡 提示：容量紧张时可通过 KV 调整 traffic:retention-days 为 7`);

        // 2. 计算截止日期
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

        console.log(`🗓️ 将删除 ${cutoffDateStr} 之前的明细数据`);

        // 3. 先统计要删除的记录数（避免意外删除过多）
        const countResult = await env.D1.prepare(`
            SELECT COUNT(*) as count
            FROM traffic_events
            WHERE event_date < ?
        `).bind(cutoffDateStr).first<{ count: number }>();

        const toDeleteCount = countResult?.count || 0;

        if (toDeleteCount === 0) {
            console.log(`✅ 无需清理的明细数据`);
            return;
        }

        console.log(`📊 预计删除 ${toDeleteCount.toLocaleString()} 条记录`);

        // 4. 分批删除（避免单次删除过多，每批 10000 条）
        const batchSize = 10000;
        let totalDeleted = 0;
        let batchCount = 0;

        while (totalDeleted < toDeleteCount) {
            const deleteResult = await env.D1.prepare(`
                DELETE FROM traffic_events
                WHERE event_date < ?
                LIMIT ?
            `).bind(cutoffDateStr, batchSize).run();

            const deletedInBatch = deleteResult.meta?.changes || 0;
            totalDeleted += deletedInBatch;
            batchCount++;

            console.log(`   批次 ${batchCount}: 删除 ${deletedInBatch} 条记录 (累计: ${totalDeleted}/${toDeleteCount})`);

            // 如果本批删除数小于 batchSize，说明已经没有更多数据了
            if (deletedInBatch < batchSize) {
                break;
            }

            // 休息 100ms，避免 D1 过载
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log(`✅ 清理完成: 共删除 ${totalDeleted.toLocaleString()} 条明细记录`);
        console.log(`📦 建议：定期运行 VACUUM 以回收存储空间`);

    } catch (error) {
        console.error(`❌ 流量明细清理失败:`, error);
        // 不抛出错误，避免影响其他任务
    }

    console.log(`========================================`);
    console.log(`✅ 流量明细清理任务完成`);
    console.log(`========================================\n`);
}

/**
 * IP 数据清理任务
 * 
 * 1. 清理超过保留期的 IP 统计数据
 * 2. 清理过期的 IP 访问规则
 */
async function handleIpDataCleanup(env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`========================================`);
    console.log(`🧹 IP 数据清理任务`);
    console.log(`========================================`);

    if (!env.D1) {
        console.warn(`⚠️ D1 未配置，跳过 IP 数据清理`);
        return;
    }

    try {
        // 1. 获取保留期配置（默认 7 天）
        const ipMonitorConfig = await loadIpMonitorConfig(env);
        const retentionDays = ipMonitorConfig.retentionDays ?? 7;

        console.log(`📅 IP 数据保留期: ${retentionDays} 天`);

        // 2. 清理过期的 IP 统计数据
        const deleteIpStatsResult = await env.D1.prepare(`
            DELETE FROM ip_traffic_daily
            WHERE date < date('now', ?)
        `).bind(`-${retentionDays} days`).run();

        const deletedIpStats = deleteIpStatsResult.meta?.changes || 0;
        console.log(`✅ 清理过期 IP 统计: ${deletedIpStats} 条记录`);

        // 2.5. 清理过期的 IP 路径数据
        const deleteIpPathsResult = await env.D1.prepare(`
            DELETE FROM ip_path_daily
            WHERE date < date('now', ?)
        `).bind(`-${retentionDays} days`).run();

        const deletedIpPaths = deleteIpPathsResult.meta?.changes || 0;
        console.log(`✅ 清理过期 IP 路径数据: ${deletedIpPaths} 条记录`);

        // 3. 清理过期的 IP 访问规则
        const now = Math.floor(Date.now() / 1000);
        const deleteRulesResult = await env.D1.prepare(`
            DELETE FROM ip_access_rules
            WHERE expires_at IS NOT NULL
              AND expires_at < ?
        `).bind(now).run();

        const deletedRules = deleteRulesResult.meta?.changes || 0;
        console.log(`✅ 清理过期 IP 规则: ${deletedRules} 条规则`);

        // 4. 如果删除了规则，刷新缓存
        if (deletedRules > 0) {
            await env.API_GATEWAY_STORAGE.delete('ip-rules:active');
            console.log(`✅ 已刷新 IP 规则缓存`);
        }

    } catch (error) {
        console.error(`❌ IP 数据清理失败:`, error);
        // 不抛出错误，避免影响其他任务
    }

    console.log(`========================================`);
    console.log(`✅ IP 数据清理任务完成`);
    console.log(`========================================\n`);
}

/**
 * 每周 KV 快照清理任务
 * 
 * 保留最近 5 个版本，删除旧版本
 */
async function handleWeeklySnapshotCleanup(env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`========================================`);
    console.log(`🧹 每周 KV 快照清理任务`);
    console.log(`========================================`);

    await cleanupOldSnapshots(env, 5);

    console.log(`✅ KV 快照清理任务完成\n`);
}

/**
 * 地理流量聚合任务（每 5 分钟）
 * 
 * 聚合最近 10 分钟的流量数据（国家 → 边缘节点），生成实时地图数据快照
 */
async function handleGeoTrafficAggregation(env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`========================================`);
    console.log(`🗺️ 地理流量聚合任务（实时地图数据）`);
    console.log(`========================================`);

    try {
        // 查询最近 30 分钟的流量数据（按 country + edge_colo 聚合）
        const since = Date.now() - 1800000; // 30 分钟

        const result = await env.D1.prepare(`
            SELECT 
                country,
                edge_colo,
                COUNT(*) as request_count,
                SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END) as error_count
            FROM traffic_events
            WHERE timestamp > ? AND edge_colo IS NOT NULL AND edge_colo != ''
            GROUP BY country, edge_colo
            ORDER BY request_count DESC
            LIMIT 100
        `).bind(since).all<{
            country: string;
            edge_colo: string;
            request_count: number;
            error_count: number
        }>();

        console.log(`📊 查询到 ${result.results.length} 条地理流量记录（Top 100）`);

        // 构造快照数据
        const snapshot = {
            edges: result.results.map(row => ({
                country: row.country || 'Unknown',
                edge_colo: row.edge_colo || 'UNKNOWN',
                request_count: row.request_count,
                error_count: row.error_count,
            })),
            timestamp: Date.now(),
        };

        // 存入 KV（5 分钟过期）
        await env.API_GATEWAY_STORAGE.put(
            'geo:traffic:latest',
            JSON.stringify(snapshot),
            { expirationTtl: 300 } // 5 分钟
        );

        console.log(`✅ 地理流量快照已更新到 KV: geo:traffic:latest`);
        console.log(`   - 数据条数: ${snapshot.edges.length}`);
        console.log(`   - 总请求数: ${snapshot.edges.reduce((sum, e) => sum + e.request_count, 0)}`);
        console.log(`   - 错误请求数: ${snapshot.edges.reduce((sum, e) => sum + e.error_count, 0)}`);

    } catch (error) {
        console.error(`❌ 地理流量聚合失败:`, error);
        // 不抛出错误，避免影响其他任务
    }

    console.log(`========================================`);
    console.log(`✅ 地理流量聚合任务完成`);
    console.log(`========================================\n`);
}

/**
 * 每小时快照生成任务
 * 
 * 从 D1 读取热点路径统计并生成 KV 快照
 */
async function handleHourlySnapshotGeneration(env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`========================================`);
    console.log(`📸 每小时快照生成任务`);
    console.log(`========================================`);

    try {
        // 生成并保存快照（最近 24 小时，Top 100 路径）
        const config = await generateAndSaveSnapshot(env, 24, 100);

        console.log(`✅ 快照生成成功`);
        console.log(`   - 版本: ${config.version}`);
        console.log(`   - 路径数: ${config.count}`);
        console.log(`   - 时间范围: ${config.timeRange.start} → ${config.timeRange.end}`);
        console.log(`   - 快照键: snapshot:latest`);

    } catch (error) {
        console.error(`❌ 快照生成失败:`, error);
        // 不抛出错误，避免影响其他任务
    }

    console.log(`========================================`);
    console.log(`✅ 快照生成任务完成`);
    console.log(`========================================\n`);
}

/**
 * 每 10 分钟 Dashboard 快照生成任务
 * 
 * 预计算 Dashboard Overview 数据并缓存到 KV
 * 加速 Dashboard 页面加载
 */
async function handleDashboardSnapshot(env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`========================================`);
    console.log(`📊 Dashboard 快照生成任务`);
    console.log(`========================================`);

    try {
        // 导入 Dashboard 聚合函数
        const { aggregateDashboardOverview } = await import('./lib/dashboard-aggregator');

        // 生成 Dashboard 数据
        const overview = await aggregateDashboardOverview(env);

        // 存入 KV（10 分钟过期）
        await env.API_GATEWAY_STORAGE.put(
            'dashboard:snapshot:latest',
            JSON.stringify({
                data: overview,
                timestamp: Date.now(),
                version: '1.0'
            }),
            { expirationTtl: 600 } // 10 分钟
        );

        console.log(`✅ Dashboard 快照已更新到 KV: dashboard:snapshot:latest`);
        console.log(`   - 总请求（24h）: ${overview.traffic.totalRequests24h}`);
        console.log(`   - 当前 RPM: ${overview.traffic.currentRpm}`);
        console.log(`   - 缓存命中率: ${overview.reliability.cacheHitRate.toFixed(2)}%`);
        console.log(`   - 配置路径数: ${overview.configuration.totalPaths}`);

    } catch (error) {
        console.error(`❌ Dashboard 快照生成失败:`, error);
        // 不抛出错误，避免影响其他任务
    }

    console.log(`========================================`);
    console.log(`✅ Dashboard 快照生成任务完成`);
    console.log(`========================================\n`);
}
