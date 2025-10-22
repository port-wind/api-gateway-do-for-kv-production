/**
 * 优化缓存实现 - 解决冷启动、可靠性、fallback 问题
 * 
 * 关键特性：
 * 1. 冷启动预热
 * 2. Stale-while-revalidate
 * 3. Feature flag 控制
 * 4. Fallback 到同步模式
 * 5. 监控和告警
 */

import type { Env } from '../types/env';
import type { ProxyRoute } from '../types/config';

/**
 * Feature Flags 配置
 */
export interface OptimizationFlags {
    enableRouteCache: boolean;          // 路由缓存
    enableIpBlacklistCache: boolean;    // IP 黑名单缓存
    enableGeoRulesCache: boolean;       // 地区规则缓存
    enableAsyncRecording: boolean;      // 异步记录
    enableParallelExecution: boolean;   // 并行执行
}

/**
 * 从环境变量或 KV 加载 Feature Flags
 */
export async function getOptimizationFlags(env: Env): Promise<OptimizationFlags> {
    try {
        // 1. 从 KV 读取配置（支持运行时动态调整）
        const flags = await env.API_GATEWAY_STORAGE.get('optimization_flags', 'json') as OptimizationFlags;

        if (flags) {
            return flags;
        }
    } catch (error) {
        console.warn('Failed to load optimization flags from KV:', error);
    }

    // 2. 默认配置（保守启用）
    return {
        enableRouteCache: true,           // 路由缓存风险低
        enableIpBlacklistCache: true,     // IP 缓存风险低
        enableGeoRulesCache: true,        // 地区规则缓存风险低
        enableAsyncRecording: false,      // 异步记录需要验证
        enableParallelExecution: true     // 并行执行风险低
    };
}

/**
 * 路由缓存 - 增强版
 * 
 * 特性：
 * - 冷启动预热
 * - Stale-while-revalidate
 * - 版本号检测
 * - Fallback 到 KV
 */
export class RouteCache {
    private cache = new Map<string, { route: ProxyRoute | null, expires: number }>();
    private allRoutes: ProxyRoute[] = [];
    private version: string | null = null;
    private lastUpdate = 0;
    private ttl = 60000; // 1 分钟
    private isWarming = false;
    private isEnabled = true;

    constructor(private env: Env) { }

    /**
     * 设置启用状态（Feature Flag 控制）
     */
    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
    }

    /**
     * 获取路由（带冷启动处理）
     */
    async get(path: string): Promise<ProxyRoute | null> {
        // Feature flag 关闭，直接走 KV
        if (!this.isEnabled) {
            return this.getFromKV(path);
        }

        const now = Date.now();

        // 1. 检查内存缓存
        const cached = this.cache.get(path);
        if (cached && now < cached.expires) {
            return cached.route; // 命中，~1ms
        }

        // 2. Stale-while-revalidate: 如果有过期缓存，先返回旧值
        if (cached) {
            // 后台刷新
            this.refreshInBackground();
            return cached.route; // 返回旧值
        }

        // 3. 缓存未命中（冷启动），需要加载
        if (this.allRoutes.length === 0) {
            await this.warmup(); // 预热
        }

        // 4. 从内存路由列表查找
        const route = this.findRoute(path);

        // 5. 缓存结果
        this.cache.set(path, {
            route,
            expires: now + this.ttl
        });

        return route;
    }

    /**
     * 冷启动预热
     */
    async warmup(): Promise<void> {
        if (this.isWarming) {
            // 已经在预热，等待完成
            await this.waitForWarmup();
            return;
        }

        this.isWarming = true;
        const startTime = Date.now();

        try {
            console.log('[RouteCache] Starting warmup...');

            // 并行加载：路由配置 + 版本号
            const [routesData, versionData] = await Promise.all([
                this.env.API_GATEWAY_STORAGE.get('proxy-routes:list', 'json'),
                this.env.API_GATEWAY_STORAGE.get('proxy-routes:version', 'text')
            ]);

            this.allRoutes = (routesData as ProxyRoute[]) || [];
            this.version = versionData || null;
            this.lastUpdate = Date.now();

            // 预填充常用路径缓存
            this.allRoutes.forEach(route => {
                if (route.pattern) {
                    const pattern = route.pattern.replace('*', '');
                    this.cache.set(pattern, {
                        route,
                        expires: this.lastUpdate + this.ttl
                    });
                }
            });

            const duration = Date.now() - startTime;
            console.log(`[RouteCache] Warmup completed in ${duration}ms, loaded ${this.allRoutes.length} routes`);

        } catch (error) {
            console.error('[RouteCache] Warmup failed:', error);
            // 预热失败，保持 isEnabled 但下次会重试
        } finally {
            this.isWarming = false;
        }
    }

    /**
     * 等待预热完成
     */
    private async waitForWarmup(maxWait = 5000): Promise<void> {
        const startTime = Date.now();
        while (this.isWarming && Date.now() - startTime < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    /**
     * 后台刷新（检测版本变化）
     */
    private refreshInBackground(): void {
        // 避免频繁刷新
        if (Date.now() - this.lastUpdate < 5000) {
            return;
        }

        // 异步刷新，不阻塞
        this.checkVersionAndRefresh().catch(error => {
            console.warn('[RouteCache] Background refresh failed:', error);
        });
    }

    /**
     * 检查版本并刷新
     */
    private async checkVersionAndRefresh(): Promise<void> {
        try {
            // 1. 检查版本号
            const currentVersion = await this.env.API_GATEWAY_STORAGE.get('proxy-routes:version', 'text');

            // 2. 版本未变化，跳过
            if (currentVersion === this.version) {
                this.lastUpdate = Date.now();
                return;
            }

            console.log(`[RouteCache] Version changed: ${this.version} → ${currentVersion}, refreshing...`);

            // 3. 版本变化，重新加载
            await this.warmup();

        } catch (error) {
            console.warn('[RouteCache] Version check failed:', error);
        }
    }

    /**
     * 从内存路由列表查找
     */
    private findRoute(path: string): ProxyRoute | null {
        if (this.allRoutes.length === 0) {
            return null;
        }

        // 按优先级排序查找
        const sorted = [...this.allRoutes].sort((a, b) => {
            return (b.priority || 0) - (a.priority || 0);
        });

        for (const route of sorted) {
            if (!route.pattern || !route.enabled) continue;

            const pattern = route.pattern.replace('*', '');
            if (path.startsWith(pattern)) {
                return route;
            }
        }

        return null;
    }

    /**
     * Fallback：直接从 KV 查询（旧逻辑）
     */
    private async getFromKV(path: string): Promise<ProxyRoute | null> {
        try {
            const routes = await this.env.API_GATEWAY_STORAGE.get('proxy-routes:list', 'json') as ProxyRoute[];
            if (!routes) return null;

            return routes.find(r => {
                if (!r.pattern || !r.enabled) return false;
                const pattern = r.pattern.replace('*', '');
                return path.startsWith(pattern);
            }) || null;

        } catch (error) {
            console.error('[RouteCache] KV fallback failed:', error);
            return null;
        }
    }

    /**
     * 手动触发刷新（管理 API 使用）
     */
    async forceRefresh(): Promise<void> {
        console.log('[RouteCache] Force refresh triggered');
        this.cache.clear();
        this.version = null;
        await this.warmup();
    }
}

/**
 * IP 黑名单缓存 - 增强版
 * 
 * 特性：
 * - 增量同步（基于 lastUpdatedAt）
 * - 即时禁用接口
 * - Fallback 到 D1
 */
export class IpBlacklistCache {
    private bannedIps = new Set<string>();
    private lastSyncTime = 0;
    private lastSyncTimestamp: string | null = null; // D1 时间戳（秒级精度）
    private lastSyncIp: string | null = null; // 最后处理的 IP（用于同一秒内的游标）
    private isSyncing = false;
    private isEnabled = true;

    constructor(private env: Env) { }

    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
    }

    /**
     * 检查 IP 是否被封禁
     */
    async isBanned(ip: string): Promise<boolean> {
        // Feature flag 关闭，直接查 D1
        if (!this.isEnabled) {
            return this.checkFromD1(ip);
        }

        // 1. 快速内存检查
        if (this.bannedIps.has(ip)) {
            return true; // ~0.1ms
        }

        // 2. 首次或需要同步
        if (this.bannedIps.size === 0 || Date.now() - this.lastSyncTime > 5000) {
            // 后台同步（不阻塞）
            this.syncInBackground();
        }

        // 3. 当前缓存中未找到，视为未封禁
        return false;
    }

    /**
     * 即时封禁 IP（管理 API 调用）
     */
    async banIpImmediately(ip: string): Promise<void> {
        console.log(`[IpBlacklistCache] Immediately banning IP: ${ip}`);

        // 1. 立即加入缓存
        this.bannedIps.add(ip);

        // 2. 写入 D1
        try {
            await this.env.D1.prepare(`
        INSERT OR REPLACE INTO ip_monitor (ip, status, updated_at)
        VALUES (?, 'banned', datetime('now'))
      `).bind(ip).run();
        } catch (error) {
            console.error('[IpBlacklistCache] Failed to ban IP in D1:', error);
            throw error;
        }
    }

    /**
     * 增量同步（获取所有变更，包括解封的 IP）
     */
    private async syncInBackground(): Promise<void> {
        if (this.isSyncing) return;

        this.isSyncing = true;

        try {
            // 增量查询：使用 (timestamp, ip) 游标避免遗漏同一秒内的更新
            // WHERE updated_at > ? OR (updated_at = ? AND ip > ?)
            let query: string;
            let stmt: any;

            if (this.lastSyncTimestamp) {
                if (this.lastSyncIp) {
                    // 有完整游标：查询时间戳更新的，或同一秒内 IP 字典序更大的
                    query = `SELECT ip, status, updated_at FROM ip_monitor 
                       WHERE updated_at > datetime(?) OR (updated_at = datetime(?) AND ip > ?)
                       ORDER BY updated_at ASC, ip ASC`;
                    stmt = this.env.D1.prepare(query).bind(this.lastSyncTimestamp, this.lastSyncTimestamp, this.lastSyncIp);
                } else {
                    // 只有时间戳游标（首次增量）
                    query = `SELECT ip, status, updated_at FROM ip_monitor 
                       WHERE updated_at > datetime(?)
                       ORDER BY updated_at ASC, ip ASC`;
                    stmt = this.env.D1.prepare(query).bind(this.lastSyncTimestamp);
                }
            } else {
                // 冷启动：获取所有 banned 状态的 IP
                query = `SELECT ip, status, updated_at FROM ip_monitor 
                   WHERE status = 'banned'
                   ORDER BY updated_at ASC, ip ASC`;
                stmt = this.env.D1.prepare(query);
            }

            const result = await stmt.all();

            // 更新缓存（处理所有状态变更）
            let latestTimestamp: string | null = this.lastSyncTimestamp;
            let latestIp: string | null = this.lastSyncIp;
            let processedCount = 0;

            if (result.results && result.results.length > 0) {
                result.results.forEach((row: any) => {
                    if (row.status === 'banned') {
                        this.bannedIps.add(row.ip);
                        console.log(`[IpBlacklistCache] Banned IP added to cache: ${row.ip}`);
                    } else {
                        // 状态不是 'banned'，从缓存中移除（处理解封情况）
                        if (this.bannedIps.has(row.ip)) {
                            this.bannedIps.delete(row.ip);
                            console.log(`[IpBlacklistCache] IP removed from ban cache: ${row.ip} (status: ${row.status})`);
                        }
                    }

                    // 更新游标：(timestamp, ip)
                    if (row.updated_at) {
                        if (!latestTimestamp || row.updated_at > latestTimestamp) {
                            // 时间戳前进了
                            latestTimestamp = row.updated_at;
                            latestIp = row.ip;
                        } else if (row.updated_at === latestTimestamp) {
                            // 同一秒内，更新 IP 游标
                            latestIp = row.ip;
                        }
                    }

                    processedCount++;
                });

                // 更新游标
                if (latestTimestamp) {
                    this.lastSyncTimestamp = latestTimestamp;
                    this.lastSyncIp = latestIp;
                }
                console.log(`[IpBlacklistCache] Synced ${processedCount} changes, cursor: (${latestTimestamp}, ${latestIp})`);
            }

            // 更新同步时间
            this.lastSyncTime = Date.now();

            console.log(`[IpBlacklistCache] Total banned IPs in cache: ${this.bannedIps.size}`);

        } catch (error) {
            console.warn('[IpBlacklistCache] Sync failed:', error);
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Fallback：直接查 D1
     */
    private async checkFromD1(ip: string): Promise<boolean> {
        try {
            const result = await this.env.D1.prepare(
                'SELECT status FROM ip_monitor WHERE ip = ? AND status = "banned"'
            ).bind(ip).first();

            return !!result;

        } catch (error) {
            console.error('[IpBlacklistCache] D1 check failed:', error);
            return false; // 查询失败，默认不封禁（安全考虑）
        }
    }

    /**
     * 预热（启动时调用）
     */
    async warmup(): Promise<void> {
        console.log('[IpBlacklistCache] Starting warmup...');
        await this.syncInBackground();
    }
}

/**
 * 地区规则缓存 - 增强版
 */
export class GeoRulesCache {
    private rules: Map<string, any> = new Map();
    private lastUpdate = 0;
    private ttl = 300000; // 5 分钟
    private isEnabled = true;

    constructor(private env: Env) { }

    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
    }

    async getRules(country: string): Promise<any> {
        if (!this.isEnabled) {
            return this.getFromKV(country);
        }

        const now = Date.now();

        // 检查缓存
        if (this.rules.has(country) && now - this.lastUpdate < this.ttl) {
            return this.rules.get(country);
        }

        // 重新加载
        await this.refresh();
        return this.rules.get(country);
    }

    private async refresh(): Promise<void> {
        try {
            const allRules = await this.env.API_GATEWAY_STORAGE.get('geo_rules', 'json') as any;

            if (allRules) {
                // 转换为 Map 方便查找
                Object.entries(allRules).forEach(([country, rule]) => {
                    this.rules.set(country, rule);
                });
            }

            this.lastUpdate = Date.now();

        } catch (error) {
            console.warn('[GeoRulesCache] Refresh failed:', error);
        }
    }

    private async getFromKV(country: string): Promise<any> {
        try {
            const allRules = await this.env.API_GATEWAY_STORAGE.get('geo_rules', 'json') as any;
            return allRules?.[country] || null;
        } catch (error) {
            console.error('[GeoRulesCache] KV fallback failed:', error);
            return null;
        }
    }

    async forceRefresh(): Promise<void> {
        console.log('[GeoRulesCache] Force refresh triggered');
        this.rules.clear();
        await this.refresh();
    }
}

/**
 * 全局缓存管理器
 */
export class CacheManager {
    public routeCache: RouteCache;
    public ipBlacklistCache: IpBlacklistCache;
    public geoRulesCache: GeoRulesCache;

    constructor(env: Env) {
        this.routeCache = new RouteCache(env);
        this.ipBlacklistCache = new IpBlacklistCache(env);
        this.geoRulesCache = new GeoRulesCache(env);
    }

    /**
     * 应用 Feature Flags
     */
    async applyFlags(flags: OptimizationFlags): Promise<void> {
        this.routeCache.setEnabled(flags.enableRouteCache);
        this.ipBlacklistCache.setEnabled(flags.enableIpBlacklistCache);
        this.geoRulesCache.setEnabled(flags.enableGeoRulesCache);

        console.log('[CacheManager] Feature flags applied:', flags);
    }

    /**
     * 预热所有缓存
     */
    async warmupAll(): Promise<void> {
        console.log('[CacheManager] Warming up all caches...');

        const startTime = Date.now();

        await Promise.allSettled([
            this.routeCache.warmup(),
            this.ipBlacklistCache.warmup(),
            this.geoRulesCache.forceRefresh()
        ]);

        const duration = Date.now() - startTime;
        console.log(`[CacheManager] All caches warmed up in ${duration}ms`);
    }

    /**
     * 强制刷新所有缓存（管理 API）
     */
    async refreshAll(): Promise<void> {
        console.log('[CacheManager] Force refreshing all caches...');

        await Promise.allSettled([
            this.routeCache.forceRefresh(),
            this.ipBlacklistCache.warmup(),
            this.geoRulesCache.forceRefresh()
        ]);
    }
}

// 全局实例（跨请求共享）
let globalCacheManager: CacheManager | null = null;

/**
 * 获取全局缓存管理器
 */
export function getCacheManager(env: Env): CacheManager {
    if (!globalCacheManager) {
        globalCacheManager = new CacheManager(env);
    }
    return globalCacheManager;
}

