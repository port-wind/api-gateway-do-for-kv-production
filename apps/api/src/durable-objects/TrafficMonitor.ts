import { DurableObject } from 'cloudflare:workers';
import type { TrafficStats } from '../types/config';

interface TrafficWindow {
  windowStart: number;
  requests: number;
  cacheHits: number;
  paths: Record<string, number>;
}

export class TrafficMonitor extends DurableObject {
  // 当前窗口
  private currentWindow: TrafficWindow;
  // 5 分钟中的毫秒数
  private windowSize: number = 5 * 60 * 1000;
  // 10000 次请求
  private alertThreshold: number = 10000;
  // 是否自动缓存
  private autoCache: boolean = false;

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);

    this.currentWindow = {
      windowStart: Date.now(),
      requests: 0,
      cacheHits: 0,
      paths: {}
    };

    // 从存储中初始化
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<{
        window: TrafficWindow;
        threshold: number;
        autoCache: boolean;
      }>('state');

      if (stored) {
        this.currentWindow = stored.window;
        this.alertThreshold = stored.threshold;
        this.autoCache = stored.autoCache;
      }
    });
  }

  /**
   * 处理流量监控请求
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      switch (path) {
        case '/record':
          return await this.recordRequest(url);
        case '/stats':
          return await this.getStats();
        case '/threshold':
          return await this.updateThreshold(request, url);
        case '/reset':
          return await this.reset();
        case '/auto-cache':
          return await this.toggleAutoCache(request);
        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      return new Response(`Error: ${error}`, { status: 500 });
    }
  }

  /**
   * 记录新的请求
   */
  private async recordRequest(url: URL): Promise<Response> {
    const path = url.searchParams.get('path') || '/';
    const isCacheHit = url.searchParams.get('cache_hit') === 'true';

    // 检查是否需要旋转窗口
    await this.rotateWindowIfNeeded();

    // 记录请求
    this.currentWindow.requests++;

    if (isCacheHit) {
      this.currentWindow.cacheHits++;
    }

    // 跟踪特定路径的请求
    this.currentWindow.paths[path] = (this.currentWindow.paths[path] || 0) + 1;

    // 保存状态
    await this.saveState();

    // 检查是否超出阈值并且自动缓存应该启用
    const shouldEnableAutoCache = this.currentWindow.requests >= this.alertThreshold;

    if (shouldEnableAutoCache && !this.autoCache) {
      this.autoCache = true;
      await this.saveState();
    }

    return new Response(JSON.stringify({
      recorded: true,
      currentRequests: this.currentWindow.requests,
      thresholdExceeded: shouldEnableAutoCache,
      autoCacheEnabled: this.autoCache
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * 获取当前流量统计
   */
  private async getStats(): Promise<Response> {
    await this.rotateWindowIfNeeded();

    const now = Date.now();
    const windowDurationMinutes = (now - this.currentWindow.windowStart) / 60000;
    const rpm = windowDurationMinutes > 0 ? this.currentWindow.requests / windowDurationMinutes : 0;

    // 从存储中获取历史峰值
    const historicalPeak = await this.ctx.storage.get<number>('peak_rpm') || 0;
    const currentPeak = Math.max(historicalPeak, rpm);

    if (currentPeak > historicalPeak) {
      await this.ctx.storage.put('peak_rpm', currentPeak);
    }

    const totalRequests = await this.ctx.storage.get<number>('total_requests') || 0;

    const cacheHitRate = this.currentWindow.requests > 0 ?
      (this.currentWindow.cacheHits / this.currentWindow.requests) * 100 : 0;

    const stats: TrafficStats = {
      currentRpm: Math.round(rpm),
      peakRpm: Math.round(currentPeak),
      totalRequests: totalRequests + this.currentWindow.requests,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      autoCache: this.autoCache
    };

    return new Response(JSON.stringify({
      stats,
      currentWindow: {
        start: new Date(this.currentWindow.windowStart).toISOString(),
        requests: this.currentWindow.requests,
        cacheHits: this.currentWindow.cacheHits,
        duration: windowDurationMinutes,
        threshold: this.alertThreshold,
        thresholdExceeded: this.currentWindow.requests >= this.alertThreshold
      },
      topPaths: this.getTopPaths()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * 更新阈值
   */
  private async updateThreshold(request: Request, url: URL): Promise<Response> {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({
        threshold: this.alertThreshold,
        autoCache: this.autoCache
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (request.method === 'PUT') {
      const newThreshold = parseInt(url.searchParams.get('threshold') || '0');

      if (newThreshold <= 0) {
        return new Response(JSON.stringify({
          error: 'Threshold must be a positive number'
        }), { status: 400 });
      }

      this.alertThreshold = newThreshold;
      await this.saveState();

      return new Response(JSON.stringify({
        threshold: this.alertThreshold,
        message: 'Threshold updated successfully'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Method not allowed', { status: 405 });
  }

  /**
   * 重置流量统计
   */
  private async reset(): Promise<Response> {
    this.currentWindow = {
      windowStart: Date.now(),
      requests: 0,
      cacheHits: 0,
      paths: {}
    };

    this.autoCache = false;
    await this.saveState();

    return new Response(JSON.stringify({
      message: 'Traffic statistics reset successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
  * 切换自动缓存模式
   */
  private async toggleAutoCache(request: Request): Promise<Response> {
    if (request.method === 'POST') {
      const body = await request.json() as { enabled: boolean };
      this.autoCache = body.enabled;
      await this.saveState();
    }

    return new Response(JSON.stringify({
      autoCache: this.autoCache,
      message: `Auto-cache ${this.autoCache ? 'enabled' : 'disabled'}`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * 旋转窗口如果足够的时间已经过去
   */
  private async rotateWindowIfNeeded(): Promise<void> {
    const now = Date.now();
    const windowAge = now - this.currentWindow.windowStart;

    if (windowAge >= this.windowSize) {
      // 归档当前窗口数据
      const totalRequests = await this.ctx.storage.get<number>('total_requests') || 0;
      await this.ctx.storage.put('total_requests', totalRequests + this.currentWindow.requests);

      // 存储窗口历史 (保留最后 24 个窗口 = 2 小时)
      const windowHistory = await this.ctx.storage.get<TrafficWindow[]>('window_history') || [];
      windowHistory.push(this.currentWindow);

      if (windowHistory.length > 24) {
        windowHistory.shift(); // 删除最旧的
      }

      await this.ctx.storage.put('window_history', windowHistory);

      // 重置为新窗口
      this.currentWindow = {
        windowStart: now,
        requests: 0,
        cacheHits: 0,
        paths: {}
      };

      await this.saveState();
    }
  }

  /**
   * 获取最受欢迎的路径
   */
  private getTopPaths(limit: number = 10): Array<{ path: string; requests: number }> {
    return Object.entries(this.currentWindow.paths)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([path, requests]) => ({ path, requests }));
  }

  /**
   * 保存当前状态到存储
   */
  private async saveState(): Promise<void> {
    await this.ctx.storage.put('state', {
      window: this.currentWindow,
      threshold: this.alertThreshold,
      autoCache: this.autoCache
    });
  }

  /**
   * 检查是否应该触发自动缓存
   */
  isAutoCacheTriggered(): boolean {
    return this.autoCache && this.currentWindow.requests >= this.alertThreshold;
  }

  /**
   * 获取警报状态
   */
  async getAlertStatus(): Promise<{
    alertActive: boolean;
    currentRequests: number;
    threshold: number;
    autoCacheEnabled: boolean;
  }> {
    await this.rotateWindowIfNeeded();

    return {
      alertActive: this.currentWindow.requests >= this.alertThreshold,
      currentRequests: this.currentWindow.requests,
      threshold: this.alertThreshold,
      autoCacheEnabled: this.autoCache
    };
  }
}