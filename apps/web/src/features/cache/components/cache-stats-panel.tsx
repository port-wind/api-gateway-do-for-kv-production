import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { 
  Database, 
  TrendingUp, 
  Clock, 
  HardDrive,
  RefreshCw,
  AlertCircle,
  Activity,
  Zap
} from 'lucide-react'
import { toast } from 'sonner'

interface CacheStats {
  hitRate: number
  hitCount: number
  missCount: number
  totalRequests: number
  avgResponseTime: number
  upstreamRequests: number
  cacheSize: {
    totalEntries: number
    pathCount: number
    estimatedSizeBytes: number
    indexSizeBytes: number
  }
  performance: {
    averageHitTime: number
    averageMissTime: number
    p95ResponseTime: number
  }
  lastUpdated: number
}

// 注意：移除了 CacheUsage 接口，因为不再需要清理功能

export function CacheStatsPanel() {
  const [stats, setStats] = useState<CacheStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  // 获取缓存统计
  const fetchStats = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/cache/stats')
      const result = await response.json()
      
      if (result.success) {
        setStats(result.data)
        setLastRefresh(new Date())
      } else {
        toast.error('获取缓存统计失败：' + result.message)
      }
    } catch (error) {
      toast.error('获取缓存统计失败：' + error)
    } finally {
      setLoading(false)
    }
  }

  // 页面加载时获取数据
  useEffect(() => {
    fetchStats()
  }, [])

  // 格式化文件大小
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
  }

  // 格式化时间
  const formatTime = (ms: number): string => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`
    if (ms < 1000) return `${ms.toFixed(1)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  // 格式化百分比
  const formatPercent = (value: number): string => {
    return `${value.toFixed(1)}%`
  }

  // 获取命中率的颜色
  const getHitRateColor = (rate: number): string => {
    if (rate >= 80) return 'text-green-600'
    if (rate >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  // 获取命中率的Badge变体
  const getHitRateBadge = (rate: number): 'default' | 'secondary' | 'destructive' => {
    if (rate >= 80) return 'default'
    if (rate >= 60) return 'secondary'
    return 'destructive'
  }

  return (
    <div className="space-y-6">
      {/* 标题和刷新按钮 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">缓存监控</h2>
          <p className="text-muted-foreground">
            实时监控缓存性能和使用情况
          </p>
        </div>
        <Button
          onClick={fetchStats}
          disabled={loading}
          variant="outline"
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新数据
        </Button>
      </div>

      {loading && !stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-16 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {stats && (
        <div className="space-y-6">
          {/* 核心指标 */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* 缓存命中率 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">缓存命中率</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <span className={getHitRateColor(stats.hitRate)}>
                    {formatPercent(stats.hitRate)}
                  </span>
                </div>
                <div className="space-y-2 mt-2">
                  <Progress value={stats.hitRate} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>命中: {stats.hitCount.toLocaleString()}</span>
                    <span>未命中: {stats.missCount.toLocaleString()}</span>
                  </div>
                </div>
                <div className="mt-2">
                  <Badge variant={getHitRateBadge(stats.hitRate)} className="text-xs">
                    {stats.hitRate >= 80 ? '优秀' : stats.hitRate >= 60 ? '良好' : '需改善'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* 平均响应时间 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">平均响应时间</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatTime(stats.avgResponseTime)}
                </div>
                <div className="space-y-1 mt-2 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>缓存命中:</span>
                    <span>{formatTime(stats.performance.averageHitTime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>缓存未命中:</span>
                    <span>{formatTime(stats.performance.averageMissTime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>P95 响应:</span>
                    <span>{formatTime(stats.performance.p95ResponseTime)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 上游请求数 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">上游请求</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.upstreamRequests.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  节省率: {formatPercent((1 - stats.upstreamRequests / stats.totalRequests) * 100)}
                </div>
                <div className="text-xs text-muted-foreground">
                  总请求: {stats.totalRequests.toLocaleString()}
                </div>
                <div className="mt-2">
                  <Badge variant="outline" className="text-xs">
                    <Zap className="h-3 w-3 mr-1" />
                    减少 {((stats.totalRequests - stats.upstreamRequests) / stats.totalRequests * 100).toFixed(0)}% 负载
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* 缓存使用 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">缓存使用</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.cacheSize.totalEntries.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">条缓存条目</div>
                <div className="space-y-1 mt-2 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>路径数:</span>
                    <span>{stats.cacheSize.pathCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>总大小:</span>
                    <span>{formatSize(stats.cacheSize.estimatedSizeBytes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>索引大小:</span>
                    <span>{formatSize(stats.cacheSize.indexSizeBytes)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 详细统计 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5" />
                缓存详情
              </CardTitle>
              <CardDescription>
                缓存系统的详细性能指标和使用情况
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 性能指标 */}
              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  性能指标
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-lg font-semibold">
                      {formatPercent(stats.hitRate)}
                    </div>
                    <div className="text-xs text-muted-foreground">命中率</div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-lg font-semibold">
                      {formatTime(stats.performance.averageHitTime)}
                    </div>
                    <div className="text-xs text-muted-foreground">命中延迟</div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-lg font-semibold">
                      {formatTime(stats.performance.averageMissTime)}
                    </div>
                    <div className="text-xs text-muted-foreground">未命中延迟</div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-lg font-semibold">
                      {formatTime(stats.performance.p95ResponseTime)}
                    </div>
                    <div className="text-xs text-muted-foreground">P95 延迟</div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* 存储使用 */}
              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  存储使用
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">缓存条目数</span>
                      <span className="font-medium">
                        {stats.cacheSize.totalEntries.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">路径数量</span>
                      <span className="font-medium">
                        {stats.cacheSize.pathCount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">数据大小</span>
                      <span className="font-medium">
                        {formatSize(stats.cacheSize.estimatedSizeBytes)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">索引大小</span>
                      <span className="font-medium">
                        {formatSize(stats.cacheSize.indexSizeBytes)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* 请求统计 */}
              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  请求统计
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 border rounded-lg">
                    <div className="text-lg font-semibold text-green-600">
                      {stats.hitCount.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">缓存命中</div>
                  </div>
                  <div className="text-center p-3 border rounded-lg">
                    <div className="text-lg font-semibold text-orange-600">
                      {stats.missCount.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">缓存未命中</div>
                  </div>
                  <div className="text-center p-3 border rounded-lg">
                    <div className="text-lg font-semibold text-blue-600">
                      {stats.totalRequests.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">总请求数</div>
                  </div>
                  <div className="text-center p-3 border rounded-lg">
                    <div className="text-lg font-semibold text-purple-600">
                      {stats.upstreamRequests.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">上游请求</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 注意：移除了缓存使用率和 LRU 清理界面，因为采用"永不删除"策略 */}

          {/* 健康状态 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                系统健康
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">缓存命中率</span>
                    <Badge variant={getHitRateBadge(stats.hitRate)}>
                      {stats.hitRate >= 80 ? '健康' : stats.hitRate >= 60 ? '警告' : '异常'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">响应时间</span>
                    <Badge variant={stats.avgResponseTime < 100 ? 'default' : stats.avgResponseTime < 500 ? 'secondary' : 'destructive'}>
                      {stats.avgResponseTime < 100 ? '优秀' : stats.avgResponseTime < 500 ? '良好' : '需优化'}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">上游压力</span>
                    <Badge variant={stats.upstreamRequests / stats.totalRequests < 0.3 ? 'default' : 'secondary'}>
                      {stats.upstreamRequests / stats.totalRequests < 0.3 ? '低压力' : '中压力'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">缓存利用率</span>
                    <Badge variant="outline">
                      {stats.cacheSize.totalEntries > 0 ? '活跃' : '空闲'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">数据保存策略</span>
                    <Badge variant="outline">
                      永久保存
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 最后更新时间 */}
          {lastRefresh && (
            <div className="text-xs text-muted-foreground text-center">
              最后更新：{lastRefresh.toLocaleString('zh-CN')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}