import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    globals: true,
    // 全局 setup 文件
    setupFiles: ['./vitest.setup.ts'],
    // 使用 workers 池以获得真实的 Cloudflare Workers 环境
    poolOptions: {
      workers: {
        wrangler: {
          configPath: './wrangler.toml'
        },
        miniflare: {
          // 配置与 wrangler.toml 中的绑定相匹配
          kvNamespaces: ['API_GATEWAY_STORAGE'],
          durableObjects: {
            COUNTER: 'Counter',
            RATE_LIMITER: 'RateLimiter',
            TRAFFIC_MONITOR: 'TrafficMonitor'
          },
          // D1 数据库绑定（Phase 2: 路径统计持久化）
          d1Databases: {
            D1: 'path-stats-db'  // 测试环境使用内存数据库
          },
          // 为测试启用隔离存储
          compatibilityDate: '2024-06-25',
          compatibilityFlags: ['nodejs_compat']
        },
        // 为小型测试文件启用单个 worker 模式以提高性能
        singleWorker: true
      }
    },
    // 测试文件模式
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    // 测试超时设置
    testTimeout: 15000,
    hookTimeout: 15000,
    // 覆盖率配置 - 仅在明确启用时启用
    // 注意：@vitest/coverage-v8 与 Cloudflare Workers 环境不兼容
    coverage: {
      enabled: process.env.COVERAGE === 'true', // 只有明确设置为 'true' 时才启用
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      exclude: [
        'node_modules',
        'dist',
        'tests',
        'scripts',
        '**/*.config.*',
        '**/*.d.ts'
      ],
      // 覆盖率阈值 - 在 Workers 环境中会被忽略
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    }
  }
})