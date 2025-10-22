/**
 * Top Paths 组件
 * 显示请求量最高的路径，包含错误数和错误率
 */

import { useDashboardOverview } from '@/hooks/use-dashboard-api'
import { Skeleton } from '@/components/ui/skeleton'

export function TopPaths() {
    const { data, isLoading, error } = useDashboardOverview()

    if (error) {
        return (
            <div className='flex h-full items-center justify-center p-6'>
                <p className='text-sm text-destructive'>加载失败: {error.message}</p>
            </div>
        )
    }

    if (isLoading || !data) {
        return (
            <div className='space-y-4'>
                {[...Array(5)].map((_, i) => (
                    <div key={i} className='flex items-start gap-3'>
                        <Skeleton className='h-8 w-8 rounded-full' />
                        <div className='flex-1 space-y-1'>
                            <Skeleton className='h-4 w-3/4' />
                            <Skeleton className='h-3 w-1/2' />
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    const topPaths = data.topPaths || []

    if (topPaths.length === 0) {
        return (
            <div className='flex h-full items-center justify-center p-6'>
                <p className='text-sm text-muted-foreground'>暂无数据</p>
            </div>
        )
    }

    return (
        <div className='space-y-4'>
            {topPaths.map((pathData: typeof topPaths[0], index: number) => {
                const hasErrors = pathData.errors > 0
                const errorRate = pathData.errorRate || 0

                return (
                    <div key={pathData.path} className='flex items-start gap-3'>
                        {/* 排名 */}
                        <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary'>
                            <span className='text-sm font-bold'>#{index + 1}</span>
                        </div>

                        {/* 路径信息 */}
                        <div className='flex-1 space-y-1 min-w-0'>
                            <p className='font-medium text-sm truncate' title={pathData.path}>
                                {pathData.path}
                            </p>
                            <div className='flex items-center gap-3 text-xs text-muted-foreground'>
                                <span>{formatNumber(pathData.requests)} 请求</span>
                                {hasErrors && (
                                    <span className='text-destructive'>
                                        {formatNumber(pathData.errors)} 错误 ({(errorRate * 100).toFixed(1)}%)
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

/**
 * 格式化数字
 */
function formatNumber(num: number): string {
    if (num >= 1_000_000) {
        return `${(num / 1_000_000).toFixed(1)}M`
    }
    if (num >= 1_000) {
        return `${(num / 1_000).toFixed(1)}K`
    }
    return num.toLocaleString()
}


