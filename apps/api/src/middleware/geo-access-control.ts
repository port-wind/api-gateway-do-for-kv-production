/**
 * 地区访问控制中间件
 * 
 * 功能：
 * - 根据请求来源国家/地区，应用访问控制规则
 * - 支持白名单、黑名单模式
 * - 内存缓存规则（10 分钟 TTL）
 * 
 * MVP 范围：
 * - 仅支持全局规则（不支持路径级规则）
 * - 仅支持 allow/block 模式（不支持 throttle）
 * - 支持国家列表 + 预定义地区组
 */

import { Context, Next } from 'hono';
import { parseCityName } from '../lib/city-utils';  // 新增：城市工具函数
import type {
    GeoRuleSet,
    GeoAccessRule,
    PRESET_GEO_GROUPS,
    COUNTRY_TO_CONTINENT
} from '../types/geo-access-control';
import { PRESET_GEO_GROUPS as PRESET_GROUPS, COUNTRY_TO_CONTINENT as COUNTRY_CONTINENT_MAP } from '../types/geo-access-control';

/**
 * 规则缓存（内存缓存，10 分钟 TTL）
 */
interface CachedRuleSet {
    rules: GeoRuleSet;
    version: number;
    expireAt: number;
}

const geoRulesCache = new Map<string, CachedRuleSet>();
const CACHE_TTL = 600000; // 10 分钟

/**
 * 地区访问控制中间件
 */
export function geoAccessControlMiddleware() {
    return async (c: Context, next: Next) => {
        try {
            // 1. 获取请求来源国家和城市
            const country = c.req.raw.cf?.country as string | undefined;
            const city = c.req.raw.cf?.city as string | undefined;  // 新增：获取城市信息

            // 无地理信息，放行
            if (!country) {
                return next();
            }

            // 2. 加载全局规则
            const rules = await loadGlobalGeoRules(c.env);

            // 无规则配置，放行
            if (!rules || rules.rules.length === 0) {
                return next();
            }

            // 3. 匹配规则（传递 city 参数）
            const matchedRule = findMatchingRule(rules, country, city);

            if (!matchedRule) {
                // 应用默认动作
                if (rules.defaultAction === 'block') {
                    console.log(`[GeoAccessControl] Blocked by default action: ${country}`);
                    return blockResponse(c, country, 'Default block rule');
                }
                // 默认放行
                return next();
            }

            // 4. 执行动作
            switch (matchedRule.mode) {
                case 'block':
                    console.log(`[GeoAccessControl] Blocked by rule ${matchedRule.id}: ${country}`);
                    return blockResponse(c, country, matchedRule);

                case 'allow':
                    console.log(`[GeoAccessControl] Allowed by rule ${matchedRule.id}: ${country}`);
                    // 记录允许事件（异步，不阻塞）
                    recordGeoEventAsync(c, 'allowed', country, matchedRule.id);
                    return next();

                case 'throttle':
                    // MVP 暂不支持限流模式，当作放行处理
                    console.warn(`[GeoAccessControl] Throttle mode not supported yet, allowing: ${country}`);
                    return next();

                default:
                    return next();
            }
        } catch (error) {
            // 中间件错误不应阻塞请求，记录日志后放行
            console.error('[GeoAccessControl] Middleware error:', error);
            return next();
        }
    };
}

/**
 * 加载全局地区规则（带缓存）
 */
async function loadGlobalGeoRules(env: any): Promise<GeoRuleSet | null> {
    const cacheKey = 'geo-rule:global';
    const now = Date.now();

    // 检查缓存
    const cached = geoRulesCache.get(cacheKey);
    if (cached && cached.expireAt > now) {
        return cached.rules;
    }

    // 从 KV 加载
    try {
        const ruleSet = await env.API_GATEWAY_STORAGE.get(cacheKey, 'json') as GeoRuleSet | null;

        if (!ruleSet) {
            return null;
        }

        // 更新缓存
        geoRulesCache.set(cacheKey, {
            rules: ruleSet,
            version: ruleSet.version,
            expireAt: now + CACHE_TTL,
        });

        return ruleSet;
    } catch (error) {
        console.error('[GeoAccessControl] Failed to load rules from KV:', error);
        return null;
    }
}

/**
 * 查找匹配的规则
 */
function findMatchingRule(
    ruleSet: GeoRuleSet,
    country: string,
    city?: string  // 新增：城市参数
): GeoAccessRule | null {
    // 按优先级排序（数字越小越优先）
    const sortedRules = ruleSet.rules
        .filter(r => r.enabled)
        .sort((a, b) => a.priority - b.priority);

    // 短路执行：匹配到第一条规则后立即返回
    for (const rule of sortedRules) {
        if (isCountryMatch(rule.geoMatch, country, city)) {  // 传递 city 参数
            return rule;
        }
    }

    return null;
}

/**
 * 判断国家是否匹配规则
 */
function isCountryMatch(
    geoMatch: GeoAccessRule['geoMatch'],
    country: string,
    city?: string  // 新增：城市参数
): boolean {
    // 1. 检查城市列表（新增）
    if (geoMatch.cities && city) {
        const standardCity = parseCityName(city);
        if (geoMatch.cities.includes(standardCity)) {
            return true;
        }
    }

    // 2. 检查国家列表
    if (geoMatch.countries && geoMatch.countries.includes(country)) {
        return true;
    }

    // 3. 检查大洲
    if (geoMatch.continents) {
        const continent = COUNTRY_CONTINENT_MAP[country];
        if (continent && geoMatch.continents.includes(continent)) {
            return true;
        }
    }

    // 4. 检查自定义组（预定义组）
    if (geoMatch.customGroups) {
        for (const groupName of geoMatch.customGroups) {
            const group = PRESET_GROUPS[groupName];
            if (group && group.countries.includes(country)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * 返回封禁响应
 */
function blockResponse(
    c: Context,
    country: string,
    ruleOrMessage: GeoAccessRule | string
): Response {
    // 记录封禁事件（异步，不阻塞）
    if (typeof ruleOrMessage !== 'string') {
        recordGeoEventAsync(c, 'blocked', country, ruleOrMessage.id);
    } else {
        recordGeoEventAsync(c, 'blocked', country);
    }

    // 构建响应
    const statusCode = typeof ruleOrMessage !== 'string' && ruleOrMessage.response?.statusCode
        ? ruleOrMessage.response.statusCode
        : 403;

    const message = typeof ruleOrMessage !== 'string' && ruleOrMessage.response?.message
        ? ruleOrMessage.response.message
        : 'Access denied from your region';

    const headers = typeof ruleOrMessage !== 'string' && ruleOrMessage.response?.headers
        ? ruleOrMessage.response.headers
        : {};

    return c.json(
        {
            error: message,
            country,
            timestamp: new Date().toISOString(),
        },
        statusCode as 403 | 429 | 500,
        headers
    );
}

/**
 * 异步记录地区事件（不阻塞主流程）
 * 
 * 注意：这里简化处理，直接在 context 中记录
 * 实际写入 D1 由 traffic_events 的现有机制处理
 */
function recordGeoEventAsync(
    c: Context,
    action: 'allowed' | 'blocked' | 'throttled',
    country: string,
    ruleId?: string
): void {
    try {
        // 在 context 中存储 geo_action，供后续 traffic_events 记录使用
        // @ts-ignore - 扩展 context
        c.set('geoAction', action);
        // @ts-ignore
        c.set('geoRuleId', ruleId);
    } catch (error) {
        // 记录失败不应影响主流程
        console.error('[GeoAccessControl] Failed to record geo event:', error);
    }
}

/**
 * 清除规则缓存（用于管理 API）
 */
export function clearGeoRulesCache(scope: 'global' | 'all' = 'all'): void {
    if (scope === 'global') {
        geoRulesCache.delete('geo-rule:global');
    } else {
        geoRulesCache.clear();
    }
    console.log(`[GeoAccessControl] Cache cleared: ${scope}`);
}

