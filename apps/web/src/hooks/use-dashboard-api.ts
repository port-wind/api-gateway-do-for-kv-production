/**
 * Dashboard API Hooks
 * 
 * 使用 SWR 封装 Dashboard API 调用，提供自动刷新和缓存
 */

import useSWR from 'swr';
import { useEnvironmentStore } from '@/stores/environment-store';
import { apiFetch } from '@/lib/api';
import type {
    DashboardOverview,
    TimeseriesResponse,
    RateLimitStats,
    RealtimeMapData,
    AlertsResponse,
} from '@/types/dashboard';

/**
 * 获取 Dashboard 概览数据
 * 
 * @returns Dashboard 概览数据，包含流量、可靠性、配置统计
 */
export function useDashboardOverview() {
    const currentEnv = useEnvironmentStore((state) => state.currentEnvironment.id);
    return useSWR<DashboardOverview>(
        ['/api/admin/dashboard/overview', currentEnv], // 包含环境 ID，切换时自动刷新
        async () => {
            const response = await apiFetch<{ success: boolean; data: DashboardOverview }>('/api/admin/dashboard/overview');
            // 如果响应包含 data 字段，提取它
            return 'data' in response ? response.data : response as unknown as DashboardOverview;
        },
        {
            refreshInterval: 60000, // 1 分钟刷新
            revalidateOnFocus: true,
            dedupingInterval: 10000, // 10 秒内去重
        }
    );
}

/**
 * 获取时间序列数据（用于趋势图表）
 * 
 * @param range 时间范围（24h | 7d）
 * @param metric 指标类型（requests | cache_hit | errors）
 * @returns 时间序列数据点数组和汇总统计
 */
export function useDashboardTimeseries(
    range: '24h' | '7d' = '24h',
    metric: 'requests' | 'cache_hit' | 'errors' = 'requests'
) {
    const currentEnv = useEnvironmentStore((state) => state.currentEnvironment.id);
    const path = `/api/admin/dashboard/timeseries?range=${range}&metric=${metric}`;
    return useSWR<TimeseriesResponse>(
        [path, currentEnv], // 包含环境 ID
        async () => {
            const response = await apiFetch<{ success: boolean; data: TimeseriesResponse }>(path);
            return 'data' in response ? response.data : response as unknown as TimeseriesResponse;
        },
        {
            refreshInterval: 300000, // 5 分钟刷新
            revalidateOnFocus: false,
        }
    );
}

/**
 * 获取 Rate Limiter 统计
 * 
 * @returns Rate Limiter 配置统计（Phase 1 简化版本）
 */
export function useRateLimitStats() {
    const currentEnv = useEnvironmentStore((state) => state.currentEnvironment.id);
    return useSWR<RateLimitStats>(
        ['/api/admin/dashboard/rate-limit/stats', currentEnv], // 包含环境 ID
        async () => {
            const response = await apiFetch<{ success: boolean; data: RateLimitStats }>('/api/admin/dashboard/rate-limit/stats');
            return 'data' in response ? response.data : response as unknown as RateLimitStats;
        },
        {
            refreshInterval: 120000, // 2 分钟刷新
            revalidateOnFocus: false,
        }
    );
}

/**
 * 获取实时地图数据
 * 
 * @param limit 返回条数（默认 50）
 * @returns 实时地图飞线数据和边缘节点
 */
export function useRealtimeMapData(limit: number = 50) {
    const currentEnv = useEnvironmentStore((state) => state.currentEnvironment.id);
    const path = `/api/admin/dashboard/realtime/recent?limit=${limit}`;
    return useSWR<RealtimeMapData>(
        [path, currentEnv], // 包含环境 ID
        async () => {
            const response = await apiFetch<{ success: boolean; events: unknown[]; edgeNodes: unknown[] }>(path);
            // RealtimeMapData 的结构是 { events: [], edgeNodes: [] }，不在 data 字段中
            return response as unknown as RealtimeMapData;
        },
        {
            refreshInterval: 300000, // 5 分钟刷新（与后端定时任务同步）
            revalidateOnFocus: false,
            dedupingInterval: 60000, // 1 分钟内去重
        }
    );
}

// 别名导出，保持向后兼容
export const useRealtimeRecent = useRealtimeMapData;

/**
 * 获取 Dashboard 告警
 * 
 * @param refreshInterval - 刷新间隔（毫秒），默认 60 秒
 */
export function useDashboardAlerts(refreshInterval: number = 60000) {
    const currentEnv = useEnvironmentStore((state) => state.currentEnvironment.id);
    const path = '/api/admin/dashboard/alerts';

    return useSWR<AlertsResponse>(
        [path, currentEnv],
        async () => {
            const response = await apiFetch<{ success: boolean; alerts: unknown[]; summary: unknown }>(path);
            // AlertsResponse 的结构是 { alerts: [], summary: {...} }，不在 data 字段中
            return response as unknown as AlertsResponse;
        },
        {
            refreshInterval,
            revalidateOnFocus: true,
            dedupingInterval: 30000,
        }
    );
}

/**
 * 手动刷新 Dashboard 概览数据
 */
export function refreshDashboardOverview() {
    // 使用 SWR 的 mutate 函数手动触发重新验证
    import('swr').then(({ mutate }) => {
        mutate('/api/admin/dashboard/overview');
    });
}

