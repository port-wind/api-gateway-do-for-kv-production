import { Hono } from 'hono';
import type { Env } from '../../types/env';
import { createRequestLogger } from '../../lib/logger';

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /global-stats - 获取全局统计数据
 */
app.get('/global-stats', async (c) => {
  try {
    const logger = createRequestLogger(c);
    logger.info('获取全局统计数据');

    const aggregatorId = c.env.GLOBAL_STATS_AGGREGATOR.idFromName('singleton');
    const aggregator = c.env.GLOBAL_STATS_AGGREGATOR.get(aggregatorId);
    
    return await aggregator.fetch(new Request('http://dummy/global-stats'));
  } catch (error) {
    const logger = createRequestLogger(c);
    logger.error('获取全局统计失败', logger.context, error as Error);
    
    return c.json({
      success: false,
      error: 'GLOBAL_STATS_FAILED',
      message: error instanceof Error ? error.message : '未知错误'
    }, 500);
  }
});

/**
 * GET /top-paths - 获取热门路径
 */
app.get('/top-paths', async (c) => {
  try {
    const logger = createRequestLogger(c);
    const limit = c.req.query('limit') || '10';
    const timeRange = c.req.query('timeRange') || '24h';
    
    logger.info('获取热门路径', { limit, timeRange });

    const aggregatorId = c.env.GLOBAL_STATS_AGGREGATOR.idFromName('singleton');
    const aggregator = c.env.GLOBAL_STATS_AGGREGATOR.get(aggregatorId);
    
    const url = new URL('http://dummy/top-paths');
    url.searchParams.set('limit', limit);
    url.searchParams.set('timeRange', timeRange);
    
    return await aggregator.fetch(url.toString());
  } catch (error) {
    const logger = createRequestLogger(c);
    logger.error('获取热门路径失败', logger.context, error as Error);
    
    return c.json({
      success: false,
      error: 'TOP_PATHS_FAILED',
      message: error instanceof Error ? error.message : '未知错误'
    }, 500);
  }
});

/**
 * GET /top-ips - 获取热门IP地址
 */
app.get('/top-ips', async (c) => {
  try {
    const logger = createRequestLogger(c);
    const limit = c.req.query('limit') || '10';
    const timeRange = c.req.query('timeRange') || '24h';
    
    logger.info('获取热门IP', { limit, timeRange });

    const aggregatorId = c.env.GLOBAL_STATS_AGGREGATOR.idFromName('singleton');
    const aggregator = c.env.GLOBAL_STATS_AGGREGATOR.get(aggregatorId);
    
    const url = new URL('http://dummy/top-ips');
    url.searchParams.set('limit', limit);
    url.searchParams.set('timeRange', timeRange);
    
    return await aggregator.fetch(url.toString());
  } catch (error) {
    const logger = createRequestLogger(c);
    logger.error('获取热门IP失败', logger.context, error as Error);
    
    return c.json({
      success: false,
      error: 'TOP_IPS_FAILED',
      message: error instanceof Error ? error.message : '未知错误'
    }, 500);
  }
});

/**
 * GET /export - 数据导出
 */
app.get('/export', async (c) => {
  try {
    const logger = createRequestLogger(c);
    const format = c.req.query('format') || 'json';
    const dateRange = c.req.query('dateRange') || '7d';
    
    logger.info('导出数据', { format, dateRange });

    const aggregatorId = c.env.GLOBAL_STATS_AGGREGATOR.idFromName('singleton');
    const aggregator = c.env.GLOBAL_STATS_AGGREGATOR.get(aggregatorId);
    
    const url = new URL('http://dummy/export-data');
    url.searchParams.set('format', format);
    url.searchParams.set('dateRange', dateRange);
    
    return await aggregator.fetch(url.toString());
  } catch (error) {
    const logger = createRequestLogger(c);
    logger.error('数据导出失败', logger.context, error as Error);
    
    return c.json({
      success: false,
      error: 'EXPORT_FAILED',
      message: error instanceof Error ? error.message : '未知错误'
    }, 500);
  }
});

/**
 * GET /aggregator-status - 获取聚合器状态
 */
app.get('/aggregator-status', async (c) => {
  try {
    const logger = createRequestLogger(c);
    logger.info('获取聚合器状态');

    const aggregatorId = c.env.GLOBAL_STATS_AGGREGATOR.idFromName('singleton');
    const aggregator = c.env.GLOBAL_STATS_AGGREGATOR.get(aggregatorId);
    
    return await aggregator.fetch(new Request('http://dummy/status'));
  } catch (error) {
    const logger = createRequestLogger(c);
    logger.error('获取聚合器状态失败', logger.context, error as Error);
    
    return c.json({
      success: false,
      error: 'AGGREGATOR_STATUS_FAILED',
      message: error instanceof Error ? error.message : '未知错误'
    }, 500);
  }
});

/**
 * POST /refresh-cache - 刷新缓存
 */
app.post('/refresh-cache', async (c) => {
  try {
    const logger = createRequestLogger(c);
    logger.info('刷新聚合器缓存');

    // 通过重新请求全局统计来刷新缓存
    const aggregatorId = c.env.GLOBAL_STATS_AGGREGATOR.idFromName('singleton');
    const aggregator = c.env.GLOBAL_STATS_AGGREGATOR.get(aggregatorId);
    
    // 先获取当前状态
    const statusResponse = await aggregator.fetch(new Request('http://dummy/status'));
    const statusData = await statusResponse.json() as any;
    
    // 重新获取全局统计（这会刷新缓存）
    const statsResponse = await aggregator.fetch(new Request('http://dummy/global-stats'));
    const statsData = await statsResponse.json() as any;
    
    return c.json({
      success: true,
      message: '缓存已刷新',
      previousCacheStats: statusData.cache,
      newStats: {
        totalRequests: statsData.data?.totalRequests || 0,
        totalActiveIPs: statsData.data?.totalActiveIPs || 0,
        cached: statsData.cached || false
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const logger = createRequestLogger(c);
    logger.error('刷新缓存失败', logger.context, error as Error);
    
    return c.json({
      success: false,
      error: 'REFRESH_CACHE_FAILED',
      message: error instanceof Error ? error.message : '未知错误'
    }, 500);
  }
});

export default app;