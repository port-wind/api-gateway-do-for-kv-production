/**
 * 已废弃的 Durable Object 类
 * 
 * 这些类仅作为占位符存在，用于满足 Cloudflare Workers 的 migration 要求
 * 实际功能已在 Phase 3 中移除，不应该创建新的实例
 * 
 * Phase 3 迁移说明：
 * - PathCollector: 路径统计已迁移到 Queue + D1 + KV 架构
 * - GlobalStatsAggregator: 全局聚合已迁移到 Queue Consumer
 */

import { DurableObject } from 'cloudflare:workers';

/**
 * @deprecated Phase 3 - 路径收集功能已迁移到 Queue + D1
 * 此类仅作为 migration 占位符，不应创建新实例
 */
export class PathCollector extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    return new Response(
      JSON.stringify({
        error: 'PathCollector has been deprecated',
        message: 'Path collection has been migrated to Queue + D1 + KV architecture in Phase 3',
        migration: 'Please use the new /api/admin/paths API instead'
      }),
      {
        status: 410, // Gone
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * @deprecated Phase 3 - 全局聚合功能已迁移到 Queue Consumer
 * 此类仅作为 migration 占位符，不应创建新实例
 */
export class GlobalStatsAggregator extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    return new Response(
      JSON.stringify({
        error: 'GlobalStatsAggregator has been deprecated',
        message: 'Global stats aggregation has been migrated to Queue Consumer in Phase 3',
        migration: 'Data is now automatically aggregated by the queue consumer'
      }),
      {
        status: 410, // Gone
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

