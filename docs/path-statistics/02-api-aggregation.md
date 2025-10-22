# API聚合查询系统设计

## 概述

本文档专注于设计跨 Durable Object 的数据聚合查询系统。由于 DO 是按 IP 隔离的，跨多个 DO 的数据聚合需要特殊的架构设计。

## 目录
- [设计挑战](#设计挑战)
- [全局统计聚合器](#全局统计聚合器)
- [活跃 IP 追踪机制](#活跃-ip-追踪机制)
- [聚合查询 API 路由](#聚合查询-api-路由)
- [缓存优化策略](#缓存优化策略)
- [性能优化](#性能优化)
- [错误处理](#错误处理)

## 设计挑战

### 核心问题
1. **DO 分布式特性**：每个 IP 一个 DO 实例，数据分散存储
2. **跨 DO 查询复杂性**：需要同时查询数百/数千个 DO 实例
3. **性能要求**：聚合查询不能影响正常请求性能
4. **一致性保证**：确保聚合数据的准确性和时效性

### 解决方案架构
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  PathCollector  │    │  PathCollector  │    │  PathCollector  │
│     DO (IP1)    │    │     DO (IP2)    │    │     DO (IP3)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
          │                        │                        │
          └────────────────────────┼────────────────────────┘
                                   │
                          ┌─────────────────┐
                          │  GlobalStats    │
                          │   Aggregator    │
                          │      DO         │
                          └─────────────────┘
                                   │
                          ┌─────────────────┐
                          │   API Routes    │
                          │ (Admin Panel)   │
                          └─────────────────┘
```

## 全局统计聚合器

### GlobalStatsAggregator DO 实现

```typescript
// 新建 src/durable-objects/GlobalStatsAggregator.ts
export class GlobalStatsAggregator extends DurableObject {
  private cache: Map<string, any> = new Map();
  private cacheExpiry: number = 5 * 60 * 1000; // 5分钟缓存

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.pathname.split('/').pop();

    switch (action) {
      case 'global-stats':
        return await this.getGlobalStats();
      case 'top-paths':
        return await this.getTopPaths(url);
      case 'top-ips':
        return await this.getTopIPs(url);
      case 'export-data':
        return await this.exportData(url);
      default:
        return new Response('Not Found', { status: 404 });
    }
  }

  private async getGlobalStats(): Promise<Response> {
    const cacheKey = 'global-stats';
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 从 KV 获取活跃 IP 列表（或者使用其他方式追踪）
    const activeIPs = await this.getActiveIPs();
    const stats: SystemStats = {
      totalRequests: 0,
      totalPaths: 0,
      totalActiveIPs: activeIPs.length,
      totalActiveDOs: 0,
      avgPathsPerIP: 0,
      topPaths: [],
      costMetrics: {
        estimatedDailyCost: 0,
        estimatedMonthlyCost: 0,
        doRequestCount: 0,
        activeDurationHours: 0
      }
    };

    // 并发查询所有活跃 IP 的统计数据
    const batchSize = 50; // 每批处理50个IP，避免超时
    const promises: Promise<any>[] = [];
    
    for (let i = 0; i < activeIPs.length; i += batchSize) {
      const batch = activeIPs.slice(i, i + batchSize);
      promises.push(this.processBatch(batch, stats));
    }

    await Promise.allSettled(promises);

    // 计算派生指标
    stats.avgPathsPerIP = stats.totalActiveIPs > 0 
      ? stats.totalPaths / stats.totalActiveIPs 
      : 0;

    // 缓存结果
    this.setCachedData(cacheKey, stats);

    return new Response(JSON.stringify(stats), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async processBatch(ipBatch: string[], stats: SystemStats): Promise<void> {
    const batchPromises = ipBatch.map(async (ip) => {
      try {
        const doId = this.env.PATH_COLLECTOR.idFromName(ip);
        const collector = this.env.PATH_COLLECTOR.get(doId);
        
        const statsUrl = new URL('http://dummy/stats');
        const response = await collector.fetch(statsUrl.toString());
        
        if (response.ok) {
          const ipStats = await response.json();
          
          // 聚合到全局统计
          stats.totalRequests += ipStats.totalRequests || 0;
          stats.totalPaths += ipStats.uniquePaths || 0;
          stats.totalActiveDOs++;
          
          return ipStats;
        }
      } catch (error) {
        console.warn(`Failed to fetch stats for IP ${ip}:`, error);
      }
      return null;
    });

    await Promise.allSettled(batchPromises);
  }

  private async getTopPaths(url: URL): Promise<Response> {
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const timeRange = url.searchParams.get('timeRange') || '24h';
    
    const cacheKey = `top-paths-${limit}-${timeRange}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const activeIPs = await this.getActiveIPs();
    const pathAggregation = new Map<string, {
      totalRequests: number;
      uniqueIPs: Set<string>;
      countries: Map<string, number>;
    }>();

    // 批量处理，聚合所有路径数据
    const batchSize = 30;
    for (let i = 0; i < activeIPs.length; i += batchSize) {
      const batch = activeIPs.slice(i, i + batchSize);
      await this.aggregatePathsBatch(batch, pathAggregation);
    }

    // 转换为排序的结果
    const topPaths = Array.from(pathAggregation.entries())
      .map(([pathKey, data]) => ({
        pathKey,
        totalRequests: data.totalRequests,
        uniqueIPs: data.uniqueIPs.size,
        avgRequestsPerIP: data.totalRequests / data.uniqueIPs.size,
        topCountries: Array.from(data.countries.entries())
          .map(([country, requests]) => ({
            country,
            requests,
            percentage: (requests / data.totalRequests) * 100
          }))
          .sort((a, b) => b.requests - a.requests)
          .slice(0, 5)
      }))
      .sort((a, b) => b.totalRequests - a.totalRequests)
      .slice(0, limit);

    this.setCachedData(cacheKey, { paths: topPaths, generatedAt: new Date().toISOString() });

    return new Response(JSON.stringify({ paths: topPaths }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async aggregatePathsBatch(
    ipBatch: string[], 
    pathAggregation: Map<string, any>
  ): Promise<void> {
    const batchPromises = ipBatch.map(async (ip) => {
      try {
        const doId = this.env.PATH_COLLECTOR.idFromName(ip);
        const collector = this.env.PATH_COLLECTOR.get(doId);
        
        const pathsUrl = new URL('http://dummy/paths');
        const response = await collector.fetch(pathsUrl.toString());
        
        if (response.ok) {
          const ipData = await response.json();
          
          // 聚合每个路径的数据
          for (const pathData of ipData.paths || []) {
            const pathKey = pathData.pathKey;
            
            if (!pathAggregation.has(pathKey)) {
              pathAggregation.set(pathKey, {
                totalRequests: 0,
                uniqueIPs: new Set<string>(),
                countries: new Map<string, number>()
              });
            }
            
            const aggregate = pathAggregation.get(pathKey)!;
            aggregate.totalRequests += pathData.count;
            aggregate.uniqueIPs.add(ip);
            
            if (pathData.country) {
              aggregate.countries.set(
                pathData.country,
                (aggregate.countries.get(pathData.country) || 0) + pathData.count
              );
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to fetch paths for IP ${ip}:`, error);
      }
    });

    await Promise.allSettled(batchPromises);
  }

  private async exportData(url: URL): Promise<Response> {
    const format = url.searchParams.get('format') || 'json';
    const dateRange = url.searchParams.get('dateRange') || '7d';
    
    const activeIPs = await this.getActiveIPs();
    const exportData: any[] = [];

    // 批量收集数据
    const batchSize = 20;
    for (let i = 0; i < activeIPs.length; i += batchSize) {
      const batch = activeIPs.slice(i, i + batchSize);
      const batchData = await this.collectExportBatch(batch, dateRange);
      exportData.push(...batchData);
    }

    if (format === 'csv') {
      const csv = this.convertToCSV(exportData);
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="path-stats-${dateRange}.csv"`
        }
      });
    }

    return new Response(JSON.stringify({
      exportedAt: new Date().toISOString(),
      dateRange,
      totalRecords: exportData.length,
      data: exportData
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async collectExportBatch(ipBatch: string[], dateRange: string): Promise<any[]> {
    const results: any[] = [];
    
    const promises = ipBatch.map(async (ip) => {
      try {
        const doId = this.env.PATH_COLLECTOR.idFromName(ip);
        const collector = this.env.PATH_COLLECTOR.get(doId);
        
        const pathsUrl = new URL('http://dummy/paths');
        const response = await collector.fetch(pathsUrl.toString());
        
        if (response.ok) {
          const ipData = await response.json();
          
          for (const pathData of ipData.paths || []) {
            results.push({
              ip: ip,
              pathKey: pathData.pathKey,
              method: pathData.method,
              count: pathData.count,
              firstSeen: pathData.firstSeen,
              lastAccessed: pathData.lastAccessed,
              country: pathData.country || 'unknown',
              userAgent: pathData.userAgent || 'unknown'
            });
          }
        }
      } catch (error) {
        console.warn(`Failed to export data for IP ${ip}:`, error);
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  private convertToCSV(data: any[]): string {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvHeaders = headers.join(',');
    
    const csvRows = data.map(row => 
      headers.map(header => {
        const value = row[header] || '';
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(',')
    );

    return [csvHeaders, ...csvRows].join('\n');
  }

  private async getActiveIPs(): Promise<string[]> {
    // 从 KV 或其他存储中获取活跃 IP 列表
    // 这里需要一个轻量级的 IP 追踪机制
    try {
      const activeIPsData = await this.env.API_GATEWAY_STORAGE.get('active-ips-list', 'json');
      return activeIPsData || [];
    } catch (error) {
      console.warn('Failed to get active IPs list:', error);
      return [];
    }
  }

  private getCachedData(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.cacheExpiry) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  private setCachedData(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
}
```

### 系统统计数据结构

```typescript
interface SystemStats {
  totalRequests: number;
  totalPaths: number;
  totalActiveIPs: number;
  totalActiveDOs: number;
  avgPathsPerIP: number;
  topPaths: GlobalPathStats[];
  costMetrics: {
    estimatedDailyCost: number;
    estimatedMonthlyCost: number;
    doRequestCount: number;
    activeDurationHours: number;
  };
}

interface GlobalPathStats {
  pathKey: string;
  totalRequests: number;
  uniqueIPs: number;
  avgRequestsPerIP: number;
  topCountries: Array<{
    country: string;
    requests: number;
    percentage: number;
  }>;
  recentActivity: {
    last24h: number;
    last7d: number;
    last30d: number;
  };
}
```

## 活跃 IP 追踪机制

### PathCollector DO 中的 IP 追踪

```typescript
// 在现有 PathCollector DO 中添加活跃 IP 追踪
export class PathCollectorDO extends DurableObject {
  // 现有代码...

  private async recordPath(url: URL): Promise<Response> {
    // 现有路径记录逻辑...
    
    // 异步更新活跃 IP 列表
    this.updateActiveIPsList(this.ipData.ip);
    
    return new Response(JSON.stringify({
      success: true,
      pathCount: pathStats.count,
      totalRequests: this.ipData.totalRequests
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private updateActiveIPsList(ip: string): void {
    // 使用 waitUntil 异步更新，不阻塞主请求
    this.ctx.waitUntil(
      (async () => {
        try {
          // 获取当前活跃 IP 列表
          const activeIPs = await this.env.API_GATEWAY_STORAGE.get('active-ips-list', 'json') as string[] || [];
          
          // 检查 IP 是否已存在
          if (!activeIPs.includes(ip)) {
            activeIPs.push(ip);
            
            // 限制列表大小，移除过期的 IP
            if (activeIPs.length > 10000) {
              // 只保留最近 10000 个 IP
              activeIPs.splice(0, activeIPs.length - 10000);
            }
            
            // 更新到 KV
            await this.env.API_GATEWAY_STORAGE.put('active-ips-list', JSON.stringify(activeIPs), {
              expirationTtl: 7 * 24 * 60 * 60 // 7天过期
            });
          }
        } catch (error) {
          console.warn('Failed to update active IPs list:', error);
        }
      })()
    );
  }
}
```

### 优化的 IP 追踪策略

```typescript
// 更高效的 IP 追踪实现
class ActiveIPTracker {
  private static readonly BATCH_SIZE = 100;
  private static readonly UPDATE_INTERVAL = 5 * 60 * 1000; // 5分钟
  private static readonly MAX_IPS = 50000; // 最大追踪 IP 数量
  
  private ipQueue: Set<string> = new Set();
  private lastUpdate: number = 0;
  
  async trackIP(env: Env, ip: string): Promise<void> {
    this.ipQueue.add(ip);
    
    // 批量更新策略
    if (this.ipQueue.size >= ActiveIPTracker.BATCH_SIZE || 
        Date.now() - this.lastUpdate > ActiveIPTracker.UPDATE_INTERVAL) {
      await this.flushIPQueue(env);
    }
  }
  
  private async flushIPQueue(env: Env): Promise<void> {
    if (this.ipQueue.size === 0) return;
    
    try {
      const newIPs = Array.from(this.ipQueue);
      this.ipQueue.clear();
      
      const existingIPs = await env.API_GATEWAY_STORAGE.get('active-ips-list', 'json') as string[] || [];
      const updatedIPs = [...new Set([...existingIPs, ...newIPs])];
      
      // 限制总数
      if (updatedIPs.length > ActiveIPTracker.MAX_IPS) {
        updatedIPs.splice(0, updatedIPs.length - ActiveIPTracker.MAX_IPS);
      }
      
      await env.API_GATEWAY_STORAGE.put('active-ips-list', JSON.stringify(updatedIPs), {
        expirationTtl: 7 * 24 * 60 * 60
      });
      
      this.lastUpdate = Date.now();
    } catch (error) {
      console.error('Failed to flush IP queue:', error);
    }
  }
}
```

## 聚合查询 API 路由

### 管理 API 路由实现

```typescript
// src/routes/admin/global-stats.ts
import { Hono } from 'hono';
import type { Env } from '../../types/env';

const app = new Hono<{ Bindings: Env }>();

// 获取全局统计数据
app.get('/global-stats', async (c) => {
  try {
    const aggregatorId = c.env.GLOBAL_STATS_AGGREGATOR.idFromName('singleton');
    const aggregator = c.env.GLOBAL_STATS_AGGREGATOR.get(aggregatorId);
    
    return await aggregator.fetch(new Request('http://dummy/global-stats'));
  } catch (error) {
    return c.json({ error: 'Failed to fetch global stats' }, 500);
  }
});

// 获取热门路径
app.get('/top-paths', async (c) => {
  try {
    const limit = c.req.query('limit') || '10';
    const timeRange = c.req.query('timeRange') || '24h';
    
    const aggregatorId = c.env.GLOBAL_STATS_AGGREGATOR.idFromName('singleton');
    const aggregator = c.env.GLOBAL_STATS_AGGREGATOR.get(aggregatorId);
    
    const url = new URL('http://dummy/top-paths');
    url.searchParams.set('limit', limit);
    url.searchParams.set('timeRange', timeRange);
    
    return await aggregator.fetch(url.toString());
  } catch (error) {
    return c.json({ error: 'Failed to fetch top paths' }, 500);
  }
});

// 获取热门 IP 地址
app.get('/top-ips', async (c) => {
  try {
    const limit = c.req.query('limit') || '10';
    const timeRange = c.req.query('timeRange') || '24h';
    
    const aggregatorId = c.env.GLOBAL_STATS_AGGREGATOR.idFromName('singleton');
    const aggregator = c.env.GLOBAL_STATS_AGGREGATOR.get(aggregatorId);
    
    const url = new URL('http://dummy/top-ips');
    url.searchParams.set('limit', limit);
    url.searchParams.set('timeRange', timeRange);
    
    return await aggregator.fetch(url.toString());
  } catch (error) {
    return c.json({ error: 'Failed to fetch top IPs' }, 500);
  }
});

// 数据导出
app.get('/export', async (c) => {
  try {
    const format = c.req.query('format') || 'json';
    const dateRange = c.req.query('dateRange') || '7d';
    
    const aggregatorId = c.env.GLOBAL_STATS_AGGREGATOR.idFromName('singleton');
    const aggregator = c.env.GLOBAL_STATS_AGGREGATOR.get(aggregatorId);
    
    const url = new URL('http://dummy/export-data');
    url.searchParams.set('format', format);
    url.searchParams.set('dateRange', dateRange);
    
    return await aggregator.fetch(url.toString());
  } catch (error) {
    return c.json({ error: 'Failed to export data' }, 500);
  }
});

// 获取聚合器状态
app.get('/aggregator-status', async (c) => {
  try {
    const aggregatorId = c.env.GLOBAL_STATS_AGGREGATOR.idFromName('singleton');
    const aggregator = c.env.GLOBAL_STATS_AGGREGATOR.get(aggregatorId);
    
    return await aggregator.fetch(new Request('http://dummy/status'));
  } catch (error) {
    return c.json({ error: 'Failed to fetch aggregator status' }, 500);
  }
});

export default app;
```

### 查询参数验证

```typescript
// src/schemas/aggregation.ts
import { z } from 'zod';

export const globalStatsQuerySchema = z.object({
  timeRange: z.enum(['1h', '24h', '7d', '30d']).default('24h'),
  includeMetrics: z.boolean().default(true),
  includeCosts: z.boolean().default(false)
});

export const topPathsQuerySchema = z.object({
  limit: z.number().min(1).max(100).default(10),
  timeRange: z.enum(['1h', '24h', '7d', '30d']).default('24h'),
  sortBy: z.enum(['requests', 'uniqueIPs', 'avgResponseTime']).default('requests')
});

export const exportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  dateRange: z.enum(['1d', '7d', '30d', '90d']).default('7d'),
  includeMetadata: z.boolean().default(true),
  compression: z.boolean().default(false)
});
```

## 缓存优化策略

### 多层缓存架构

```typescript
class AggregationCache {
  private memoryCache: Map<string, CacheEntry> = new Map();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5分钟
  
  interface CacheEntry {
    data: any;
    timestamp: number;
    ttl: number;
    size: number;
  }
  
  // 内存缓存（最快）
  getFromMemory(key: string): any | null {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.memoryCache.delete(key);
      return null;
    }
    
    return entry.data;
  }
  
  setToMemory(key: string, data: any, ttl: number = this.DEFAULT_TTL): void {
    // 估算数据大小
    const size = JSON.stringify(data).length;
    
    // 内存限制：不超过 50MB
    if (size > 50 * 1024 * 1024) {
      console.warn('Data too large for memory cache:', size);
      return;
    }
    
    this.memoryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      size
    });
    
    // 清理过期缓存
    this.cleanupExpiredEntries();
  }
  
  // KV 缓存（中等速度，持久化）
  async getFromKV(env: Env, key: string): Promise<any | null> {
    try {
      const cached = await env.API_GATEWAY_STORAGE.get(`cache:${key}`, 'json');
      if (!cached) return null;
      
      if (Date.now() - cached.timestamp > cached.ttl) {
        // 异步删除过期缓存
        env.API_GATEWAY_STORAGE.delete(`cache:${key}`);
        return null;
      }
      
      return cached.data;
    } catch (error) {
      console.warn('KV cache read error:', error);
      return null;
    }
  }
  
  async setToKV(env: Env, key: string, data: any, ttl: number = this.DEFAULT_TTL): Promise<void> {
    try {
      const cacheEntry = {
        data,
        timestamp: Date.now(),
        ttl
      };
      
      await env.API_GATEWAY_STORAGE.put(`cache:${key}`, JSON.stringify(cacheEntry), {
        expirationTtl: Math.floor(ttl / 1000)
      });
    } catch (error) {
      console.warn('KV cache write error:', error);
    }
  }
  
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.memoryCache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.memoryCache.delete(key);
      }
    }
  }
}
```

### 智能缓存策略

```typescript
class SmartCacheStrategy {
  // 根据查询频率和数据变化率动态调整缓存TTL
  calculateOptimalTTL(queryType: string, dataVolatility: number): number {
    const baseTTL = {
      'global-stats': 5 * 60 * 1000,      // 5分钟
      'top-paths': 10 * 60 * 1000,        // 10分钟
      'export-data': 30 * 60 * 1000,      // 30分钟
      'aggregator-status': 1 * 60 * 1000  // 1分钟
    };
    
    const base = baseTTL[queryType] || 5 * 60 * 1000;
    
    // 根据数据变化频率调整
    // dataVolatility: 0-1, 0=稳定, 1=高频变化
    const volatilityFactor = 1 - dataVolatility * 0.8;
    
    return Math.max(base * volatilityFactor, 60 * 1000); // 最少1分钟
  }
  
  // 预热关键缓存
  async preWarmCache(env: Env, aggregator: DurableObjectStub): Promise<void> {
    const criticalQueries = [
      'global-stats',
      'top-paths?limit=10&timeRange=24h',
      'aggregator-status'
    ];
    
    for (const query of criticalQueries) {
      try {
        await aggregator.fetch(`http://dummy/${query}`);
      } catch (error) {
        console.warn(`Failed to pre-warm cache for ${query}:`, error);
      }
    }
  }
}
```

## 性能优化

### 并发控制

```typescript
class ConcurrencyController {
  private activeBatches: Map<string, Promise<any>> = new Map();
  
  // 防止重复查询
  async deduplicateQuery(key: string, queryFn: () => Promise<any>): Promise<any> {
    if (this.activeBatches.has(key)) {
      // 如果已有相同查询在进行，等待结果
      return await this.activeBatches.get(key)!;
    }
    
    const queryPromise = queryFn();
    this.activeBatches.set(key, queryPromise);
    
    try {
      const result = await queryPromise;
      return result;
    } finally {
      this.activeBatches.delete(key);
    }
  }
  
  // 限制并发数
  async batchWithLimit<T>(
    items: T[], 
    processor: (item: T) => Promise<any>, 
    concurrencyLimit: number = 50
  ): Promise<any[]> {
    const results: any[] = [];
    
    for (let i = 0; i < items.length; i += concurrencyLimit) {
      const batch = items.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.allSettled(
        batch.map(processor)
      );
      
      results.push(...batchResults.map(r => 
        r.status === 'fulfilled' ? r.value : null
      ));
    }
    
    return results;
  }
}
```

### 查询超时处理

```typescript
class TimeoutHandler {
  static async withTimeout<T>(
    promise: Promise<T>, 
    timeoutMs: number, 
    fallbackValue?: T
  ): Promise<T> {
    const timeoutPromise = new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    
    try {
      return await Promise.race([promise, timeoutPromise]);
    } catch (error) {
      if (fallbackValue !== undefined) {
        console.warn('Operation timed out, using fallback value:', error);
        return fallbackValue;
      }
      throw error;
    }
  }
}
```

## 错误处理

### 降级策略

```typescript
class GracefulDegradation {
  // 部分数据可用时的处理
  static handlePartialFailure(
    results: Array<{ success: boolean; data?: any; error?: string }>,
    minimumSuccessRate: number = 0.7
  ): { data: any; warnings: string[] } {
    const successful = results.filter(r => r.success);
    const successRate = successful.length / results.length;
    
    if (successRate < minimumSuccessRate) {
      throw new Error(
        `Success rate ${successRate} below minimum ${minimumSuccessRate}`
      );
    }
    
    const warnings = results
      .filter(r => !r.success)
      .map(r => r.error || 'Unknown error');
    
    return {
      data: successful.map(r => r.data),
      warnings
    };
  }
  
  // 缓存降级
  static async withCacheAsBackup<T>(
    primaryFn: () => Promise<T>,
    cacheGetter: () => Promise<T | null>,
    maxAge: number = 30 * 60 * 1000 // 30分钟
  ): Promise<T> {
    try {
      return await primaryFn();
    } catch (error) {
      console.warn('Primary source failed, trying cache:', error);
      
      const cached = await cacheGetter();
      if (cached) {
        return cached;
      }
      
      throw error;
    }
  }
}
```

## 设计优势总结

这个 API 聚合查询系统的核心优势：

1. **分离关注点**：单独的聚合器 DO 专门处理跨 IP 的数据汇总
2. **缓存优化**：多层缓存（内存+KV）避免重复计算
3. **批量处理**：分批查询多个 DO，避免超时
4. **错误容错**：单个 IP 查询失败不影响整体结果
5. **灵活导出**：支持 JSON/CSV 格式导出
6. **轻量追踪**：高效的活跃 IP 列表维护
7. **智能缓存**：根据数据变化率动态调整缓存策略
8. **并发控制**：防止重复查询，限制并发数
9. **降级机制**：部分失败时仍能提供服务

## 下一步

继续实施后续阶段：

- **[03-data-management.md](./03-data-management.md)** - 数据管理与备份
- **[04-performance-testing.md](./04-performance-testing.md)** - 性能测试与优化
- **[05-monitoring-operations.md](./05-monitoring-operations.md)** - 监控与运维