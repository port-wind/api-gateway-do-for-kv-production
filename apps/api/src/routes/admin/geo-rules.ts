/**
 * 地区访问控制规则管理 API
 * 
 * 路由前缀: /api/admin/geo/rules
 * 
 * MVP 功能：
 * - CRUD 全局规则
 * - 支持 allow/block 模式
 * - 支持国家列表 + 预定义地区组
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { GeoAccessRule, GeoRuleSet } from '../../types/geo-access-control';
import { PRESET_GEO_GROUPS } from '../../types/geo-access-control';
import { clearGeoRulesCache } from '../../middleware/geo-access-control';

const app = new Hono();

/**
 * Zod 验证模式
 */
const geoMatchSchema = z.object({
    type: z.enum(['country', 'continent', 'custom']),
    countries: z.array(z.string()).optional(),
    continents: z.array(z.string()).optional(),
    customGroups: z.array(z.string()).optional(),
});

const createRuleSchema = z.object({
    name: z.string().min(1).max(100),
    mode: z.enum(['allow', 'block']), // MVP 仅支持 allow/block
    priority: z.number().int().min(0).max(1000),
    enabled: z.boolean().optional().default(true), // ✅ 添加 enabled 字段
    geoMatch: geoMatchSchema,
    response: z.object({
        statusCode: z.number().int().min(200).max(599).optional(),
        message: z.string().optional(),
        headers: z.record(z.string()).optional(),
    }).optional(),
    metadata: z.object({
        comment: z.string().optional(),
    }).optional(),
});

const updateRuleSchema = createRuleSchema.partial();

const bulkToggleSchema = z.object({
    ruleIds: z.array(z.string()),
    enabled: z.boolean(),
});

/**
 * KV Key 常量
 */
const GLOBAL_RULES_KEY = 'geo-rule:global';

/**
 * 获取全局规则列表
 * GET /api/admin/geo/rules
 */
app.get('/', async (c) => {
    try {
        const ruleSet = await loadGlobalRuleSet(c.env);

        return c.json({
            success: true,
            data: {
                version: ruleSet.version,
                defaultAction: ruleSet.defaultAction,
                rules: ruleSet.rules,
                totalCount: ruleSet.rules.length,
            },
        });
    } catch (error) {
        console.error('[GeoRules] Failed to get rules:', error);
        return c.json({ success: false, error: 'Failed to load rules' }, 500);
    }
});

/**
 * 创建新规则
 * POST /api/admin/geo/rules
 */
app.post('/', zValidator('json', createRuleSchema), async (c) => {
    try {
        const data = c.req.valid('json');

        // 生成规则 ID
        const ruleId = `rule-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        // 构建规则对象
        const newRule: GeoAccessRule = {
            id: ruleId,
            name: data.name,
            enabled: data.enabled ?? true,  // ✅ 尊重请求中的 enabled 值，默认为 true
            mode: data.mode,
            priority: data.priority,
            scope: 'global', // MVP 仅支持全局规则
            geoMatch: data.geoMatch,
            response: data.response,
            metadata: {
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',  // TODO: 从认证中获取用户 ID
                comment: data.metadata?.comment,
            },
        };

        // 加载现有规则集
        const ruleSet = await loadGlobalRuleSet(c.env);

        // 检查优先级冲突
        const conflictRule = ruleSet.rules.find(r => r.priority === data.priority);
        if (conflictRule) {
            return c.json({
                success: false,
                error: `Priority ${data.priority} is already used by rule "${conflictRule.name}"`,
            }, 400);
        }

        // 添加新规则
        ruleSet.rules.push(newRule);
        ruleSet.version += 1;
        ruleSet.lastModified = Date.now();

        // 保存到 KV
        await saveGlobalRuleSet(c.env, ruleSet);

        // 清除缓存
        clearGeoRulesCache('global');

        return c.json({
            success: true,
            data: newRule,
        }, 201);
    } catch (error) {
        console.error('[GeoRules] Failed to create rule:', error);
        return c.json({ success: false, error: 'Failed to create rule' }, 500);
    }
});

/**
 * 更新规则
 * PUT /api/admin/geo/rules/:ruleId
 */
app.put('/:ruleId', zValidator('json', updateRuleSchema), async (c) => {
    try {
        const ruleId = c.req.param('ruleId');
        const updates = c.req.valid('json');

        // 加载现有规则集
        const ruleSet = await loadGlobalRuleSet(c.env);

        // 查找规则
        const ruleIndex = ruleSet.rules.findIndex(r => r.id === ruleId);
        if (ruleIndex === -1) {
            return c.json({ success: false, error: 'Rule not found' }, 404);
        }

        const existingRule = ruleSet.rules[ruleIndex];

        // 检查优先级冲突（如果更新了优先级）
        if (updates.priority !== undefined && updates.priority !== existingRule.priority) {
            const conflictRule = ruleSet.rules.find(
                r => r.id !== ruleId && r.priority === updates.priority
            );
            if (conflictRule) {
                return c.json({
                    success: false,
                    error: `Priority ${updates.priority} is already used by rule "${conflictRule.name}"`,
                }, 400);
            }
        }

        // 更新规则
        const updatedRule: GeoAccessRule = {
            ...existingRule,
            ...updates,
            metadata: {
                ...existingRule.metadata,
                updatedAt: new Date().toISOString(),
                comment: updates.metadata?.comment ?? existingRule.metadata.comment,
            },
        };

        ruleSet.rules[ruleIndex] = updatedRule;
        ruleSet.version += 1;
        ruleSet.lastModified = Date.now();

        // 保存到 KV
        await saveGlobalRuleSet(c.env, ruleSet);

        // 清除缓存
        clearGeoRulesCache('global');

        return c.json({
            success: true,
            data: updatedRule,
        });
    } catch (error) {
        console.error('[GeoRules] Failed to update rule:', error);
        return c.json({ success: false, error: 'Failed to update rule' }, 500);
    }
});

/**
 * 删除规则
 * DELETE /api/admin/geo/rules/:ruleId
 */
app.delete('/:ruleId', async (c) => {
    try {
        const ruleId = c.req.param('ruleId');

        // 加载现有规则集
        const ruleSet = await loadGlobalRuleSet(c.env);

        // 查找并删除规则
        const ruleIndex = ruleSet.rules.findIndex(r => r.id === ruleId);
        if (ruleIndex === -1) {
            return c.json({ success: false, error: 'Rule not found' }, 404);
        }

        const deletedRule = ruleSet.rules.splice(ruleIndex, 1)[0];
        ruleSet.version += 1;
        ruleSet.lastModified = Date.now();

        // 保存到 KV
        await saveGlobalRuleSet(c.env, ruleSet);

        // 清除缓存
        clearGeoRulesCache('global');

        return c.json({
            success: true,
            data: deletedRule,
        });
    } catch (error) {
        console.error('[GeoRules] Failed to delete rule:', error);
        return c.json({ success: false, error: 'Failed to delete rule' }, 500);
    }
});

/**
 * 批量启用/禁用规则
 * PATCH /api/admin/geo/rules/bulk-toggle
 */
app.patch('/bulk-toggle', zValidator('json', bulkToggleSchema), async (c) => {
    try {
        const { ruleIds, enabled } = c.req.valid('json');

        // 加载现有规则集
        const ruleSet = await loadGlobalRuleSet(c.env);

        // 更新规则状态
        let updatedCount = 0;
        for (const rule of ruleSet.rules) {
            if (ruleIds.includes(rule.id)) {
                rule.enabled = enabled;
                rule.metadata.updatedAt = new Date().toISOString();
                updatedCount++;
            }
        }

        if (updatedCount === 0) {
            return c.json({ success: false, error: 'No rules found' }, 404);
        }

        ruleSet.version += 1;
        ruleSet.lastModified = Date.now();

        // 保存到 KV
        await saveGlobalRuleSet(c.env, ruleSet);

        // 清除缓存
        clearGeoRulesCache('global');

        return c.json({
            success: true,
            data: {
                updatedCount,
                enabled,
            },
        });
    } catch (error) {
        console.error('[GeoRules] Failed to bulk toggle:', error);
        return c.json({ success: false, error: 'Failed to bulk toggle rules' }, 500);
    }
});

/**
 * 获取预定义地区组列表
 * GET /api/admin/geo/groups/preset
 */
app.get('/groups/preset', async (c) => {
    try {
        const groups = Object.entries(PRESET_GEO_GROUPS).map(([key, value]) => ({
            id: key,
            ...value,
        }));

        return c.json({
            success: true,
            data: groups,
        });
    } catch (error) {
        console.error('[GeoRules] Failed to get preset groups:', error);
        return c.json({ success: false, error: 'Failed to load preset groups' }, 500);
    }
});

/**
 * 辅助函数：加载全局规则集
 */
async function loadGlobalRuleSet(env: any): Promise<GeoRuleSet> {
    const ruleSet = await env.API_GATEWAY_STORAGE.get(GLOBAL_RULES_KEY, 'json') as GeoRuleSet | null;

    if (!ruleSet) {
        // 返回默认规则集
        return {
            version: 1,
            defaultAction: 'allow',
            rules: [],
            lastModified: Date.now(),
        };
    }

    return ruleSet;
}

/**
 * 辅助函数：保存全局规则集
 */
async function saveGlobalRuleSet(env: any, ruleSet: GeoRuleSet): Promise<void> {
    await env.API_GATEWAY_STORAGE.put(GLOBAL_RULES_KEY, JSON.stringify(ruleSet));
}

export default app;

