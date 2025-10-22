/**
 * 告警徽章组件
 * 
 * 在 Dashboard 顶部显示活跃告警，支持展开/收起
 */

import { useState } from 'react'
import { AlertTriangle, X, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { useDashboardAlerts } from '@/hooks/use-dashboard-api'
import { Alert } from '@/types/dashboard'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function AlertBadge() {
    const { data, isLoading, error } = useDashboardAlerts(60000) // 60 秒刷新
    const [isExpanded, setIsExpanded] = useState(false)
    const [dismissed, setDismissed] = useState<string[]>([])

    // 加载或错误状态，不显示徽章
    if (isLoading || error || !data?.success) {
        return null
    }

    // 过滤已关闭的告警
    const activeAlerts = data.alerts.filter((alert) => !dismissed.includes(alert.id))

    // 没有告警，不显示徽章
    if (activeAlerts.length === 0) {
        return null
    }

    const criticalCount = activeAlerts.filter((a) => a.severity === 'critical').length
    const warningCount = activeAlerts.filter((a) => a.severity === 'warning').length

    // 关闭单个告警
    const handleDismiss = (alertId: string) => {
        setDismissed([...dismissed, alertId])
    }

    return (
        <div className='mb-4 rounded-lg border shadow-sm'>
            {/* 徽章头部 */}
            <div
                className={cn(
                    'flex items-center justify-between gap-4 px-4 py-3 cursor-pointer transition-colors',
                    criticalCount > 0
                        ? 'bg-red-50 border-red-200 hover:bg-red-100 dark:bg-red-950 dark:border-red-900'
                        : 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100 dark:bg-yellow-950 dark:border-yellow-900'
                )}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className='flex items-center gap-3'>
                    <AlertTriangle
                        className={cn(
                            'h-5 w-5',
                            criticalCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'
                        )}
                    />
                    <div>
                        <h3 className='text-sm font-semibold'>
                            {criticalCount > 0 ? '🚨 紧急告警' : '⚠️ 警告'}
                        </h3>
                        <p className='text-xs text-muted-foreground'>
                            {criticalCount > 0 && `${criticalCount} 个紧急告警`}
                            {criticalCount > 0 && warningCount > 0 && '，'}
                            {warningCount > 0 && `${warningCount} 个警告`}
                        </p>
                    </div>
                </div>

                <Button variant='ghost' size='sm'>
                    {isExpanded ? <ChevronUp className='h-4 w-4' /> : <ChevronDown className='h-4 w-4' />}
                </Button>
            </div>

            {/* 告警列表（展开时显示） */}
            {isExpanded && (
                <div className='border-t bg-card'>
                    {activeAlerts.map((alert) => (
                        <AlertItem key={alert.id} alert={alert} onDismiss={handleDismiss} />
                    ))}
                </div>
            )}
        </div>
    )
}

/**
 * 单个告警项组件
 */
function AlertItem({ alert, onDismiss }: { alert: Alert; onDismiss: (id: string) => void }) {
    const severityColors = {
        critical: 'border-l-red-500 bg-red-50 dark:bg-red-950',
        warning: 'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950',
        info: 'border-l-blue-500 bg-blue-50 dark:bg-blue-950',
    }

    const severityBadgeColors = {
        critical: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
        warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
        info: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    }

    return (
        <div
            className={cn(
                'flex items-start justify-between gap-4 border-l-4 p-4',
                severityColors[alert.severity]
            )}
        >
            <div className='flex-1 space-y-1'>
                <div className='flex items-center gap-2'>
                    <span
                        className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                            severityBadgeColors[alert.severity]
                        )}
                    >
                        {alert.severity === 'critical' ? '紧急' : alert.severity === 'warning' ? '警告' : '提示'}
                    </span>
                    <h4 className='text-sm font-semibold'>{alert.title}</h4>
                </div>
                <p className='text-sm text-muted-foreground'>{alert.message}</p>
                <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                    <span>当前值：{alert.value}</span>
                    {alert.link && (
                        <a
                            href={alert.link}
                            className='inline-flex items-center gap-1 text-primary hover:underline'
                            onClick={(e) => e.stopPropagation()}
                        >
                            查看详情 <ExternalLink className='h-3 w-3' />
                        </a>
                    )}
                </div>
            </div>

            <Button
                variant='ghost'
                size='sm'
                onClick={(e) => {
                    e.stopPropagation()
                    onDismiss(alert.id)
                }}
                className='shrink-0'
            >
                <X className='h-4 w-4' />
            </Button>
        </div>
    )
}

