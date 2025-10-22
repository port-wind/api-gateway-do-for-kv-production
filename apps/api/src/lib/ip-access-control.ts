/**
 * IP 访问控制管理器
 * 
 * 功能：
 * - 从 KV/D1 加载 IP 访问规则（支持精确 IP 和 CIDR）
 * - 检查客户端 IP 是否被封禁或限流
 * - 规则缓存策略（KV TTL 5 分钟）
 */

import type { Env } from '../types/env';
import { hashIP } from './idempotency';

/**
 * IP 访问规则
 */
export interface IPAccessRule {
    id: number;
    ipPattern: string;      // 原始 IP 或 CIDR
    ipHash?: string;        // 精确 IP 的哈希值
    mode: 'block' | 'throttle';
    limit?: number;         // throttle 模式的限流值
    window?: number;        // throttle 模式的时间窗口（秒）
    reason?: string;
    expiresAt?: number;     // Unix timestamp (秒)
}

/**
 * 规则集合（优化查询性能）
 */
interface RuleSet {
    exact: Map<string, IPAccessRule>;  // 精确 IP 匹配（ip_hash -> rule）
    cidrs: IPAccessRule[];             // CIDR 规则列表
}

/**
 * KV 缓存键
 */
const RULES_CACHE_KEY = 'ip-rules:active';
const RULES_CACHE_TTL = 300; // 5 分钟

/**
 * 从 KV 获取活跃规则列表（带缓存）
 * 降级到 D1 查询
 * 
 * @param env 环境变量
 * @returns 规则集合
 */
export async function getActiveRules(env: Env): Promise<RuleSet> {
    // 尝试从 KV 读取缓存
    try {
        const cached = await env.API_GATEWAY_STORAGE.get(RULES_CACHE_KEY, 'json');
        if (cached) {
            console.log(`✅ IP 规则从 KV 缓存加载`);
            return deserializeRuleSet(cached);
        }
    } catch (error) {
        console.warn(`⚠️ KV 读取规则失败:`, error);
    }

    // KV miss 或出错，从 D1 查询
    const rules = await loadRulesFromD1(env);
    const ruleSet = buildRuleSet(rules);

    // 写入 KV 缓存
    try {
        const serialized = serializeRuleSet(ruleSet);
        await env.API_GATEWAY_STORAGE.put(
            RULES_CACHE_KEY,
            JSON.stringify(serialized),
            { expirationTtl: RULES_CACHE_TTL }
        );
        console.log(`✅ IP 规则已缓存到 KV (${rules.length} 条)`);
    } catch (error) {
        console.warn(`⚠️ KV 写入规则失败:`, error);
    }

    return ruleSet;
}

/**
 * 从 D1 加载所有活跃规则
 * 
 * @param env 环境变量
 * @returns 规则数组
 */
async function loadRulesFromD1(env: Env): Promise<IPAccessRule[]> {
    if (!env.D1) {
        console.warn('⚠️ D1 未配置，IP 规则为空');
        return [];
    }

    const now = Math.floor(Date.now() / 1000);

    try {
        const result = await env.D1.prepare(`
      SELECT 
        id, ip_pattern, ip_hash, mode, 
        "limit", "window", reason, expires_at
      FROM ip_access_rules
      WHERE is_active = 1
        AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY created_at DESC
      LIMIT 1000
    `).bind(now).all();

        const rules = (result.results || []).map(row => ({
            id: row.id as number,
            ipPattern: row.ip_pattern as string,
            ipHash: row.ip_hash as string | undefined,
            mode: row.mode as 'block' | 'throttle',
            limit: row.limit as number | undefined,
            window: row.window as number | undefined,
            reason: row.reason as string | undefined,
            expiresAt: row.expires_at as number | undefined,
        }));

        console.log(`✅ 从 D1 加载 ${rules.length} 条 IP 规则`);
        return rules;
    } catch (error) {
        console.error(`❌ D1 查询规则失败:`, error);
        return [];
    }
}

/**
 * 构建规则集合（优化查询）
 * 
 * @param rules 规则数组
 * @returns 规则集合
 */
function buildRuleSet(rules: IPAccessRule[]): RuleSet {
    const exact = new Map<string, IPAccessRule>();
    const cidrs: IPAccessRule[] = [];

    for (const rule of rules) {
        if (rule.ipHash) {
            // 精确 IP 匹配
            exact.set(rule.ipHash, rule);
        } else {
            // CIDR 匹配
            cidrs.push(rule);
        }
    }

    console.log(`📊 规则集合: ${exact.size} 个精确 IP, ${cidrs.length} 个 CIDR`);

    return { exact, cidrs };
}

/**
 * 检查 IP 是否匹配规则
 * 
 * @param env 环境变量
 * @param clientIP 客户端 IP（原始）
 * @param clientIpHash 客户端 IP 哈希值
 * @returns 匹配结果
 */
export async function checkIpAccess(
    env: Env,
    clientIP: string,
    clientIpHash: string
): Promise<{ allowed: boolean; rule?: IPAccessRule }> {
    const ruleSet = await getActiveRules(env);

    // 1. 精确匹配（O(1)）
    const exactRule = ruleSet.exact.get(clientIpHash);
    if (exactRule) {
        console.log(`🛡️ 精确匹配规则: ${exactRule.ipPattern} (${exactRule.mode})`);
        return { allowed: false, rule: exactRule };
    }

    // 2. CIDR 匹配（O(N)）
    for (const rule of ruleSet.cidrs) {
        if (isIpInCidr(clientIP, rule.ipPattern)) {
            console.log(`🛡️ CIDR 匹配规则: ${rule.ipPattern} (${rule.mode})`);
            return { allowed: false, rule };
        }
    }

    // 没有匹配的规则，允许访问
    return { allowed: true };
}

/**
 * 判断 IP 是否在 CIDR 范围内
 * 
 * 支持 IPv4 CIDR 格式，例如：192.168.1.0/24
 * 
 * @param ip 客户端 IP
 * @param cidr CIDR 字符串
 * @returns 是否匹配
 */
function isIpInCidr(ip: string, cidr: string): boolean {
    // 如果不是 CIDR 格式，按精确匹配
    if (!cidr.includes('/')) {
        return ip === cidr;
    }

    // 检测 IPv6
    if (isIPv6(ip) || isIPv6(cidr)) {
        return isIPv6InCidr(ip, cidr);
    }

    // IPv4 CIDR 匹配
    try {
        const [network, prefixLenStr] = cidr.split('/');
        const prefixLen = parseInt(prefixLenStr, 10);

        // 验证前缀长度
        if (prefixLen < 0 || prefixLen > 32) {
            console.warn(`⚠️ 无效的 IPv4 CIDR 前缀长度: ${cidr}`);
            return false;
        }

        // 将 IP 和网络地址转换为 32 位整数
        const ipInt = ipToInt(ip);
        const networkInt = ipToInt(network);

        // 计算子网掩码
        const mask = (0xFFFFFFFF << (32 - prefixLen)) >>> 0;

        // 比较网络地址
        return (ipInt & mask) === (networkInt & mask);
    } catch (error) {
        console.warn(`⚠️ IPv4 CIDR 匹配失败: ${cidr}`, error);
        return false;
    }
}

/**
 * 将 IPv4 地址转换为 32 位整数
 * 
 * @param ip IPv4 地址字符串
 * @returns 32 位整数
 */
function ipToInt(ip: string): number {
    const parts = ip.split('.').map(part => parseInt(part, 10));

    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
        throw new Error(`Invalid IP address: ${ip}`);
    }

    return (
        (parts[0] << 24) |
        (parts[1] << 16) |
        (parts[2] << 8) |
        parts[3]
    ) >>> 0; // 确保无符号整数
}

/**
 * 检测 IP 地址类型
 */
function isIPv6(ip: string): boolean {
    return ip.includes(':');
}

/**
 * 将 IPv6 地址转换为 BigInt 数组（128位，分为两个64位）
 */
function ipv6ToInts(ip: string): [bigint, bigint] {
    // 展开 IPv6 压缩格式
    let expanded = ip;
    if (ip.includes('::')) {
        const parts = ip.split('::');
        const left = parts[0] ? parts[0].split(':') : [];
        const right = parts[1] ? parts[1].split(':') : [];
        const missing = 8 - left.length - right.length;
        const middle = Array(missing).fill('0');
        expanded = [...left, ...middle, ...right].join(':');
    }

    // 确保有 8 个部分
    const segments = expanded.split(':');
    while (segments.length < 8) {
        segments.push('0');
    }

    // 将前 4 个段组成高 64 位，后 4 个段组成低 64 位
    const high = segments.slice(0, 4).reduce((acc, seg) => {
        return (acc << 16n) | BigInt(parseInt(seg || '0', 16));
    }, 0n);

    const low = segments.slice(4, 8).reduce((acc, seg) => {
        return (acc << 16n) | BigInt(parseInt(seg || '0', 16));
    }, 0n);

    return [high, low];
}

/**
 * IPv6 CIDR 匹配
 */
function isIPv6InCidr(ip: string, cidr: string): boolean {
    const [network, prefixLenStr] = cidr.split('/');
    const prefixLen = parseInt(prefixLenStr, 10);

    if (prefixLen < 0 || prefixLen > 128) {
        console.warn(`⚠️ 无效的 IPv6 CIDR 前缀长度: ${cidr}`);
        return false;
    }

    try {
        const [ipHigh, ipLow] = ipv6ToInts(ip);
        const [netHigh, netLow] = ipv6ToInts(network);

        // 计算需要比较多少位
        if (prefixLen <= 64) {
            // 只需要比较高 64 位
            const mask = (0xFFFFFFFFFFFFFFFFn << BigInt(64 - prefixLen)) & 0xFFFFFFFFFFFFFFFFn;
            return (ipHigh & mask) === (netHigh & mask);
        } else {
            // 需要比较高 64 位（全部）和低 64 位（部分）
            if (ipHigh !== netHigh) {
                return false;
            }
            const lowBits = prefixLen - 64;
            const mask = (0xFFFFFFFFFFFFFFFFn << BigInt(64 - lowBits)) & 0xFFFFFFFFFFFFFFFFn;
            return (ipLow & mask) === (netLow & mask);
        }
    } catch (error) {
        console.warn(`⚠️ IPv6 CIDR 匹配失败: ${cidr}`, error);
        return false;
    }
}

/**
 * 序列化规则集合（用于 KV 缓存）
 */
function serializeRuleSet(ruleSet: RuleSet): any {
    return {
        exact: Array.from(ruleSet.exact.entries()),
        cidrs: ruleSet.cidrs,
    };
}

/**
 * 反序列化规则集合（从 KV 缓存）
 */
function deserializeRuleSet(data: any): RuleSet {
    return {
        exact: new Map(data.exact || []),
        cidrs: data.cidrs || [],
    };
}

/**
 * 刷新规则缓存（创建/更新/删除规则后调用）
 * 
 * @param env 环境变量
 */
export async function refreshRulesCache(env: Env): Promise<void> {
    try {
        // 删除 KV 缓存，强制下次请求重新加载
        await env.API_GATEWAY_STORAGE.delete(RULES_CACHE_KEY);
        console.log(`✅ IP 规则缓存已刷新`);
    } catch (error) {
        console.error(`❌ 刷新规则缓存失败:`, error);
    }
}

/**
 * 创建 IP 访问规则
 * 
 * @param env 环境变量
 * @param rule 规则数据
 * @returns 规则 ID
 */
export async function createIpRule(
    env: Env,
    rule: Omit<IPAccessRule, 'id'>
): Promise<number> {
    if (!env.D1) {
        throw new Error('D1 未配置');
    }

    // 验证 IP 格式
    validateIpPattern(rule.ipPattern);

    // 计算 ip_hash（仅精确 IP）
    let ipHash: string | null = null;
    if (!rule.ipPattern.includes('/')) {
        ipHash = await hashIP(rule.ipPattern);
    }

    // 验证 throttle 模式参数
    if (rule.mode === 'throttle') {
        if (!rule.limit || !rule.window) {
            throw new Error('throttle 模式必须提供 limit 和 window 参数');
        }
    }

    // 插入规则
    const result = await env.D1.prepare(`
    INSERT INTO ip_access_rules (
      ip_pattern, ip_hash, mode, "limit", "window", 
      reason, created_by, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
        rule.ipPattern,
        ipHash,
        rule.mode,
        rule.limit || null,
        rule.window || null,
        rule.reason || null,
        'system', // TODO: 传入管理员账号
        rule.expiresAt || null
    ).run();

    // 刷新缓存
    await refreshRulesCache(env);

    console.log(`✅ 创建 IP 规则: ${rule.ipPattern} (${rule.mode})`);

    return result.meta?.last_row_id as number || 0;
}

/**
 * 删除 IP 访问规则
 * 
 * @param env 环境变量
 * @param ruleId 规则 ID
 */
export async function deleteIpRule(env: Env, ruleId: number): Promise<void> {
    if (!env.D1) {
        throw new Error('D1 未配置');
    }

    await env.D1.prepare(`
    UPDATE ip_access_rules
    SET is_active = 0
    WHERE id = ?
  `).bind(ruleId).run();

    // 刷新缓存
    await refreshRulesCache(env);

    console.log(`✅ 删除 IP 规则: ID=${ruleId}`);
}

/**
 * 验证 IP/CIDR 格式
 * 
 * @param pattern IP 或 CIDR 字符串
 */
function validateIpPattern(pattern: string): void {
    if (pattern.includes('/')) {
        // CIDR 格式
        const [network, prefixLenStr] = pattern.split('/');
        const prefixLen = parseInt(prefixLenStr, 10);

        // 验证网络地址（IPv4 或 IPv6）
        if (isIPv6(network)) {
            ipv6ToInts(network); // 验证 IPv6 格式
            // IPv6 前缀长度 0-128
            if (prefixLen < 0 || prefixLen > 128) {
                throw new Error(`IPv6 CIDR 前缀长度必须在 0-128 之间: ${pattern}`);
            }
        } else {
            ipToInt(network); // 验证 IPv4 格式
            // IPv4 前缀长度 16-32
            if (prefixLen < 16 || prefixLen > 32) {
                throw new Error(`IPv4 CIDR 前缀长度必须在 16-32 之间: ${pattern}`);
            }
        }
    } else {
        // 精确 IP 格式（IPv4 或 IPv6）
        if (isIPv6(pattern)) {
            ipv6ToInts(pattern); // 验证 IPv6 格式
        } else {
            ipToInt(pattern); // 验证 IPv4 格式
        }
    }
}

