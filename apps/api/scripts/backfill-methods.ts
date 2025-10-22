/**
 * Backfill Script: 批量修复 unified-paths:list 中的 method 字段
 * 
 * 问题：历史数据中所有路径的 method 都被默认设置为 'GET'
 * 解决：从 traffic_events 表查询实际使用的 method，批量更新配置
 * 
 * 使用方法：
 *   wrangler dev --local --test-scheduled  # 本地测试
 *   wrangler deploy                         # 部署
 *   curl -X POST https://your-worker.workers.dev/__backfill-methods  # 触发
 */

import type { Env } from '../src/types/env';
import type { UnifiedPathConfig } from '../src/types/config';

interface BackfillResult {
    totalPaths: number;
    queriedPaths: number;
    updatedPaths: number;
    errors: number;
    details: Array<{
        path: string;
        oldMethod?: string;
        newMethod: string;
        source: 'traffic_events' | 'inference';
    }>;
}

/**
 * 批量修复 method 字段
 */
export async function backfillMethods(env: Env): Promise<BackfillResult> {
    console.log('========================================');
    console.log('🔧 开始批量修复 method 字段');
    console.log('========================================\n');

    const result: BackfillResult = {
        totalPaths: 0,
        queriedPaths: 0,
        updatedPaths: 0,
        errors: 0,
        details: []
    };

    try {
        // 步骤 1: 读取统一配置
        console.log('📖 读取 unified-paths:list...');
        const UNIFIED_PATHS_KEY = 'unified-paths:list';
        const stored = await env.API_GATEWAY_STORAGE.get(UNIFIED_PATHS_KEY, 'json');
        const configs = (stored as UnifiedPathConfig[]) || [];

        result.totalPaths = configs.length;
        console.log(`✅ 读取到 ${configs.length} 个路径配置\n`);

        if (configs.length === 0) {
            console.log('⚠️ 没有配置需要修复');
            return result;
        }

        // 步骤 2: 从 traffic_events 查询实际使用的 method
        // ⚠️ 关键：D1/SQLite 限制绑定参数最多 999 个，需要分块查询
        console.log('🔍 查询 traffic_events 表...');
        const paths = configs.map(c => c.path);
        const CHUNK_SIZE = 500; // 安全余量：使用 500 而不是 999
        const pathMethodMap = new Map<string, string>();
        const since60Days = Date.now() - 60 * 24 * 60 * 60 * 1000;

        console.log(`📊 开始分块查询: 总路径数=${paths.length}, 块大小=${CHUNK_SIZE}`);

        // 分块查询
        for (let i = 0; i < paths.length; i += CHUNK_SIZE) {
            const chunk = paths.slice(i, i + CHUNK_SIZE);
            const placeholders = chunk.map(() => '?').join(',');

            const query = `
                SELECT path, method, COUNT(*) as count
                FROM traffic_events
                WHERE path IN (${placeholders})
                  AND timestamp >= ?
                GROUP BY path, method
                ORDER BY path, count DESC
            `;

            const queryResult = await env.D1.prepare(query)
                .bind(...chunk, since60Days)
                .all<{ path: string; method: string; count: number }>();

            // 为每个路径选择最常用的 method
            let currentPath = '';
            let selectedMethod = '';

            for (const row of queryResult.results || []) {
                if (row.path !== currentPath) {
                    // 保存前一个路径的结果
                    if (currentPath && selectedMethod) {
                        pathMethodMap.set(currentPath, selectedMethod);
                    }
                    // 重置为新路径
                    currentPath = row.path;
                    selectedMethod = row.method;
                }
            }
            // 保存最后一个路径的结果
            if (currentPath && selectedMethod) {
                pathMethodMap.set(currentPath, selectedMethod);
            }

            const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
            const totalChunks = Math.ceil(paths.length / CHUNK_SIZE);
            console.log(`✅ 分块 ${chunkNum}/${totalChunks}: 查询了 ${chunk.length} 个路径，找到 ${queryResult.results?.length || 0} 个 method 记录`);
        }

        result.queriedPaths = pathMethodMap.size;
        console.log(`\n✅ 从 traffic_events 查询到 ${pathMethodMap.size} 个路径的 method\n`);

        // 步骤 3: 批量更新配置
        // ⚠️ 关键：只使用真实流量数据，不使用启发式推断
        // 推断可能错误且会被永久锁定（kv-snapshot不会覆盖非GET值）
        console.log('💾 更新配置...');
        for (const config of configs) {
            const oldMethod = config.method;
            const discoveredMethod = pathMethodMap.get(config.path);

            // 更新条件：
            // 1. 必须从 traffic_events 查询到真实 method
            // 2. 没有 method 或 method 是 GET（可能是错误的默认值）
            if (discoveredMethod && (!oldMethod || oldMethod === 'GET')) {
                config.method = discoveredMethod;
                config.metadata = config.metadata || {
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    source: 'auto'
                };
                config.metadata.updatedAt = new Date();

                result.updatedPaths++;
                result.details.push({
                    path: config.path,
                    oldMethod,
                    newMethod: discoveredMethod,
                    source: 'traffic_events'
                });
            }
        }

        console.log(`✅ 更新完成：${result.updatedPaths}/${result.totalPaths} 个路径\n`);

        // 步骤 4: 写回 KV
        console.log(`📝 写回 ${result.updatedPaths} 个更新到 KV...`);
        await env.API_GATEWAY_STORAGE.put(UNIFIED_PATHS_KEY, JSON.stringify(configs));
        console.log('✅ 配置已更新\n');

        // 打印详细信息（限制前 20 个）
        console.log('📋 更新详情（前 20 个）:');
        result.details.slice(0, 20).forEach(detail => {
            console.log(`  ${detail.path}: ${detail.oldMethod || '(无)'} → ${detail.newMethod} [${detail.source}]`);
        });
        if (result.details.length > 20) {
            console.log(`  ... 还有 ${result.details.length - 20} 个更新`);
        }

    } catch (error) {
        console.error('❌ 批量修复失败:', error);
        result.errors++;
        throw error;
    }

    console.log('\n========================================');
    console.log('✅ 批量修复完成');
    console.log(`   总路径数: ${result.totalPaths}`);
    console.log(`   查询到: ${result.queriedPaths}`);
    console.log(`   已更新: ${result.updatedPaths}`);
    console.log(`   错误数: ${result.errors}`);
    console.log('========================================\n');

    return result;
}

// Cloudflare Workers 入口
export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        // 触发端点
        if (url.pathname === '/__backfill-methods' && request.method === 'POST') {
            try {
                const result = await backfillMethods(env);
                return new Response(JSON.stringify({
                    success: true,
                    result
                }, null, 2), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (error) {
                return new Response(JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        return new Response('Backfill Methods Script\n\nUsage: POST /__backfill-methods', {
            status: 404
        });
    }
};

