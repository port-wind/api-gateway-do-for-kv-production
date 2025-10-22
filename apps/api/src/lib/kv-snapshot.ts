/**
 * KV 快照管理
 * 
 * 功能：
 * - 从 D1 读取热点路径统计
 * - 生成版本化快照
 * - 写入 KV 存储
 * - 支持快照刷新和版本管理
 */

import type { Env } from '../types/env';
import type { SimplifiedStats } from './simplified-stats';
import type { UnifiedPathConfig } from '../types/config';
import { generateStatsSummary } from './simplified-stats';

/**
 * 快照配置
 */
export interface SnapshotConfig {
    // 快照版本号（递增）
    version: number;
    // 快照生成时间
    timestamp: number;
    // 快照数据数量
    count: number;
    // 快照覆盖的时间范围
    timeRange: {
        start: string;  // 开始小时桶
        end: string;    // 结束小时桶
    };
}

/**
 * 路径统计快照（简化版，用于 KV 存储）
 */
export interface PathStatsSnapshot {
    path: string;
    hour_bucket: string;
    requests: number;
    errors: number;
    error_rate: number;
    avg_response_time: number;
    // 百分位（从 SimplifiedStats 计算得出）
    p50: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
    // Unique IP 估计（下界）
    unique_ips_min: number;
    // HTTP Method（从 traffic_events 补充）
    method?: string;
}

/**
 * 从 D1 读取最近 N 小时的热点路径统计
 * 
 * ⚠️ 关键修复：按 path 分组聚合，避免重复路径
 * 
 * @param env 环境变量
 * @param hours 读取的小时数（默认 24 小时）
 * @param topN 返回 Top N 路径（默认 100）
 * @returns Promise<SimplifiedStats[]>
 */
export async function fetchHotPathsFromD1(
    env: Env,
    hours: number = 24,
    topN: number = 100
): Promise<SimplifiedStats[]> {
    console.log(`📊 从 D1 读取最近 ${hours} 小时的 Top ${topN} 热点路径`);

    // 计算时间范围
    const now = new Date();
    const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const startBucket = formatHourBucket(startTime);

    // 查询热点路径（按 path 分组聚合，避免重复）
    const results = await env.D1.prepare(
        `SELECT 
            path,
            MAX(hour_bucket) as hour_bucket,
            SUM(requests) as requests,
            SUM(errors) as errors,
            SUM(sum_response_time) as sum_response_time,
            SUM(count_response_time) as count_response_time,
            SUM(unique_ips_seen) as unique_ips_seen,
            MAX(response_samples) as response_samples,
            MAX(ip_hashes) as ip_hashes
         FROM path_stats_hourly 
         WHERE hour_bucket >= ? 
         GROUP BY path
         ORDER BY requests DESC 
         LIMIT ?`
    ).bind(startBucket, topN).all();

    if (!results.results || results.results.length === 0) {
        console.log(`⚠️ 未找到热点路径数据`);
        return [];
    }

    // 解析为 SimplifiedStats
    const stats: SimplifiedStats[] = results.results.map(row => ({
        path: row.path as string,
        hour_bucket: row.hour_bucket as string,
        requests: row.requests as number,
        errors: row.errors as number,
        sum_response_time: row.sum_response_time as number,
        count_response_time: row.count_response_time as number,
        response_samples: JSON.parse((row.response_samples as string) || '[]'),
        ip_hashes: JSON.parse((row.ip_hashes as string) || '[]'),
        unique_ips_seen: row.unique_ips_seen as number
    }));

    console.log(`✅ 读取到 ${stats.length} 条去重后的热点路径统计`);
    return stats;
}

/**
 * 将 SimplifiedStats 转换为 PathStatsSnapshot
 * 
 * @param stats SimplifiedStats 对象
 * @returns PathStatsSnapshot
 */
export function convertToSnapshot(stats: SimplifiedStats): PathStatsSnapshot {
    const summary = generateStatsSummary(stats);

    return {
        path: stats.path,
        hour_bucket: stats.hour_bucket,
        requests: stats.requests,
        errors: stats.errors,
        error_rate: summary.error_rate,
        avg_response_time: summary.percentiles.avg, // 使用百分位中的 avg
        p50: summary.percentiles.p50,
        p95: summary.percentiles.p95,
        p99: summary.percentiles.p99,
        min: summary.percentiles.min,
        max: summary.percentiles.max,
        unique_ips_min: summary.unique_ips_min
    };
}

/**
 * 生成 KV 快照并写入
 * 
 * @param env 环境变量
 * @param hours 统计的小时数（默认 24）
 * @param topN 返回 Top N 路径（默认 100）
 * @returns Promise<SnapshotConfig>
 */
export async function generateAndSaveSnapshot(
    env: Env,
    hours: number = 24,
    topN: number = 100
): Promise<SnapshotConfig> {
    console.log(`========================================`);
    console.log(`📸 生成 KV 快照`);
    console.log(`   Hours: ${hours}`);
    console.log(`   Top N: ${topN}`);
    console.log(`========================================`);

    // 1. 从 D1 读取热点路径
    const hotPaths = await fetchHotPathsFromD1(env, hours, topN);

    if (hotPaths.length === 0) {
        console.log(`⚠️ 无数据，跳过快照生成`);
        throw new Error('No data to snapshot');
    }

    // 2. 转换为快照格式
    const snapshots = hotPaths.map(convertToSnapshot);

    // 2.5 补充 method 字段（从 traffic_events 查询）
    await enrichSnapshotsWithMethods(env, snapshots);

    // 3. 读取当前版本号
    const currentVersion = await getCurrentSnapshotVersion(env);
    const newVersion = currentVersion + 1;

    // 4. 计算时间范围
    const hourBuckets = hotPaths.map(s => s.hour_bucket).sort();
    const timeRange = {
        start: hourBuckets[0],
        end: hourBuckets[hourBuckets.length - 1]
    };

    // 5. 构造快照配置
    const config: SnapshotConfig = {
        version: newVersion,
        timestamp: Date.now(),
        count: snapshots.length,
        timeRange
    };

    // 6. 写入 KV
    await saveSnapshotToKV(env, snapshots, config);

    console.log(`========================================`);
    console.log(`✅ KV 快照生成完成`);
    console.log(`   Version: ${newVersion}`);
    console.log(`   Count: ${snapshots.length}`);
    console.log(`   Time Range: ${timeRange.start} → ${timeRange.end}`);
    console.log(`========================================\n`);

    return config;
}

/**
 * 保存快照到 KV
 * 
 * KV 键结构：
 * - `snapshot:config`: 快照配置元数据
 * - `snapshot:v{version}:paths`: 快照数据（所有路径）
 * - `snapshot:v{version}:path:{path}`: 单个路径的快照（可选，用于快速查询）
 * 
 * @param env 环境变量
 * @param snapshots 快照数据数组
 * @param config 快照配置
 */
export async function saveSnapshotToKV(
    env: Env,
    snapshots: PathStatsSnapshot[],
    config: SnapshotConfig
): Promise<void> {
    console.log(`💾 保存快照到 KV (Version: ${config.version})`);

    // 1. 保存快照配置
    await env.API_GATEWAY_STORAGE.put(
        'snapshot:config',
        JSON.stringify(config),
        { metadata: { version: config.version, timestamp: config.timestamp } }
    );

    // 2. 保存完整快照数据
    const snapshotKey = `snapshot:v${config.version}:paths`;
    await env.API_GATEWAY_STORAGE.put(
        snapshotKey,
        JSON.stringify(snapshots),
        {
            metadata: {
                version: config.version,
                count: snapshots.length,
                timestamp: config.timestamp
            }
        }
    );

    // 3. 保存最新版本的快捷方式（用于快速访问）
    await env.API_GATEWAY_STORAGE.put(
        'snapshot:latest',
        JSON.stringify(snapshots),
        {
            metadata: {
                version: config.version,
                timestamp: config.timestamp
            }
        }
    );

    console.log(`✅ KV 快照保存完成`);
    console.log(`   Config Key: snapshot:config`);
    console.log(`   Data Key: ${snapshotKey}`);
    console.log(`   Latest Key: snapshot:latest`);
}

/**
 * 获取当前快照版本号
 * 
 * @param env 环境变量
 * @returns Promise<number> 当前版本号（如果不存在则返回 0）
 */
export async function getCurrentSnapshotVersion(env: Env): Promise<number> {
    const config = await env.API_GATEWAY_STORAGE.get('snapshot:config', 'json');

    if (!config) {
        console.log(`📍 快照配置不存在，初始化版本号为 0`);
        return 0;
    }

    const version = (config as SnapshotConfig).version;
    console.log(`📍 当前快照版本: ${version}`);
    return version;
}

/**
 * 读取最新快照
 * 
 * @param env 环境变量
 * @returns Promise<PathStatsSnapshot[] | null>
 */
export async function getLatestSnapshot(
    env: Env
): Promise<PathStatsSnapshot[] | null> {
    const snapshot = await env.API_GATEWAY_STORAGE.get('snapshot:latest', 'json');

    if (!snapshot) {
        console.log(`⚠️ 未找到最新快照`);
        return null;
    }

    return snapshot as PathStatsSnapshot[];
}

/**
 * 读取指定版本的快照
 * 
 * @param env 环境变量
 * @param version 版本号
 * @returns Promise<PathStatsSnapshot[] | null>
 */
export async function getSnapshotByVersion(
    env: Env,
    version: number
): Promise<PathStatsSnapshot[] | null> {
    const snapshotKey = `snapshot:v${version}:paths`;
    const snapshot = await env.API_GATEWAY_STORAGE.get(snapshotKey, 'json');

    if (!snapshot) {
        console.log(`⚠️ 未找到版本 ${version} 的快照`);
        return null;
    }

    return snapshot as PathStatsSnapshot[];
}

/**
 * 清理旧快照
 * 
 * 保留最近 N 个版本，删除旧版本
 * 
 * @param env 环境变量
 * @param keepVersions 保留的版本数（默认 5）
 */
export async function cleanupOldSnapshots(
    env: Env,
    keepVersions: number = 5
): Promise<void> {
    console.log(`🧹 清理旧快照（保留最近 ${keepVersions} 个版本）`);

    const currentVersion = await getCurrentSnapshotVersion(env);

    if (currentVersion <= keepVersions) {
        console.log(`✅ 当前版本数 ${currentVersion} ≤ ${keepVersions}，无需清理`);
        return;
    }

    // 删除旧版本
    const deletePromises = [];
    const deleteVersion = currentVersion - keepVersions;

    for (let v = 1; v <= deleteVersion; v++) {
        const key = `snapshot:v${v}:paths`;
        console.log(`  删除版本 ${v}: ${key}`);
        deletePromises.push(env.API_GATEWAY_STORAGE.delete(key));
    }

    await Promise.all(deletePromises);

    console.log(`✅ 清理完成，删除了 ${deletePromises.length} 个旧版本`);
}

/**
 * 辅助函数：格式化小时桶
 * 
 * @param date Date 对象
 * @returns 小时桶字符串（格式：'2025-10-15T14'）
 */
function formatHourBucket(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}T${String(date.getUTCHours()).padStart(2, '0')}`;
}

/**
 * 补充快照的 method 字段
 * 
 * 从 traffic_events 查询每个路径最常用的 HTTP method
 * 如果查询不到，从统一配置中获取；如果都没有，则不设置（留空）
 * 
 * @param env 环境变量
 * @param snapshots 快照数组（会直接修改）
 */
async function enrichSnapshotsWithMethods(env: Env, snapshots: PathStatsSnapshot[]): Promise<void> {
    if (snapshots.length === 0) {
        return;
    }

    console.log(`🔍 查询路径的 HTTP Method...`);

    try {
        // 步骤 1: 从统一配置获取已配置的 method
        const unifiedPaths = await getUnifiedPathsFromKV(env);
        const configMethodMap = new Map<string, string>();
        for (const config of unifiedPaths) {
            if (config.method) {
                configMethodMap.set(config.path, config.method);
            }
        }

        console.log(`📋 从统一配置中找到 ${configMethodMap.size} 个路径的 method`);

        // 步骤 2: 从 traffic_events 查询实际使用的 method
        const paths = snapshots.map(s => s.path);
        const placeholders = paths.map(() => '?').join(',');
        const query = `
            SELECT path, method, COUNT(*) as count
            FROM traffic_events
            WHERE path IN (${placeholders})
              AND timestamp >= ?
            GROUP BY path, method
            ORDER BY path, count DESC
        `;

        // 查询最近 30 天的数据（扩大时间范围）
        const since30Days = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const results = await env.D1.prepare(query)
            .bind(...paths, since30Days)
            .all<{ path: string; method: string; count: number }>();

        // 为每个路径选择最常用的 method
        const pathMethodMap = new Map<string, string>();
        let currentPath = '';
        let maxCount = 0;
        let selectedMethod = '';

        for (const row of results.results || []) {
            if (row.path !== currentPath) {
                // 保存前一个路径的结果
                if (currentPath && selectedMethod) {
                    pathMethodMap.set(currentPath, selectedMethod);
                }
                // 重置为新路径
                currentPath = row.path;
                maxCount = row.count;
                selectedMethod = row.method;
            }
        }
        // 保存最后一个路径的结果
        if (currentPath && selectedMethod) {
            pathMethodMap.set(currentPath, selectedMethod);
        }

        console.log(`📊 从 traffic_events 中找到 ${pathMethodMap.size} 个路径的实际 method`);

        // 步骤 3: 更新快照数据（优先级：traffic_events > 统一配置 > 保留原值）
        let fromTrafficEvents = 0;
        let fromConfig = 0;
        let kept = 0;

        for (const snapshot of snapshots) {
            const trafficMethod = pathMethodMap.get(snapshot.path);
            const configMethod = configMethodMap.get(snapshot.path);

            if (trafficMethod) {
                snapshot.method = trafficMethod;
                fromTrafficEvents++;
            } else if (configMethod) {
                snapshot.method = configMethod;
                fromConfig++;
            } else {
                // 保留快照中已有的 method（如果有的话），否则不设置
                // 这样可以让管理员在 UI 中手动设置新路径的 method
                kept++;
                // snapshot.method 保持原值（如果没有则为 undefined）
            }
        }

        console.log(`✅ Method 补充完成:`);
        console.log(`   - 从 traffic_events: ${fromTrafficEvents}`);
        console.log(`   - 从统一配置: ${fromConfig}`);
        console.log(`   - 保留原值: ${kept}`);

        // 步骤 4: 将发现的 method 写回 unified-paths:list（修复持久化数据）
        if (fromTrafficEvents > 0) {
            await writeMethodsBackToConfig(env, unifiedPaths, pathMethodMap);
        }
    } catch (error) {
        console.error('❌ Method 补充失败:', error);
        // 失败时不设置默认值，保持原有配置
        console.log('⚠️ 将使用统一配置中的 method 值');
    }
}

/**
 * 将发现的 method 写回统一配置
 * 
 * 更新策略：
 * - 只更新 undefined 或 GET（旧的默认值）
 * - 不覆盖其他值（可能是手动设置的，或来自历史版本）
 * - 这样可以保护手动配置，同时修复错误的默认值
 * 
 * ⚠️ 注意：由于已移除启发式推断，所有 methodMap 中的值都来自真实流量
 * 
 * @param env 环境变量
 * @param configs 统一配置数组
 * @param methodMap 从 traffic_events 查询到的 method 映射（真实流量数据）
 */
async function writeMethodsBackToConfig(
    env: Env,
    configs: UnifiedPathConfig[],
    methodMap: Map<string, string>
): Promise<void> {
    let updatedCount = 0;
    let skippedCount = 0;

    for (const config of configs) {
        const discoveredMethod = methodMap.get(config.path);

        if (!discoveredMethod) {
            continue;
        }

        // 更新条件：
        // 1. 没有 method（undefined）
        // 2. method 是 GET（可能是旧的错误默认值）
        //
        // 不更新的情况：
        // - method 是其他值（POST, PUT, DELETE 等）
        // - 假设这些是手动设置或之前正确识别的
        //
        // 如果需要强制使用真实流量数据覆盖所有值，可以移除第二个条件：
        // if (discoveredMethod && discoveredMethod !== config.method) {
        const shouldUpdate = !config.method || config.method === 'GET';

        if (shouldUpdate) {
            config.method = discoveredMethod;
            config.metadata = config.metadata || {
                createdAt: new Date(),
                updatedAt: new Date(),
                source: 'auto'
            };
            config.metadata.updatedAt = new Date();
            updatedCount++;
        } else {
            // 记录跳过的路径（用于调试）
            if (config.method !== discoveredMethod) {
                skippedCount++;
            }
        }
    }

    if (updatedCount > 0) {
        console.log(`💾 写回 ${updatedCount} 个 method 到 unified-paths:list`);
        if (skippedCount > 0) {
            console.log(`⏭️  跳过 ${skippedCount} 个已有非GET值的路径（保护手动配置）`);
        }
        const UNIFIED_PATHS_KEY = 'unified-paths:list';
        await env.API_GATEWAY_STORAGE.put(UNIFIED_PATHS_KEY, JSON.stringify(configs));
        console.log(`✅ 持久化配置已更新`);
    }
}

/**
 * 从 KV 获取统一路径配置（内部使用）
 * 
 * @param env 环境变量
 * @returns Promise<UnifiedPathConfig[]>
 */
async function getUnifiedPathsFromKV(env: Env): Promise<UnifiedPathConfig[]> {
    try {
        const UNIFIED_PATHS_KEY = 'unified-paths:list';
        const stored = await env.API_GATEWAY_STORAGE.get(UNIFIED_PATHS_KEY, 'json');
        return (stored as UnifiedPathConfig[]) || [];
    } catch (error) {
        console.error('获取统一路径配置失败:', error);
        return [];
    }
}

