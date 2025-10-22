/**
 * 集成测试 D1 数据库初始化辅助工具
 * 
 * 用法：
 * ```typescript
 * import { initializeD1ForTests } from './setup-d1';
 * 
 * describe('My Integration Test', () => {
 *   initializeD1ForTests();  // 自动注册 beforeAll 和 afterAll
 *   
 *   it('should work', async ({ env }) => {
 *     // env.D1 已初始化并包含所有表
 *   });
 * });
 * ```
 */

import { beforeAll, afterAll } from 'vitest';

let d1Initialized = false;
let migrationError: Error | null = null;

// D1 迁移 SQL（直接嵌入，避免在 Workers 环境中使用 readFileSync）
const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS traffic_events (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 200,
  response_time REAL NOT NULL DEFAULT 0,
  client_ip_hash TEXT NOT NULL,
  user_agent TEXT,
  country TEXT,
  timestamp INTEGER NOT NULL,
  event_date TEXT NOT NULL,
  is_error INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_events_date ON traffic_events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_path_date ON traffic_events(path, event_date);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON traffic_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_id ON traffic_events(id);

CREATE TABLE IF NOT EXISTS path_stats_hourly (
  path TEXT NOT NULL,
  hour_bucket TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  sum_response_time REAL NOT NULL DEFAULT 0,
  count_response_time INTEGER NOT NULL DEFAULT 0,
  response_samples TEXT,
  ip_hashes TEXT,
  unique_ips_seen INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (path, hour_bucket)
);

CREATE INDEX IF NOT EXISTS idx_stats_hour ON path_stats_hourly(hour_bucket);
CREATE INDEX IF NOT EXISTS idx_stats_updated ON path_stats_hourly(updated_at);
CREATE INDEX IF NOT EXISTS idx_stats_requests ON path_stats_hourly(requests DESC);

CREATE TABLE IF NOT EXISTS archive_metadata (
  date TEXT PRIMARY KEY,
  r2_path TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  file_size_bytes INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  archived_at INTEGER NOT NULL,
  completed_at INTEGER,
  d1_cleaned INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_archive_status ON archive_metadata(status);
CREATE INDEX IF NOT EXISTS idx_archive_date ON archive_metadata(archived_at);

CREATE TABLE IF NOT EXISTS consumer_heartbeat (
  consumer_id TEXT PRIMARY KEY,
  last_heartbeat INTEGER NOT NULL,
  last_batch_size INTEGER,
  last_batch_duration_ms INTEGER,
  total_processed INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
`;

/**
 * 注册 D1 初始化钩子
 * 在测试套件开始前初始化 D1 表结构
 */
export function initializeD1ForTests() {
    beforeAll(async () => {
        // 动态导入 cloudflare:test（在测试运行时由 Vitest Workers Pool 提供）
        // @ts-expect-error - cloudflare:test 在测试环境中可用
        const { env } = await import('cloudflare:test');
        // 跳过已初始化的情况
        if (d1Initialized) {
            console.log('⏭️  D1 already initialized, skipping...');
            return;
        }

        // 如果之前初始化失败，抛出错误
        if (migrationError) {
            throw migrationError;
        }

        try {
            console.log('🔧 Initializing D1 database for integration tests...');

            // 使用嵌入的 SQL（避免 readFileSync）
            const migrationSQL = MIGRATION_SQL;

            // 将 SQL 分割成单独的语句
            const sqlStatements = migrationSQL
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0);

            // D1 batch 限制：最多 10 条语句/批次，需要分批执行
            const BATCH_SIZE = 10;
            let totalExecuted = 0;

            for (let i = 0; i < sqlStatements.length; i += BATCH_SIZE) {
                const batch = sqlStatements
                    .slice(i, i + BATCH_SIZE)
                    .map(s => env.D1.prepare(s));

                await env.D1.batch(batch);
                totalExecuted += batch.length;
                console.log(`  ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} statements`);
            }

            console.log(`✅ D1 migrations executed: ${totalExecuted} statements`);

            // 验证表是否创建成功
            const tables = await env.D1.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            ).all();

            const tableNames = tables.results?.map((row: any) => row.name) || [];
            console.log(`📊 D1 tables: ${tableNames.join(', ')}`);

            // 验证必需的表
            const requiredTables = ['traffic_events', 'path_stats_hourly', 'archive_metadata', 'consumer_heartbeat'];
            const missingTables = requiredTables.filter(table => !tableNames.includes(table));

            if (missingTables.length > 0) {
                throw new Error(`❌ Missing required D1 tables: ${missingTables.join(', ')}`);
            }

            d1Initialized = true;
            console.log('✅ D1 database initialized successfully');

        } catch (error) {
            migrationError = error as Error;
            console.error('❌ D1 initialization failed:', error);
            throw error;
        }
    });

    afterAll(async () => {
        // 动态导入 cloudflare:test（在测试运行时由 Vitest Workers Pool 提供）
        // @ts-expect-error - cloudflare:test 在测试环境中可用
        const { env } = await import('cloudflare:test');

        // 可选：清理测试数据
        // 注意：每个测试文件运行在隔离的环境中，通常不需要清理
        try {
            console.log('🧹 Cleaning up D1 test data...');
            await env.D1.batch([
                env.D1.prepare('DELETE FROM traffic_events'),
                env.D1.prepare('DELETE FROM path_stats_hourly'),
                env.D1.prepare('DELETE FROM archive_metadata'),
                env.D1.prepare('DELETE FROM consumer_heartbeat'),
            ]);
            console.log('✅ D1 test data cleaned');
        } catch (error) {
            // 静默失败，清理不是关键操作
            console.warn('⚠️ D1 cleanup warning:', error);
        }
    });
}

/**
 * 手动初始化 D1（用于高级用例）
 * 大多数情况下应使用 initializeD1ForTests()
 */
export async function setupD1Manually(env: any): Promise<void> {
    await env.D1.exec(MIGRATION_SQL);
}

