import type { Env } from '../types/env';
import { createRequestLogger } from './logger';

export interface TrafficDataPoint {
  path: string;
  clientIP: string;
  country?: string;
  city?: string;           // Cloudflare 返回的城市信息
  isCacheHit: boolean;
  responseTime: number;
  method: string;
  statusCode: number;
}

/**
 * 记录流量分析数据到 Analytics Engine
 * 支持采样率控制和向后兼容
 */
export async function recordTraffic(
  env: Env,
  ctx: ExecutionContext,
  data: TrafficDataPoint
): Promise<void> {
  const samplingRate = parseFloat(env.TRAFFIC_SAMPLING_RATE || '1.0');

  // 采样逻辑
  if (Math.random() > samplingRate) {
    return;
  }

  // 使用 Analytics Engine
  if (env.USE_ANALYTICS_ENGINE === 'true' && env.TRAFFIC_ANALYTICS) {
    ctx.waitUntil(
      Promise.resolve().then(() =>
        env.TRAFFIC_ANALYTICS.writeDataPoint({
          blobs: [
            data.path,                     // blob1: 请求路径
            data.clientIP,                 // blob2: 客户端 IP
            data.country || 'unknown',     // blob3: 国家代码
            data.method                    // blob4: HTTP 方法
          ],
          doubles: [
            1,                             // double1: 请求计数
            data.isCacheHit ? 1 : 0,      // double2: 缓存命中
            data.responseTime,             // double3: 响应时间
            data.statusCode                // double4: 状态码
          ],
          indexes: [
            // 5分钟时间窗口用于聚合分析
            Math.floor(Date.now() / (5 * 60 * 1000)).toString()
          ]
        })
      )
    );
  } else {
    // 向后兼容：使用原有 DO
    const id = env.TRAFFIC_MONITOR.idFromName('global');
    const trafficMonitor = env.TRAFFIC_MONITOR.get(id);

    const recordUrl = new URL('http://dummy/record');
    recordUrl.searchParams.set('path', data.path);
    recordUrl.searchParams.set('cache_hit', data.isCacheHit.toString());

    ctx.waitUntil(trafficMonitor.fetch(recordUrl.toString()));
  }
}

/**
 * 查询流量统计数据
 * 注意：实际查询需要通过 Cloudflare API，这里返回查询结构
 */
export async function queryTrafficStats(
  env: Env,
  timeRange: string = '5 MINUTE'
): Promise<{
  query: string;
  result: {
    total_requests: number;
    cache_hits: number;
    cache_hit_rate: number;
    avg_response_time: number;
    unique_ips: number;
    p50_latency: number;
    p95_latency: number;
    p99_latency: number;
  }
}> {
  if (!env.TRAFFIC_ANALYTICS) {
    throw new Error('Analytics Engine not configured');
  }

  const query = `
    SELECT 
      COUNT(*) as total_requests,
      SUM(double2) as cache_hits,
      ROUND(SUM(double2) * 100.0 / COUNT(*), 2) as cache_hit_rate,
      ROUND(AVG(double3), 2) as avg_response_time,
      COUNT(DISTINCT blob2) as unique_ips,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY double3) as p50_latency,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY double3) as p95_latency,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY double3) as p99_latency
    FROM api_traffic
    WHERE timestamp > NOW() - INTERVAL '${timeRange}'
  `.trim();

  // 注意：实际查询需要通过 Cloudflare Analytics API
  // 这里返回模拟数据用于开发和演示
  return {
    query,
    result: {
      total_requests: 0,
      cache_hits: 0,
      cache_hit_rate: 0,
      avg_response_time: 0,
      unique_ips: 0,
      p50_latency: 0,
      p95_latency: 0,
      p99_latency: 0
    }
  };
}

/**
 * 获取最受欢迎的路径统计
 */
export async function getTopPaths(
  env: Env,
  limit: number = 10,
  timeRange: string = '1 HOUR'
): Promise<{
  query: string;
  result: Array<{
    path: string;
    requests: number;
    avg_response_time: number;
    cache_hit_rate: number;
  }>
}> {
  if (!env.TRAFFIC_ANALYTICS) {
    throw new Error('Analytics Engine not configured');
  }

  const query = `
    SELECT 
      blob1 as path,
      COUNT(*) as requests,
      ROUND(AVG(double3), 2) as avg_response_time,
      ROUND(SUM(double2) * 100.0 / COUNT(*), 2) as cache_hit_rate
    FROM api_traffic
    WHERE timestamp > NOW() - INTERVAL '${timeRange}'
    GROUP BY blob1
    ORDER BY requests DESC
    LIMIT ${limit}
  `.trim();

  return {
    query,
    result: []
  };
}

/**
 * 获取错误状态码统计
 */
export async function getErrorStats(
  env: Env,
  timeRange: string = '1 HOUR'
): Promise<{
  query: string;
  result: Array<{
    status_code: number;
    count: number;
    percentage: number;
  }>
}> {
  if (!env.TRAFFIC_ANALYTICS) {
    throw new Error('Analytics Engine not configured');
  }

  const query = `
    SELECT 
      double4 as status_code,
      COUNT(*) as count,
      ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM api_traffic WHERE timestamp > NOW() - INTERVAL '${timeRange}'), 2) as percentage
    FROM api_traffic
    WHERE timestamp > NOW() - INTERVAL '${timeRange}'
      AND double4 >= 400
    GROUP BY double4
    ORDER BY count DESC
  `.trim();

  return {
    query,
    result: []
  };
}

/**
 * 获取地理位置分析
 */
export async function getGeoStats(
  env: Env,
  timeRange: string = '24 HOUR'
): Promise<{
  query: string;
  result: Array<{
    country: string;
    requests: number;
    avg_response_time: number;
  }>
}> {
  if (!env.TRAFFIC_ANALYTICS) {
    throw new Error('Analytics Engine not configured');
  }

  const query = `
    SELECT 
      blob3 as country,
      COUNT(*) as requests,
      ROUND(AVG(double3), 2) as avg_response_time
    FROM api_traffic
    WHERE timestamp > NOW() - INTERVAL '${timeRange}'
      AND blob3 != 'unknown'
    GROUP BY blob3
    ORDER BY requests DESC
    LIMIT 20
  `.trim();

  return {
    query,
    result: []
  };
}

/**
 * 检查 Analytics Engine 是否可用
 */
export function isAnalyticsEngineEnabled(env: Env): boolean {
  return env.USE_ANALYTICS_ENGINE === 'true' && !!env.TRAFFIC_ANALYTICS;
}

/**
 * 获取当前采样率
 */
export function getSamplingRate(env: Env): number {
  return parseFloat(env.TRAFFIC_SAMPLING_RATE || '1.0');
}