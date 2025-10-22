/**
 * Dashboard 统计卡片组件
 * 显示核心指标：总请求、缓存命中率、RPM、活跃路径
 * 按功能分组：流量、可靠性、配置
 */

import { useDashboardOverview } from '@/hooks/use-dashboard-api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendBadge } from '@/components/trend-badge'
import { Activity, TrendingUp, Zap, BarChart3, Shield, Clock } from 'lucide-react'
import { Separator } from '@/components/ui/separator'

export function StatsCards() {
    const { data, isLoading, error } = useDashboardOverview()

    if (error) {
        return (
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
                <Card className='border-destructive'>
                    <CardContent className='pt-6'>
                        <p className='text-sm text-destructive'>加载失败: {error.message}</p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (isLoading || !data) {
        return (
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
                {[...Array(4)].map((_, i) => (
                    <Card key={i}>
                        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                            <Skeleton className='h-4 w-24' />
                            <Skeleton className='h-4 w-4 rounded' />
                        </CardHeader>
                        <CardContent>
                            <Skeleton className='h-8 w-32 mb-2' />
                            <Skeleton className='h-3 w-40' />
                        </CardContent>
                    </Card>
                ))}
            </div>
        )
    }

    const { traffic, reliability, configuration } = data

    return (
        <div className='space-y-6'>
            {/* 流量指标 Section */}
            <div>
                <div className='mb-3 flex items-center gap-2'>
                    <Activity className='h-5 w-5 text-primary' />
                    <h3 className='text-lg font-semibold'>流量指标</h3>
                </div>
                <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                    {/* 总请求数 */}
                    <Card className='shadow-sm hover:shadow-md transition-shadow'>
                        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                            <CardTitle className='text-sm font-medium'>总请求（24h）</CardTitle>
                            <Activity className='h-4 w-4 text-blue-600 dark:text-blue-400' />
                        </CardHeader>
                        <CardContent>
                            <div className='flex items-baseline justify-between'>
                                <div className='text-3xl font-bold text-foreground'>
                                    {formatNumber(traffic.totalRequests24h)}
                                </div>
                                <TrendBadge value={traffic.trendVsPrevDay} />
                            </div>
                            <p className='text-xs text-muted-foreground mt-2'>
                                对比昨日同期
                            </p>
                        </CardContent>
                    </Card>

                    {/* 当前 RPM */}
                    <Card className='shadow-sm hover:shadow-md transition-shadow'>
                        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                            <CardTitle className='text-sm font-medium'>当前 RPM</CardTitle>
                            <Clock className='h-4 w-4 text-purple-600 dark:text-purple-400' />
                        </CardHeader>
                        <CardContent>
                            <div className='text-3xl font-bold text-foreground'>
                                {traffic.currentRpm || 0}
                            </div>
                            <p className='text-xs text-muted-foreground mt-2'>
                                每分钟请求数
                            </p>
                        </CardContent>
                    </Card>

                    {/* 峰值 RPM */}
                    <Card className='shadow-sm hover:shadow-md transition-shadow'>
                        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                            <CardTitle className='text-sm font-medium'>峰值 RPM</CardTitle>
                            <Zap className='h-4 w-4 text-amber-600 dark:text-amber-400' />
                        </CardHeader>
                        <CardContent>
                            <div className='text-3xl font-bold text-foreground'>{traffic.peakRpm || 0}</div>
                            <p className='text-xs text-muted-foreground mt-2'>
                                活跃 IP: {formatNumber(traffic.activeIPs24h)}
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Separator />

            {/* 可靠性指标 Section */}
            <div>
                <div className='mb-3 flex items-center gap-2'>
                    <Shield className='h-5 w-5 text-green-600 dark:text-green-400' />
                    <h3 className='text-lg font-semibold'>可靠性指标</h3>
                </div>
                <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-2'>
                    {/* 缓存命中率 */}
                    <Card className='shadow-sm hover:shadow-md transition-shadow'>
                        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                            <CardTitle className='text-sm font-medium'>缓存命中率</CardTitle>
                            <TrendingUp className='h-4 w-4 text-green-600 dark:text-green-400' />
                        </CardHeader>
                        <CardContent>
                            <div className='text-3xl font-bold text-foreground'>
                                {reliability.cacheHitRate.toFixed(1)}%
                            </div>
                            <p className='text-xs text-muted-foreground mt-2'>
                                <span className={reliability.errorRate > 5 ? 'text-red-500' : ''}>
                                    错误率: {reliability.errorRate.toFixed(1)}%
                                </span>
                            </p>
                        </CardContent>
                    </Card>

                    {/* 配置路径 */}
                    <Card className='shadow-sm hover:shadow-md transition-shadow'>
                        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                            <CardTitle className='text-sm font-medium'>配置路径</CardTitle>
                            <BarChart3 className='h-4 w-4 text-cyan-600 dark:text-cyan-400' />
                        </CardHeader>
                        <CardContent>
                            <div className='text-3xl font-bold text-foreground'>{configuration.totalPaths}</div>
                            <p className='text-xs text-muted-foreground mt-2'>
                                限流: {configuration.pathsWithRateLimit} | 缓存: {configuration.pathsWithCache}
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

/**
 * 格式化数字（千位分隔符）
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


