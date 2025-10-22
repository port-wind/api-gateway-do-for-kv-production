/**
 * 实时流量地图组件
 * 使用 ECharts 显示全球流量飞线动画（MVP 版本）
 * 
 * MVP 功能：
 * - 2D 地图（ECharts Geo）
 * - Top 10-20 国家 → Cloudflare POP 飞线
 * - 5 分钟数据刷新
 * - 基础交互（Tooltip）
 */

import { lazy, Suspense, useMemo, useEffect, useState } from 'react'
import { useRealtimeRecent } from '@/hooks/use-dashboard-api'
import { useTheme } from '@/context/theme-provider'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { registerWorldMap } from '@/lib/echarts-register'
import type { EChartsOption } from 'echarts'

// 懒加载 ECharts 组件（优化首屏加载）
const ReactECharts = lazy(() => import('echarts-for-react'))

export function RealtimeMap() {
    // 增加数据量到 100 条（与后端上限保持一致）
    const { data, isLoading, error } = useRealtimeRecent(100)
    const { resolvedTheme } = useTheme()
    const [mapReady, setMapReady] = useState(false)

    // 懒加载地图数据
    useEffect(() => {
        registerWorldMap().then(() => setMapReady(true))
    }, [])

    const chartOption = useMemo<EChartsOption>(() => {
        // 如果地图未加载完成，返回空配置
        if (!mapReady) {
            return {}
        }

        // 如果没有数据或数据为空，显示空地图
        if (!data || data.events.length === 0) {
            return getEmptyChartOption(resolvedTheme === 'dark')
        }

        return {
            backgroundColor: 'transparent',
            // 添加动画配置
            animation: true,
            animationDuration: 1000,
            animationEasing: 'cubicOut',
            // 添加工具栏（缩放按钮）
            toolbox: {
                show: true,
                right: 20,
                top: 20,
                feature: {
                    dataZoom: {
                        show: true,
                        title: {
                            zoom: '区域缩放',
                            back: '还原缩放'
                        }
                    },
                    restore: {
                        show: true,
                        title: '还原视图',
                    },
                },
                iconStyle: {
                    borderColor: resolvedTheme === 'dark' ? '#94a3b8' : '#64748b',
                    borderWidth: 2,
                },
                emphasis: {
                    iconStyle: {
                        borderColor: resolvedTheme === 'dark' ? '#60a5fa' : '#3b82f6',
                        borderWidth: 2,
                    }
                }
            },
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(50, 50, 50, 0.9)',
                borderColor: '#777',
                borderWidth: 1,
                textStyle: {
                    color: '#fff',
                    fontSize: 12,
                },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter: (params: any) => {
                    if (params.seriesType === 'lines') {
                        const { from, to, count, errorCount } = params.data
                        return `
              <div style="padding: 4px;">
                <strong>${from} → ${to}</strong><br/>
                请求数: ${count.toLocaleString()}<br/>
                错误数: ${errorCount}
              </div>
            `
                    }
                    if (params.seriesType === 'scatter') {
                        const { name, value } = params.data
                        return `
              <div style="padding: 4px;">
                <strong>${name}</strong><br/>
                请求数: ${value[2]?.toLocaleString() || 0}
              </div>
            `
                    }
                    return params.name
                },
            },
            geo: {
                map: 'world',
                roam: true, // 允许缩放和平移
                zoom: 1.2,
                center: [0, 30],
                scaleLimit: {
                    min: 1,      // 最小缩放倍数
                    max: 20,     // 最大缩放倍数
                },
                itemStyle: {
                    // 使用主题状态支持主题切换
                    areaColor: resolvedTheme === 'dark'
                        ? '#1e293b'  // 暗色主题：深蓝灰
                        : '#e0e5eb', // 亮色主题：浅灰蓝
                    borderColor: resolvedTheme === 'dark'
                        ? '#334155'  // 暗色主题：中蓝灰
                        : '#cbd5e1', // 亮色主题：浅灰
                    borderWidth: 1,
                    shadowColor: 'rgba(0, 0, 0, 0.1)',
                    shadowBlur: 10,
                },
                emphasis: {
                    itemStyle: {
                        areaColor: resolvedTheme === 'dark'
                            ? '#2d3e54'  // 暗色主题：稍亮的深蓝灰
                            : '#c7d2dc', // 亮色主题：稍深的浅灰
                    },
                    label: {
                        show: true,
                        color: resolvedTheme === 'dark'
                            ? '#e2e8f0'  // 暗色主题：浅灰文字
                            : '#334155', // 亮色主题：深灰文字
                        fontSize: 12,
                    },
                },
                label: {
                    show: false,
                },
            },
            series: [
                // 飞线系列
                {
                    type: 'lines',
                    coordinateSystem: 'geo',
                    zlevel: 2,
                    polyline: false,
                    effect: {
                        show: true,
                        period: 4, // 动画周期（秒）
                        trailLength: 0.2, // 拖尾长度
                        symbol: 'arrow',
                        symbolSize: 7,
                        color: resolvedTheme === 'dark' ? '#60a5fa' : '#3b82f6',
                    },
                    lineStyle: {
                        color: resolvedTheme === 'dark' ? '#60a5fa' : '#3b82f6',
                        width: 1,
                        opacity: 0.5,
                        curveness: 0.2,
                    },
                    // 不使用 large 模式，保持动画效果
                    progressive: 400, // 渐进式渲染阈值
                    progressiveThreshold: 500, // 数据量超过 500 才使用渐进式渲染
                    data: data.events.map((event) => ({
                        coords: [event.clientCoords, event.edgeCoords],
                        lineStyle: {
                            width: Math.max(1, Math.log(event.requestCount + 1) * 0.5),
                        },
                        // 自定义 Tooltip 数据
                        from: event.clientCountry,
                        to: event.edgeColo,
                        count: event.requestCount,
                        errorCount: event.errorCount,
                    })),
                },
                // 起点（客户端）散点
                {
                    type: 'scatter',
                    coordinateSystem: 'geo',
                    zlevel: 3,
                    symbolSize: (val: number[]) => Math.max(6, Math.log(val[2] + 1) * 2.5),
                    progressive: 400,
                    progressiveThreshold: 500,
                    itemStyle: {
                        // 暗色主题使用更亮的红色
                        color: resolvedTheme === 'dark'
                            ? '#f87171'  // 暗色主题：更亮的红色
                            : '#ef4444', // 亮色主题：标准红色
                        borderColor: resolvedTheme === 'dark'
                            ? '#1e293b'  // 暗色主题：深色边框
                            : '#fff',    // 亮色主题：白色边框
                        borderWidth: 2,
                        opacity: 0.9,
                        shadowBlur: 10,
                        shadowColor: resolvedTheme === 'dark'
                            ? 'rgba(248, 113, 113, 0.4)'  // 暗色主题阴影
                            : 'rgba(239, 68, 68, 0.4)',   // 亮色主题阴影
                    },
                    data: data.events.map((event) => ({
                        name: event.clientCountry,
                        value: [...event.clientCoords, event.requestCount],
                    })),
                },
                // 终点（边缘节点）散点
                {
                    type: 'scatter',
                    coordinateSystem: 'geo',
                    zlevel: 3,
                    symbolSize: (val: number[]) => Math.max(8, Math.log(val[2] + 1) * 3),
                    progressive: 400,
                    progressiveThreshold: 500,
                    itemStyle: {
                        // 暗色主题使用更亮的绿色
                        color: resolvedTheme === 'dark'
                            ? '#34d399'  // 暗色主题：更亮的绿色
                            : '#10b981', // 亮色主题：标准绿色
                        borderColor: resolvedTheme === 'dark'
                            ? '#1e293b'  // 暗色主题：深色边框
                            : '#fff',    // 亮色主题：白色边框
                        borderWidth: 2,
                        shadowBlur: 15,
                        shadowColor: resolvedTheme === 'dark'
                            ? 'rgba(52, 211, 153, 0.5)'   // 暗色主题阴影
                            : 'rgba(16, 185, 129, 0.5)',  // 亮色主题阴影
                    },
                    label: {
                        show: true,
                        formatter: '{b}',
                        position: 'top',
                        color: resolvedTheme === 'dark'
                            ? '#e2e8f0'  // 暗色主题：浅灰文字
                            : '#334155', // 亮色主题：深灰文字
                        fontSize: 11,
                        fontWeight: 'bold',
                    },
                    data: data.edgeNodes.map((node) => ({
                        name: node.colo,
                        value: [...node.coords, node.requestCount],
                    })),
                },
            ],
        }
    }, [data, mapReady, resolvedTheme])

    // 地图加载中 - 显示骨架屏
    if (!mapReady) {
        return (
            <div className='space-y-4'>
                <div className='flex items-center justify-between'>
                    <Badge variant='outline' className='gap-1.5'>
                        <span className='inline-block h-2 w-2 rounded-full bg-muted animate-pulse' />
                        加载地图中...
                    </Badge>
                </div>
                <Skeleton className='h-[500px] w-full' />
            </div>
        )
    }

    // API 错误 - 仍然显示空地图
    if (error) {
        // eslint-disable-next-line no-console
        console.error('Realtime map API error:', error)
        // 不阻止地图渲染，显示空地图 + 错误提示
    }

    return (
        <div className='space-y-4'>
            {/* 状态栏 */}
            <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                    {error ? (
                        <Badge variant='destructive' className='gap-1.5'>
                            <span className='inline-block h-2 w-2 rounded-full bg-white' />
                            数据加载失败
                        </Badge>
                    ) : isLoading ? (
                        <Badge variant='outline' className='gap-1.5'>
                            <span className='inline-block h-2 w-2 rounded-full bg-muted animate-pulse' />
                            加载中...
                        </Badge>
                    ) : data && data.events.length > 0 ? (
                        <>
                            <Badge variant='outline' className='gap-1.5'>
                                <span className='inline-block h-2 w-2 rounded-full bg-primary animate-pulse' />
                                实时流量
                            </Badge>
                            <span className='text-xs text-muted-foreground'>
                                显示 Top {data.events.length} 路由
                            </span>
                        </>
                    ) : (
                        <Badge variant='secondary' className='gap-1.5'>
                            <span className='inline-block h-2 w-2 rounded-full bg-muted' />
                            暂无数据
                        </Badge>
                    )}
                </div>
                <div className='flex items-center gap-4 text-xs text-muted-foreground'>
                    <div className='flex items-center gap-1.5'>
                        <span className='inline-block h-2 w-2 rounded-full bg-chart-1' />
                        请求来源
                    </div>
                    <div className='flex items-center gap-1.5'>
                        <span className='inline-block h-2 w-2 rounded-full bg-chart-2' />
                        边缘节点
                    </div>
                </div>
            </div>

            {/* 地图 */}
            <Suspense fallback={<Skeleton className='h-[500px] w-full' />}>
                <ReactECharts
                    option={chartOption}
                    style={{ height: '500px', width: '100%' }}
                    opts={{
                        renderer: 'canvas',
                        locale: 'ZH'
                    }}
                    lazyUpdate={true}
                    notMerge={false}
                />
            </Suspense>

            {/* 数据来源说明 */}
            {data && (
                <p className='text-xs text-muted-foreground text-center'>
                    {data.dataSource === 'cache' ? '⚡ 来自缓存' : '🔄 实时查询'} ·
                    最近 30 分钟数据 ·
                    每 5 分钟刷新 ·
                    最后更新: {new Date(data.timestamp).toLocaleTimeString('zh-CN')}
                </p>
            )}
            {error && (
                <p className='text-xs text-destructive text-center'>
                    ⚠️ 数据加载失败，显示空地图
                </p>
            )}
        </div>
    )
}

/**
 * 空数据时的图表配置
 */
function getEmptyChartOption(isDark: boolean): EChartsOption {
    return {
        backgroundColor: 'transparent',
        // 添加工具栏（即使空数据也提供缩放功能）
        toolbox: {
            show: true,
            right: 20,
            top: 20,
            feature: {
                dataZoom: {
                    show: true,
                    title: {
                        zoom: '区域缩放',
                        back: '还原缩放'
                    }
                },
                restore: {
                    show: true,
                    title: '还原视图',
                },
            },
            iconStyle: {
                borderColor: isDark ? '#94a3b8' : '#64748b',
                borderWidth: 2,
            },
            emphasis: {
                iconStyle: {
                    borderColor: isDark ? '#60a5fa' : '#3b82f6',
                    borderWidth: 2,
                }
            }
        },
        geo: {
            map: 'world',
            roam: true, // 即使无数据也允许交互
            zoom: 1.2,
            center: [0, 30],
            scaleLimit: {
                min: 1,
                max: 20,
            },
            itemStyle: {
                areaColor: isDark ? '#1e293b' : '#e8ecf1',  // 暗色/亮色主题
                borderColor: isDark ? '#334155' : '#cbd5e1',
                borderWidth: 1,
                shadowColor: 'rgba(0, 0, 0, 0.1)',
                shadowBlur: 10,
            },
            emphasis: {
                itemStyle: {
                    areaColor: isDark ? '#2d3e54' : '#d1d8e0',
                },
                label: {
                    show: true,
                    color: isDark ? '#94a3b8' : '#64748b',
                    fontSize: 12,
                },
            },
            label: {
                show: false,
            },
        },
        graphic: {
            type: 'text',
            left: 'center',
            top: 'middle',
            style: {
                text: '',
                fontSize: 24, // 增大字号
                fontWeight: 500,
                fill: isDark ? '#64748b' : '#94a3b8',  // 暗色主题使用稍亮的灰色
            },
        },
    }
}
