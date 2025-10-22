/**
 * 认证 API Hooks
 */

import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '@/stores/auth-store';
import { useEnvironmentStore } from '@/stores/environment-store';

interface User {
    username: string;
    role: string;
    createdAt: string;
}

interface LoginRequest {
    username: string;
    password: string;
}

interface LoginResponse {
    success: boolean;
    accessToken: string;
    refreshToken: string;
    user: User;
}

interface ChangePasswordRequest {
    oldPassword: string;
    newPassword: string;
}

/**
 * 登录 Hook
 */
export function useLogin() {
    const navigate = useNavigate();
    const { auth } = useAuthStore();

    return useMutation({
        mutationFn: async (credentials: LoginRequest) => {
            // 获取当前环境的 API URL
            const currentEnv = useEnvironmentStore.getState().currentEnvironment;
            const baseURL = (currentEnv.id === 'local' && import.meta.env.DEV) ? '' : currentEnv.baseURL;

            const response = await fetch(`${baseURL}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(credentials),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || '登录失败');
            }

            return response.json() as Promise<LoginResponse>;
        },
        onSuccess: (data) => {
            // 保存到 auth store（Access Token + Refresh Token）
            const userWithExp = { ...data.user, exp: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000 };
            auth.setTokens(data.accessToken, data.refreshToken, userWithExp);
            // 登录成功后跳转到首页
            navigate({ to: '/' });
        },
    });
}

/**
 * 登出 Hook
 */
export function useLogout() {
    const navigate = useNavigate();
    const { auth } = useAuthStore();

    return useMutation({
        mutationFn: async () => {
            const accessToken = auth.accessToken;
            const refreshToken = auth.refreshToken;

            if (accessToken) {
                const currentEnv = useEnvironmentStore.getState().currentEnvironment;
                const baseURL = (currentEnv.id === 'local' && import.meta.env.DEV) ? '' : currentEnv.baseURL;

                await fetch(`${baseURL}/api/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ refreshToken }),
                });
            }
        },
        onSettled: () => {
            // 无论成功失败都清除本地认证信息
            auth.reset();
            // 跳转到登录页
            navigate({ to: '/sign-in' });
        },
    });
}

/**
 * 修改密码 Hook
 */
export function useChangePassword() {
    const { auth } = useAuthStore();

    return useMutation({
        mutationFn: async ({ oldPassword, newPassword }: ChangePasswordRequest) => {
            const token = auth.accessToken;
            if (!token) {
                throw new Error('未登录');
            }

            const currentEnv = useEnvironmentStore.getState().currentEnvironment;
            const baseURL = (currentEnv.id === 'local' && import.meta.env.DEV) ? '' : currentEnv.baseURL;

            const response = await fetch(`${baseURL}/api/auth/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ oldPassword, newPassword }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || '修改密码失败');
            }

            return response.json();
        },
        onSuccess: () => {
            // 修改密码成功后需要重新登录
            auth.reset();
        },
    });
}

/**
 * 初始化管理员账号 Hook
 */
export function useInitAdmin() {
    return useMutation({
        mutationFn: async () => {
            const currentEnv = useEnvironmentStore.getState().currentEnvironment;
            const baseURL = (currentEnv.id === 'local' && import.meta.env.DEV) ? '' : currentEnv.baseURL;

            const response = await fetch(`${baseURL}/api/auth/init`, {
                method: 'POST',
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || '初始化失败');
            }

            return response.json();
        },
    });
}

