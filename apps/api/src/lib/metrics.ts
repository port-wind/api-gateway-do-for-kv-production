/**
 * 性能监控和指标收集工具
 * 用于 Cloudflare Workers 的高性能指标收集
 */

import { logger, LogContext } from './logger';
import type { Env } from '../types/env';

export interface TimingMeasurement {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface PerformanceMetrics {
  requestDuration: number;
  proxyDuration?: number;
  cacheLookupDuration?: number;
  rateLimitCheckDuration?: number;
  geoCheckDuration?: number;
  kvReadDuration?: number;
  kvWriteDuration?: number;
  upstreamResponseTime?: number;
}

/**
 * 无状态性能计时器工具函数
 * 符合 Worker 无状态原则，不使用类内部状态
 */

/**
 * 开始一个性能测量，返回测量对象
 */
export function createTimer(name: string, metadata?: Record<string, any>): TimingMeasurement {
  return {
    name,
    startTime: performance.now(),
    metadata
  };
}

/**
 * 结束性能测量，返回持续时间
 */
export function endTimer(measurement: TimingMeasurement): number {
  const endTime = performance.now();
  const duration = endTime - measurement.startTime;

  measurement.endTime = endTime;
  measurement.duration = duration;

  return duration;
}

/**
 * 记录一个即时测量（无状态版本）
 */
export function recordTiming(name: string, duration: number, metadata?: Record<string, any>): TimingMeasurement {
  const now = performance.now();
  return {
    name,
    startTime: now - duration,
    endTime: now,
    duration,
    metadata
  };
}

/**
 * 获取简单的性能摘要
 */
export function getTimingSummary(measurements: TimingMeasurement[]): Record<string, number> {
  const summary: Record<string, number> = {};
  
  for (const measurement of measurements) {
    if (measurement.duration !== undefined) {
      summary[measurement.name] = measurement.duration;
    }
  }
  
  return summary;
}

/**
 * 性能监控装饰器（无状态版本）
 */
export function measureTime(name: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const timer = createTimer(name);

      try {
        const result = await originalMethod.apply(this, args);
        const duration = endTimer(timer);
        
        logger.logPerformanceMetric(`method_${name}`, duration, 'ms');
        
        return result;
      } catch (error) {
        endTimer(timer);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * 异步函数计时辅助函数
 */
export async function timeAsync<T>(
  name: string,
  fn: () => Promise<T>,
  context?: LogContext
): Promise<T> {
  const startTime = performance.now();
  
  try {
    const result = await fn();
    const duration = performance.now() - startTime;
    
    logger.logPerformanceMetric(name, duration, 'ms', context);
    
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    
    logger.logPerformanceMetric(name, duration, 'ms', {
      ...context,
      error: true
    });
    
    throw error;
  }
}

/**
 * 同步函数计时辅助函数
 */
export function timeSync<T>(
  name: string,
  fn: () => T,
  context?: LogContext
): T {
  const startTime = performance.now();
  
  try {
    const result = fn();
    const duration = performance.now() - startTime;
    
    logger.logPerformanceMetric(name, duration, 'ms', context);
    
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    
    logger.logPerformanceMetric(name, duration, 'ms', {
      ...context,
      error: true
    });
    
    throw error;
  }
}

/**
 * 内存使用监控
 */
export class MemoryMonitor {
  private static measurements: Array<{
    timestamp: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  }> = [];

  public static recordMemoryUsage(): void {
    // 注意：Cloudflare Workers 中的内存监控有限
    // 这里我们记录时间戳，实际的内存使用情况会在日志中体现
    this.measurements.push({
      timestamp: Date.now(),
      heapUsed: 0, // Workers 中无法直接获取
      heapTotal: 0,
      external: 0
    });

    // 保持最近 100 个记录
    if (this.measurements.length > 100) {
      this.measurements.shift();
    }
  }

  public static getMemoryStats(): {
    measurements: number;
    timespan: number;
  } {
    if (this.measurements.length === 0) {
      return { measurements: 0, timespan: 0 };
    }

    const first = this.measurements[0];
    const last = this.measurements[this.measurements.length - 1];

    return {
      measurements: this.measurements.length,
      timespan: last.timestamp - first.timestamp
    };
  }
}

/**
 * 系统健康检查指标
 */
export interface HealthMetrics {
  uptime: number;
  requestCount: number;
  errorCount: number;
  averageResponseTime: number;
  cacheHitRate: number;
  rateLimitHits: number;
}

/**
 * 健康指标收集器
 */
export class HealthMetricsCollector {
  private static instance: HealthMetricsCollector;
  private startTime = Date.now();
  private requestCount = 0;
  private errorCount = 0;
  private responseTimes: number[] = [];
  private cacheHits = 0;
  private cacheMisses = 0;
  private rateLimitHits = 0;

  public static getInstance(): HealthMetricsCollector {
    if (!HealthMetricsCollector.instance) {
      HealthMetricsCollector.instance = new HealthMetricsCollector();
    }
    return HealthMetricsCollector.instance;
  }

  public recordRequest(responseTime: number, isError: boolean = false): void {
    this.requestCount++;
    this.responseTimes.push(responseTime);
    
    // 保持最近 1000 个响应时间记录
    if (this.responseTimes.length > 1000) {
      this.responseTimes.shift();
    }

    if (isError) {
      this.errorCount++;
    }
  }

  public recordCacheHit(): void {
    this.cacheHits++;
  }

  public recordCacheMiss(): void {
    this.cacheMisses++;
  }

  public recordRateLimitHit(): void {
    this.rateLimitHits++;
  }

  public getHealthMetrics(): HealthMetrics {
    const totalCacheRequests = this.cacheHits + this.cacheMisses;
    const cacheHitRate = totalCacheRequests > 0 ? 
      (this.cacheHits / totalCacheRequests) * 100 : 0;

    const averageResponseTime = this.responseTimes.length > 0 ?
      this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length : 0;

    return {
      uptime: Date.now() - this.startTime,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      averageResponseTime,
      cacheHitRate,
      rateLimitHits: this.rateLimitHits
    };
  }

  public logHealthMetrics(context?: LogContext): void {
    const metrics = this.getHealthMetrics();
    
    logger.info('Health metrics snapshot', {
      ...context,
      metrics,
      event: 'health_metrics'
    });
  }

  public reset(): void {
    this.requestCount = 0;
    this.errorCount = 0;
    this.responseTimes = [];
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.rateLimitHits = 0;
    this.startTime = Date.now();
  }
}

/**
 * 性能基准测试工具
 */
/**
 * 无状态性能基准测试函数
 */
export async function runBenchmark<T>(
  name: string,
  fn: () => Promise<T>,
  iterations: number = 10
): Promise<{
  average: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
  times: number[];
}> {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const startTime = performance.now();
    await fn();
    const duration = performance.now() - startTime;
    times.push(duration);
  }

  // 排序以计算百分位数
  const sortedTimes = [...times].sort((a, b) => a - b);
  
  const average = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)];
  const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
  const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)];

  const benchmarkResult = { average, min, max, p50, p95, p99, times };

  logger.info(`Benchmark results for ${name}`, {
    event: 'performance_benchmark',
    name,
    iterations,
    results: benchmarkResult
  });

  return benchmarkResult;
}

// 导出全局实例（保留 HealthMetricsCollector，因为它使用单例模式管理全局状态是可接受的）
export const healthMetrics = HealthMetricsCollector.getInstance();

// 便捷函数
export const recordRequest = healthMetrics.recordRequest.bind(healthMetrics);
export const recordCacheHit = healthMetrics.recordCacheHit.bind(healthMetrics);
export const recordCacheMiss = healthMetrics.recordCacheMiss.bind(healthMetrics);
export const recordRateLimitHit = healthMetrics.recordRateLimitHit.bind(healthMetrics);