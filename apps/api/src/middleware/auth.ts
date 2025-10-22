/**
 * 认证中间件
 * 
 * 保护管理 API，要求请求携带有效的 Token
 */

import type { Context, Next } from 'hono';
import type { Env } from '../types/env';
import { verifyToken, type TokenInfo } from '../lib/auth';

/**
 * 认证中间件
 * 
 * 检查 Authorization header 中的 Bearer token
 * 如果 token 无效，返回 401
 */
export async function authMiddleware(
    c: Context<{ Bindings: Env; Variables: { user?: TokenInfo } }>,
    next: Next
) {
    // 1. 获取 Authorization header
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json(
            { error: 'Unauthorized', message: '需要登录访问此资源' },
            401
        );
    }

    // 2. 提取 token
    const token = authHeader.substring(7); // 移除 "Bearer " 前缀

    // 3. 验证 token
    const tokenInfo = await verifyToken(c.env, token);

    if (!tokenInfo) {
        return c.json(
            { error: 'Unauthorized', message: 'Token 无效或已过期，请重新登录' },
            401
        );
    }

    // 4. 将用户信息存储在 context 中，供后续使用
    c.set('user', tokenInfo);

    // 5. 继续处理请求
    return next();
}

/**
 * 管理员权限中间件
 * 
 * 要求用户必须是 admin 角色
 */
export async function adminMiddleware(
    c: Context<{ Bindings: Env; Variables: { user?: TokenInfo } }>,
    next: Next
) {
    const user = c.get('user');

    if (!user || user.role !== 'admin') {
        return c.json(
            { error: 'Forbidden', message: '需要管理员权限' },
            403
        );
    }

    return next();
}

