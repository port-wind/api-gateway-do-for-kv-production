import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api'
import type {
  RateLimitConfig,
  RateLimitStatus,
  RateLimitHealth,
  ApiResponse
} from '@/types/api'

// Query Keys
const RATE_LIMIT_QUERY_KEYS = {
  config: ['rateLimit', 'config'] as const,
  status: (ip: string) => ['rateLimit', 'status', ip] as const,
  health: ['rateLimit', 'health'] as const,
} as const

/**
 * 获取限流配置
 */
export function useRateLimitConfig() {
  return useQuery({
    queryKey: RATE_LIMIT_QUERY_KEYS.config,
    queryFn: async (): Promise<RateLimitConfig> => {
      const response = (await apiClient.getRateLimitConfig()) as { config?: RateLimitConfig; data?: RateLimitConfig }
      return response.config || response.data as RateLimitConfig
    },
    refetchInterval: 30000, // 30 秒自动刷新
    retry: 2,
    retryDelay: 1000,
  })
}

/**
 * 更新限流配置
 */
export function useUpdateRateLimitConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (config: RateLimitConfig): Promise<ApiResponse<RateLimitConfig>> => {
      return (await apiClient.updateRateLimitConfig(config)) as ApiResponse<RateLimitConfig>
    },
    onSuccess: (_, variables) => {
      // 更新缓存中的数据
      queryClient.setQueryData(RATE_LIMIT_QUERY_KEYS.config, variables)
      queryClient.invalidateQueries({ queryKey: RATE_LIMIT_QUERY_KEYS.health })

      toast.success('限流配置更新成功')
    },
    onError: (error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to update rate limit config:', error)
      toast.error('限流配置更新失败')
    }
  })
}

/**
 * 获取限流健康状态
 */
export function useRateLimitHealth() {
  return useQuery({
    queryKey: RATE_LIMIT_QUERY_KEYS.health,
    queryFn: async (): Promise<RateLimitHealth> => {
      const response = (await apiClient.getRateLimitHealth()) as RateLimitHealth
      return response
    },
    refetchInterval: 15000, // 15 秒自动刷新健康状态
    retry: 1,
  })
}

/**
 * 获取 IP 限流状态
 */
export function useRateLimitStatus(ip: string, enabled: boolean = false) {
  return useQuery({
    queryKey: RATE_LIMIT_QUERY_KEYS.status(ip),
    queryFn: async (): Promise<RateLimitStatus> => {
      const response = (await apiClient.getRateLimitStatus(ip)) as { status?: RateLimitStatus; data?: RateLimitStatus }
      return response.status || response.data as RateLimitStatus
    },
    enabled: enabled && !!ip, // 只在启用时且IP有效时查询
    refetchInterval: 10000, // 10 秒自动刷新状态
    retry: 1,
  })
}

/**
 * 重置 IP 限流
 */
export function useResetRateLimit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ip: string) => {
      return await apiClient.resetRateLimit(ip)
    },
    onSuccess: (_data, ip) => {
      // 刷新相关查询
      queryClient.invalidateQueries({ queryKey: RATE_LIMIT_QUERY_KEYS.status(ip) })
      queryClient.invalidateQueries({ queryKey: RATE_LIMIT_QUERY_KEYS.health })

      toast.success(`IP ${ip} 的限流状态已重置`)
    },
    onError: (error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to reset rate limit:', error)
      toast.error('重置限流状态失败')
    }
  })
}

/**
 * 重置限流配置到默认值
 */
export function useResetRateLimitConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      // 获取默认配置
      const defaultConfig: RateLimitConfig = {
        enabled: true,
        defaultLimit: 1000,
        windowSeconds: 3600,
        pathLimits: {}
      }

      return await apiClient.updateRateLimitConfig(defaultConfig)
    },
    onSuccess: () => {
      // 刷新所有相关数据
      queryClient.invalidateQueries({ queryKey: RATE_LIMIT_QUERY_KEYS.config })
      queryClient.invalidateQueries({ queryKey: RATE_LIMIT_QUERY_KEYS.health })

      toast.success('限流配置已重置为默认值')
    },
    onError: (error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to reset rate limit config:', error)
      toast.error('重置限流配置失败')
    }
  })
}

/**
 * 自定义 hook：组合多个限流相关的查询
 */
export function useRateLimitManagement() {
  const configQuery = useRateLimitConfig()
  const healthQuery = useRateLimitHealth()

  const updateConfig = useUpdateRateLimitConfig()
  const resetConfig = useResetRateLimitConfig()
  const resetRateLimit = useResetRateLimit()

  const isLoading = configQuery.isLoading || healthQuery.isLoading
  const hasError = configQuery.error || healthQuery.error
  const isUpdating = updateConfig.isPending || resetConfig.isPending || resetRateLimit.isPending

  return {
    // 数据
    config: configQuery.data,
    health: healthQuery.data,

    // 状态
    isLoading,
    isUpdating,
    hasError,

    // 操作
    updateConfig: updateConfig.mutate,
    resetConfig: resetConfig.mutate,
    resetRateLimit: resetRateLimit.mutate,

    // 查询对象（用于访问详细状态）
    queries: {
      config: configQuery,
      health: healthQuery
    },

    // 操作对象（用于访问详细状态）
    mutations: {
      updateConfig,
      resetConfig,
      resetRateLimit
    }
  }
}