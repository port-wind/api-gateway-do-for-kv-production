/**
 * 认证路由
 * 
 * 提供登录、登出、获取当前用户信息等接口
 */

import { Hono } from 'hono';
import type { Env } from '../types/env';
import { login, logout, verifyToken, createUser, getUser, initDefaultAdmin, refreshAccessToken, type TokenInfo } from '../lib/auth';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user?: TokenInfo } }>();

/**
 * POST /api/auth/login
 * 用户登录
 */
app.post('/login', async (c) => {
    try {
        const { username, password } = await c.req.json();

        if (!username || !password) {
            return c.json(
                { error: 'Bad Request', message: '用户名和密码不能为空' },
                400
            );
        }

        // 尝试登录
        const result = await login(c.env, username, password);

        if (!result) {
            return c.json(
                { error: 'Unauthorized', message: '用户名或密码错误' },
                401
            );
        }

        return c.json({
            success: true,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            user: result.user,
        });
    } catch (error) {
        console.error('登录错误:', error);
        return c.json(
            { error: 'Internal Server Error', message: '登录失败，请稍后重试' },
            500
        );
    }
});

/**
 * POST /api/auth/refresh
 * 刷新 Access Token（无感刷新）
 */
app.post('/refresh', async (c) => {
    try {
        const { refreshToken } = await c.req.json();

        if (!refreshToken) {
            return c.json(
                { error: 'Bad Request', message: 'Refresh Token 不能为空' },
                400
            );
        }

        // 使用 Refresh Token 获取新的 Access Token
        const result = await refreshAccessToken(c.env, refreshToken);

        if (!result) {
            return c.json(
                { error: 'Unauthorized', message: 'Refresh Token 无效或已过期，请重新登录' },
                401
            );
        }

        return c.json({
            success: true,
            accessToken: result.accessToken,
            user: result.user,
        });
    } catch (error) {
        console.error('刷新 Token 错误:', error);
        return c.json(
            { error: 'Internal Server Error', message: '刷新 Token 失败' },
            500
        );
    }
});

/**
 * POST /api/auth/logout
 * 用户登出（需要认证）
 */
app.post('/logout', authMiddleware, async (c) => {
    try {
        const authHeader = c.req.header('Authorization');
        const { refreshToken } = await c.req.json().catch(() => ({ refreshToken: undefined }));

        if (authHeader) {
            const accessToken = authHeader.substring(7);
            await logout(c.env, accessToken, refreshToken);
        }

        return c.json({ success: true, message: '已成功登出' });
    } catch (error) {
        console.error('登出错误:', error);
        return c.json(
            { error: 'Internal Server Error', message: '登出失败' },
            500
        );
    }
});

/**
 * GET /api/auth/me
 * 获取当前登录用户信息（需要认证）
 */
app.get('/me', authMiddleware, async (c) => {
    try {
        const tokenInfo = c.get('user')!;

        // 从数据库获取完整用户信息
        const user = await getUser(c.env, tokenInfo.username);

        if (!user) {
            return c.json(
                { error: 'Not Found', message: '用户不存在' },
                404
            );
        }

        // 返回用户信息（不含密码）
        const { passwordHash, ...userWithoutPassword } = user;
        return c.json({
            success: true,
            user: userWithoutPassword,
        });
    } catch (error) {
        console.error('获取用户信息错误:', error);
        return c.json(
            { error: 'Internal Server Error', message: '获取用户信息失败' },
            500
        );
    }
});

/**
 * POST /api/auth/change-password
 * 修改密码（需要认证）
 */
app.post('/change-password', authMiddleware, async (c) => {
    try {
        const tokenInfo = c.get('user')!;
        const { oldPassword, newPassword } = await c.req.json();

        if (!oldPassword || !newPassword) {
            return c.json(
                { error: 'Bad Request', message: '旧密码和新密码不能为空' },
                400
            );
        }

        if (newPassword.length < 6) {
            return c.json(
                { error: 'Bad Request', message: '新密码长度不能少于 6 个字符' },
                400
            );
        }

        // 验证旧密码
        const loginResult = await login(c.env, tokenInfo.username, oldPassword);
        if (!loginResult) {
            return c.json(
                { error: 'Unauthorized', message: '旧密码错误' },
                401
            );
        }

        // 获取用户角色
        const user = await getUser(c.env, tokenInfo.username);
        if (!user) {
            return c.json(
                { error: 'Not Found', message: '用户不存在' },
                404
            );
        }

        // 创建新用户（覆盖旧用户）
        await createUser(c.env, tokenInfo.username, newPassword, user.role);

        return c.json({
            success: true,
            message: '密码修改成功，请重新登录',
        });
    } catch (error) {
        console.error('修改密码错误:', error);
        return c.json(
            { error: 'Internal Server Error', message: '修改密码失败' },
            500
        );
    }
});

/**
 * POST /api/auth/init
 * 初始化默认管理员账号（仅在没有用户时可用）
 */
app.post('/init', async (c) => {
    try {
        // 检查是否已存在管理员
        const admin = await getUser(c.env, 'admin');
        if (admin) {
            return c.json(
                { error: 'Conflict', message: '管理员账号已存在' },
                409
            );
        }

        // 初始化默认管理员
        await initDefaultAdmin(c.env);

        return c.json({
            success: true,
            message: '默认管理员账号已创建',
            credentials: {
                username: 'admin',
                password: 'admin123',
                warning: '⚠️ 请立即登录并修改密码！',
            },
        });
    } catch (error) {
        console.error('初始化管理员错误:', error);
        return c.json(
            { error: 'Internal Server Error', message: '初始化失败' },
            500
        );
    }
});

export default app;

