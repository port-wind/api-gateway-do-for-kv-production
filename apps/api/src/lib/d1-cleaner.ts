/**
 * D1 数据清理
 * 
 * 清理策略：
 * - traffic_events（明细表）：删除已归档到 R2 的数据
 * - path_stats_hourly（聚合表）：永久保留，不清理 ✅
 */

import type { Env } from '../types/env';

/**
 * 清理配置
 */
export const CLEANUP_CONFIG = {
    // 每批删除的记录数（D1 DELETE 限制）
    BATCH_SIZE: 1000,
    // 最大删除批次数（避免单次清理时间过长）
    MAX_BATCHES: 50,
};

/**
 * 清理任务结果
 */
export interface CleanupResult {
    date: string;              // 清理日期（YYYY-MM-DD）
    deletedCount: number;      // 删除记录数
    duration: number;          // 清理耗时（毫秒）
    status: 'success' | 'failed';
    error?: string;
}

/**
 * 清理已归档的明细事件
 * 
 * 仅清理状态为 'completed' 且 d1_cleaned = 0 的归档
 * 
 * @param env 环境变量
 * @param date 日期（YYYY-MM-DD）
 * @returns Promise<CleanupResult>
 */
export async function cleanupArchivedEvents(
    env: Env,
    date: string
): Promise<CleanupResult> {
    const startTime = Date.now();
    console.log(`========================================`);
    console.log(`🧹 开始清理: ${date}`);
    console.log(`========================================`);

    try {
        // Step 1: 验证归档状态
        const archiveStatus = await verifyArchiveStatus(env, date);

        if (!archiveStatus.exists) {
            throw new Error(`归档记录不存在: ${date}`);
        }

        if (archiveStatus.status !== 'completed') {
            throw new Error(`归档未完成（状态: ${archiveStatus.status}）: ${date}`);
        }

        if (archiveStatus.d1_cleaned === 1) {
            console.log(`⚠️ 该日期已清理过: ${date}`);
            return {
                date,
                deletedCount: 0,
                duration: Date.now() - startTime,
                status: 'success'
            };
        }

        console.log(`✅ 归档验证通过: ${date}`);
        console.log(`   记录数: ${archiveStatus.record_count}`);
        console.log(`   R2 路径: ${archiveStatus.r2_path}`);

        // Step 2: 分批删除事件（删除到完全清空）
        let totalDeleted = 0;
        let batchCount = 0;

        while (true) {
            // 使用 rowid 子查询删除（避免 DELETE ... LIMIT 不兼容问题）
            const result = await env.D1.prepare(
                `DELETE FROM traffic_events 
         WHERE rowid IN (
           SELECT rowid FROM traffic_events 
           WHERE event_date = ? 
           LIMIT ?
         )`
            ).bind(date, CLEANUP_CONFIG.BATCH_SIZE).run();

            const deletedInBatch = result.meta?.changes || 0;
            totalDeleted += deletedInBatch;
            batchCount++;

            console.log(`  批次 ${batchCount}: 删除 ${deletedInBatch} 条（累计 ${totalDeleted} 条）`);

            // 如果删除数量少于 BATCH_SIZE，说明已经删完
            if (deletedInBatch < CLEANUP_CONFIG.BATCH_SIZE) {
                console.log(`✅ 所有数据已删除完毕`);
                break;
            }

            // ⚠️ 安全检查：如果批次数过多，可能是异常情况
            if (batchCount >= CLEANUP_CONFIG.MAX_BATCHES) {
                // 检查是否还有剩余数据
                const remaining = await env.D1.prepare(
                    `SELECT COUNT(*) as count FROM traffic_events WHERE event_date = ?`
                ).bind(date).first();

                const remainingCount = (remaining?.count as number) || 0;

                if (remainingCount > 0) {
                    // 仍有数据未删除，抛出错误（不标记为已清理）
                    throw new Error(
                        `清理未完成：已删除 ${totalDeleted} 条，仍剩余 ${remainingCount} 条。` +
                        `达到最大批次限制 (${CLEANUP_CONFIG.MAX_BATCHES})，请增加 MAX_BATCHES 或分批清理。`
                    );
                }

                // 没有剩余数据，正常退出
                console.log(`✅ 所有数据已删除完毕（达到批次限制但已清空）`);
                break;
            }
        }

        console.log(`✅ 删除完成: ${totalDeleted} 条记录`);

        // Step 3: 更新归档元数据（标记已清理）
        await markAsCleaned(env, date);

        const duration = Date.now() - startTime;
        console.log(`========================================`);
        console.log(`✅ 清理完成: ${date}`);
        console.log(`   删除记录数: ${totalDeleted}`);
        console.log(`   耗时: ${duration}ms`);
        console.log(`========================================\n`);

        return {
            date,
            deletedCount: totalDeleted,
            duration,
            status: 'success'
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ 清理失败: ${date}`, error);

        return {
            date,
            deletedCount: 0,
            duration: Date.now() - startTime,
            status: 'failed',
            error: errorMessage
        };
    }
}

/**
 * 批量清理多个日期的已归档数据
 * 
 * @param env 环境变量
 * @returns Promise<CleanupResult[]>
 */
export async function cleanupAllArchivedDates(env: Env): Promise<CleanupResult[]> {
    console.log(`========================================`);
    console.log(`🧹 批量清理已归档数据`);
    console.log(`========================================`);

    // 查询所有已归档但未清理的日期
    const result = await env.D1.prepare(
        `SELECT date FROM archive_metadata 
     WHERE status = 'completed' AND d1_cleaned = 0
     ORDER BY date`
    ).all();

    const dates = result.results?.map(row => row.date as string) || [];

    if (dates.length === 0) {
        console.log(`✅ 无需清理的数据`);
        return [];
    }

    console.log(`📅 找到 ${dates.length} 个待清理日期: ${dates.join(', ')}`);

    // 逐个清理
    const results: CleanupResult[] = [];

    for (const date of dates) {
        const result = await cleanupArchivedEvents(env, date);
        results.push(result);
    }

    // 统计
    const successCount = results.filter(r => r.status === 'success').length;
    const totalDeleted = results.reduce((sum, r) => sum + r.deletedCount, 0);

    console.log(`========================================`);
    console.log(`✅ 批量清理完成`);
    console.log(`   成功: ${successCount}/${dates.length}`);
    console.log(`   总删除: ${totalDeleted} 条记录`);
    console.log(`========================================\n`);

    return results;
}

/**
 * 验证归档状态
 * 
 * @param env 环境变量
 * @param date 日期
 * @returns Promise<ArchiveStatus>
 */
async function verifyArchiveStatus(env: Env, date: string): Promise<{
    exists: boolean;
    status?: string;
    record_count?: number;
    r2_path?: string;
    d1_cleaned?: number;
}> {
    const result = await env.D1.prepare(
        `SELECT status, record_count, r2_path, d1_cleaned 
     FROM archive_metadata 
     WHERE date = ?`
    ).bind(date).first();

    if (!result) {
        return { exists: false };
    }

    return {
        exists: true,
        status: result.status as string,
        record_count: result.record_count as number,
        r2_path: result.r2_path as string,
        d1_cleaned: result.d1_cleaned as number
    };
}

/**
 * 标记已清理
 * 
 * @param env 环境变量
 * @param date 日期
 */
async function markAsCleaned(env: Env, date: string): Promise<void> {
    await env.D1.prepare(
        `UPDATE archive_metadata 
     SET d1_cleaned = 1 
     WHERE date = ?`
    ).bind(date).run();
}

/**
 * 获取 D1 存储统计
 * 
 * @param env 环境变量
 * @returns Promise<StorageStats>
 */
export async function getStorageStats(env: Env): Promise<{
    traffic_events_count: number;
    traffic_events_oldest: string | null;
    traffic_events_newest: string | null;
    path_stats_count: number;
    archived_dates_count: number;
    cleaned_dates_count: number;
}> {
    console.log(`📊 查询存储统计...`);

    // 明细事件统计
    const eventsStats = await env.D1.prepare(
        `SELECT 
       COUNT(*) as count,
       MIN(event_date) as oldest,
       MAX(event_date) as newest
     FROM traffic_events`
    ).first();

    // 聚合统计
    const statsCount = await env.D1.prepare(
        `SELECT COUNT(*) as count FROM path_stats_hourly`
    ).first();

    // 归档统计
    const archiveStats = await env.D1.prepare(
        `SELECT 
       COUNT(*) as total,
       SUM(CASE WHEN d1_cleaned = 1 THEN 1 ELSE 0 END) as cleaned
     FROM archive_metadata
     WHERE status = 'completed'`
    ).first();

    return {
        traffic_events_count: eventsStats?.count as number || 0,
        traffic_events_oldest: eventsStats?.oldest as string || null,
        traffic_events_newest: eventsStats?.newest as string || null,
        path_stats_count: statsCount?.count as number || 0,
        archived_dates_count: archiveStats?.total as number || 0,
        cleaned_dates_count: archiveStats?.cleaned as number || 0
    };
}

/**
 * 打印存储统计报告
 * 
 * @param env 环境变量
 */
export async function printStorageReport(env: Env): Promise<void> {
    const stats = await getStorageStats(env);

    console.log(`========================================`);
    console.log(`📊 D1 存储统计`);
    console.log(`========================================`);
    console.log(`明细事件表 (traffic_events):`);
    console.log(`  记录数: ${stats.traffic_events_count.toLocaleString()}`);
    console.log(`  最早: ${stats.traffic_events_oldest || 'N/A'}`);
    console.log(`  最新: ${stats.traffic_events_newest || 'N/A'}`);
    console.log(``);
    console.log(`聚合统计表 (path_stats_hourly):`);
    console.log(`  记录数: ${stats.path_stats_count.toLocaleString()}`);
    console.log(`  策略: 永久保留 ✅`);
    console.log(``);
    console.log(`归档状态:`);
    console.log(`  已归档日期: ${stats.archived_dates_count}`);
    console.log(`  已清理日期: ${stats.cleaned_dates_count}`);
    console.log(`  待清理日期: ${stats.archived_dates_count - stats.cleaned_dates_count}`);
    console.log(`========================================\n`);
}

