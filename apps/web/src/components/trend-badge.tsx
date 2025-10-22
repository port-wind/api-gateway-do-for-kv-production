/**
 * Trend Badge 组件
 * 显示数值变化趋势（▲/▼）和百分比
 */

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Badge } from './ui/badge'
import { cn } from '@/lib/utils'

interface TrendBadgeProps {
    value: number // 百分比变化值（如 +20.5 表示增长 20.5%）
    className?: string
    showIcon?: boolean
    showSign?: boolean
}

export function TrendBadge({
    value,
    className,
    showIcon = true,
    showSign = true,
}: TrendBadgeProps) {
    const isPositive = value > 0
    const isNeutral = value === 0
    const absValue = Math.abs(value)

    const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown

    const variantClass = isNeutral
        ? 'text-muted-foreground bg-muted'
        : isPositive
            ? 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-950/30'
            : 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950/30'

    return (
        <Badge
            variant='secondary'
            className={cn(
                'gap-1 font-mono text-xs tabular-nums',
                variantClass,
                className
            )}
        >
            {showIcon && <Icon className='h-3 w-3' />}
            {showSign && !isNeutral && (isPositive ? '+' : '-')}
            {absValue.toFixed(1)}%
        </Badge>
    )
}

