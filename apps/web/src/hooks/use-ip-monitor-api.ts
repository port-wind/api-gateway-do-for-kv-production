import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api'

export interface ThresholdSetting {
  enabled: boolean
  threshold: number
}

export interface IpMonitorAlertConfig {
  webhookUrl?: string
  cooldownMinutes?: number
  globalRps?: ThresholdSetting
  ipSpike?: ThresholdSetting
}

export interface IpMonitorConfig {
  retentionDays: number
  alerts: IpMonitorAlertConfig
}

export interface IpMonitorConfigResponse {
  success: boolean
  config: IpMonitorConfig
}

// Query Keys
const IP_MONITOR_QUERY_KEYS = {
  all: ['ip-monitor'] as const,
  ips: ['ip-monitor', 'ips'] as const,
  ipList: (params?: {
    date?: string
    days?: number
    page?: number
    limit?: number
    sortBy?: 'requests' | 'errors'
    sortOrder?: string
    search?: string
  }) => ['ip-monitor', 'ips', 'list', params] as const,
  ipDetail: (ipHash: string) => ['ip-monitor', 'ips', 'detail', ipHash] as const,
  ipPaths: (ipHash: string, params?: { page?: number; limit?: number }) =>
    ['ip-monitor', 'ips', 'paths', ipHash, params] as const,
  rules: ['ip-monitor', 'rules'] as const,
  ruleList: (params?: { page?: number; limit?: number }) =>
    ['ip-monitor', 'rules', 'list', params] as const,
  config: ['ip-monitor', 'config'] as const,
} as const

/**
 * 获取 IP 列表
 */
export function useIpList(params?: {
  date?: string
  days?: number
  page?: number
  limit?: number
  sortBy?: 'requests' | 'errors'
  sortOrder?: 'asc' | 'desc'
  search?: string
}) {
  return useQuery({
    queryKey: IP_MONITOR_QUERY_KEYS.ipList(params),
    queryFn: async () => {
      return (await apiClient.getIpList(params)) as {
        data: unknown[];
        pagination: {
          page: number;
          limit: number;
          total: number;
          hasMore: boolean
        }
      }
    },
    retry: 2,
    retryDelay: 1000,
  })
}

/**
 * 获取 IP 详细信息
 */
export function useIpDetail(ipHash: string, enabled: boolean = true) {
  return useQuery({
    queryKey: IP_MONITOR_QUERY_KEYS.ipDetail(ipHash),
    queryFn: async () => {
      // apiClient 已返回解包后的数据，直接使用
      return await apiClient.getIpDetail(ipHash)
    },
    enabled: enabled && !!ipHash,
    retry: 2,
    retryDelay: 1000,
  })
}

/**
 * 获取 IP 的访问路径明细
 */
export function useIpPaths(
  ipHash: string,
  params?: { date?: string; page?: number; limit?: number },
  enabled: boolean = true
) {
  return useQuery({
    queryKey: IP_MONITOR_QUERY_KEYS.ipPaths(ipHash, params),
    queryFn: async () => {
      return (await apiClient.getIpPaths(ipHash, params)) as {
        data: unknown[];
        pagination: {
          page: number;
          limit: number;
          total: number;
          hasNext: boolean;
          hasPrev: boolean;
          totalPages: number;
        };
        notice?: string
      }
    },
    enabled: enabled && !!ipHash,
    retry: 2,
    retryDelay: 1000,
  })
}

/**
 * 获取 IP 访问规则列表
 */
export function useIpRules(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: IP_MONITOR_QUERY_KEYS.ruleList(params),
    queryFn: async () => {
      return (await apiClient.getIpRules(params)) as { data: unknown[]; pagination: { page: number; limit: number; total: number } }
    },
    refetchInterval: 30000, // 30 秒自动刷新
    retry: 2,
    retryDelay: 1000,
  })
}

/**
 * 获取 IP 监控配置
 */
export function useIpMonitorConfig() {
  return useQuery({
    queryKey: IP_MONITOR_QUERY_KEYS.config,
    queryFn: async (): Promise<IpMonitorConfigResponse> => {
      return (await apiClient.getIpMonitorConfig()) as IpMonitorConfigResponse
    },
    retry: 2,
    retryDelay: 1000,
  })
}

/**
 * 创建 IP 访问规则
 */
export function useCreateIpRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      ipPattern: string
      mode: 'block' | 'throttle'
      limit?: number
      window?: number
      reason?: string
      expiresAt?: number
    }) => {
      return await apiClient.createIpRule(data)
    },
    onSuccess: () => {
      // 刷新规则列表
      queryClient.invalidateQueries({ queryKey: IP_MONITOR_QUERY_KEYS.rules })
      toast.success('IP 规则创建成功')
    },
    onError: (error: Error) => {
      toast.error(`创建 IP 规则失败: ${error.message}`)
    },
  })
}

/**
 * 删除 IP 访问规则
 */
export function useDeleteIpRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ipHash: string) => {
      return await apiClient.deleteIpRule(ipHash)
    },
    onSuccess: () => {
      // 刷新规则列表和 IP 列表
      queryClient.invalidateQueries({ queryKey: IP_MONITOR_QUERY_KEYS.rules })
      queryClient.invalidateQueries({ queryKey: IP_MONITOR_QUERY_KEYS.ips })
      toast.success('IP 规则已删除')
    },
    onError: (error: Error) => {
      toast.error(`删除 IP 规则失败: ${error.message}`)
    },
  })
}

/**
 * 更新 IP 监控配置
 */
export function useUpdateIpMonitorConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (config: IpMonitorConfig) => {
      return await apiClient.updateIpMonitorConfig(config)
    },
    onSuccess: () => {
      // 刷新配置
      queryClient.invalidateQueries({ queryKey: IP_MONITOR_QUERY_KEYS.config })
      toast.success('IP 监控配置更新成功')
    },
    onError: (error: Error) => {
      toast.error(`更新配置失败: ${error.message}`)
    },
  })
}

/**
 * 综合 IP 监控管理 hook
 */
export function useIpMonitorManagement(params?: {
  date?: string
  days?: number
  page?: number
  limit?: number
  sortBy?: 'requests' | 'errors'
  sortOrder?: 'asc' | 'desc'
  search?: string
}) {
  const ipListQuery = useIpList(params)
  const rulesQuery = useIpRules()
  const configQuery = useIpMonitorConfig()

  const createRule = useCreateIpRule()
  const deleteRule = useDeleteIpRule()
  const updateConfig = useUpdateIpMonitorConfig()

  const isLoading = ipListQuery.isLoading || rulesQuery.isLoading || configQuery.isLoading
  const hasError = ipListQuery.error || rulesQuery.error || configQuery.error
  const isUpdating = createRule.isPending || deleteRule.isPending || updateConfig.isPending

  return {
    // 数据
    ipList: ipListQuery.data,
    rules: rulesQuery.data,
    config: configQuery.data,

    // 状态
    isLoading,
    isUpdating,
    hasError,

    // 操作方法
    createRule: createRule.mutate,
    deleteRule: deleteRule.mutate,
    updateConfig: updateConfig.mutate,

    // 查询对象（用于访问详细状态）
    queries: {
      ipList: ipListQuery,
      rules: rulesQuery,
      config: configQuery,
    },

    // 操作对象（用于访问详细状态）
    mutations: {
      createRule,
      deleteRule,
      updateConfig,
    },
  }
}

/**
 * 分析可疑 IP 的辅助函数
 */
export function analyzeSuspiciousIp(ipData: {
  totalRequests: number
  errorCount: number
  rateLimitedCount: number
  uniquePaths: number
  countries?: { name: string; code: string; count: number }[]
  userAgents?: { ua: string; count: number }[]
}): {
  suspicionScore: number
  indicators: string[]
  recommendation: 'block' | 'throttle' | 'monitor'
} {
  const indicators: string[] = []
  let suspicionScore = 0

  // 高错误率（>10%）
  const errorRate = ipData.errorCount / ipData.totalRequests
  if (errorRate > 0.1) {
    indicators.push(`高错误率: ${(errorRate * 100).toFixed(1)}%`)
    suspicionScore += 30
  }

  // 高限流率（>5%）
  const rateLimitRate = ipData.rateLimitedCount / ipData.totalRequests
  if (rateLimitRate > 0.05) {
    indicators.push(`频繁触发限流: ${(rateLimitRate * 100).toFixed(1)}%`)
    suspicionScore += 40
  }

  // 路径扫描（访问路径数量多）
  if (ipData.uniquePaths > 50) {
    indicators.push(`路径扫描行为: 访问了 ${ipData.uniquePaths} 个不同路径`)
    suspicionScore += 20
  }

  // 高请求量（单日超过 1000 次）
  if (ipData.totalRequests > 1000) {
    indicators.push(`高请求量: ${ipData.totalRequests} 次请求`)
    suspicionScore += 10
  }

  // 多地域访问（可能是代理/VPN）
  if (ipData.countries && ipData.countries.length > 3) {
    indicators.push(`多地域访问: ${ipData.countries.length} 个不同国家`)
    suspicionScore += 15
  }

  // 多 UA 访问（可能是工具/脚本）
  if (ipData.userAgents && ipData.userAgents.length > 5) {
    indicators.push(`多 User-Agent: ${ipData.userAgents.length} 个不同 UA`)
    suspicionScore += 15
  }

  // 推荐操作
  let recommendation: 'block' | 'throttle' | 'monitor' = 'monitor'
  if (suspicionScore >= 80) {
    recommendation = 'block'
  } else if (suspicionScore >= 50) {
    recommendation = 'throttle'
  }

  return {
    suspicionScore: Math.min(100, suspicionScore),
    indicators,
    recommendation,
  }
}

/**
 * 格式化 IP 数据的辅助函数
 */
export function formatIpStats(data: {
  totalRequests?: number
  successCount?: number
  errorCount?: number
  rateLimitedCount?: number
}) {
  const total = Number(data.totalRequests) || 0
  const success = Number(data.successCount) || 0
  const error = Number(data.errorCount) || 0
  const rateLimited = Number(data.rateLimitedCount) || 0

  return {
    successRate: total > 0 ? ((success / total) * 100).toFixed(1) : '0.0',
    errorRate: total > 0 ? ((error / total) * 100).toFixed(1) : '0.0',
    rateLimitRate: total > 0 ? ((rateLimited / total) * 100).toFixed(1) : '0.0',
  }
}
