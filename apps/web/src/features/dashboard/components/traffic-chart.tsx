/**
 * 流量趋势图表组件
 * 显示最近 7 天的请求量和缓存命中趋势
 */

import { useEffect, useMemo, useState } from 'react'
import { useDashboardTimeseries } from '@/hooks/use-dashboard-api'
import {
    Area,
    AreaChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { useTheme } from '@/context/theme-provider'

type MetricType = 'requests' | 'cache_hit' | 'errors'

const METRIC_LABELS: Record<MetricType, string> = {
    requests: '总请求',
    cache_hit: '缓存命中',
    errors: '错误数',
}

export function TrafficChart() {
    const [range, setRange] = useState<'24h' | '7d'>('7d')
    const [metric, setMetric] = useState<MetricType>('requests')
    const { data, isLoading, error } = useDashboardTimeseries(range, metric)
    const { resolvedTheme } = useTheme()

    const [colors, setColors] = useState(() => ({
        grid: '#d4d4d8',
        axis: '#1f2937',
        background: '#ffffff',
        border: '#e5e7eb',
        requests: '#2563eb',
        cache: '#0ea5e9',
        errors: '#f87171',
    }))

    useEffect(() => {
        if (typeof window === 'undefined') return
        const style = getComputedStyle(document.documentElement)

        const fallbackGrid = resolvedTheme === 'dark' ? '#3f4c66' : '#e5e7eb'
        const fallbackAxis = resolvedTheme === 'dark' ? '#e2e8f0' : '#1f2937'
        const fallbackBackground = resolvedTheme === 'dark' ? '#0f172a' : '#ffffff'
        const fallbackBorder = resolvedTheme === 'dark' ? '#334155' : '#d1d5db'
        const fallbackRequests = resolvedTheme === 'dark' ? '#7c8dff' : '#3b82f6'
        const fallbackCache = resolvedTheme === 'dark' ? '#5bc4d6' : '#22c5c7'
        const fallbackErrors = resolvedTheme === 'dark' ? '#f08a8a' : '#dc2626'

        const readVar = (variable: string, fallback: string) => {
            const value = style.getPropertyValue(variable).trim()
            return value || fallback
        }

        setColors({
            grid: readVar('--muted-foreground', fallbackGrid),
            axis: readVar('--foreground', fallbackAxis),
            background: readVar('--background', fallbackBackground),
            border: readVar('--border', fallbackBorder),
            requests: readVar('--chart-1', fallbackRequests),
            cache: readVar('--chart-2', fallbackCache),
            errors: readVar('--destructive', fallbackErrors),
        })
    }, [resolvedTheme])

    const softPalette = useMemo(() => {
        const blend = (base: string) => `color-mix(in oklch, ${colors.axis} 65%, ${base} 35%)`
        return {
            requests: blend(colors.requests),
            cache: blend(colors.cache),
            errors: blend(colors.errors),
        }
    }, [colors.axis, colors.cache, colors.errors, colors.requests])

    const metricColor = useMemo(() => {
        switch (metric) {
            case 'errors':
                return softPalette.errors
            case 'cache_hit':
                return softPalette.cache
            default:
                return softPalette.requests
        }
    }, [metric, softPalette.cache, softPalette.errors, softPalette.requests])

    const gradientTopOpacity = resolvedTheme === 'dark' ? 0.35 : 0.25
    const gradientBottomOpacity = resolvedTheme === 'dark' ? 0.12 : 0.08
    const gridOpacity = resolvedTheme === 'dark' ? 0.35 : 0.2

    if (error) {
        return (
            <div className='flex h-[350px] items-center justify-center'>
                <p className='text-sm text-muted-foreground'>
                    加载失败: {error.message}
                </p>
            </div>
        )
    }

    if (isLoading || !data) {
        return <Skeleton className='h-[350px] w-full' />
    }

    // 转换数据格式适配 Recharts
    const chartData = data.dataPoints.map((point) => ({
        time: formatTimestamp(new Date(point.timestamp).getTime(), range),
        value: point.value,
    }))

    return (
        <div className='space-y-4'>
            {/* 控制栏 */}
            <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                    <Select value={range} onValueChange={(v) => setRange(v as typeof range)}>
                        <SelectTrigger className='w-[120px]'>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value='24h'>最近 24 小时</SelectItem>
                            <SelectItem value='7d'>最近 7 天</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={metric} onValueChange={(v) => setMetric(v as MetricType)}>
                        <SelectTrigger className='w-[120px]'>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value='requests'>总请求</SelectItem>
                            <SelectItem value='cache_hit'>缓存命中</SelectItem>
                            <SelectItem value='errors'>错误数</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {data.actualRange !== range && (
                    <p className='text-xs text-muted-foreground'>
                        ⚠️ 数据受限于保留周期，显示 {data.actualRange}
                    </p>
                )}
            </div>

            {/* 图表 */}
            <ResponsiveContainer width='100%' height={350}>
                <AreaChart data={chartData}>
                    <defs>
                        <linearGradient id='colorMetric' x1='0' y1='0' x2='0' y2='1'>
                            <stop
                                offset='5%'
                                stopColor={metricColor}
                                stopOpacity={gradientTopOpacity}
                            />
                            <stop
                                offset='95%'
                                stopColor={metricColor}
                                stopOpacity={gradientBottomOpacity}
                            />
                        </linearGradient>
                    </defs>
                    <CartesianGrid
                        strokeDasharray='3 3'
                        stroke={colors.grid}
                        opacity={gridOpacity}
                    />
                    <XAxis
                        dataKey='time'
                        stroke={colors.axis}
                        fontSize={12}
                        tickLine={false}
                        tick={{ fill: colors.axis }}
                    />
                    <YAxis
                        stroke={colors.axis}
                        fontSize={12}
                        tickLine={false}
                        tickFormatter={(value) => formatNumber(value)}
                        tick={{ fill: colors.axis }}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: colors.background,
                            border: `1px solid ${colors.border}`,
                            borderRadius: '6px',
                            color: colors.axis,
                        }}
                        formatter={(value: number) => formatNumber(value)}
                    />
                    <Legend />
                    <Area
                        type='monotone'
                        dataKey='value'
                        stroke={metricColor}
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill='url(#colorMetric)'
                        name={METRIC_LABELS[metric]}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    )
}

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp: number, range: '24h' | '7d'): string {
    const date = new Date(timestamp)

    if (range === '24h') {
        // 24 小时：显示小时
        return date.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    // 7 天：显示日期
    return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
    })
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
