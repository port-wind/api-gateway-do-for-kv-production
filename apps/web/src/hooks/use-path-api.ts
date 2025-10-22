import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api'
import type {
  UnifiedPathConfig,
  UnifiedPathOperation,
  PathsPaginationResponse,
  PathHealthResponse
} from '@/types/api'

// Query Keys
const PATHS_QUERY_KEYS = {
  all: ['paths'] as const,
  unified: ['paths', 'unified'] as const,
  list: (params?: { q?: string; page?: number; limit?: number }) => ['paths', 'unified', 'list', params] as const,
  detail: (path: string) => ['paths', 'unified', 'detail', path] as const,
  health: ['paths', 'health'] as const,
} as const

/**
 * 获取统一路径列表（支持搜索和分页）
 */
export function useUnifiedPaths(params?: { q?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: PATHS_QUERY_KEYS.list(params),
    queryFn: async (): Promise<PathsPaginationResponse> => {
      return (await apiClient.getUnifiedPaths(params)) as PathsPaginationResponse
    },
    refetchInterval: 30000, // 30 秒自动刷新
    retry: 2,
    retryDelay: 1000,
  })
}

/**
 * 获取单个路径的统一配置
 */
export function useUnifiedPathConfig(path: string, enabled: boolean = true) {
  return useQuery({
    queryKey: PATHS_QUERY_KEYS.detail(path),
    queryFn: async (): Promise<{ success: boolean; data: UnifiedPathConfig; timestamp: string }> => {
      return (await apiClient.getUnifiedPathConfig(path)) as { success: boolean; data: UnifiedPathConfig; timestamp: string }
    },
    enabled: enabled && !!path,
    retry: 2,
    retryDelay: 1000,
  })
}

/**
 * 更新单个路径的统一配置
 */
export function useUpdateUnifiedPathConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      path,
      config
    }: {
      path: string;
      config: Partial<UnifiedPathConfig>
    }) => {
      // 直接使用统一路径API，保留所有配置字段（包括TTL、version等）
      return await apiClient.updateUnifiedPathConfig(path, config)
    },
    onSuccess: (_, variables) => {
      // 刷新相关查询
      queryClient.invalidateQueries({ queryKey: PATHS_QUERY_KEYS.unified })
      queryClient.invalidateQueries({ queryKey: PATHS_QUERY_KEYS.detail(variables.path) })
      queryClient.invalidateQueries({ queryKey: PATHS_QUERY_KEYS.health })

      // 同时刷新原有的功能模块缓存
      queryClient.invalidateQueries({ queryKey: ['cache'] })
      queryClient.invalidateQueries({ queryKey: ['rate-limit'] })
      queryClient.invalidateQueries({ queryKey: ['geo'] })

      toast.success('路径配置更新成功')
    },
    onError: (_error) => {
      // Failed to update path config
      toast.error('路径配置更新失败')
    }
  })
}

/**
 * 批量更新路径配置
 */
export function useBatchUpdateUnifiedPaths() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (operations: UnifiedPathOperation[]) => {
      return (await apiClient.batchUpdateUnifiedPaths(operations)) as { summary?: { successCount: number; total: number } }
    },
    onSuccess: (data, variables) => {
      // 刷新所有路径相关查询
      queryClient.invalidateQueries({ queryKey: PATHS_QUERY_KEYS.unified })
      queryClient.invalidateQueries({ queryKey: PATHS_QUERY_KEYS.health })

      // 刷新所有功能模块缓存
      queryClient.invalidateQueries({ queryKey: ['cache'] })
      queryClient.invalidateQueries({ queryKey: ['rate-limit'] })
      queryClient.invalidateQueries({ queryKey: ['geo'] })

      const successCount = data.summary?.successCount || 0
      const totalCount = data.summary?.total || variables.length

      toast.success(`批量操作完成：${successCount}/${totalCount} 个操作成功`)
    },
    onError: (_error) => {
      // Failed to batch update paths
      toast.error('批量操作失败')
    }
  })
}

/**
 * 获取路径系统健康状态
 */
export function usePathsHealth() {
  return useQuery({
    queryKey: PATHS_QUERY_KEYS.health,
    queryFn: async (): Promise<PathHealthResponse> => {
      return (await apiClient.getPathsHealth()) as PathHealthResponse
    },
    refetchInterval: 15000, // 15 秒自动刷新健康状态
    retry: 1,
  })
}

/**
 * 批量切换路径功能状态
 */
export function useBatchTogglePaths() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      paths,
      feature
    }: {
      paths: string[]
      feature: 'cache' | 'rate-limit' | 'geo'
    }) => {
      // 获取当前统一路径数据，用于确定每个路径的当前状态
      const currentPaths = (await apiClient.getUnifiedPaths()) as PathsPaginationResponse
      const pathConfigs = currentPaths.data || []

      // 根据功能类型批量切换
      const promises = paths.map(async (path) => {
        const pathConfig = pathConfigs.find((p: UnifiedPathConfig) => p.path === path)

        switch (feature) {
          case 'cache': {
            const currentCacheEnabled = pathConfig?.cache.enabled || false
            return await apiClient.togglePathCache(path, !currentCacheEnabled)
          }

          case 'rate-limit': {
            const currentRateLimitEnabled = pathConfig?.rateLimit.enabled || false
            const limit = pathConfig?.rateLimit.limit || 60
            return await apiClient.togglePathRateLimit(path, !currentRateLimitEnabled, limit)
          }

          case 'geo': {
            const currentGeoEnabled = pathConfig?.geo.enabled || false
            const countries = pathConfig?.geo.countries || []
            return await apiClient.togglePathGeo(path, !currentGeoEnabled, countries)
          }

          default:
            throw new Error(`Unknown feature: ${feature}`)
        }
      })

      await Promise.all(promises)

      return {
        success: true,
        summary: {
          successCount: paths.length,
          total: paths.length
        }
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: PATHS_QUERY_KEYS.unified })
      queryClient.invalidateQueries({ queryKey: PATHS_QUERY_KEYS.health })

      // 刷新所有模块缓存
      queryClient.invalidateQueries({ queryKey: ['cache'] })
      queryClient.invalidateQueries({ queryKey: ['rate-limit'] })
      queryClient.invalidateQueries({ queryKey: ['geo'] })

      const featureNames = {
        'cache': '缓存',
        'rate-limit': '限流',
        'geo': '地域封锁'
      }

      const successCount = data.summary?.successCount || 0
      toast.success(`批量切换${featureNames[variables.feature]}：${successCount} 个路径已更新`)
    },
    onError: (_error) => {
      // Failed to batch toggle paths
      toast.error('批量切换操作失败')
    }
  })
}

/**
 * 删除路径的所有配置
 */
export function useDeletePaths() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (paths: string[]) => {
      // 并行删除所有路径在各模块中的配置
      const promises = paths.map(path => apiClient.deletePathAllConfigs(path))

      await Promise.all(promises)

      return {
        success: true,
        summary: {
          successCount: paths.length,
          total: paths.length
        }
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: PATHS_QUERY_KEYS.unified })
      queryClient.invalidateQueries({ queryKey: PATHS_QUERY_KEYS.health })

      // 刷新所有功能模块
      queryClient.invalidateQueries({ queryKey: ['cache'] })
      queryClient.invalidateQueries({ queryKey: ['rate-limit'] })
      queryClient.invalidateQueries({ queryKey: ['geo'] })

      const successCount = data.summary?.successCount || 0
      toast.success(`批量删除完成：${successCount} 个路径配置已删除`)
    },
    onError: (_error) => {
      // Failed to delete paths
      toast.error('批量删除失败')
    }
  })
}

/**
 * 自定义 hook：综合路径管理功能
 */
export function usePathManagement(params?: { q?: string; page?: number; limit?: number }) {
  const pathsQuery = useUnifiedPaths(params)
  const healthQuery = usePathsHealth()

  const updateConfig = useUpdateUnifiedPathConfig()
  const batchUpdate = useBatchUpdateUnifiedPaths()
  const batchToggle = useBatchTogglePaths()
  const deletePaths = useDeletePaths()

  const isLoading = pathsQuery.isLoading || healthQuery.isLoading
  const hasError = pathsQuery.error || healthQuery.error
  const isUpdating = updateConfig.isPending || batchUpdate.isPending || batchToggle.isPending || deletePaths.isPending

  return {
    // 数据
    paths: pathsQuery.data,
    health: healthQuery.data,

    // 状态
    isLoading,
    isUpdating,
    hasError,

    // 操作方法
    updateConfig: updateConfig.mutate,
    batchUpdate: batchUpdate.mutate,
    batchToggle: batchToggle.mutate,
    deletePaths: deletePaths.mutate,

    // 查询对象（用于访问详细状态）
    queries: {
      paths: pathsQuery,
      health: healthQuery
    },

    // 操作对象（用于访问详细状态）
    mutations: {
      updateConfig,
      batchUpdate,
      batchToggle,
      deletePaths
    }
  }
}

/**
 * 快速创建路径配置的辅助函数
 */
export function createPathConfig(overrides: Partial<UnifiedPathConfig> = {}): UnifiedPathConfig {
  return {
    path: '',
    cache: { enabled: false },
    rateLimit: { enabled: false },
    geo: { enabled: false },
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'manual'
    },
    ...overrides
  }
}

/**
 * 路径配置比较辅助函数
 */
export function comparePathConfigs(a: UnifiedPathConfig, b: UnifiedPathConfig): boolean {
  return (
    a.cache.enabled === b.cache.enabled &&
    a.cache.version === b.cache.version &&
    a.rateLimit.enabled === b.rateLimit.enabled &&
    a.rateLimit.limit === b.rateLimit.limit &&
    a.rateLimit.window === b.rateLimit.window &&
    a.geo.enabled === b.geo.enabled &&
    a.geo.mode === b.geo.mode &&
    JSON.stringify(a.geo.countries) === JSON.stringify(b.geo.countries)
  )
}