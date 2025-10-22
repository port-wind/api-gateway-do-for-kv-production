import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Activity, Globe, Monitor, TrendingUp } from 'lucide-react'
import { useIpDetail, formatIpStats, analyzeSuspiciousIp } from '@/hooks/use-ip-monitor-api'

interface IpDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ipHash: string
}

export function IpDetailDialog({ open, onOpenChange, ipHash }: IpDetailDialogProps) {
  const { data: ipDetail, isLoading: detailLoading } = useIpDetail(ipHash, open)

  const isLoading = detailLoading

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-screen h-[95vh] max-w-none px-8 sm:max-w-none sm:w-screen sm:rounded-none overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>IP 详细信息</DialogTitle>
            <DialogDescription>加载中...</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (!ipDetail) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-2xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>IP 详细信息</DialogTitle>
            <DialogDescription>未找到该 IP 的详细信息</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  const ip = ipDetail as any
  const totalErrorsCount = Number(ip.totalErrors ?? ip.errorCount ?? 0)
  const rateLimitedCount = Number(ip.rateLimitedCount ?? 0)
  const stats = formatIpStats({
    totalRequests: ip.totalRequests,
    successCount: ip.successCount,
    errorCount: totalErrorsCount,
    rateLimitedCount,
  })
  const analysis = analyzeSuspiciousIp(ip)
  const paths = Array.isArray(ip.topPaths) ? ip.topPaths : []
  const topCountry = Array.isArray(ip.countries) && ip.countries.length > 0 ? ip.countries[0] : null
  const rateLimitRateDisplay = stats.rateLimitRate
  const errorRateDisplay = stats.errorRate

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-screen h-[95vh] max-w-none px-8 sm:max-w-none sm:w-screen sm:rounded-none overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>IP 详细信息</DialogTitle>
          <DialogDescription className="font-mono flex flex-col gap-1">
            <span>{ip.ipHash}</span>
            {ip.ipAddress && <span className="text-xs text-muted-foreground">真实 IP：{ip.ipAddress}</span>}
            {topCountry && (
              <span className="text-xs text-muted-foreground">
                主要来源：{topCountry.name} ({topCountry.code}) · {topCountry.count.toLocaleString()} 次
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-4 pr-2">
          {/* 基础统计 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">总请求</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{ip.totalRequests.toLocaleString()}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">错误率</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{errorRateDisplay}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  错误请求 {totalErrorsCount.toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">限流</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{rateLimitRateDisplay}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  限流/封禁 {rateLimitedCount.toLocaleString()} 次
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 风险分析 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                风险分析
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">风险评分</span>
                <div className="flex items-center gap-2">
                  {analysis.suspicionScore >= 80 ? (
                    <Badge variant="destructive">高危 {analysis.suspicionScore}</Badge>
                  ) : analysis.suspicionScore >= 50 ? (
                    <Badge variant="default" className="bg-orange-500">
                      可疑 {analysis.suspicionScore}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">正常 {analysis.suspicionScore}</Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">建议操作</span>
                <Badge variant="outline">
                  {analysis.recommendation === 'block'
                    ? '建议封禁'
                    : analysis.recommendation === 'throttle'
                      ? '建议限流'
                      : '继续监控'}
                </Badge>
              </div>

              {analysis.indicators.length > 0 && (
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">风险指标：</span>
                  <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                    {analysis.indicators.map((indicator, idx) => (
                      <li key={idx}>{indicator}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 地域分布 */}
          {ip.countries && ip.countries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  地域分布 (Top 5)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {ip.countries && ip.countries.length > 0 ? (
                  <div className="space-y-2">
                    {ip.countries.map((country: { name: string; code: string; count: number; percentage: number; coordinates?: [number, number] }) => (
                      <div key={country.code} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                        <div>
                          <div className="text-sm font-medium">
                            {country.name} ({country.code})
                          </div>
                          <div className="text-xs text-muted-foreground">
                            占比约 {country.percentage}%
                          </div>
                          {country.coordinates && (
                            <div className="text-[10px] text-muted-foreground">
                              坐标：{country.coordinates[1].toFixed(2)}, {country.coordinates[0].toFixed(2)}
                            </div>
                          )}
                        </div>
                        <Badge variant="secondary">{country.count.toLocaleString()} 次</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-2">暂无地域分布数据</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* User-Agent 分布 */}
          {ip.userAgents && ip.userAgents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  User-Agent 分布 (Top 5)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {ip.userAgents.map((ua: { ua: string; count: number }, idx: number) => (
                    <div key={idx} className="flex items-start justify-between gap-2">
                      <span className="text-xs text-muted-foreground flex-1 line-clamp-2">
                        {ua.ua}
                      </span>
                      <Badge variant="secondary" className="flex-shrink-0">
                        {ua.count.toLocaleString()}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 访问路径 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4" />
                访问路径 (Top 20)
              </CardTitle>
              <CardDescription>该 IP 访问最频繁的路径</CardDescription>
            </CardHeader>
            <CardContent>
              {paths.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[60px]">排名</TableHead>
                        <TableHead>路径</TableHead>
                        <TableHead className="text-right w-[100px]">请求次数</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paths.map((pathItem: { path: string; count: number }, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">#{idx + 1}</TableCell>
                          <TableCell className="font-mono text-xs">{pathItem.path}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">{pathItem.count.toLocaleString()}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  暂无路径数据
                </p>
              )}
            </CardContent>
          </Card>

          {/* 时间信息 */}
          <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
            <div>
              <span className="font-medium">首次访问：</span>
              <span className="ml-2">
                {ip.firstSeenAt ? new Date(ip.firstSeenAt).toLocaleString('zh-CN') : '未知'}
              </span>
            </div>
            <div>
              <span className="font-medium">最后访问：</span>
              <span className="ml-2">
                {ip.lastSeenAt ? new Date(ip.lastSeenAt).toLocaleString('zh-CN') : '未知'}
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
