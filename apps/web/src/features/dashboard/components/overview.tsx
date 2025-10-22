import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { useTheme } from '@/context/theme-provider'

const data = [
  {
    name: 'Jan',
    total: Math.floor(Math.random() * 5000) + 1000,
  },
  {
    name: 'Feb',
    total: Math.floor(Math.random() * 5000) + 1000,
  },
  {
    name: 'Mar',
    total: Math.floor(Math.random() * 5000) + 1000,
  },
  {
    name: 'Apr',
    total: Math.floor(Math.random() * 5000) + 1000,
  },
  {
    name: 'May',
    total: Math.floor(Math.random() * 5000) + 1000,
  },
  {
    name: 'Jun',
    total: Math.floor(Math.random() * 5000) + 1000,
  },
  {
    name: 'Jul',
    total: Math.floor(Math.random() * 5000) + 1000,
  },
  {
    name: 'Aug',
    total: Math.floor(Math.random() * 5000) + 1000,
  },
  {
    name: 'Sep',
    total: Math.floor(Math.random() * 5000) + 1000,
  },
  {
    name: 'Oct',
    total: Math.floor(Math.random() * 5000) + 1000,
  },
  {
    name: 'Nov',
    total: Math.floor(Math.random() * 5000) + 1000,
  },
  {
    name: 'Dec',
    total: Math.floor(Math.random() * 5000) + 1000,
  },
]

export function Overview() {
  const { resolvedTheme } = useTheme()
  const [chartColors, setChartColors] = useState(() => ({
    axis: '#1f2937',
    primary: '#2563eb',
  }))

  useEffect(() => {
    const fallbackAxis = resolvedTheme === 'dark' ? '#e2e8f0' : '#1f2937'
    const fallbackPrimary = resolvedTheme === 'dark' ? '#7386ff' : '#3b82f6'
    if (typeof window === 'undefined') return
    const style = getComputedStyle(document.documentElement)
    const readVar = (variable: string, fallback: string) => {
      const value = style.getPropertyValue(variable).trim()
      return value || fallback
    }

    setChartColors({
      axis: readVar('--foreground', fallbackAxis),
      primary: readVar('--chart-1', fallbackPrimary),
    })
  }, [resolvedTheme])

  const axisColor = useMemo(() => chartColors.axis, [chartColors.axis])
  const primaryColor = useMemo(
    () => `color-mix(in oklch, ${chartColors.axis} 60%, ${chartColors.primary} 40%)`,
    [chartColors.axis, chartColors.primary]
  )

  return (
    <ResponsiveContainer width='100%' height={350}>
      <BarChart data={data}>
        <XAxis
          dataKey='name'
          stroke={axisColor}
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tick={{ fill: axisColor }}
        />
        <YAxis
          stroke={axisColor}
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `$${value}`}
          tick={{ fill: axisColor }}
        />
        <Bar
          dataKey='total'
          fill={primaryColor}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
