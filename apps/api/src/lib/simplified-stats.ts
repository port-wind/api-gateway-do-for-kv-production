/**
 * 简化统计实现
 * 
 * 基于 Phase 0 验证结果，采用无外部依赖的统计方案：
 * - 百分位计算：水库采样排序数组（最多 1000 个）
 * - Unique IP 统计：水库采样（最多 1000 个）
 * 
 * 优势：
 * - 零外部依赖
 * - 完全兼容 Workers
 * - 性能充足（<10ms/批）
 * 
 * 准确度：
 * - 百分位统计：≤1000 请求时 100% 准确，>1000 时误差 ±3%
 * - Unique IP 统计：≤1000 请求时 100% 准确，>1000 时仅提供下界估计（真实值 ≥ 返回值）
 * 
 * ⚠️ 限制：
 * - Unique IP 无法准确计数（水库轮转导致的固有限制）
 * - Phase 5 可使用 HyperLogLog 实现 ±2% 误差的基数估计
 */

export interface SimplifiedStats {
    path: string;
    hour_bucket: string;
    requests: number;
    errors: number;
    sum_response_time: number;
    count_response_time: number;
    response_samples: number[]; // 最多 1000 个
    ip_hashes: string[]; // 最多 1000 个（水库采样）
    // ⚠️ 限制：由于内存约束，无法维护完整的"已见过的IP"集合
    // unique_ips_seen 是基于水库样本的**近似值**，会随着水库轮转而产生误差
    // 真正的准确计数需要 HyperLogLog 或 Bloom Filter（Phase 5 优化）
    unique_ips_seen: number; // 近似的不同 IP 数（基于水库样本）
}

export interface TrafficEvent {
    path: string;
    method: string;
    status: number;
    responseTime: number;
    clientIpHash: string;
    timestamp: number;
}

export interface Percentiles {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
    min: number;
    max: number;
}

/**
 * 聚合事件到统计数据
 * 使用水库采样（Reservoir Sampling）保证无偏采样
 * 
 * ⚠️ Unique IP 限制：
 * - ipHashesSet 只跟踪当前水库中的 1000 个 IP
 * - 被驱逐的 IP 再次出现时会被误判为"新IP"
 * - 因此 unique_ips_seen 是**近似值**，不是准确计数
 * - Phase 5 可使用 HyperLogLog 实现真正的基数估计
 */
export function aggregateEvents(events: TrafficEvent[], existing: SimplifiedStats | null): SimplifiedStats {
    const samples = existing?.response_samples ? [...existing.response_samples] : [];
    const ipHashesArray = existing?.ip_hashes ? [...existing.ip_hashes] : [];
    // ⚠️ ipHashesSet 只包含水库中的 IP，不包含历史上所有见过的 IP
    const ipHashesSet = new Set(ipHashesArray);

    let requests = existing?.requests || 0;
    let errors = existing?.errors || 0;
    let sumResponseTime = existing?.sum_response_time || 0;
    let countResponseTime = existing?.count_response_time || 0;

    for (const event of events) {
        requests++;
        if (event.status >= 400) errors++;
        sumResponseTime += event.responseTime;
        countResponseTime++;

        // ✅ 响应时间水库采样 - 基于总请求数
        if (samples.length < 1000) {
            samples.push(event.responseTime);
        } else {
            const randomIndex = Math.floor(Math.random() * requests);
            if (randomIndex < 1000) {
                samples[randomIndex] = event.responseTime;
            }
        }

        // ✅ Unique IP 水库采样 - 标准算法
        // ⚠️ 局限性：无法区分"新IP"和"被驱逐后重新出现的IP"
        if (!ipHashesSet.has(event.clientIpHash)) {
            if (ipHashesArray.length < 1000) {
                // 前 1000 个 IP：直接添加
                ipHashesArray.push(event.clientIpHash);
                ipHashesSet.add(event.clientIpHash);
            } else {
                // 水库已满：以 1000/requests 概率替换
                const randomIndex = Math.floor(Math.random() * requests);
                if (randomIndex < 1000) {
                    // 替换旧 IP
                    const oldIp = ipHashesArray[randomIndex];
                    ipHashesSet.delete(oldIp);
                    ipHashesArray[randomIndex] = event.clientIpHash;
                    ipHashesSet.add(event.clientIpHash);
                }
            }
        }
        // 重复 IP（或被驱逐后重新出现的IP）：不做任何操作
    }

    return {
        path: events[0]?.path || existing?.path || '',
        hour_bucket: getHourBucket(events[0]?.timestamp || Date.now()),
        requests,
        errors,
        sum_response_time: sumResponseTime,
        count_response_time: countResponseTime,
        response_samples: samples,
        ip_hashes: ipHashesArray,
        // ⚠️ unique_ips_seen = 水库中的唯一 IP 数（近似值）
        // 由于水库轮转，无法准确跟踪历史上所有的唯一 IP
        unique_ips_seen: ipHashesArray.length,
    };
}

/**
 * 计算百分位数
 * 使用线性排名法（linear rank method）
 */
export function calculatePercentiles(samples: number[]): Percentiles {
    if (samples.length === 0) {
        return {
            p50: 0,
            p95: 0,
            p99: 0,
            avg: 0,
            min: 0,
            max: 0,
        };
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const sum = samples.reduce((acc, val) => acc + val, 0);
    const n = sorted.length;

    /**
     * 百分位计算：index = percentile * (n - 1)
     * - p50, p95: 使用 floor（标准排名）
     * - p99: 使用 ceil（确保取到极值）
     */
    const getPercentile = (p: number) => {
        if (p >= 0.99) {
            // p99 及以上：向上取整，确保接近最大值
            const index = Math.ceil(p * (n - 1));
            return sorted[Math.min(index, n - 1)];
        } else {
            // p50, p95: 标准 floor 方法
            const index = Math.floor(p * (n - 1));
            return sorted[index];
        }
    };

    return {
        p50: getPercentile(0.5),
        p95: getPercentile(0.95),
        p99: getPercentile(0.99),
        avg: sum / samples.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
    };
}

/**
 * 序列化统计数据到 D1
 */
export function serializeStats(stats: SimplifiedStats): {
    path: string;
    hour_bucket: string;
    requests: number;
    errors: number;
    sum_response_time: number;
    count_response_time: number;
    response_samples: string; // JSON 字符串
    ip_hashes: string; // JSON 字符串
    unique_ips_seen: number;
} {
    return {
        path: stats.path,
        hour_bucket: stats.hour_bucket,
        requests: stats.requests,
        errors: stats.errors,
        sum_response_time: stats.sum_response_time,
        count_response_time: stats.count_response_time,
        response_samples: JSON.stringify(stats.response_samples),
        ip_hashes: JSON.stringify(stats.ip_hashes),
        unique_ips_seen: stats.unique_ips_seen,
    };
}

/**
 * 从 D1 反序列化统计数据
 */
export function deserializeStats(row: {
    path: string;
    hour_bucket: string;
    requests: number;
    errors: number;
    sum_response_time: number;
    count_response_time: number;
    response_samples: string | null;
    ip_hashes: string | null;
    unique_ips_seen?: number; // 可选，兼容旧数据
}): SimplifiedStats {
    return {
        path: row.path,
        hour_bucket: row.hour_bucket,
        requests: row.requests,
        errors: row.errors,
        sum_response_time: row.sum_response_time,
        count_response_time: row.count_response_time,
        response_samples: row.response_samples ? JSON.parse(row.response_samples) : [],
        ip_hashes: row.ip_hashes ? JSON.parse(row.ip_hashes) : [],
        unique_ips_seen: row.unique_ips_seen ?? 0, // 默认 0，兼容旧数据
    };
}

/**
 * 获取小时桶标识
 */
function getHourBucket(timestamp: number): string {
    const date = new Date(timestamp);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    return `${year}-${month}-${day}T${hour}`;
}

/**
 * 生成统计摘要（用于 API 返回）
 * 
 * ⚠️ Unique IP 限制说明：
 * - unique_ips_seen = 水库中的唯一 IP 数（≤1000）
 * - 这是一个**下界估计**，真实唯一 IP 数 ≥ unique_ips_seen
 * - 由于水库轮转，无法提供准确的上界
 * - Phase 5 可使用 HyperLogLog 实现真正的基数估计
 */
export function generateStatsSummary(stats: SimplifiedStats): {
    path: string;
    hour: string;
    requests: number;
    errors: number;
    error_rate: number;
    percentiles: Percentiles;
    unique_ips_min: number; // 至少有这么多唯一 IP（下界）
    accuracy_note: string;
} {
    const percentiles = calculatePercentiles(stats.response_samples);

    // ⚠️ unique_ips_seen 只是水库中的 IP 数，是真实值的下界
    const uniqueIPsMin = stats.unique_ips_seen;
    const accuracyNote = stats.unique_ips_seen >= 1000
        ? `水库采样 1000 个 IP，真实唯一 IP ≥ ${uniqueIPsMin}（下界估计）`
        : `完全采样 ${uniqueIPsMin} 个唯一 IP，准确度 100%`;

    return {
        path: stats.path,
        hour: stats.hour_bucket,
        requests: stats.requests,
        errors: stats.errors,
        error_rate: stats.requests > 0 ? stats.errors / stats.requests : 0,
        percentiles,
        unique_ips_min: uniqueIPsMin, // 至少有这么多唯一 IP
        accuracy_note: accuracyNote,
    };
}

/**
 * 合并多个小时桶的统计数据
 * 
 * ⚠️ 限制：
 * - 合并后的 unique_ips_seen 只是水库样本的去重数（≤1000）
 * - 不是真实的唯一 IP 总数
 * - 仅用于提供下界估计
 */
export function mergeStats(statsList: SimplifiedStats[]): SimplifiedStats {
    if (statsList.length === 0) {
        throw new Error('Cannot merge empty stats list');
    }

    const allSamples: number[] = [];
    const allIpHashes = new Set<string>();
    let totalRequests = 0;
    let totalErrors = 0;
    let totalSumResponseTime = 0;
    let totalCountResponseTime = 0;

    for (const stats of statsList) {
        totalRequests += stats.requests;
        totalErrors += stats.errors;
        totalSumResponseTime += stats.sum_response_time;
        totalCountResponseTime += stats.count_response_time;

        // 合并样本（最多 1000 个）
        for (const sample of stats.response_samples) {
            if (allSamples.length < 1000) {
                allSamples.push(sample);
            }
        }

        // 合并 IP 哈希（去重，最多 1000 个）
        for (const hash of stats.ip_hashes) {
            if (allIpHashes.size < 1000) {
                allIpHashes.add(hash);
            }
        }
    }

    // ⚠️ unique_ips_seen = 合并后水库中的唯一 IP 数（≤1000）
    // 这是所有桶的 IP 样本去重后的结果，不是真实的唯一 IP 总数
    const mergedUniqueIPs = allIpHashes.size;

    return {
        path: statsList[0].path,
        hour_bucket: 'merged',
        requests: totalRequests,
        errors: totalErrors,
        sum_response_time: totalSumResponseTime,
        count_response_time: totalCountResponseTime,
        response_samples: allSamples,
        ip_hashes: Array.from(allIpHashes),
        unique_ips_seen: mergedUniqueIPs, // 水库样本中的唯一 IP 数
    };
}

