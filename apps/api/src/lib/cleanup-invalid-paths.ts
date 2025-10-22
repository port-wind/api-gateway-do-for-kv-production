/**
 * 清理 D1 中不匹配当前启用代理路由的历史路径数据
 * 
 * 使用方法：
 * npx wrangler dev --local --test-scheduled --env dev
 * 然后访问: /__scheduled?cron=cleanup-invalid-paths
 * 
 * 或者直接调用：
 * curl -X POST http://localhost:8787/api/admin/cleanup/invalid-paths
 */

import type { Env } from '../types/env';

/**
 * PathMatcher 的简化版本（与 path-matcher.ts 保持一致）
 */
function isPathMatchingPattern(path: string, pattern: string): boolean {
  try {
    if (!pattern) return false;

    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*');

    const regex = new RegExp(`^${regexPattern}(/|$)`);
    return regex.test(path);
  } catch (error) {
    console.warn('Error matching pattern:', pattern, error);
    return false;
  }
}

/**
 * 从 KV 获取当前启用的代理路由
 */
async function getEnabledProxyRoutes(env: Env): Promise<Array<{ id: string; pattern: string }>> {
  try {
    const PROXY_ROUTES_KEY = 'proxy-routes:list';
    const stored = await env.API_GATEWAY_STORAGE.get(PROXY_ROUTES_KEY, 'json');

    return ((stored as any[]) || [])
      .filter(r => r.enabled === true)
      .map(r => ({
        id: r.id,
        pattern: r.pattern
      }));
  } catch (error) {
    console.error('获取代理路由失败:', error);
    return [];
  }
}

/**
 * 检查路径是否匹配任何启用的代理路由
 */
function shouldKeepPath(path: string, enabledRoutes: Array<{ id: string; pattern: string }>): boolean {
  for (const route of enabledRoutes) {
    if (isPathMatchingPattern(path, route.pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * 执行清理
 */
export async function cleanupInvalidPaths(env: Env): Promise<{
  success: boolean;
  deletedCount: number;
  keptCount: number;
  invalidPaths: string[];
  enabledPatterns: string[];
  kvCleaned?: {
    before: number;
    after: number;
    removed: number;
  } | null;
}> {
  console.log('=== 开始清理无效路径数据 ===');

  // 1. 获取当前启用的代理路由
  const enabledRoutes = await getEnabledProxyRoutes(env);
  console.log('当前启用的代理路由:', enabledRoutes);

  if (enabledRoutes.length === 0) {
    console.warn('警告：没有启用的代理路由，跳过清理');
    return {
      success: false,
      deletedCount: 0,
      keptCount: 0,
      invalidPaths: [],
      enabledPatterns: []
    };
  }

  // 2. 从 D1 获取所有唯一路径（从聚合表和详细事件表）
  // 优化：使用 GROUP BY 代替 DISTINCT，利用主键索引
  // path_stats_hourly 的主键是 (path, hour_bucket)，GROUP BY path 会利用索引
  const pathsFromHourly = await env.D1.prepare(`
    SELECT path FROM path_stats_hourly GROUP BY path
  `).all();

  // traffic_events 有 idx_events_path_date 索引
  const pathsFromEvents = await env.D1.prepare(`
    SELECT path FROM traffic_events GROUP BY path
  `).all();

  // 合并并去重
  const allPathsSet = new Set<string>();
  for (const row of pathsFromHourly.results || []) {
    allPathsSet.add(row.path as string);
  }
  for (const row of pathsFromEvents.results || []) {
    allPathsSet.add(row.path as string);
  }

  const allPaths = Array.from(allPathsSet).sort();
  console.log(`D1 中共有 ${allPaths.length} 个唯一路径（聚合表: ${pathsFromHourly.results?.length || 0}, 事件表: ${pathsFromEvents.results?.length || 0}）`);

  // 🔥 性能检查：如果路径数量过大，记录警告
  if (allPaths.length > 5000) {
    console.warn(`警告：检测到大量路径 (${allPaths.length})，清理操作可能需要较长时间`);
  }

  // 3. 识别无效路径
  const invalidPaths: string[] = [];
  const validPaths: string[] = [];

  for (const path of allPaths) {
    if (shouldKeepPath(path, enabledRoutes)) {
      validPaths.push(path);
    } else {
      invalidPaths.push(path);
    }
  }

  console.log(`有效路径: ${validPaths.length}, 无效路径: ${invalidPaths.length}`);
  console.log('无效路径列表:', invalidPaths);

  if (invalidPaths.length === 0) {
    console.log('没有需要清理的无效路径');
    return {
      success: true,
      deletedCount: 0,
      keptCount: validPaths.length,
      invalidPaths: [],
      enabledPatterns: enabledRoutes.map(r => r.pattern)
    };
  }

  // 4. 删除无效路径的数据（分批处理）
  let deletedCount = 0;
  const batchSize = 50; // 每批处理 50 个路径

  for (let i = 0; i < invalidPaths.length; i += batchSize) {
    const batch = invalidPaths.slice(i, i + batchSize);
    const placeholders = batch.map(() => '?').join(',');

    // 删除 path_stats_hourly（聚合数据）
    const deleteHourlyQuery = `
      DELETE FROM path_stats_hourly 
      WHERE path IN (${placeholders})
    `;
    const hourlyResult = await env.D1.prepare(deleteHourlyQuery).bind(...batch).run();
    console.log(`从 path_stats_hourly 删除了 ${batch.length} 个路径的数据`);

    // 删除 traffic_events（详细事件数据）
    const deleteEventsQuery = `
      DELETE FROM traffic_events 
      WHERE path IN (${placeholders})
    `;
    const eventsResult = await env.D1.prepare(deleteEventsQuery).bind(...batch).run();
    console.log(`从 traffic_events 删除了 ${batch.length} 个路径的数据`);

    deletedCount += batch.length;
    console.log(`已处理 ${deletedCount}/${invalidPaths.length} 个无效路径`);
  }

  console.log('=== 步骤 5: 清理 KV unified-paths:list ===');

  // 从 KV 读取 unified-paths:list
  const UNIFIED_PATHS_KEY = 'unified-paths:list';
  console.log(`正在从 KV 读取 ${UNIFIED_PATHS_KEY}...`);
  const unifiedPathsStored = await env.API_GATEWAY_STORAGE.get(UNIFIED_PATHS_KEY, 'json');
  console.log(`KV 读取结果类型: ${typeof unifiedPathsStored}, 是数组: ${Array.isArray(unifiedPathsStored)}`);
  const unifiedPaths = (unifiedPathsStored as any[]) || [];

  console.log(`KV unified-paths:list 中有 ${unifiedPaths.length} 个路径配置`);

  let kvCleanupInfo = null;

  if (unifiedPaths.length > 0) {
    // 过滤出有效的路径配置
    const validUnifiedPaths = unifiedPaths.filter(item => {
      const path = item.path;
      return shouldKeepPath(path, enabledRoutes);
    });

    const removedFromKV = unifiedPaths.length - validUnifiedPaths.length;

    if (removedFromKV > 0) {
      // 更新 KV，只保留有效路径
      await env.API_GATEWAY_STORAGE.put(UNIFIED_PATHS_KEY, JSON.stringify(validUnifiedPaths));
      console.log(`从 unified-paths:list 移除了 ${removedFromKV} 个无效配置，保留 ${validUnifiedPaths.length} 个`);
    } else {
      console.log('unified-paths:list 中没有需要清理的配置');
    }

    kvCleanupInfo = {
      before: unifiedPaths.length,
      after: validUnifiedPaths.length,
      removed: removedFromKV
    };
  }

  console.log('=== 清理完成 ===');
  console.log(`D1 删除: ${deletedCount}, D1 保留: ${validPaths.length}`);

  return {
    success: true,
    deletedCount,
    keptCount: validPaths.length,
    invalidPaths,
    enabledPatterns: enabledRoutes.map(r => r.pattern),
    kvCleaned: kvCleanupInfo
  };
}

