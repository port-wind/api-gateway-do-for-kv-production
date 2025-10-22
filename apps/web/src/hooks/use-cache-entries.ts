import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CacheEntryMetadata } from '@/types/api'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api'

interface CacheEntriesData {
    path: string
    entries: CacheEntryMetadata[]
    pagination: {
        limit: number
        offset: number
        count: number
    }
}

/**
 * 获取路径的缓存条目列表
 */
export function useCacheEntries(
    path: string | null,
    options?: {
        limit?: number
        offset?: number
        enabled?: boolean
    }
) {
    const { limit = 100, offset = 0, enabled = true } = options || {}

    return useQuery({
        queryKey: ['cache-entries', path, limit, offset],
        queryFn: async () => {
            if (!path) {
                throw new Error('路径不能为空')
            }

            // API 返回格式: { success: true, data: { path, entries, pagination } }
            const response = await apiClient.getPathCacheEntries(path, { limit, offset }) as { success: boolean; data: CacheEntriesData }

            // 提取 data 字段
            return response.data
        },
        enabled: enabled && !!path,
        staleTime: 30 * 1000, // 30 秒内使用缓存
        retry: 2,
    })
}

/**
 * 删除特定的缓存条目
 */
export function useDeleteCacheEntry() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (cacheKey: string) => {
            // apiClient 已经通过 apiDelete 解包，直接返回数据
            // 如果请求失败，apiFetch/apiDelete 会自动抛出错误
            await apiClient.deleteCacheEntry(cacheKey)
        },
        onSuccess: () => {
            // 刷新缓存条目列表
            queryClient.invalidateQueries({ queryKey: ['cache-entries'] })
            toast.success('缓存条目已删除')
        },
        onError: (error: Error) => {
            toast.error(`删除失败: ${error.message}`)
        },
    })
}

/**
 * 刷新路径的所有缓存
 */
export function useRefreshPathCache() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (path: string) => {
            // apiClient 已经通过 apiPost 解包，直接返回数据
            // 如果请求失败，apiFetch/apiPost 会自动抛出错误
            await apiClient.refreshPathCache(path)
        },
        onSuccess: (_, path) => {
            // 刷新缓存条目列表
            queryClient.invalidateQueries({ queryKey: ['cache-entries', path] })
            toast.success('缓存已刷新')
        },
        onError: (error: Error) => {
            toast.error(`刷新失败: ${error.message}`)
        },
    })
}

