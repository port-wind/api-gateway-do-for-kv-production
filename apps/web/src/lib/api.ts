/**
 * 通用 API 工具函数
 * 
 * 统一处理 API 请求、认证、错误处理、无感刷新
 */

import { useEnvironmentStore } from '@/stores/environment-store';
import { useAuthStore } from '@/stores/auth-store';

// 刷新锁，防止多个请求同时刷新 token
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

/**
 * 获取当前环境的完整 API URL
 */
export function getApiUrl(path: string): string {
  const currentEnv = useEnvironmentStore.getState().currentEnvironment;

  // 开发模式下，本地环境使用空 baseURL（Vite 代理）
  const baseURL = (currentEnv.id === 'local' && import.meta.env.DEV)
    ? ''
    : currentEnv.baseURL;

  return `${baseURL}${path}`;
}

/**
 * 获取认证 headers
 */
export function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('auth_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * 刷新 Access Token
 * 
 * 使用 Refresh Token 获取新的 Access Token
 */
async function refreshToken(): Promise<boolean> {
  // 如果正在刷新，等待刷新完成
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  // 设置刷新锁
  isRefreshing = true;

  refreshPromise = (async () => {
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        return false;
      }

      const currentEnv = useEnvironmentStore.getState().currentEnvironment;
      const baseURL = (currentEnv.id === 'local' && import.meta.env.DEV) ? '' : currentEnv.baseURL;

      const response = await fetch(`${baseURL}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        // Refresh Token 也过期了，清除所有认证信息
        useAuthStore.getState().auth.reset();
        return false;
      }

      const data = await response.json();
      if (data.success && data.accessToken) {
        // 更新 Access Token
        useAuthStore.getState().auth.setAccessToken(data.accessToken, data.user);
        return true;
      }

      return false;
    } catch {
      // 刷新失败，静默处理
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * 通用 API fetcher（GET 请求，自动添加认证和无感刷新）
 * 
 * 兼容两种响应格式：
 * 1. 包装格式：{ success: true, data: {...} }（新的认证 API）
 * 2. 直接格式：{ data: [...], pagination: {...} }（现有的 admin API）
 */
export async function apiFetch<T>(url: string): Promise<T> {
  const fullUrl = getApiUrl(url);
  let headers = getAuthHeaders();

  let res = await fetch(fullUrl, { headers });

  // 401 未认证，尝试刷新 token
  if (res.status === 401) {
    const refreshed = await refreshToken();

    if (refreshed) {
      // 刷新成功，重试原请求
      headers = getAuthHeaders();
      res = await fetch(fullUrl, { headers });
    } else {
      // 刷新失败，跳转到登录页
      throw new Error('登录已过期，请重新登录');
    }
  }

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  const data = await res.json();

  // 检查 success 字段（如果存在）
  if ('success' in data && !data.success) {
    throw new Error(data.error || data.message || 'API request failed');
  }

  // 直接返回整个响应对象，不做任何提取
  // 这样可以保留 pagination, timestamp 等所有字段
  return data as T;
}

/**
 * POST 请求（自动添加认证和无感刷新）
 * 
 * 兼容两种响应格式
 */
export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const fullUrl = getApiUrl(url);
  let headers = getAuthHeaders();

  let res = await fetch(fullUrl, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // 401 未认证，尝试刷新 token
  if (res.status === 401) {
    const refreshed = await refreshToken();

    if (refreshed) {
      // 刷新成功，重试原请求
      headers = getAuthHeaders();
      res = await fetch(fullUrl, {
        method: 'POST',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } else {
      throw new Error('登录已过期，请重新登录');
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `API error: ${res.status}`);
  }

  const data = await res.json();

  // 检查 success 字段（如果存在）
  if ('success' in data && !data.success) {
    throw new Error(data.error || data.message || 'API request failed');
  }

  // 直接返回整个响应对象
  return data as T;
}

/**
 * PUT 请求（自动添加认证和无感刷新）
 */
export async function apiPut<T>(url: string, body?: unknown): Promise<T> {
  const fullUrl = getApiUrl(url);
  let headers = getAuthHeaders();

  let res = await fetch(fullUrl, {
    method: 'PUT',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // 401 未认证，尝试刷新 token
  if (res.status === 401) {
    const refreshed = await refreshToken();

    if (refreshed) {
      headers = getAuthHeaders();
      res = await fetch(fullUrl, {
        method: 'PUT',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } else {
      throw new Error('登录已过期，请重新登录');
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `API error: ${res.status}`);
  }

  const data = await res.json();

  // 检查 success 字段（如果存在）
  if ('success' in data && !data.success) {
    throw new Error(data.error || data.message || 'API request failed');
  }

  // 直接返回整个响应对象
  return data as T;
}

/**
 * DELETE 请求（自动添加认证和无感刷新）
 */
export async function apiDelete<T>(url: string): Promise<T> {
  const fullUrl = getApiUrl(url);
  let headers = getAuthHeaders();

  let res = await fetch(fullUrl, {
    method: 'DELETE',
    headers,
  });

  // 401 未认证，尝试刷新 token
  if (res.status === 401) {
    const refreshed = await refreshToken();

    if (refreshed) {
      headers = getAuthHeaders();
      res = await fetch(fullUrl, {
        method: 'DELETE',
        headers,
      });
    } else {
      throw new Error('登录已过期，请重新登录');
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `API error: ${res.status}`);
  }

  const data = await res.json();

  // 检查 success 字段（如果存在）
  if ('success' in data && !data.success) {
    throw new Error(data.error || data.message || 'API request failed');
  }

  // 直接返回整个响应对象
  return data as T;
}

/**
 * API 客户端对象 - 维护向后兼容性
 * 
 * 提供与旧代码兼容的 API 方法集合
 */
export const apiClient = {
  // 通用 HTTP 方法
  async get(url: string, options?: { params?: Record<string, unknown> }) {
    const queryString = options?.params
      ? '?' + new URLSearchParams(options.params as Record<string, string>).toString()
      : '';
    return { data: await apiFetch(`${url}${queryString}`) };
  },

  async post(url: string, data?: unknown) {
    return { data: await apiPost(url, data) };
  },

  async put(url: string, data?: unknown) {
    return { data: await apiPut(url, data) };
  },

  async patch(url: string, data?: unknown) {
    return { data: await apiPost(url, data) };
  },

  async delete(url: string) {
    return { data: await apiDelete(url) };
  },

  // 缓存相关 API
  async getPathCacheEntries(path: string, options?: { limit?: number; offset?: number }) {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    const queryString = params.toString() ? `?${params.toString()}` : '';
    // 修正路径：后端实际路由是 /api/admin/paths/:path/cache-entries
    return await apiFetch(`/api/admin/paths/${encodeURIComponent(path)}/cache-entries${queryString}`);
  },

  async deleteCacheEntry(cacheKey: string) {
    // 修正路径：后端实际路由是 /api/admin/cache/:cacheKey
    return await apiDelete(`/api/admin/cache/${encodeURIComponent(cacheKey)}`);
  },

  async refreshPathCache(path: string) {
    // 修正路径：后端实际路由是 /api/admin/cache/refresh
    return await apiPost(`/api/admin/cache/refresh`, { path });
  },

  // IP 监控相关 API
  async getIpList(params?: Record<string, unknown>) {
    const queryString = params
      ? '?' + new URLSearchParams(params as Record<string, string>).toString()
      : '';
    return await apiFetch(`/api/admin/ip-monitor/ips${queryString}`);
  },

  async getIpDetail(ipHash: string) {
    return await apiFetch(`/api/admin/ip-monitor/ips/${ipHash}`);
  },

  async getIpPaths(ipHash: string, params?: Record<string, unknown>) {
    const queryString = params
      ? '?' + new URLSearchParams(params as Record<string, string>).toString()
      : '';
    return await apiFetch(`/api/admin/ip-monitor/ips/${ipHash}/paths${queryString}`);
  },

  async getIpRules(params?: Record<string, unknown>) {
    const queryString = params
      ? '?' + new URLSearchParams(params as Record<string, string>).toString()
      : '';
    return await apiFetch(`/api/admin/ip-monitor/rules${queryString}`);
  },

  async getIpMonitorConfig() {
    return await apiFetch('/api/admin/ip-monitor/config');
  },

  async createIpRule(data: unknown) {
    return await apiPost('/api/admin/ip-monitor/rules', data);
  },

  async deleteIpRule(ipHash: string) {
    return await apiDelete(`/api/admin/ip-monitor/rules/${ipHash}`);
  },

  async updateIpMonitorConfig(config: unknown) {
    return await apiPut('/api/admin/ip-monitor/config', config);
  },

  // 路径管理相关 API
  async getUnifiedPaths(params?: Record<string, unknown>) {
    const queryString = params
      ? '?' + new URLSearchParams(params as Record<string, string>).toString()
      : '';
    return await apiFetch(`/api/admin/paths${queryString}`);
  },

  async getUnifiedPathConfig(path: string) {
    return await apiFetch(`/api/admin/paths/${encodeURIComponent(path)}`);
  },

  async updateUnifiedPathConfig(path: string, config: unknown) {
    return await apiPut(`/api/admin/paths/${encodeURIComponent(path)}`, config);
  },

  async batchUpdateUnifiedPaths(operations: unknown[]) {
    return await apiPost('/api/admin/paths/batch', { operations });
  },

  async getPathsHealth() {
    return await apiFetch('/api/admin/paths/health');
  },

  async togglePathCache(path: string, _enabled: boolean) {
    return await apiPost('/api/admin/paths/batch', {
      operations: [{ type: 'toggle-cache', path }],
    });
  },

  async togglePathRateLimit(path: string, _enabled: boolean, _limit: number) {
    return await apiPost('/api/admin/paths/batch', {
      operations: [{ type: 'toggle-rate-limit', path }],
    });
  },

  async togglePathGeo(path: string, _enabled: boolean, _countries: string[]) {
    return await apiPost('/api/admin/paths/batch', {
      operations: [{ type: 'toggle-geo', path }],
    });
  },

  async deletePathAllConfigs(path: string) {
    return await apiPost('/api/admin/paths/batch', {
      operations: [{ type: 'delete', path }],
    });
  },

  // 代理路由相关 API
  async getProxyRoutes(params?: Record<string, unknown>) {
    const queryString = params
      ? '?' + new URLSearchParams(params as Record<string, string>).toString()
      : '';
    return await apiFetch(`/api/admin/proxy-routes${queryString}`);
  },

  async getProxyRouteStats() {
    return await apiFetch('/api/admin/proxy-routes/stats');
  },

  async createProxyRoute(data: unknown) {
    return await apiPost('/api/admin/proxy-routes', data);
  },

  async updateProxyRoute(id: string, data: unknown) {
    return await apiPut(`/api/admin/proxy-routes/${id}`, data);
  },

  async deleteProxyRoute(id: string) {
    return await apiDelete(`/api/admin/proxy-routes/${id}`);
  },

  async batchProxyRouteOperation(operation: string, ids: string[]) {
    return await apiPost('/api/admin/proxy-routes/batch', { operation, ids });
  },

  async reorderProxyRoutes(routes: unknown[]) {
    return await apiPost('/api/admin/proxy-routes/reorder', { routes });
  },

  // 限流相关 API
  async getRateLimitConfig() {
    return await apiFetch('/api/admin/rate-limit/config');
  },

  async updateRateLimitConfig(config: unknown) {
    return await apiPut('/api/admin/rate-limit/config', config);
  },

  async getRateLimitHealth() {
    return await apiFetch('/api/admin/rate-limit/health');
  },

  async getRateLimitStatus(ip: string) {
    return await apiFetch(`/api/admin/rate-limit/status/${ip}`);
  },

  async resetRateLimit(ip: string) {
    return await apiPost(`/api/admin/rate-limit/reset/${ip}`);
  },
};

/**
 * 获取当前 API 客户端
 * 
 * 用于与旧代码兼容
 */
export function getCurrentApiClient() {
  return apiClient;
}
