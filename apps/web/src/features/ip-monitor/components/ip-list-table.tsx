import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronLeft, ChevronRight, MoreHorizontal, Shield, Eye, Ban, Gauge } from 'lucide-react'
import { analyzeSuspiciousIp, formatIpStats } from '@/hooks/use-ip-monitor-api'
import { IpDetailDialog } from './ip-detail-dialog'
import { IpPathsDialog } from './ip-paths-dialog'

interface CountryStat {
  code: string
  name: string
  count: number
  percentage: number
  coordinates?: [number, number]
}

interface IpListTableProps {
  data: Array<{
    ipHash: string
    ipAddress?: string  // 真实 IP 地址
    date?: string
    totalRequests: number
    successCount?: number
    errorCount?: number
    rateLimitedCount?: number
    uniquePaths: number
    topPaths: Array<{ path: string; count: number }>
    countries?: CountryStat[]
    primaryCountry?: CountryStat
    rawCity?: string  // Quick Win: 原始城市名称
    userAgents?: Array<{ ua: string; count: number }>
    firstSeenAt?: string | null
    lastSeenAt?: string | null
    successRate?: number
    errorRate?: number
    rateLimitRate?: number
  }>
  pagination?: {
    page: number
    limit: number
    total: number
    hasMore: boolean
  }
  isLoading?: boolean
  currentPage: number
  selectedDate: string  // 当前选中的日期（用于传递给路径详情对话框）
  onPageChange: (page: number) => void
  onCreateRule?: (ipPattern: string, mode: 'block' | 'throttle') => void
}

export function IpListTable({
  data,
  pagination,
  isLoading,
  currentPage,
  selectedDate,
  onPageChange,
  onCreateRule,
}: IpListTableProps) {
  const [selectedIpHash, setSelectedIpHash] = useState<string | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [pathsDialogOpen, setPathsDialogOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12">
        <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">暂无 IP 访问数据</p>
        <p className="text-xs text-muted-foreground mt-1">
          等待流量产生后将显示访问统计
        </p>
      </div>
    )
  }

  const handleViewDetail = (ipHash: string) => {
    setSelectedIpHash(ipHash)
    setDetailDialogOpen(true)
  }

  const handleViewPaths = (ipHash: string) => {
    setSelectedIpHash(ipHash)
    setPathsDialogOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">IP 地址</TableHead>
              <TableHead className="w-[180px]">主要来源</TableHead>
              <TableHead className="text-right">总请求</TableHead>
              <TableHead className="text-right">错误率</TableHead>
              <TableHead className="text-right">限流率</TableHead>
              <TableHead className="text-center">路径数</TableHead>
              <TableHead className="text-center">风险等级</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((ip) => {
              const stats = formatIpStats(ip)
              const analysis = analyzeSuspiciousIp({
                ...ip,
                errorCount: ip.errorCount ?? 0,
                rateLimitedCount: ip.rateLimitedCount ?? 0
              })
              const primaryCountry = ip.primaryCountry || ip.countries?.[0]
              const errorRateDisplay = typeof ip.errorRate === 'number'
                ? ip.errorRate.toFixed(1)
                : stats.errorRate
              const rateLimitDisplay = typeof ip.rateLimitRate === 'number'
                ? ip.rateLimitRate.toFixed(1)
                : stats.rateLimitRate

              return (
                <TableRow key={ip.ipHash}>
                  <TableCell className="font-mono text-xs">
                    <div className="flex flex-col gap-1">
                      <span>{ip.ipAddress || `${ip.ipHash.slice(0, 16)}...`}</span>
                      {ip.firstSeenAt && (
                        <span className="text-[10px] text-muted-foreground">
                          首次 {new Date(ip.firstSeenAt).toLocaleDateString('zh-CN')}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[160px]">
                    {primaryCountry ? (
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-medium">{primaryCountry.name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {primaryCountry.percentage}% · {primaryCountry.code}
                            {ip.rawCity && (
                              <span className="ml-1 text-blue-600">· {ip.rawCity}</span>
                            )}
                          </div>
                        </div>
                        <Badge variant="secondary">
                          {primaryCountry.count.toLocaleString()}
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {ip.rawCity || '未知'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary">{ip.totalRequests.toLocaleString()}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        parseFloat(errorRateDisplay) > 10
                          ? 'text-red-600 font-medium'
                          : 'text-muted-foreground'
                      }
                    >
                      {errorRateDisplay}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        parseFloat(rateLimitDisplay) > 5
                          ? 'text-orange-600 font-medium'
                          : 'text-muted-foreground'
                      }
                    >
                      {rateLimitDisplay}%
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => handleViewPaths(ip.ipHash)}
                    >
                      <Badge variant="outline" className="cursor-pointer hover:bg-secondary">
                        {ip.uniquePaths} 个路径
                      </Badge>
                    </Button>
                  </TableCell>
                  <TableCell className="text-center">
                    {analysis.suspicionScore >= 80 ? (
                      <Badge variant="destructive">高危 {analysis.suspicionScore}</Badge>
                    ) : analysis.suspicionScore >= 50 ? (
                      <Badge variant="default" className="bg-orange-500">
                        可疑 {analysis.suspicionScore}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">正常 {analysis.suspicionScore}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewDetail(ip.ipHash)}>
                          <Eye className="h-4 w-4 mr-2" />
                          查看详情
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onCreateRule?.(ip.ipAddress!, 'block')}
                          disabled={!onCreateRule || !ip.ipAddress}
                        >
                          <Ban className="h-4 w-4 mr-2 text-red-600" />
                          封禁此 IP
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onCreateRule?.(ip.ipAddress!, 'throttle')}
                          disabled={!onCreateRule || !ip.ipAddress}
                        >
                          <Gauge className="h-4 w-4 mr-2 text-orange-600" />
                          限流此 IP
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* 分页控件 */}
      {pagination && pagination.total > pagination.limit && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            显示 {Math.min((currentPage - 1) * pagination.limit + 1, pagination.total)} -{' '}
            {Math.min(currentPage * pagination.limit, pagination.total)} 条，共{' '}
            {pagination.total} 条
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              上一页
            </Button>
            <div className="text-sm text-muted-foreground">
              第 {currentPage} 页 / 共 {Math.ceil(pagination.total / pagination.limit)} 页
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={!pagination.hasMore}
            >
              下一页
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* IP 详情对话框 */}
      {selectedIpHash && (
        <>
          <IpDetailDialog
            open={detailDialogOpen}
            onOpenChange={setDetailDialogOpen}
            ipHash={selectedIpHash}
          />
          <IpPathsDialog
            open={pathsDialogOpen}
            onOpenChange={setPathsDialogOpen}
            ipHash={selectedIpHash}
            date={selectedDate}
          />
        </>
      )}
    </div>
  )
}
