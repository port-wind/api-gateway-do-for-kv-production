import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api'
import type { ProxyRoute } from '@/types/api'

interface ProxyRouteSearchParams {
  q?: string
  page?: number
  limit?: number
  enabled?: boolean
}

interface ProxyRoutePaginationResponse<T = ProxyRoute> {
  success: boolean
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
  timestamp: string
}

interface ProxyRouteStats {
  totalRoutes: number
  enabledRoutes: number
  disabledRoutes: number
  routesWithCache: number
  routesWithRateLimit: number
  routesWithGeo: number
}

interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
  timestamp: string
}

// API 函数 - 现在使用 apiClient
async function fetchProxyRoutes(params: ProxyRouteSearchParams): Promise<ProxyRoutePaginationResponse> {
  return (await apiClient.getProxyRoutes(params as Record<string, unknown>)) as ProxyRoutePaginationResponse
}

async function fetchProxyRouteStats(): Promise<ApiResponse<ProxyRouteStats>> {
  return (await apiClient.getProxyRouteStats()) as ApiResponse<ProxyRouteStats>
}

async function createProxyRoute(data: Omit<ProxyRoute, 'id'>): Promise<ApiResponse<ProxyRoute>> {
  return (await apiClient.createProxyRoute(data)) as ApiResponse<ProxyRoute>
}

async function updateProxyRoute(id: string, data: Partial<ProxyRoute>): Promise<ApiResponse<ProxyRoute>> {
  return (await apiClient.updateProxyRoute(id, data)) as ApiResponse<ProxyRoute>
}

async function deleteProxyRoute(id: string): Promise<ApiResponse<ProxyRoute>> {
  return (await apiClient.deleteProxyRoute(id)) as ApiResponse<ProxyRoute>
}

async function batchOperationProxyRoutes(operation: 'enable' | 'disable' | 'delete', ids: string[]): Promise<ApiResponse> {
  return (await apiClient.batchProxyRouteOperation(operation, ids)) as ApiResponse
}

async function reorderProxyRoutes(routes: { id: string; priority: number }[]): Promise<ApiResponse> {
  return (await apiClient.reorderProxyRoutes(routes)) as ApiResponse
}

// Query Keys
const QUERY_KEYS = {
  proxyRoutes: (params: ProxyRouteSearchParams) => ['proxy-routes', params],
  stats: () => ['proxy-routes', 'stats'],
} as const

// Hooks
export function useProxyRoutes(params: ProxyRouteSearchParams) {
  return useQuery({
    queryKey: QUERY_KEYS.proxyRoutes(params),
    queryFn: () => fetchProxyRoutes(params),
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: false,
  })
}

export function useProxyRouteStats() {
  return useQuery({
    queryKey: QUERY_KEYS.stats(),
    queryFn: fetchProxyRouteStats,
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
  })
}

export function useCreateProxyRoute() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createProxyRoute,
    onSuccess: (data) => {
      // 刷新相关查询
      queryClient.invalidateQueries({ queryKey: ['proxy-routes'] })
      toast.success(data.message || '代理路由创建成功')
    },
    onError: (error: Error) => {
      toast.error(error.message || '创建代理路由失败')
    },
  })
}

export function useUpdateProxyRoute() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProxyRoute> }) =>
      updateProxyRoute(id, data),
    onSuccess: (data) => {
      // 刷新相关查询
      queryClient.invalidateQueries({ queryKey: ['proxy-routes'] })
      toast.success(data.message || '代理路由更新成功')
    },
    onError: (error: Error) => {
      toast.error(error.message || '更新代理路由失败')
    },
  })
}

export function useDeleteProxyRoute() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteProxyRoute,
    onSuccess: (data) => {
      // 刷新相关查询
      queryClient.invalidateQueries({ queryKey: ['proxy-routes'] })
      toast.success(data.message || '代理路由删除成功')
    },
    onError: (error: Error) => {
      toast.error(error.message || '删除代理路由失败')
    },
  })
}

export function useBatchProxyRouteOperation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ operation, ids }: { operation: 'enable' | 'disable' | 'delete'; ids: string[] }) =>
      batchOperationProxyRoutes(operation, ids),
    onSuccess: (data) => {
      // 刷新相关查询
      queryClient.invalidateQueries({ queryKey: ['proxy-routes'] })
      toast.success(data.message || '批量操作完成')
    },
    onError: (error: Error) => {
      toast.error(error.message || '批量操作失败')
    },
  })
}

export function useReorderProxyRoutes() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: reorderProxyRoutes,
    onSuccess: (data) => {
      // 刷新相关查询
      queryClient.invalidateQueries({ queryKey: ['proxy-routes'] })
      toast.success(data.message || '路由优先级调整成功')
    },
    onError: (error: Error) => {
      toast.error(error.message || '调整路由优先级失败')
    },
  })
}

// 组合 Hook
export function useProxyRouteManagement(params: ProxyRouteSearchParams) {
  const routesQuery = useProxyRoutes(params)
  const statsQuery = useProxyRouteStats()

  return {
    routes: routesQuery.data,
    stats: statsQuery.data?.data,
    isLoading: routesQuery.isLoading || statsQuery.isLoading,
    isUpdating: routesQuery.isFetching || statsQuery.isFetching,
    hasError: routesQuery.isError || statsQuery.isError,
    error: routesQuery.error || statsQuery.error,
    queries: {
      routes: routesQuery,
      stats: statsQuery,
    },
  }
}