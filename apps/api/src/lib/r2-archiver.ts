/**
 * R2 归档管理
 * 
 * 分层归档策略：
 * - traffic_events（明细表）：
 *   - 热数据（0-3 天）：保留在 D1
 *   - 温数据（3-30 天）：归档到 R2
 *   - 冷数据（>30 天）：继续保留在 R2 或删除
 * 
 * - path_stats_hourly（聚合表）：
 *   - 所有历史数据：永久保留在 D1 ✅
 */

import type { Env } from '../types/env';

/**
 * 归档配置
 */
export const ARCHIVE_CONFIG = {
    // 归档阈值：3 天前的数据
    ARCHIVE_DAYS_AGO: 3,
    // 每批读取的记录数
    BATCH_SIZE: 5000,
    // 压缩格式
    COMPRESSION: 'gzip' as const,
    // R2 路径前缀
    R2_PREFIX: 'traffic-events',
};

/**
 * 归档任务结果
 */
export interface ArchiveResult {
    date: string;              // 归档日期（YYYY-MM-DD）
    recordCount: number;       // 归档记录数
    fileSizeBytes: number;     // 文件大小（字节）
    r2Path: string;            // R2 存储路径
    duration: number;          // 归档耗时（毫秒）
    status: 'success' | 'failed';
    error?: string;
}

/**
 * 获取需要归档的日期列表
 * 
 * @param env 环境变量
 * @param daysAgo 归档 N 天前的数据
 * @returns Promise<string[]> 日期列表（YYYY-MM-DD）
 */
export async function getDatesToArchive(
    env: Env,
    daysAgo: number = ARCHIVE_CONFIG.ARCHIVE_DAYS_AGO
): Promise<string[]> {
    console.log(`📅 查找需要归档的日期（${daysAgo} 天前）`);

    // 计算目标日期
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - daysAgo);
    const targetDateStr = targetDate.toISOString().split('T')[0];

    // 查询该日期是否有数据且未归档
    const result = await env.D1.prepare(
        `SELECT DISTINCT event_date 
     FROM traffic_events 
     WHERE event_date <= ? 
       AND event_date NOT IN (
         SELECT date FROM archive_metadata WHERE status = 'completed'
       )
     ORDER BY event_date`
    ).bind(targetDateStr).all();

    const dates = result.results?.map(row => row.event_date as string) || [];
    console.log(`✅ 找到 ${dates.length} 个待归档日期: ${dates.join(', ')}`);

    return dates;
}

/**
 * 归档指定日期的明细事件到 R2
 * 
 * @param env 环境变量
 * @param date 日期（YYYY-MM-DD）
 * @returns Promise<ArchiveResult>
 */
export async function archiveEventsForDate(
    env: Env,
    date: string
): Promise<ArchiveResult> {
    const startTime = Date.now();
    console.log(`========================================`);
    console.log(`📦 开始归档: ${date}`);
    console.log(`========================================`);

    try {
        // Step 1: 创建归档元数据记录（状态：pending）
        await createArchiveMetadata(env, date, 'pending');

        // Step 2: 统计记录数（避免加载所有数据到内存）
        const countResult = await env.D1.prepare(
            `SELECT COUNT(*) as count FROM traffic_events WHERE event_date = ?`
        ).bind(date).first();

        const recordCount = (countResult?.count as number) || 0;

        if (recordCount === 0) {
            console.log(`⚠️ 该日期无数据: ${date}`);
            await updateArchiveMetadata(env, date, 'completed', 0, 0, '');
            return {
                date,
                recordCount: 0,
                fileSizeBytes: 0,
                r2Path: '',
                duration: Date.now() - startTime,
                status: 'success'
            };
        }

        console.log(`📊 发现 ${recordCount} 条事件`);

        // Step 3: 流式压缩并上传到 R2（避免 OOM）
        const r2Path = `${ARCHIVE_CONFIG.R2_PREFIX}/${date}.jsonl.gz`;
        const compressedSize = await streamEventsToR2(env, date, r2Path);

        console.log(`☁️ 上传到 R2: ${r2Path}`);
        console.log(`🗜️ 压缩后大小: ${formatBytes(compressedSize)}`);

        // Step 4: 更新归档元数据（状态：completed）
        await updateArchiveMetadata(env, date, 'completed', recordCount, compressedSize, r2Path);

        const duration = Date.now() - startTime;
        console.log(`========================================`);
        console.log(`✅ 归档完成: ${date}`);
        console.log(`   记录数: ${recordCount}`);
        console.log(`   文件大小: ${formatBytes(compressedSize)}`);
        console.log(`   耗时: ${duration}ms`);
        console.log(`========================================\n`);

        return {
            date,
            recordCount,
            fileSizeBytes: compressedSize,
            r2Path,
            duration,
            status: 'success'
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ 归档失败: ${date}`, error);

        // 更新归档元数据（状态：failed）
        await updateArchiveMetadata(env, date, 'failed', 0, 0, '', errorMessage);

        return {
            date,
            recordCount: 0,
            fileSizeBytes: 0,
            r2Path: '',
            duration: Date.now() - startTime,
            status: 'failed',
            error: errorMessage
        };
    }
}

/**
 * 流式处理：从 D1 读取 → 压缩 → 上传到 R2
 * 
 * ⚠️ 关键：分批读取、边读边压缩、边压缩边上传，避免 OOM
 * 
 * @param env 环境变量
 * @param date 日期（YYYY-MM-DD）
 * @param r2Path R2 存储路径
 * @returns Promise<number> 压缩后的文件大小
 */
async function streamEventsToR2(
    env: Env,
    date: string,
    r2Path: string
): Promise<number> {
    console.log(`🌊 开始流式归档: ${date}`);

    let offset = 0;
    let totalProcessed = 0;

    // 创建压缩流
    const { readable, writable } = new TransformStream();
    const compressionStream = readable.pipeThrough(new CompressionStream('gzip'));
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // 异步读取压缩后的数据块
    const compressedChunks: Uint8Array[] = [];
    const reader = compressionStream.getReader();
    const readCompressed = async () => {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            compressedChunks.push(value);
        }
    };
    const readPromise = readCompressed();

    // 分批读取并写入压缩流
    while (true) {
        const result = await env.D1.prepare(
            `SELECT * FROM traffic_events 
       WHERE event_date = ? 
       ORDER BY timestamp 
       LIMIT ? OFFSET ?`
        ).bind(date, ARCHIVE_CONFIG.BATCH_SIZE, offset).all();

        if (!result.results || result.results.length === 0) {
            break;
        }

        // 转换为 JSONL 并写入压缩流
        for (const event of result.results) {
            const line = JSON.stringify(event) + '\n';
            await writer.write(encoder.encode(line));
        }

        totalProcessed += result.results.length;
        offset += ARCHIVE_CONFIG.BATCH_SIZE;

        console.log(`  已处理: ${totalProcessed} 条`);

        // 如果读取的数量少于 BATCH_SIZE，说明已经读完
        if (result.results.length < ARCHIVE_CONFIG.BATCH_SIZE) {
            break;
        }
    }

    // 关闭写入流
    await writer.close();

    // 等待压缩完成
    await readPromise;

    // 合并所有压缩块
    const totalSize = compressedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const compressed = new Uint8Array(totalSize);
    let position = 0;
    for (const chunk of compressedChunks) {
        compressed.set(chunk, position);
        position += chunk.length;
    }

    console.log(`🗜️ 压缩完成: ${totalProcessed} 条 → ${formatBytes(compressed.byteLength)}`);

    // 上传到 R2
    await uploadToR2(env, r2Path, compressed.buffer);

    return compressed.byteLength;
}

/**
 * 上传到 R2
 * 
 * @param env 环境变量
 * @param key R2 键
 * @param data 数据（ArrayBuffer）
 */
async function uploadToR2(env: Env, key: string, data: ArrayBuffer): Promise<void> {
    // 检查 R2 绑定是否存在
    if (!env.R2_ARCHIVE) {
        throw new Error('R2_ARCHIVE binding is not configured');
    }

    await env.R2_ARCHIVE.put(key, data, {
        httpMetadata: {
            contentType: 'application/gzip',
            contentEncoding: 'gzip'
        },
        customMetadata: {
            archived_at: new Date().toISOString(),
            source: 'traffic_events'
        }
    });
}

/**
 * 创建归档元数据记录
 * 
 * @param env 环境变量
 * @param date 日期
 * @param status 状态
 */
async function createArchiveMetadata(
    env: Env,
    date: string,
    status: 'pending' | 'completed' | 'failed'
): Promise<void> {
    await env.D1.prepare(
        `INSERT OR REPLACE INTO archive_metadata 
     (date, r2_path, record_count, file_size_bytes, status, archived_at, d1_cleaned)
     VALUES (?, '', 0, 0, ?, ?, 0)`
    ).bind(date, status, Date.now()).run();
}

/**
 * 更新归档元数据记录
 * 
 * @param env 环境变量
 * @param date 日期
 * @param status 状态
 * @param recordCount 记录数
 * @param fileSizeBytes 文件大小
 * @param r2Path R2 路径
 * @param errorMessage 错误信息（可选）
 */
async function updateArchiveMetadata(
    env: Env,
    date: string,
    status: 'pending' | 'completed' | 'failed',
    recordCount: number,
    fileSizeBytes: number,
    r2Path: string,
    errorMessage?: string
): Promise<void> {
    await env.D1.prepare(
        `UPDATE archive_metadata 
     SET r2_path = ?, 
         record_count = ?, 
         file_size_bytes = ?, 
         status = ?, 
         error_message = ?,
         completed_at = ?
     WHERE date = ?`
    ).bind(
        r2Path,
        recordCount,
        fileSizeBytes,
        status,
        errorMessage || null,
        status === 'completed' ? Date.now() : null,
        date
    ).run();
}

/**
 * 从 R2 读取归档数据
 * 
 * @param env 环境变量
 * @param date 日期（YYYY-MM-DD）
 * @returns Promise<any[]> 事件数组
 */
export async function readArchiveFromR2(env: Env, date: string): Promise<any[]> {
    console.log(`📥 从 R2 读取归档: ${date}`);

    if (!env.R2_ARCHIVE) {
        throw new Error('R2_ARCHIVE binding is not configured');
    }

    const r2Path = `${ARCHIVE_CONFIG.R2_PREFIX}/${date}.jsonl.gz`;
    const object = await env.R2_ARCHIVE.get(r2Path);

    if (!object) {
        throw new Error(`Archive not found: ${r2Path}`);
    }

    // 解压缩
    const compressedStream = object.body;
    const decompressedStream = compressedStream.pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(decompressedStream).text();

    // 解析 JSONL
    const lines = text.trim().split('\n');
    const events = lines.map(line => JSON.parse(line));

    console.log(`✅ 读取到 ${events.length} 条事件`);
    return events;
}

/**
 * 辅助函数：格式化字节数
 * 
 * @param bytes 字节数
 * @returns 格式化字符串
 */
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

