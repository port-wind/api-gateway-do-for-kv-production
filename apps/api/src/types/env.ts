export interface Env {
  // Cloudflare Service Bindings
  // Uncomment the services you're using:

  // D1 Database（Phase 2: 路径统计持久化）
  D1: D1Database;

  // KV Namespace
  API_GATEWAY_STORAGE: KVNamespace;

  // R2 Bucket（Phase 2: 归档）
  R2_ARCHIVE: R2Bucket;

  // Durable Objects
  COUNTER: DurableObjectNamespace;
  RATE_LIMITER: DurableObjectNamespace;
  TRAFFIC_MONITOR: DurableObjectNamespace;
  PATH_COLLECTOR: DurableObjectNamespace;
  GLOBAL_STATS_AGGREGATOR: DurableObjectNamespace;

  // Analytics Engine
  TRAFFIC_ANALYTICS: AnalyticsEngineDataset;

  // Workers Queue（Phase 1: 路径统计重构）
  TRAFFIC_QUEUE: Queue;

  // Environment Variables
  // JWT_SECRET?: string;
  // API_KEY?: string;
  DEFAULT_RATE_LIMIT?: string;
  DEFAULT_RATE_WINDOW?: string;
  DEFAULT_CACHE_VERSION?: string;
  TRAFFIC_THRESHOLD?: string;
  USE_ANALYTICS_ENGINE?: string;
  TRAFFIC_SAMPLING_RATE?: string;
  PATH_COLLECTION_ENABLED?: string;
  USE_TRAFFIC_QUEUE?: string; // Phase 1: 控制是否使用队列

  // Custom environment variables
  // Add your own environment variables below
}