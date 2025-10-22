/**
 * IP 访问数据聚合器
 * 
 * 功能：
 * - 按 (date, ip_hash) 分组聚合流量事件
 * - 计算每个 IP 的统计指标（请求数、错误数、路径分布等）
 * - 批量 upsert 到 D1 ip_traffic_daily 表
 */

import type { Env } from '../types/env';
import type { TrafficEvent } from './d1-writer';

/**
 * IP 每日统计数据
 */
export interface IpDailyStats {
    date: string;                    // YYYY-MM-DD
    ipHash: string;
    ipAddress?: string;              // 真实 IP 地址（可选，用于显示）
    totalRequests: number;
    totalErrors: number;
    blockedRequests: number;
    throttledRequests: number;
    uniquePaths: number;
    topPaths: PathCount[];           // Top 20
    countryCounts: Map<string, number>; // 国家计数，用于 Top 5
    cityCounts: Map<string, number>; // 城市计数（Quick Win 新增）
    userAgentCounts: Map<string, number>; // User-Agent 计数，用于 Top 5
    firstSeen: number;               // Unix timestamp (ms)
    lastSeen: number;                // Unix timestamp (ms)
    // 内部使用，用于一次遍历构建路径统计
    pathCounts?: Map<string, number>;
}

export interface PathCount {
    path: string;
    count: number;
}

/**
 * 聚合流量事件为 IP 每日统计
 * 
 * ⚠️ 性能优化：使用 O(n) 单次遍历，避免嵌套循环
 * 
 * @param events 流量事件列表
 * @returns 按 (date, ipHash) 分组的统计数据
 */
export function aggregateIpEvents(events: TrafficEvent[]): Map<string, IpDailyStats> {
    const statsMap = new Map<string, IpDailyStats>();

    // ⚠️ 关键优化：单次遍历，在第一次遍历时同时统计路径
    for (const event of events) {
        // 生成日期（YYYY-MM-DD）
        const date = new Date(event.timestamp).toISOString().split('T')[0];
        const ipHash = event.clientIpHash;
        const key = `${date}|||${ipHash}`;

        // 获取或初始化统计
        let stats = statsMap.get(key);
        if (!stats) {
            stats = {
                date,
                ipHash,
                ipAddress: event.clientIp,  // 记录真实 IP（首次出现）
                totalRequests: 0,
                totalErrors: 0,
                blockedRequests: 0,
                throttledRequests: 0,
                uniquePaths: 0,
                topPaths: [],
                countryCounts: new Map(),
                cityCounts: new Map(), // Quick Win: 城市计数
                userAgentCounts: new Map(),
                firstSeen: event.timestamp,
                lastSeen: event.timestamp,
                pathCounts: new Map(), // 内部使用的路径计数器
            };
            statsMap.set(key, stats);
        }

        // 累加统计
        stats.totalRequests++;
        if (event.isError) {
            stats.totalErrors++;
        }

        // 更新时间范围
        if (event.timestamp < stats.firstSeen) {
            stats.firstSeen = event.timestamp;
        }
        if (event.timestamp > stats.lastSeen) {
            stats.lastSeen = event.timestamp;
        }

        // 收集国家、城市和 UA
        if (event.country) {
            const code = event.country.toUpperCase();
            stats.countryCounts.set(code, (stats.countryCounts.get(code) || 0) + 1);
        }
        // Quick Win: 收集城市数据（原始值，未标准化）
        if (event.city && event.city !== 'UNKNOWN') {
            const city = event.city;
            stats.cityCounts.set(city, (stats.cityCounts.get(city) || 0) + 1);
        }
        if (event.userAgent) {
            const ua = event.userAgent.substring(0, 100);
            stats.userAgentCounts.set(ua, (stats.userAgentCounts.get(ua) || 0) + 1);
        }

        // ⚠️ 关键：在同一次遍历中统计路径
        const pathCounts = stats.pathCounts!;
        pathCounts.set(event.path, (pathCounts.get(event.path) || 0) + 1);

        // 统计限流/封禁
        if (event.geoAction === 'blocked' || event.status === 403) {
            stats.blockedRequests++;
        } else if (event.geoAction === 'throttled' || event.status === 429) {
            stats.throttledRequests++;
        }
    }

    // 第二次遍历：转换路径计数为 Top 20 数组（用于展示）
    // 这是 O(m)，m 是 statsMap 的大小，远小于 events 数量
    for (const stats of statsMap.values()) {
        const pathCounts = stats.pathCounts!;

        // 转换为数组并排序，取 Top 20（用于 top_paths 字段）
        stats.topPaths = Array.from(pathCounts.entries())
            .map(([path, count]) => ({ path, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 20);

        stats.uniquePaths = pathCounts.size;

        // ⚠️ 保留 pathCounts，稍后用于写入 ip_path_daily 表
        // 不要 delete，因为需要完整的路径列表
    }

    return statsMap;
}

/**
 * 批量 upsert IP 统计到 D1
 * 
 * 策略：
 * - 每批最多 100 条记录
 * - 使用 D1 batch() API 进行事务性写入
 * - 使用 INSERT ... ON CONFLICT DO UPDATE 语句
 * 
 * @param env 环境变量
 * @param stats IP 统计数据 Map
 */
export async function batchUpsertIpStats(
    env: Env,
    stats: Map<string, IpDailyStats>
): Promise<void> {
    const statsArray = Array.from(stats.values());

    if (statsArray.length === 0) {
        return;
    }

    const BATCH_SIZE = 100;
    const batches: IpDailyStats[][] = [];

    // 分批
    for (let i = 0; i < statsArray.length; i += BATCH_SIZE) {
        batches.push(statsArray.slice(i, i + BATCH_SIZE));
    }

    console.log(`📊 IP 聚合: ${statsArray.length} 条记录，分 ${batches.length} 批写入`);

    // 批量写入
    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];

        try {
            await upsertIpStatsBatch(env, batch);
            console.log(`✅ IP 批次 ${i + 1}/${batches.length} 写入成功 (${batch.length} 条)`);
        } catch (error) {
            console.error(`❌ IP 批次 ${i + 1}/${batches.length} 写入失败:`, error);
            throw error; // 传播错误，触发 retry
        }
    }
}

/**
 * Upsert 单批 IP 统计（使用 D1 batch API）
 * 
 * @param env 环境变量
 * @param stats IP 统计数据数组
 */
async function upsertIpStatsBatch(
    env: Env,
    stats: IpDailyStats[]
): Promise<void> {
    if (!env.D1) {
        throw new Error('D1 binding not available');
    }

    const allStatements: Array<ReturnType<typeof env.D1.prepare>> = [];

    // 1. 构造 ip_traffic_daily 的 upsert 语句
    //    unique_paths 将在稍后基于 ip_path_daily 重新计算
    const dailySql = `
    INSERT INTO ip_traffic_daily (
      date, ip_hash, ip_address, total_requests, total_errors,
      blocked_requests, throttled_requests,
      unique_paths, top_paths, countries, user_agents, last_seen_city, first_seen, last_seen,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, ip_hash) DO UPDATE SET
      total_requests = total_requests + excluded.total_requests,
      total_errors = total_errors + excluded.total_errors,
      blocked_requests = blocked_requests + excluded.blocked_requests,
      throttled_requests = throttled_requests + excluded.throttled_requests,
      -- unique_paths 暂不更新，稍后批量刷新
      top_paths = excluded.top_paths,
      countries = excluded.countries,
      user_agents = excluded.user_agents,
      last_seen_city = excluded.last_seen_city,
      first_seen = CASE 
        WHEN excluded.first_seen < first_seen 
        THEN excluded.first_seen 
        ELSE first_seen 
      END,
      last_seen = CASE 
        WHEN excluded.last_seen > last_seen 
        THEN excluded.last_seen 
        ELSE last_seen 
      END,
      updated_at = excluded.updated_at,
      ip_address = COALESCE(ip_traffic_daily.ip_address, excluded.ip_address)
  `;

    stats.forEach(stat => {
        const countries = Array.from(stat.countryCounts.entries())
            .map(([code, count]) => ({ code, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        const userAgents = Array.from(stat.userAgentCounts.entries())
            .map(([ua, count]) => ({ ua, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        // Quick Win: 计算最频繁出现的城市
        const mostFrequentCity = Array.from(stat.cityCounts.entries())
            .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

        allStatements.push(
            env.D1.prepare(dailySql).bind(
                stat.date,
                stat.ipHash,
                stat.ipAddress || null,
                stat.totalRequests,
                stat.totalErrors,
                stat.blockedRequests,
                stat.throttledRequests,
                0,  // unique_paths 将在批处理末尾由 ip_path_daily 重新计算
                JSON.stringify(stat.topPaths),
                JSON.stringify(countries),
                JSON.stringify(userAgents),
                mostFrequentCity,  // Quick Win: 最频繁出现的城市
                stat.firstSeen,
                stat.lastSeen,
                Math.floor(Date.now() / 1000)
            )
        );
    });

    // 2. 构造 ip_path_daily 的 upsert 语句（每条路径一个记录）
    // ⚠️ 关键改进：使用完整的 pathCounts，而不是截断后的 topPaths
    //    - 确保后续按 path 聚合的数据完整，不丢失长尾路径
    //    - topPaths 仅用于展示，pathCounts 才是完整的统计数据源
    const pathSql = `
    INSERT INTO ip_path_daily (date, ip_hash, path, request_count)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(date, ip_hash, path) DO UPDATE SET
      request_count = request_count + excluded.request_count
  `;

    stats.forEach(stat => {
        // 遍历该 IP 的所有路径（完整列表，不截断）
        const pathCounts = stat.pathCounts!;
        for (const [path, count] of pathCounts.entries()) {
            allStatements.push(
                env.D1.prepare(pathSql).bind(
                    stat.date,
                    stat.ipHash,
                    path,
                    count
                )
            );
        }
    });

    // 3. 刷新 unique_paths 字段（基于 ip_path_daily 的真实计数）
    // ⚠️ 注意：这里使用 COUNT(*) 等价于 COUNT(DISTINCT path)
    //    因为 ip_path_daily 的主键是 (date, ip_hash, path)，保证了路径唯一性
    //    若未来修改主键结构（如添加其他字段），需改为 COUNT(DISTINCT path)
    const refreshSql = `
    UPDATE ip_traffic_daily
    SET unique_paths = (
      SELECT COUNT(*) FROM ip_path_daily
      WHERE date = ? AND ip_hash = ?
    )
    WHERE date = ? AND ip_hash = ?
  `;

    stats.forEach(stat => {
        allStatements.push(
            env.D1.prepare(refreshSql).bind(
                stat.date,
                stat.ipHash,
                stat.date,
                stat.ipHash
            )
        );
    });

    // 4. 批量执行所有语句
    console.log(`📝 准备写入: ${stats.length} 条 IP 统计 + ${allStatements.length - stats.length} 条路径/刷新记录`);

    await env.D1.batch(allStatements);

    // 5. 清理临时的路径计数，释放内存
    // ⚠️ 重要：写入后立即清理 pathCounts map
    //    - 避免批次之间的内存占用累积
    //    - 防止 map 被重复使用造成数据污染
    stats.forEach(stat => {
        stat.pathCounts?.clear();
        delete stat.pathCounts;
    });
}

/**
 * 从 D1 查询 IP 统计数据（用于调试和验证）
 * 
 * @param env 环境变量
 * @param date 日期 (YYYY-MM-DD)
 * @param limit 返回数量限制
 * @returns IP 统计数据数组
 */
export async function queryIpStats(
    env: Env,
    date: string,
    limit: number = 100
): Promise<any[]> {
    if (!env.D1) {
        throw new Error('D1 binding not available');
    }

    const result = await env.D1.prepare(`
    SELECT 
      daily.date,
      daily.ip_hash,
      daily.total_requests,
      daily.total_errors,
      COALESCE(unique_paths.unique_paths, 0) AS unique_paths,
      daily.top_paths,
      daily.countries,
      daily.user_agents,
      daily.first_seen,
      daily.last_seen
    FROM ip_traffic_daily daily
    LEFT JOIN (
      SELECT ip_hash, COUNT(DISTINCT path) AS unique_paths
      FROM ip_path_daily
      WHERE date = ?
      GROUP BY ip_hash
    ) unique_paths
      ON unique_paths.ip_hash = daily.ip_hash
    WHERE daily.date = ?
    ORDER BY daily.total_requests DESC
    LIMIT ?
  `).bind(date, date, limit).all();

    return result.results || [];
}
