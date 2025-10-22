/**
 * 前端认证工具库
 */

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

export interface User {
    username: string;
    role: string;
    createdAt: string;
}

/**
 * 保存认证信息到 localStorage
 */
export function saveAuth(token: string, user: User): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * 获取 token
 */
export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

/**
 * 获取用户信息
 */
export function getUser(): User | null {
    const userJson = localStorage.getItem(USER_KEY);
    if (!userJson) return null;
    try {
        return JSON.parse(userJson) as User;
    } catch {
        return null;
    }
}

/**
 * 清除认证信息
 */
export function clearAuth(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

/**
 * 检查是否已登录
 */
export function isAuthenticated(): boolean {
    return !!getToken();
}

/**
 * 创建带 token 的请求 headers
 */
export function getAuthHeaders(): HeadersInit {
    const token = getToken();
    if (!token) {
        return {};
    }
    return {
        'Authorization': `Bearer ${token}`,
    };
}

