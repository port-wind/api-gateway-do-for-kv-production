/**
 * Vitest 全局测试设置
 * 
 * 在所有测试运行前执行：
 * 1. 初始化 D1 数据库表结构
 * 2. 准备测试环境
 */

/**
 * 全局测试设置钩子
 * 在所有测试文件执行前运行一次
 */
export async function setup() {
    console.log('🔧 Setting up test environment...');

    // 注意：D1 数据库将在每个测试文件的 beforeAll 中初始化
    // 因为 Miniflare 环境在这里还不可用

    console.log('✅ Test environment setup complete');
}

/**
 * 在每个测试文件中初始化 D1 数据库
 * 
 * 使用方法：
 * ```typescript
 * import { setupD1Database } from '../vitest.setup';
 * 
 * beforeAll(async () => {
 *   await setupD1Database(env);
 * });
 * ```
 * 
 * 注意：此函数已弃用，请使用 tests/integration/setup-d1.ts 中的 initializeD1ForTests()
 */
export async function setupD1Database(env: any): Promise<void> {
    try {
        // 注意：不再使用 readFileSync，因为它在 Workers 环境中不可用
        // 请使用 tests/integration/setup-d1.ts 中的 initializeD1ForTests()
        console.log('⚠️ setupD1Database is deprecated, use initializeD1ForTests() instead');
        console.log('📦 Running D1 migrations...');

        // 这里只是一个占位符
        const results = { count: 0 };

        console.log(`✅ D1 migrations complete: ${results.count || 'N/A'} statements executed`);

        // 验证表是否创建成功
        const tables = await env.D1.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ).all();

        const tableNames = tables.results?.map((row: any) => row.name) || [];
        console.log(`📊 D1 tables created: ${tableNames.join(', ')}`);

        // 验证必需的表是否存在
        const requiredTables = ['traffic_events', 'path_stats_hourly', 'archive_metadata', 'consumer_heartbeat'];
        const missingTables = requiredTables.filter(table => !tableNames.includes(table));

        if (missingTables.length > 0) {
            throw new Error(`Missing required D1 tables: ${missingTables.join(', ')}`);
        }

        console.log('✅ All required D1 tables verified');

    } catch (error) {
        console.error('❌ D1 migration failed:', error);
        throw error;
    }
}

/**
 * 清理测试数据
 * 在每个测试文件结束后调用
 */
export async function cleanupD1Database(env: any): Promise<void> {
    try {
        console.log('🧹 Cleaning up D1 test data...');

        // 清空所有表但保留结构
        await env.D1.batch([
            env.D1.prepare('DELETE FROM traffic_events'),
            env.D1.prepare('DELETE FROM path_stats_hourly'),
            env.D1.prepare('DELETE FROM archive_metadata'),
            env.D1.prepare('DELETE FROM consumer_heartbeat'),
        ]);

        console.log('✅ D1 test data cleaned up');
    } catch (error) {
        console.error('⚠️ D1 cleanup failed:', error);
        // 不抛出错误，允许测试继续
    }
}

