import { DurableObject } from 'cloudflare:workers';
import type { RateLimitResult } from '../types/config';

export class RateLimiter extends DurableObject {
  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
  }

  /**
   * 限流请求处理
   * @param request ip, limit, window
   * @returns 
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      switch (path) {
        case '/check':
          return await this.checkRateLimit(url);
        case '/reset':
          return await this.resetRateLimit(url);
        case '/status':
          return await this.getRateLimitStatus(url);
        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      return new Response(`Error: ${error}`, { status: 500 });
    }
  }

  /**
   * 检查 IP 是否在限流范围内
   */
  private async checkRateLimit(url: URL): Promise<Response> {
    const ip = url.searchParams.get('ip');
    const limit = parseInt(url.searchParams.get('limit') || '60');
    const window = parseInt(url.searchParams.get('window') || '60');

    if (!ip) {
      return new Response(JSON.stringify({
        error: 'IP address is required'
      }), { status: 400 });
    }

    const result = await this.performRateLimitCheck(ip, limit, window);

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: result.allowed ? 200 : 429
    });
  }

  /**
   * 重置指定 IP 的限流
   */
  private async resetRateLimit(url: URL): Promise<Response> {
    const ip = url.searchParams.get('ip');

    if (!ip) {
      return new Response(JSON.stringify({
        error: 'IP address is required'
      }), { status: 400 });
    }

    await this.ctx.storage.delete(`ip:${ip}`);

    return new Response(JSON.stringify({
      success: true,
      message: `Rate limit reset for IP: ${ip}`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * 获取指定 IP 的当前限流状态
   */
  private async getRateLimitStatus(url: URL): Promise<Response> {
    const ip = url.searchParams.get('ip');
    const limit = parseInt(url.searchParams.get('limit') || '60');
    const window = parseInt(url.searchParams.get('window') || '60');

    if (!ip) {
      return new Response(JSON.stringify({
        error: 'IP address is required'
      }), { status: 400 });
    }

    const now = Date.now();
    const windowStart = now - (window * 1000);

    // 获取请求历史
    const history = await this.ctx.storage.get<number[]>(`ip:${ip}`) || [];

    // 过滤出当前窗口内的记录
    const recentRequests = history.filter(timestamp => timestamp > windowStart);

    const remaining = Math.max(0, limit - recentRequests.length);
    const resetAt = recentRequests.length > 0 ?
      Math.max(...recentRequests) + (window * 1000) :
      now;

    return new Response(JSON.stringify({
      ip,
      limit,
      used: recentRequests.length,
      remaining,
      resetAt,
      windowSeconds: window
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * 执行实际的限流检查
   */
  private async performRateLimitCheck(
    ip: string,
    limit: number,
    window: number
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - (window * 1000);

    // 获取指定 IP 的请求历史
    const history = await this.ctx.storage.get<number[]>(`ip:${ip}`) || [];

    // 过滤出当前窗口内的记录
    const recentRequests = history.filter(timestamp => timestamp > windowStart);

    // 检查是否超出限流
    if (recentRequests.length >= limit) {
      // 找到窗口内最早的请求的过期时间
      const oldestRequest = Math.min(...recentRequests);
      const resetAt = oldestRequest + (window * 1000);

      return {
        allowed: false,
        remaining: 0,
        resetAt
      };
    }

    // 添加当前请求到历史
    recentRequests.push(now);

    // 存储更新后的历史 (只保留最近的请求以节省空间)
    await this.ctx.storage.put(`ip:${ip}`, recentRequests);

    const remaining = limit - recentRequests.length;

    return {
      allowed: true,
      remaining
    };
  }

  /**
   * 清理旧的条目 (定期调用)
   */
  async cleanup(): Promise<void> {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const cutoff = now - maxAge;

    // 获取所有存储键
    const keys = await this.ctx.storage.list();

    for (const [key, value] of keys) {
      if (key.startsWith('ip:') && Array.isArray(value)) {
        // 清理指定 IP 的历史中的旧时间戳
        const cleanedHistory = (value as number[]).filter(timestamp => timestamp > cutoff);

        if (cleanedHistory.length === 0) {
          // 删除空的历史
          await this.ctx.storage.delete(key);
        } else if (cleanedHistory.length !== value.length) {
          // 更新清理后的历史
          await this.ctx.storage.put(key, cleanedHistory);
        }
      }
    }
  }

  /**
   * 获取聚合统计
   */
  async getStats(): Promise<{
    activeIPs: number;
    totalRequests: number;
    averageRequestsPerIP: number;
  }> {
    const keys = await this.ctx.storage.list();
    let activeIPs = 0;
    let totalRequests = 0;

    for (const [key, value] of keys) {
      if (key.startsWith('ip:') && Array.isArray(value)) {
        activeIPs++;
        totalRequests += value.length;
      }
    }

    return {
      activeIPs,
      totalRequests,
      averageRequestsPerIP: activeIPs > 0 ? totalRequests / activeIPs : 0
    };
  }
}