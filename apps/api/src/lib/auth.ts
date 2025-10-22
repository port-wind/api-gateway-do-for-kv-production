/**
 * 简单的认证工具库
 * 
 * 特性：
 * - 使用 Web Crypto API 进行密码哈希
 * - Token 存储在 KV 中，自动过期
 * - 无需额外依赖
 */

import type { Env } from '../types/env';

/**
 * 用户信息
 */
export interface User {
    username: string;
    passwordHash: string;
    role: 'admin' | 'user';
    createdAt: string;
}

/**
 * Token 信息
 */
export interface TokenInfo {
    username: string;
    role: string;
    createdAt: string;
}

const ACCESS_TOKEN_PREFIX = 'auth:access:';
const REFRESH_TOKEN_PREFIX = 'auth:refresh:';
const USER_PREFIX = 'auth:user:';

// Access Token: 1 小时（用于 API 请求）
const ACCESS_TOKEN_EXPIRY_SECONDS = 60 * 60; // 1 小时

// Refresh Token: 7 天（用于刷新 Access Token）
const REFRESH_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 天

/**
 * 生成随机 Token
 */
function generateToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * 使用 SHA-256 哈希密码
 */
async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 验证密码
 */
async function verifyPassword(password: string, hash: string): Promise<boolean> {
    const passwordHash = await hashPassword(password);
    return passwordHash === hash;
}

/**
 * 创建用户
 */
export async function createUser(
    env: Env,
    username: string,
    password: string,
    role: 'admin' | 'user' = 'user'
): Promise<User> {
    const passwordHash = await hashPassword(password);
    const user: User = {
        username,
        passwordHash,
        role,
        createdAt: new Date().toISOString(),
    };

    await env.API_GATEWAY_STORAGE.put(
        `${USER_PREFIX}${username}`,
        JSON.stringify(user)
    );

    return user;
}

/**
 * 获取用户
 */
export async function getUser(env: Env, username: string): Promise<User | null> {
    const userJson = await env.API_GATEWAY_STORAGE.get(`${USER_PREFIX}${username}`);
    if (!userJson) {
        return null;
    }
    return JSON.parse(userJson) as User;
}

/**
 * 登录（创建 Access Token 和 Refresh Token）
 */
export async function login(
    env: Env,
    username: string,
    password: string
): Promise<{ accessToken: string; refreshToken: string; user: Omit<User, 'passwordHash'> } | null> {
    // 1. 查找用户
    const user = await getUser(env, username);
    if (!user) {
        return null;
    }

    // 2. 验证密码
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
        return null;
    }

    // 3. 生成 Access Token 和 Refresh Token
    const accessToken = generateToken();
    const refreshToken = generateToken();
    const tokenInfo: TokenInfo = {
        username: user.username,
        role: user.role,
        createdAt: new Date().toISOString(),
    };

    // 4. 存储 Access Token（短期，1小时）
    await env.API_GATEWAY_STORAGE.put(
        `${ACCESS_TOKEN_PREFIX}${accessToken}`,
        JSON.stringify(tokenInfo),
        { expirationTtl: ACCESS_TOKEN_EXPIRY_SECONDS }
    );

    // 5. 存储 Refresh Token（长期，7天）
    // Refresh Token 关联到用户名，用于刷新时验证
    await env.API_GATEWAY_STORAGE.put(
        `${REFRESH_TOKEN_PREFIX}${refreshToken}`,
        JSON.stringify({ username: user.username, createdAt: new Date().toISOString() }),
        { expirationTtl: REFRESH_TOKEN_EXPIRY_SECONDS }
    );

    // 6. 返回 Tokens 和用户信息（不含密码）
    const { passwordHash, ...userWithoutPassword } = user;
    return { accessToken, refreshToken, user: userWithoutPassword };
}

/**
 * 验证 Access Token
 */
export async function verifyToken(env: Env, token: string): Promise<TokenInfo | null> {
    const tokenJson = await env.API_GATEWAY_STORAGE.get(`${ACCESS_TOKEN_PREFIX}${token}`);
    if (!tokenJson) {
        return null;
    }
    return JSON.parse(tokenJson) as TokenInfo;
}

/**
 * 刷新 Access Token
 * 
 * 使用 Refresh Token 获取新的 Access Token
 */
export async function refreshAccessToken(
    env: Env,
    refreshToken: string
): Promise<{ accessToken: string; user: Omit<User, 'passwordHash'> } | null> {
    // 1. 验证 Refresh Token
    const refreshTokenJson = await env.API_GATEWAY_STORAGE.get(
        `${REFRESH_TOKEN_PREFIX}${refreshToken}`
    );

    if (!refreshTokenJson) {
        return null;
    }

    const refreshTokenData = JSON.parse(refreshTokenJson) as { username: string; createdAt: string };

    // 2. 获取用户信息
    const user = await getUser(env, refreshTokenData.username);
    if (!user) {
        return null;
    }

    // 3. 生成新的 Access Token
    const newAccessToken = generateToken();
    const tokenInfo: TokenInfo = {
        username: user.username,
        role: user.role,
        createdAt: new Date().toISOString(),
    };

    // 4. 存储新的 Access Token
    await env.API_GATEWAY_STORAGE.put(
        `${ACCESS_TOKEN_PREFIX}${newAccessToken}`,
        JSON.stringify(tokenInfo),
        { expirationTtl: ACCESS_TOKEN_EXPIRY_SECONDS }
    );

    // 5. 返回新 Token 和用户信息
    const { passwordHash, ...userWithoutPassword } = user;
    return { accessToken: newAccessToken, user: userWithoutPassword };
}

/**
 * 登出（删除 Access Token 和 Refresh Token）
 */
export async function logout(
    env: Env,
    accessToken: string,
    refreshToken?: string
): Promise<void> {
    // 删除 Access Token
    await env.API_GATEWAY_STORAGE.delete(`${ACCESS_TOKEN_PREFIX}${accessToken}`);

    // 如果提供了 Refresh Token，也删除它
    if (refreshToken) {
        await env.API_GATEWAY_STORAGE.delete(`${REFRESH_TOKEN_PREFIX}${refreshToken}`);
    }
}

/**
 * 初始化默认管理员账号
 * 
 * 在首次部署时调用，创建默认的 admin 账号
 */
export async function initDefaultAdmin(env: Env): Promise<void> {
    const adminUsername = 'admin';
    const existingAdmin = await getUser(env, adminUsername);

    if (!existingAdmin) {
        // 创建默认管理员账号：admin / admin123
        // ⚠️ 生产环境部署后请立即修改密码！
        await createUser(env, adminUsername, 'admin123', 'admin');
        console.log('✅ 默认管理员账号已创建: admin / admin123');
    }
}

