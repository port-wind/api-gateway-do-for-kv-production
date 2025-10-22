/**
 * D1 数据库写入工具
 * 
 * 提供批量插入明细事件和 upsert 聚合统计的功能
 */

import type { Env } from '../types/env';
import type { SimplifiedStats, TrafficEvent as StatsEvent } from './simplified-stats';

/**
 * 队列事件接口（扩展自统计事件）
 * 
 * 包含额外的队列相关字段：
 * - idempotentId: 幂等 ID，用于去重
 * - userAgent, country: 额外的元数据
 * - isError: 是否为错误请求（status >= 400）
 * - clientIp: 真实 IP 地址（用于显示）
 */
export interface TrafficEvent extends StatsEvent {
    idempotentId: string;
    userAgent?: string;
    country?: string;
    city?: string;                  // Quick Win: Cloudflare 返回的城市名称
    isError?: boolean;
    clientIp?: string;              // 真实 IP 地址
    edgeColo?: string;              // Cloudflare 边缘节点代码（如 'SJC', 'HKG'）
    geoAction?: 'allowed' | 'blocked' | 'throttled';  // ✅ 地区访问控制动作
}

/**
 * 批量插入明细事件到 D1（支持分块）
 * 
 * D1 限制：最多 10 个语句/batch
 * 解决方案：自动分块，每次最多 10 个语句
 * 
 * ⚠️ 关键：返回实际插入的事件 ID，避免重复计数
 * 
 * @param env 环境变量
 * @param events 事件数组
 * @returns Promise<Set<string>> 实际插入的事件 ID 集合
 */
export async function insertEvents(
    env: Env,
    events: TrafficEvent[]
): Promise<Set<string>> {
    if (events.length === 0) return new Set();

    console.log(`📝 插入 ${events.length} 条明细事件到 D1`);

    // 批量插入（D1 支持事务）
    const statements = events.map(event => {
        const eventDate = new Date(event.timestamp).toISOString().split('T')[0];
        // 判断是否为错误：status >= 400 或显式标记 isError
        const isError = event.isError !== undefined ? event.isError : (event.status >= 400);

        return env.D1.prepare(
            `INSERT OR IGNORE INTO traffic_events 
       (id, path, method, status, response_time, client_ip_hash, ip_address, timestamp, event_date, user_agent, country, city, is_error, edge_colo, geo_action)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            event.idempotentId,
            event.path,
            event.method,
            event.status,
            event.responseTime,
            event.clientIpHash,
            event.clientIp || null,  // 真实 IP 地址
            event.timestamp,
            eventDate,
            event.userAgent || null,
            event.country || null,
            event.city || null,       // ✅ Cloudflare 城市信息
            isError ? 1 : 0,
            event.edgeColo || null,   // Cloudflare 边缘节点代码
            event.geoAction || null   // ✅ 地区访问控制动作
        );
    });

    // D1 限制：最多 10 个语句/batch，需要分块处理
    const BATCH_SIZE = 10;
    const chunks = [];
    const eventChunks = []; // 对应的事件分块

    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
        chunks.push(statements.slice(i, i + BATCH_SIZE));
        eventChunks.push(events.slice(i, i + BATCH_SIZE));
    }

    console.log(`📦 分为 ${chunks.length} 个 chunk（每个最多 ${BATCH_SIZE} 个语句）`);

    // 记录实际插入的事件 ID
    const insertedIds = new Set<string>();
    let totalInserted = 0;

    // 顺序执行每个 chunk
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkEvents = eventChunks[i];

        const results = await env.D1.batch(chunk);

        // 检查每条语句的执行结果
        for (let j = 0; j < results.length; j++) {
            const result = results[j];
            const event = chunkEvents[j];

            // meta.changes > 0 表示实际插入了记录
            if (result.meta && result.meta.changes > 0) {
                insertedIds.add(event.idempotentId);
                totalInserted++;
            }
        }
    }

    const skippedCount = events.length - totalInserted;
    console.log(`✅ D1 明细事件插入完成`);
    console.log(`   总计: ${events.length} 条`);
    console.log(`   实际插入: ${totalInserted} 条`);
    console.log(`   跳过（已存在）: ${skippedCount} 条`);

    return insertedIds;
}

/**
 * 读取现有聚合统计
 * 
 * @param env 环境变量
 * @param path 路径
 * @param hourBucket 小时桶（格式：'2025-10-15T14'）
 * @returns Promise<SimplifiedStats | null>
 */
export async function getExistingStats(
    env: Env,
    path: string,
    hourBucket: string
): Promise<SimplifiedStats | null> {
    const result = await env.D1.prepare(
        `SELECT * FROM path_stats_hourly WHERE path = ? AND hour_bucket = ?`
    ).bind(path, hourBucket).first();

    if (!result) return null;

    // 解析 JSON 字段
    return {
        path: result.path as string,
        hour_bucket: result.hour_bucket as string,
        requests: result.requests as number,
        errors: result.errors as number,
        sum_response_time: result.sum_response_time as number,
        count_response_time: result.count_response_time as number,
        response_samples: JSON.parse((result.response_samples as string) || '[]'),
        ip_hashes: JSON.parse((result.ip_hashes as string) || '[]'),
        unique_ips_seen: result.unique_ips_seen as number
    };
}

/**
 * Upsert 聚合统计到 D1
 * 
 * @param env 环境变量
 * @param stats 聚合统计对象
 * @returns Promise<void>
 */
export async function upsertStats(
    env: Env,
    stats: SimplifiedStats
): Promise<void> {
    console.log(`💾 Upsert 聚合统计: ${stats.path} | ${stats.hour_bucket} | ${stats.requests} requests`);

    const now = Date.now();

    await env.D1.prepare(
        `INSERT OR REPLACE INTO path_stats_hourly 
     (path, hour_bucket, requests, errors, sum_response_time, count_response_time, 
      response_samples, ip_hashes, unique_ips_seen, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM path_stats_hourly WHERE path = ? AND hour_bucket = ?), ?), ?)`
    ).bind(
        stats.path,
        stats.hour_bucket,
        stats.requests,
        stats.errors,
        stats.sum_response_time,
        stats.count_response_time,
        JSON.stringify(stats.response_samples),
        JSON.stringify(stats.ip_hashes),
        stats.unique_ips_seen,
        // 保留原有的 created_at，如果不存在则使用当前时间
        stats.path,
        stats.hour_bucket,
        now,
        // updated_at 总是更新为当前时间
        now
    ).run();

    console.log(`✅ D1 聚合统计 upsert 完成`);
}

/**
 * 批量 upsert 聚合统计（优化版，支持分块）
 * 
 * D1 限制：最多 10 个语句/batch
 * 解决方案：自动分块，每次最多 10 个语句
 * 
 * @param env 环境变量
 * @param statsArray 聚合统计数组
 * @returns Promise<void>
 */
export async function batchUpsertStats(
    env: Env,
    statsArray: SimplifiedStats[]
): Promise<void> {
    if (statsArray.length === 0) return;

    console.log(`💾 批量 upsert ${statsArray.length} 个聚合统计`);

    const now = Date.now();

    const statements = statsArray.map(stats =>
        env.D1.prepare(
            `INSERT OR REPLACE INTO path_stats_hourly 
       (path, hour_bucket, requests, errors, sum_response_time, count_response_time, 
        response_samples, ip_hashes, unique_ips_seen, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM path_stats_hourly WHERE path = ? AND hour_bucket = ?), ?), ?)`
        ).bind(
            stats.path,
            stats.hour_bucket,
            stats.requests,
            stats.errors,
            stats.sum_response_time,
            stats.count_response_time,
            JSON.stringify(stats.response_samples),
            JSON.stringify(stats.ip_hashes),
            stats.unique_ips_seen,
            stats.path,
            stats.hour_bucket,
            now,
            now
        )
    );

    // D1 限制：最多 10 个语句/batch，需要分块处理
    const BATCH_SIZE = 10;
    const chunks = [];

    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
        chunks.push(statements.slice(i, i + BATCH_SIZE));
    }

    console.log(`📦 分为 ${chunks.length} 个 chunk（每个最多 ${BATCH_SIZE} 个语句）`);

    // 顺序执行每个 chunk（避免并发冲突）
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`  处理 chunk ${i + 1}/${chunks.length}（${chunk.length} 个语句）`);
        await env.D1.batch(chunk);
    }

    console.log(`✅ D1 批量聚合统计 upsert 完成（总计 ${statsArray.length} 个）`);
}

/**
 * 辅助函数：生成小时桶
 * 格式：'2025-10-15T14'
 * 
 * @param timestamp Unix 时间戳（毫秒）
 * @returns 小时桶字符串
 */
export function getHourBucket(timestamp: number): string {
    const date = new Date(timestamp);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}T${String(date.getUTCHours()).padStart(2, '0')}`;
}

/**
 * 辅助函数：生成事件日期
 * 格式：'2025-10-15'
 * 
 * @param timestamp Unix 时间戳（毫秒）
 * @returns 日期字符串
 */
export function getEventDate(timestamp: number): string {
    return new Date(timestamp).toISOString().split('T')[0];
}

