/**
 * 地区访问控制规则管理 API Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCurrentApiClient } from '@/lib/api';

/**
 * 地区访问规则类型
 */
export interface GeoAccessRule {
    id: string;
    name: string;
    enabled: boolean;
    mode: 'allow' | 'block' | 'throttle';
    priority: number;
    scope: 'global' | 'path';
    path?: string;
    geoMatch: {
        type: 'country' | 'continent' | 'custom';
        countries?: string[];
        continents?: string[];
        customGroups?: string[];
    };
    throttleConfig?: {
        maxRequests: number;
        windowSeconds: number;
        action: 'delay' | 'reject';
    };
    response?: {
        statusCode: number;
        message: string;
        headers?: Record<string, string>;
    };
    metadata: {
        createdAt: string;
        updatedAt: string;
        createdBy?: string;
        comment?: string;
    };
}

/**
 * 地区规则集合
 */
export interface GeoRuleSet {
    version: number;
    defaultAction: 'allow' | 'block';
    rules: GeoAccessRule[];
    totalCount: number;
}

/**
 * 预定义地区组
 */
export interface PresetGeoGroup {
    id: string;
    name: string;
    countries: string[];
    description: string;
}

/**
 * 获取地区规则列表
 */
export function useGeoRules() {
    return useQuery<{ success: boolean; data: GeoRuleSet }>({
        queryKey: ['geo-rules'],
        queryFn: async () => {
            const client = getCurrentApiClient();
            const response = await client.get('/api/admin/geo/rules');
            return response.data as { success: boolean; data: GeoRuleSet };
        },
    });
}

/**
 * 获取预定义地区组列表
 */
export function usePresetGeoGroups() {
    return useQuery<{ success: boolean; data: PresetGeoGroup[] }>({
        queryKey: ['geo-groups', 'preset'],
        queryFn: async () => {
            const client = getCurrentApiClient();
            const response = await client.get('/api/admin/geo/rules/groups/preset');
            return response.data as { success: boolean; data: PresetGeoGroup[] };
        },
    });
}

/**
 * 创建地区规则
 */
export function useCreateGeoRule() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            name: string;
            mode: 'allow' | 'block';
            priority: number;
            geoMatch: GeoAccessRule['geoMatch'];
            response?: GeoAccessRule['response'];
            metadata?: { comment?: string };
        }) => {
            const client = getCurrentApiClient();
            const response = await client.post('/api/admin/geo/rules', data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['geo-rules'] });
        },
    });
}

/**
 * 更新地区规则
 */
export function useUpdateGeoRule() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            ruleId,
            updates
        }: {
            ruleId: string;
            updates: Partial<Omit<GeoAccessRule, 'id' | 'metadata'>>
        }) => {
            const client = getCurrentApiClient();
            const response = await client.put(`/api/admin/geo/rules/${ruleId}`, updates);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['geo-rules'] });
        },
    });
}

/**
 * 删除地区规则
 */
export function useDeleteGeoRule() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (ruleId: string) => {
            const client = getCurrentApiClient();
            const response = await client.delete(`/api/admin/geo/rules/${ruleId}`);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['geo-rules'] });
        },
    });
}

/**
 * 批量启用/禁用规则
 */
export function useBulkToggleGeoRules() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            ruleIds,
            enabled
        }: {
            ruleIds: string[];
            enabled: boolean
        }) => {
            const client = getCurrentApiClient();
            const response = await client.patch('/api/admin/geo/rules/bulk-toggle', {
                ruleIds,
                enabled,
            });
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['geo-rules'] });
        },
    });
}

/**
 * 综合地区规则管理 hook
 */
export function useGeoRulesManagement() {
    const rulesQuery = useGeoRules();
    const presetGroupsQuery = usePresetGeoGroups();

    const createRule = useCreateGeoRule();
    const updateRule = useUpdateGeoRule();
    const deleteRule = useDeleteGeoRule();
    const bulkToggle = useBulkToggleGeoRules();

    const isLoading = rulesQuery.isLoading || presetGroupsQuery.isLoading;
    const hasError = rulesQuery.error || presetGroupsQuery.error;
    const isUpdating = createRule.isPending || updateRule.isPending ||
        deleteRule.isPending || bulkToggle.isPending;

    return {
        // 数据
        rules: rulesQuery.data?.data.rules || [],
        ruleSet: rulesQuery.data?.data,
        presetGroups: presetGroupsQuery.data?.data || [],

        // 状态
        isLoading,
        isUpdating,
        hasError,

        // 操作方法
        createRule: createRule.mutate,
        updateRule: updateRule.mutate,
        deleteRule: deleteRule.mutate,
        bulkToggle: bulkToggle.mutate,

        // 查询对象（用于访问详细状态）
        queries: {
            rules: rulesQuery,
            presetGroups: presetGroupsQuery,
        },

        // 操作对象（用于访问详细状态）
        mutations: {
            createRule,
            updateRule,
            deleteRule,
            bulkToggle,
        },
    };
}

// ==================== 地区访问监控列表 API ==================== //

/**
 * 地区访问统计数据
 */
export interface GeoAccessStat {
    country: string;
    countryName: string;
    date: string;
    totalRequests: number;
    blockedRequests: number;
    throttledRequests: number;
    allowedRequests: number;
    successRate: number;
    blockRate: number;
    error4xx: number;
    error5xx: number;
    avgResponseTime: number;
    // p95ResponseTime?: number;  // TODO: 定时聚合时实现
    uniquePaths: number;
    topPaths: Array<{ path: string; count: number }>;
}

/**
 * 地区访问列表响应
 */
export interface GeoAccessListResponse {
    data: GeoAccessStat[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        hasMore: boolean;
    };
    summary: {
        totalCountries: number;
        totalRequests: number;
        totalBlocked: number;
        totalThrottled: number;
        avgBlockRate: number;
    };
}

/**
 * 地区路径统计
 */
export interface GeoPathStat {
    path: string;
    totalRequests: number;
    blockedRequests: number;
    throttledRequests: number;
    allowedRequests: number;
    successRate: number;
    avgResponseTime: number;
}

/**
 * 国家详情响应
 */
export interface GeoCountryDetail {
    country: string;
    countryName: string;
    stats: GeoAccessStat;
    pathBreakdown: GeoPathStat[];
    timeline: Array<{
        hour: string;
        requests: number;
        blocked: number;
        throttled: number;
    }>;
    existingRules: GeoAccessRule[];
}

/**
 * 获取地区访问列表
 */
export function useGeoAccessList(params: {
    date?: string;
    page?: number;
    limit?: number;
    sortBy?: 'total_requests' | 'blocked_requests' | 'success_rate';
    sortOrder?: 'asc' | 'desc';
    search?: string;
}) {
    return useQuery<GeoAccessListResponse>({
        // ✅ 使用稳定的原始值数组作为 key，避免对象引用导致的重复请求
        queryKey: [
            'geo-access-list',
            params.date,
            params.page,
            params.limit,
            params.sortBy,
            params.sortOrder,
            params.search,
        ],
        queryFn: async () => {
            const client = getCurrentApiClient();
            const response = await client.get('/api/admin/geo/access-list', {
                params,
            });
            return response.data as GeoAccessListResponse;
        },
        staleTime: 30_000,  // 30 秒
        refetchInterval: 60_000,  // 自动刷新 1 分钟
    });
}

/**
 * 获取国家详情
 */
export function useGeoCountryDetail(country: string, date?: string, enabled = true) {
    return useQuery<GeoCountryDetail>({
        // ✅ 已经使用稳定的原始值，无需修改
        queryKey: ['geo-country-detail', country, date],
        queryFn: async () => {
            const client = getCurrentApiClient();
            const response = await client.get(`/api/admin/geo/access-list/${country}`, {
                params: { date },
            });
            return response.data as GeoCountryDetail;
        },
        enabled,
    });
}

/**
 * 获取国家路径列表
 */
export function useGeoCountryPaths(
    country: string,
    params: { date?: string; page?: number; limit?: number },
    enabled = true
) {
    return useQuery<{
        data: GeoPathStat[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            hasMore: boolean;
        };
    }>({
        // ✅ 使用稳定的原始值数组作为 key
        queryKey: ['geo-country-paths', country, params.date, params.page, params.limit],
        queryFn: async () => {
            const client = getCurrentApiClient();
            const response = await client.get(`/api/admin/geo/access-list/${country}/paths`, {
                params,
            });
            return response.data as {
                data: GeoPathStat[];
                pagination: {
                    page: number;
                    limit: number;
                    total: number;
                    hasMore: boolean;
                };
            };
        },
        enabled,
    });
}

/**
 * 地区访问监控综合 Hook
 * 
 * 组合多个查询，提供统一的数据管理接口
 */
export function useGeoAccessManagement(params: {
    date?: string;
    page?: number;
    limit?: number;
    sortBy?: 'total_requests' | 'blocked_requests' | 'success_rate';
    sortOrder?: 'asc' | 'desc';
    search?: string;
}) {
    const accessListQuery = useGeoAccessList(params);

    return {
        // 访问列表数据
        accessList: accessListQuery.data?.data || [],
        pagination: accessListQuery.data?.pagination,
        summary: accessListQuery.data?.summary,

        // 加载状态
        isLoading: accessListQuery.isLoading,
        hasError: accessListQuery.isError,

        // 查询对象（用于刷新等操作）
        queries: {
            accessList: accessListQuery,
        },
    };
}

