/**
 * Phase 3: 新版路径 API 实现
 * 
 * 数据流：KV Snapshot → D1 Fallback
 * 性能：KV hit < 50ms, D1 fallback < 200ms
 */

import type { Env } from '../types/env';
import type { UnifiedPathConfig } from '../types/config';
import type { SnapshotConfig, PathStatsSnapshot } from './kv-snapshot';
import { generateAndSaveSnapshot } from './kv-snapshot';
import { getHourBucket } from './d1-writer';

// 快照最大年龄（超过此时间触发异步刷新）
const MAX_SNAPSHOT_AGE_MS = 10 * 60 * 1000; // 10 分钟

/**
 * 路径 API 查询选项
 */
export interface PathsQueryOptions {
  searchQuery: string;
  proxyId: string;
  page: number;
  limit: number;
}

/**
 * 路径 API 响应
 */
export interface PathsAPIResponse {
  success: boolean;
  data: UnifiedPathConfig[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  metadata: {
    dataSource: 'kv-snapshot' | 'd1-fallback' | 'do-legacy';
    version?: number;
    timestamp: string;
    ageSeconds?: number;
  };
  timestamp: string;
}

/**
 * 从 KV Snapshot 读取路径统计（主路径）
 * 
 * @param env 环境变量
 * @param options 查询选项
 * @param logger 日志记录器
 * @returns PathsAPIResponse
 */
export async function readPathsFromKV(
  env: Env,
  options: PathsQueryOptions,
  logger: any
): Promise<PathsAPIResponse> {
  const { searchQuery, proxyId, page, limit } = options;

  try {
    // Step 1: 读取 KV 快照配置
    const snapshotConfig = await env.API_GATEWAY_STORAGE.get(
      'snapshot:config',
      'json'
    ) as SnapshotConfig | null;

    if (!snapshotConfig) {
      logger.warn('KV snapshot:config not found, falling back to D1');
      return await readPathsFromD1(env, options, logger);
    }

    // Step 2: 检查快照新鲜度
    const snapshotAge = Date.now() - snapshotConfig.timestamp;

    if (snapshotAge > MAX_SNAPSHOT_AGE_MS) {
      logger.warn('KV snapshot stale', { ageMinutes: snapshotAge / 60000 });
      // 异步触发快照刷新，但仍然返回旧数据（SWR）
      // 注意：不使用 waitUntil，因为这个函数可能不在请求上下文中调用
      void generateAndSaveSnapshot(env).catch(err => {
        logger.error('Failed to trigger snapshot refresh', err);
      });
    }

    // Step 3: 读取快照数据
    const snapshot = await env.API_GATEWAY_STORAGE.get(
      'snapshot:latest',
      'json'
    ) as PathStatsSnapshot[] | null;

    if (!snapshot || snapshot.length === 0) {
      logger.warn('KV snapshot:latest empty, falling back to D1');
      return await readPathsFromD1(env, options, logger);
    }

    logger.info('KV snapshot hit', {
      version: snapshotConfig.version,
      pathCount: snapshot.length,
      ageMinutes: snapshotAge / 60000
    });

    // Step 4: 合并快照数据与静态配置
    const unifiedPaths = await getUnifiedPathsFromKV(env);
    const mergedPaths = mergeSnapshotWithConfigs(snapshot, unifiedPaths);

    // Step 5: 搜索、过滤、分页
    let filteredPaths = mergedPaths;
    if (searchQuery) {
      filteredPaths = filteredPaths.filter(p =>
        p.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.proxyPattern && p.proxyPattern.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }
    if (proxyId) {
      filteredPaths = filteredPaths.filter(p => p.proxyId === proxyId);
    }

    // 排序：按请求数降序
    filteredPaths.sort((a, b) => (b.requestCount || 0) - (a.requestCount || 0));

    const total = filteredPaths.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedPaths = filteredPaths.slice(startIndex, startIndex + limit);

    return {
      success: true,
      data: paginatedPaths,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      metadata: {
        dataSource: 'kv-snapshot',
        version: snapshotConfig.version,
        timestamp: new Date(snapshotConfig.timestamp).toISOString(),
        ageSeconds: Math.floor(snapshotAge / 1000)
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('KV snapshot read failed, falling back to D1', error as Error);
    return await readPathsFromD1(env, options, logger);
  }
}

/**
 * 从 D1 读取路径统计（Fallback 路径）
 * 
 * @param env 环境变量
 * @param options 查询选项
 * @param logger 日志记录器
 * @returns PathsAPIResponse
 */
export async function readPathsFromD1(
  env: Env,
  options: PathsQueryOptions,
  logger: any
): Promise<PathsAPIResponse> {
  const { searchQuery, proxyId, page, limit } = options;

  try {
    // 读取最近 24 小时的聚合数据
    const startHour = getHourBucket(Date.now() - 24 * 60 * 60 * 1000);

    // 构建查询 - 修复 SQL 语法：搜索过滤必须在 WHERE 子句中，GROUP BY 之前
    let query = `
      SELECT 
        path,
        SUM(requests) as requests,
        SUM(errors) as errors,
        MAX(updated_at) as last_updated
      FROM path_stats_hourly
      WHERE hour_bucket >= ?
    `;

    // 绑定参数
    const bindings: any[] = [startHour];

    // 添加搜索过滤（必须在 GROUP BY 之前）
    if (searchQuery) {
      query += ` AND path LIKE ?`;
      bindings.push(`%${searchQuery}%`);
    }

    query += ` GROUP BY path ORDER BY requests DESC LIMIT ? OFFSET ?`;
    bindings.push(limit, (page - 1) * limit);

    const result = await env.D1.prepare(query).bind(...bindings).all();

    // 转换 D1 结果为 UnifiedPathConfig
    const unifiedPaths = await getUnifiedPathsFromKV(env);
    const configMap = new Map(unifiedPaths.map(c => [c.path, c]));

    const paths = (result.results || []).map(row => {
      const existing = configMap.get(row.path as string);
      return {
        path: row.path as string,
        requestCount: row.requests as number,
        errorCount: row.errors as number,
        // last_updated 已经是毫秒级时间戳，不需要再乘以 1000
        lastAccessed: new Date(row.last_updated as number),
        cache: existing?.cache || { enabled: false },
        rateLimit: existing?.rateLimit || { enabled: false },
        geo: existing?.geo || { enabled: false },
        proxyId: existing?.proxyId,
        proxyPattern: existing?.proxyPattern,
        metadata: {
          createdAt: existing?.metadata?.createdAt || new Date(),
          updatedAt: new Date(),
          source: existing?.metadata?.source || 'auto'
        }
      } as UnifiedPathConfig;
    });

    // 代理过滤（在内存中过滤，因为 D1 查询中没有 proxyId）
    let filteredPaths = paths;
    if (proxyId) {
      filteredPaths = paths.filter(p => p.proxyId === proxyId);
    }

    logger.info('D1 fallback success', { pathCount: filteredPaths.length });

    return {
      success: true,
      data: filteredPaths,
      pagination: {
        page,
        limit,
        total: filteredPaths.length,
        totalPages: Math.ceil(filteredPaths.length / limit),
        hasNext: false, // D1 fallback 不支持精确分页
        hasPrev: page > 1
      },
      metadata: {
        dataSource: 'd1-fallback',
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('D1 fallback failed', error as Error);
    throw error;
  }
}

/**
 * 合并快照数据与静态配置
 * 
 * @param snapshot 快照数据
 * @param configs 静态配置
 * @returns 合并后的路径配置
 */
function mergeSnapshotWithConfigs(
  snapshot: PathStatsSnapshot[],
  configs: UnifiedPathConfig[]
): UnifiedPathConfig[] {
  const configMap = new Map(configs.map(c => [c.path, c]));

  return snapshot.map(snap => {
    const existing = configMap.get(snap.path);
    return {
      path: snap.path,
      requestCount: snap.requests,
      errorCount: snap.errors,
      lastAccessed: new Date(), // 快照中没有精确的 lastAccessed，使用当前时间
      cache: existing?.cache || { enabled: false },
      rateLimit: existing?.rateLimit || { enabled: false },
      geo: existing?.geo || { enabled: false },
      proxyId: existing?.proxyId,
      proxyPattern: existing?.proxyPattern,
      method: snap.method || existing?.method, // 优先使用快照的 method，再用配置的
      metadata: {
        createdAt: existing?.metadata?.createdAt || new Date(),
        updatedAt: new Date(),
        source: existing?.metadata?.source || 'auto'
      }
    } as UnifiedPathConfig;
  });
}

/**
 * 从 KV 获取统一路径配置
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

/**
 * 灰度配置
 */
export interface PathsAPIMigrationConfig {
  // 启用新版 API（KV Snapshot）的流量百分比 (0-100)
  newAPIPercentage: number;
  // 强制使用新 API 的 IP 列表（白名单测试）
  forceNewAPIIPs: string[];
  // 强制使用旧 API 的 IP 列表（回退灰名单）
  forceOldAPIIPs: string[];
  // 是否启用数据对比日志（比对 DO 和 D1 数据）
  enableComparison: boolean;
  // 最后更新时间
  updatedAt: string;
}

/**
 * 默认灰度配置
 */
export const DEFAULT_MIGRATION_CONFIG: PathsAPIMigrationConfig = {
  newAPIPercentage: 0, // 默认 0%，全部走旧 API
  forceNewAPIIPs: [],
  forceOldAPIIPs: [],
  enableComparison: false,
  updatedAt: new Date().toISOString()
};

/**
 * 判断是否使用新 API（KV Snapshot）
 * 
 * @param env 环境变量
 * @param clientIP 客户端 IP
 * @returns boolean
 */
export async function shouldUseNewAPI(
  env: Env,
  clientIP: string
): Promise<{ useNewAPI: boolean; reason: string }> {
  try {
    // 读取灰度配置
    const config = await env.API_GATEWAY_STORAGE.get(
      'migration:paths-api-config',
      'json'
    ) as PathsAPIMigrationConfig | null;

    const effectiveConfig = config || DEFAULT_MIGRATION_CONFIG;

    // 强制旧 API（回退）
    if (effectiveConfig.forceOldAPIIPs.includes(clientIP)) {
      return { useNewAPI: false, reason: 'forced-old' };
    }

    // 强制新 API（白名单）
    if (effectiveConfig.forceNewAPIIPs.includes(clientIP)) {
      return { useNewAPI: true, reason: 'forced-new' };
    }

    // 按百分比灰度
    const hash = await hashIP(clientIP);
    const percentage = hash % 100;
    const useNewAPI = percentage < effectiveConfig.newAPIPercentage;

    return {
      useNewAPI,
      reason: `canary-${percentage}/${effectiveConfig.newAPIPercentage}`
    };
  } catch (error) {
    console.error('Failed to determine API version:', error);
    // 错误时默认使用旧 API
    return { useNewAPI: false, reason: 'error-fallback' };
  }
}

/**
 * IP 哈希函数（用于灰度路由）
 * 
 * @param ip IP 地址
 * @returns number (0-255)
 */
async function hashIP(ip: string): Promise<number> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return hashArray[0]; // 取第一个字节 (0-255)
}

