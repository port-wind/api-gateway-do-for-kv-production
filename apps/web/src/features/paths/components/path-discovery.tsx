/**
 * @deprecated 此组件已废弃
 * 
 * 原因：PathCollector DO 已下线，/api/admin/paths/discovered 端点返回 410 Gone
 * 日期：2025-10-16
 * Phase: Phase 3 路径统计架构迁移
 * 
 * 相关变更：
 * - 后端已从 Durable Objects 迁移到 Queue + D1 + KV 架构
 * - /api/admin/paths/discovered 端点已废弃
 * - 路径自动发现功能已从前端移除
 * 
 * 保留此文件仅供参考，请勿使用或导入此组件
 */

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'
import {
  Search,
  Plus,
  Activity,
  Globe,
  TrendingUp,
  Eye,
  EyeOff
} from 'lucide-react'
import { useUpdateUnifiedPathConfig } from '@/hooks/use-path-api'
import type { UnifiedPathConfig, PathDiscoveryStats } from '@/types/api'
import { useTheme } from '@/context/theme-provider'

interface PathDiscoveryProps {
  discoveredPaths: UnifiedPathConfig[]
  stats?: PathDiscoveryStats
  isLoading?: boolean
}

export function PathDiscovery({ discoveredPaths, stats, isLoading }: PathDiscoveryProps) {
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [showAll, setShowAll] = useState(false)

  const updateConfig = useUpdateUnifiedPathConfig()
  const { resolvedTheme } = useTheme()

  const [chartColors, setChartColors] = useState(() => ({
    grid: '#d4d4d8',
    axis: '#1f2937',
    background: '#ffffff',
    border: '#e5e7eb',
    primary: '#2563eb',
  }))

  useEffect(() => {
    const fallbackAxis = resolvedTheme === 'dark' ? '#e2e8f0' : '#1f2937'
    const fallbackPrimary = resolvedTheme === 'dark' ? '#7386ff' : '#3b82f6'
    const fallbackGrid = resolvedTheme === 'dark' ? '#3f4c66' : '#e5e7eb'
    const fallbackBorder = resolvedTheme === 'dark' ? '#334155' : '#d1d5db'
    const fallbackBackground = resolvedTheme === 'dark' ? '#0f172a' : '#ffffff'
    if (typeof window === 'undefined') return
    const style = getComputedStyle(document.documentElement)

    const readVar = (variable: string, fallback: string) => {
      const value = style.getPropertyValue(variable).trim()
      return value || fallback
    }

    setChartColors({
      grid: readVar('--muted-foreground', fallbackGrid),
      axis: readVar('--foreground', fallbackAxis),
      background: readVar('--background', fallbackBackground),
      border: readVar('--border', fallbackBorder),
      primary: readVar('--chart-1', fallbackPrimary),
    })
  }, [resolvedTheme])

  const barFill = useMemo(
    () => `color-mix(in oklch, ${chartColors.axis} 60%, ${chartColors.primary} 40%)`,
    [chartColors.axis, chartColors.primary]
  )

  // 处理路径选择
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedPaths(discoveredPaths.map(path => path.path))
    } else {
      setSelectedPaths([])
    }
  }

  const handleSelectPath = (path: string, checked: boolean) => {
    if (checked) {
      setSelectedPaths(prev => [...prev, path])
    } else {
      setSelectedPaths(prev => prev.filter(p => p !== path))
    }
  }

  // 批量添加路径到配置
  const handleBatchAddPaths = () => {
    selectedPaths.forEach(path => {
      // 为每个路径创建基本配置
      updateConfig.mutate({
        path,
        config: {
          cache: { enabled: true, version: 1 },
          rateLimit: { enabled: false },
          geo: { enabled: false },
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            source: 'manual'
          }
        }
      })
    })
    setSelectedPaths([])
  }

  // 单个路径添加到配置
  const handleAddSinglePath = (path: string) => {
    updateConfig.mutate({
      path,
      config: {
        cache: { enabled: true, version: 1 },
        rateLimit: { enabled: false },
        geo: { enabled: false },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: 'manual'
        }
      }
    })
  }

  // 显示的路径数据（可能需要截取）
  const displayPaths = showAll ? discoveredPaths : discoveredPaths.slice(0, 20)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-gray-100 rounded animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 统计概览 */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">发现路径</CardTitle>
              <Search className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalPaths}</div>
              <p className="text-xs text-muted-foreground">
                自动发现的API路径
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">总请求数</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalRequests.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                累计请求次数
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">HTTP方法</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.uniqueMethods.length}</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {stats.uniqueMethods.map(method => (
                  <Badge key={method} variant="outline" className="text-xs">
                    {method}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">热门路径</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.topPaths.length}</div>
              <p className="text-xs text-muted-foreground">
                访问量最高的路径
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 访问量排行榜图表 */}
      {stats && stats.topPaths.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>热门路径访问量</CardTitle>
            <CardDescription>
              访问次数最多的前 {stats.topPaths.length} 个路径
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.topPaths}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.3} />
                  <XAxis
                    dataKey="path"
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    interval={0}
                    fontSize={12}
                    stroke={chartColors.axis}
                    tick={{ fill: chartColors.axis }}
                  />
                  <YAxis stroke={chartColors.axis} tick={{ fill: chartColors.axis }} />
                  <Tooltip
                    formatter={(value) => [value, '访问次数']}
                    labelFormatter={(path) => `路径: ${path}`}
                    contentStyle={{
                      backgroundColor: chartColors.background,
                      border: `1px solid ${chartColors.border}`,
                      borderRadius: '6px',
                      color: chartColors.axis,
                    }}
                  />
                  <Bar dataKey="count" fill={barFill} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 路径列表 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>发现的路径</CardTitle>
              <CardDescription>
                系统自动发现的 {discoveredPaths.length} 个API路径，您可以选择性地添加到管理配置中
              </CardDescription>
            </div>

            {discoveredPaths.length > 20 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? (
                  <>
                    <EyeOff className="h-4 w-4 mr-2" />
                    显示前20个
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-2" />
                    显示全部
                  </>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* 批量操作工具栏 */}
          {selectedPaths.length > 0 && (
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg mb-4">
              <span className="text-sm font-medium">
                已选择 {selectedPaths.length} 个路径
              </span>

              <Button
                size="sm"
                onClick={handleBatchAddPaths}
                disabled={updateConfig.isPending}
              >
                <Plus className="h-4 w-4 mr-2" />
                批量添加到配置
              </Button>
            </div>
          )}

          {/* 路径数据表格 */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={selectedPaths.length === displayPaths.length && displayPaths.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>路径</TableHead>
                  <TableHead className="w-[100px] text-center">访问次数</TableHead>
                  <TableHead className="w-[120px] text-center">首次发现</TableHead>
                  <TableHead className="w-[120px] text-center">最后访问</TableHead>
                  <TableHead className="w-[100px] text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayPaths.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      暂无发现的路径数据
                    </TableCell>
                  </TableRow>
                ) : (
                  displayPaths.map((pathConfig) => (
                    <TableRow key={pathConfig.path}>
                      <TableCell>
                        <Checkbox
                          checked={selectedPaths.includes(pathConfig.path)}
                          onCheckedChange={(checked) =>
                            handleSelectPath(pathConfig.path, checked as boolean)
                          }
                        />
                      </TableCell>

                      <TableCell>
                        <div className="font-mono text-sm">
                          {pathConfig.path}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          来源：自动发现
                        </div>
                      </TableCell>

                      <TableCell className="text-center">
                        <Badge variant="secondary">
                          {pathConfig.requestCount?.toLocaleString() || '0'}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-center text-sm text-muted-foreground">
                        {pathConfig.metadata?.createdAt
                          ? new Date(pathConfig.metadata.createdAt).toLocaleDateString('zh-CN')
                          : '-'
                        }
                      </TableCell>

                      <TableCell className="text-center text-sm text-muted-foreground">
                        {pathConfig.lastAccessed
                          ? new Date(pathConfig.lastAccessed).toLocaleDateString('zh-CN')
                          : '-'
                        }
                      </TableCell>

                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddSinglePath(pathConfig.path)}
                          disabled={updateConfig.isPending}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          添加
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* 显示更多提示 */}
          {!showAll && discoveredPaths.length > 20 && (
            <div className="text-center mt-4">
              <div className="text-sm text-muted-foreground mb-2">
                显示前 20 个路径，还有 {discoveredPaths.length - 20} 个路径未显示
              </div>
              <Button
                variant="outline"
                onClick={() => setShowAll(true)}
              >
                显示全部 {discoveredPaths.length} 个路径
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 使用说明 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            路径发现说明
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              • <strong>自动收集：</strong>系统会自动记录经过中间件的所有API请求路径
            </p>
            <p>
              • <strong>统计信息：</strong>包含访问次数、首次发现时间和最后访问时间
            </p>
            <p>
              • <strong>添加配置：</strong>选择需要管理的路径，为其启用缓存、限流或地域封锁功能
            </p>
            <p>
              • <strong>数据更新：</strong>路径发现数据每分钟自动刷新一次
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
