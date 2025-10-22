import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Settings,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Database,
  Shield,
  Globe,
  RefreshCw,
  Clock,
  FileText,
  User,
  Users
} from 'lucide-react'
import { PathConfigDialog } from './path-config-dialog'
import { BatchCacheOperationDialog } from './batch-cache-operation-dialog'
import { CacheEntriesDialog } from './cache-entries-dialog'
import {
  useUpdateUnifiedPathConfig,
  useBatchTogglePaths,
  useDeletePaths
} from '@/hooks/use-path-api'
import type { UnifiedPathConfig } from '@/types/api'
import { toast } from 'sonner'

interface UnifiedPathTableProps {
  data: UnifiedPathConfig[]
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
  isLoading?: boolean
  searchQuery?: string
  currentPage: number
  onPageChange: (page: number) => void
}

export function UnifiedPathTable({
  data,
  pagination,
  isLoading,
  searchQuery,
  currentPage,
  onPageChange,
}: UnifiedPathTableProps) {
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [configDialogPath, setConfigDialogPath] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pathsToDelete, setPathsToDelete] = useState<string[]>([])
  const [batchCacheDialogOpen, setBatchCacheDialogOpen] = useState(false)
  const [cacheEntriesDialogPath, setCacheEntriesDialogPath] = useState<string | null>(null)

  const updateConfig = useUpdateUnifiedPathConfig()
  const batchToggle = useBatchTogglePaths()
  const deletePaths = useDeletePaths()

  // 获取缓存策略显示信息
  const getCacheStrategyBadge = (pathConfig: UnifiedPathConfig) => {
    if (!pathConfig.cache?.enabled) {
      return <span className="text-xs text-muted-foreground">-</span>
    }

    const strategy = pathConfig.cache.keyStrategy || 'path-params'
    const strategyConfig = {
      'path-only': {
        label: '仅路径',
        icon: <FileText className="h-3 w-3" />,
        variant: 'outline' as const
      },
      'path-params': {
        label: '路径+参数',
        icon: <Database className="h-3 w-3" />,
        variant: 'secondary' as const
      },
      'path-headers': {
        label: '路径+Headers',
        icon: <User className="h-3 w-3" />,
        variant: 'default' as const
      },
      'path-params-headers': {
        label: '组合策略',
        icon: <Users className="h-3 w-3" />,
        variant: 'default' as const
      }
    }

    const config = strategyConfig[strategy]

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant={config.variant} className="flex items-center gap-1 cursor-help">
              {config.icon}
              <span className="text-xs">{config.label}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              <p className="font-semibold">{config.label}</p>
              {strategy === 'path-headers' && pathConfig.cache.keyHeaders && (
                <p className="text-xs">
                  Headers: {(pathConfig.cache.keyHeaders as 'all' | string[]) === 'all'
                    ? '所有 Headers'
                    : (pathConfig.cache.keyHeaders as string[]).join(', ')}
                </p>
              )}
              {(strategy === 'path-params' || strategy === 'path-params-headers') && pathConfig.cache.keyParams && (
                <p className="text-xs">
                  参数: {pathConfig.cache.keyParams === 'all' ? '所有' : pathConfig.cache.keyParams.join(', ')}
                </p>
              )}
              {strategy === 'path-params-headers' && pathConfig.cache.keyHeaders && (
                <p className="text-xs">
                  Headers: {(pathConfig.cache.keyHeaders as 'all' | string[]) === 'all'
                    ? '所有 Headers'
                    : (pathConfig.cache.keyHeaders as string[]).join(', ')}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // 选择相关的处理函数
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedPaths(data.map(path => path.path))
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

  // 单个路径功能切换
  const handleToggleFeature = async (path: string, feature: 'cache' | 'rateLimit' | 'geo') => {
    const pathConfig = data.find(p => p.path === path)
    if (!pathConfig) return

    const updates: Partial<UnifiedPathConfig> = {}

    switch (feature) {
      case 'cache':
        updates.cache = {
          ...pathConfig.cache,
          enabled: !pathConfig.cache?.enabled,
          version: pathConfig.cache?.version || 1
        }
        break
      case 'rateLimit':
        updates.rateLimit = {
          ...pathConfig.rateLimit,
          enabled: !pathConfig.rateLimit?.enabled,
          limit: pathConfig.rateLimit?.limit || 60,
          window: pathConfig.rateLimit?.window || 60
        }
        break
      case 'geo':
        updates.geo = {
          ...pathConfig.geo,
          enabled: !pathConfig.geo?.enabled,
          mode: pathConfig.geo?.mode || 'blacklist',
          countries: pathConfig.geo?.countries || []
        }
        break
    }

    updateConfig.mutate({ path, config: updates })
  }

  // 查看缓存条目
  const handleViewCacheEntries = (path: string) => {
    setCacheEntriesDialogPath(path)
  }

  // 批量操作
  const handleBatchToggle = (feature: 'cache' | 'rate-limit' | 'geo') => {
    if (selectedPaths.length === 0) return

    let pathsToProcess = selectedPaths

    // 如果是缓存操作，只处理可缓存的路径
    if (feature === 'cache') {
      pathsToProcess = selectedPaths.filter(path => {
        const pathConfig = data.find(p => p.path === path)
        return pathConfig && isCacheableMethod(pathConfig.method)
      })

      if (pathsToProcess.length === 0) {
        // TODO: 可以添加toast提示用户没有可缓存的路径被选中
        return
      }
    }

    batchToggle.mutate({ paths: pathsToProcess, feature })
    setSelectedPaths([])
  }

  const handleBatchDelete = () => {
    setPathsToDelete(selectedPaths)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    if (pathsToDelete.length > 0) {
      deletePaths.mutate(pathsToDelete)
      setSelectedPaths([])
      setPathsToDelete([])
    }
    setDeleteDialogOpen(false)
  }

  // 批量缓存刷新
  const handleBatchCacheFlush = async () => {
    const cacheablePaths = selectedPaths.filter(path => {
      const pathConfig = data.find(p => p.path === path)
      return pathConfig && isCacheableMethod(pathConfig.method)
    })

    if (cacheablePaths.length === 0) {
      toast.error('没有选择可缓存的路径')
      return
    }

    try {
      const response = await fetch('/api/admin/cache/flush', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keys: cacheablePaths
        })
      })
      const result = await response.json()

      if (result.success) {
        toast.success(`批量刷新完成！已刷新 ${result.result.flushedCount} 个缓存条目`)
        setSelectedPaths([])
      } else {
        toast.error('批量刷新失败：' + result.message)
      }
    } catch (error) {
      toast.error('批量刷新失败：' + error)
    }
  }

  // 打开批量缓存操作对话框
  const handleBatchCacheOperation = () => {
    const cacheablePaths = selectedPaths.filter(path => {
      const pathConfig = data.find(p => p.path === path)
      return pathConfig && isCacheableMethod(pathConfig.method)
    })

    if (cacheablePaths.length === 0) {
      toast.error('没有选择可缓存的路径')
      return
    }

    setBatchCacheDialogOpen(true)
  }

  // 获取路径来源的显示标识
  const getSourceBadge = (pathConfig: UnifiedPathConfig) => {
    const source = pathConfig.metadata?.source || 'unknown'
    const colors = {
      manual: 'bg-blue-100 text-blue-800',
      auto: 'bg-green-100 text-green-800',
      proxy: 'bg-purple-100 text-purple-800',
      unknown: 'bg-gray-100 text-gray-800'
    }

    const labels = {
      manual: '手动',
      auto: '自动',
      proxy: '代理',
      unknown: '未知'
    }

    return (
      <Badge className={`${colors[source]} text-xs`}>
        {labels[source]}
      </Badge>
    )
  }

  // 获取HTTP方法的显示标识
  const getMethodBadge = (method?: string) => {
    if (!method) {
      return <Badge variant="outline" className="text-xs">-</Badge>
    }

    const methodColors = {
      'GET': 'bg-green-100 text-green-800 hover:bg-green-200',
      'HEAD': 'bg-green-100 text-green-800 hover:bg-green-200',
      'POST': 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200',
      'PUT': 'bg-orange-100 text-orange-800 hover:bg-orange-200',
      'PATCH': 'bg-orange-100 text-orange-800 hover:bg-orange-200',
      'DELETE': 'bg-red-100 text-red-800 hover:bg-red-200',
      'OPTIONS': 'bg-gray-100 text-gray-800 hover:bg-gray-200'
    } as const

    const color = methodColors[method as keyof typeof methodColors] || 'bg-gray-100 text-gray-800 hover:bg-gray-200'

    return (
      <Badge className={`${color} text-xs font-mono`}>
        {method}
      </Badge>
    )
  }

  // 判断HTTP方法是否可以缓存
  const isCacheableMethod = (method?: string): boolean => {
    if (!method) return false
    return method === 'GET' || method === 'HEAD' || method === 'POST'
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {/* 加载骨架屏 */}
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 批量操作工具栏 */}
      {selectedPaths.length > 0 && (
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">
            已选择 {selectedPaths.length} 个路径
          </span>

          <div className="flex items-center gap-2">
            {(() => {
              const cacheablePaths = selectedPaths.filter(path => {
                const pathConfig = data.find(p => p.path === path)
                return pathConfig && isCacheableMethod(pathConfig.method)
              })

              return (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBatchToggle('cache')}
                    disabled={batchToggle.isPending || cacheablePaths.length === 0}
                  >
                    <Database className="h-4 w-4 mr-2" />
                    切换缓存 {cacheablePaths.length > 0 && `(${cacheablePaths.length})`}
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBatchCacheFlush}
                    disabled={cacheablePaths.length === 0}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    刷新缓存 {cacheablePaths.length > 0 && `(${cacheablePaths.length})`}
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBatchCacheOperation}
                    disabled={cacheablePaths.length === 0}
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    TTL设置 {cacheablePaths.length > 0 && `(${cacheablePaths.length})`}
                  </Button>
                </>
              )
            })()}

            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBatchToggle('rate-limit')}
              disabled={batchToggle.isPending}
            >
              <Shield className="h-4 w-4 mr-2" />
              切换限流
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBatchToggle('geo')}
              disabled={batchToggle.isPending}
            >
              <Globe className="h-4 w-4 mr-2" />
              切换地域
            </Button>

            <Button
              size="sm"
              variant="destructive"
              onClick={handleBatchDelete}
              disabled={deletePaths.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              删除配置
            </Button>
          </div>
        </div>
      )}

      {/* 数据表格 */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">
                <Checkbox
                  checked={selectedPaths.length === data.length && data.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>路径</TableHead>
              <TableHead className="w-[80px]">方法</TableHead>
              <TableHead className="w-[80px]">来源</TableHead>
              <TableHead className="w-[80px] text-center">缓存</TableHead>
              <TableHead className="w-[140px] text-center">缓存策略</TableHead>
              <TableHead className="w-[100px] text-center">缓存条目</TableHead>
              <TableHead className="w-[80px] text-center">限流</TableHead>
              <TableHead className="w-[80px] text-center">地域</TableHead>
              <TableHead className="w-[100px] text-center">访问次数</TableHead>
              <TableHead className="w-[120px] text-center">最后访问</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                  {searchQuery ? `没有找到匹配 "${searchQuery}" 的路径` : '暂无路径数据'}
                </TableCell>
              </TableRow>
            ) : (
              data.map((pathConfig) => (
                <TableRow key={`${pathConfig.method || 'UNKNOWN'}:${pathConfig.path}`}>
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
                  </TableCell>

                  <TableCell>
                    {getMethodBadge(pathConfig.method)}
                  </TableCell>

                  <TableCell>
                    {getSourceBadge(pathConfig)}
                  </TableCell>

                  <TableCell className="text-center">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="inline-block">
                            <Switch
                              checked={pathConfig.cache?.enabled || false}
                              onCheckedChange={() => handleToggleFeature(pathConfig.path, 'cache')}
                              disabled={updateConfig.isPending || !isCacheableMethod(pathConfig.method)}
                            />
                          </div>
                        </TooltipTrigger>
                        {!isCacheableMethod(pathConfig.method) && (
                          <TooltipContent>
                            <p>仅 GET、HEAD 和 POST 请求可启用缓存</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>

                  <TableCell className="text-center">
                    {getCacheStrategyBadge(pathConfig)}
                  </TableCell>

                  <TableCell className="text-center">
                    {pathConfig.cache?.enabled ? (
                      pathConfig.cacheEntryCount !== undefined && pathConfig.cacheEntryCount > 0 ? (
                        <Badge
                          variant="outline"
                          className="cursor-pointer hover:bg-accent transition-colors"
                          onClick={() => handleViewCacheEntries(pathConfig.path)}
                        >
                          {pathConfig.cacheEntryCount} 条
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          0 条
                        </Badge>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Switch
                        checked={pathConfig.rateLimit?.enabled || false}
                        onCheckedChange={() => handleToggleFeature(pathConfig.path, 'rateLimit')}
                        disabled={updateConfig.isPending}
                      />
                      {pathConfig.rateLimit?.limit && (
                        <span className="text-xs text-muted-foreground ml-1">
                          {pathConfig.rateLimit.limit}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="text-center">
                    <Switch
                      checked={pathConfig.geo?.enabled || false}
                      onCheckedChange={() => handleToggleFeature(pathConfig.path, 'geo')}
                      disabled={updateConfig.isPending}
                    />
                  </TableCell>

                  <TableCell className="text-center">
                    {pathConfig.requestCount ? (
                      <Badge variant="secondary">
                        {pathConfig.requestCount.toLocaleString()}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>

                  <TableCell className="text-center text-sm text-muted-foreground">
                    {pathConfig.lastAccessed
                      ? (() => {
                        const date = new Date(pathConfig.lastAccessed)
                        // 检查日期是否有效
                        if (isNaN(date.getTime())) {
                          return '-'
                        }
                        return date.toLocaleDateString('zh-CN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit'
                        })
                      })()
                      : '-'
                    }
                  </TableCell>

                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setConfigDialogPath(pathConfig.path)}
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          详细配置
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={isCacheableMethod(pathConfig.method) ? () => handleToggleFeature(pathConfig.path, 'cache') : undefined}
                          className={!isCacheableMethod(pathConfig.method) ? "text-muted-foreground cursor-not-allowed" : ""}
                        >
                          {pathConfig.cache?.enabled ? (
                            <><ToggleLeft className="h-4 w-4 mr-2" />禁用缓存</>
                          ) : (
                            <><ToggleRight className="h-4 w-4 mr-2" />启用缓存</>
                          )}
                          {!isCacheableMethod(pathConfig.method) && (
                            <span className="text-xs text-muted-foreground ml-auto">(仅GET/HEAD/POST可用)</span>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleToggleFeature(pathConfig.path, 'rateLimit')}
                        >
                          {pathConfig.rateLimit?.enabled ? (
                            <><ToggleLeft className="h-4 w-4 mr-2" />禁用限流</>
                          ) : (
                            <><ToggleRight className="h-4 w-4 mr-2" />启用限流</>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleToggleFeature(pathConfig.path, 'geo')}
                        >
                          {pathConfig.geo?.enabled ? (
                            <><ToggleLeft className="h-4 w-4 mr-2" />禁用地域</>
                          ) : (
                            <><ToggleRight className="h-4 w-4 mr-2" />启用地域</>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => {
                            setPathsToDelete([pathConfig.path])
                            setDeleteDialogOpen(true)
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          删除配置
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 分页控件 */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            显示第 {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)}-
            {Math.min(pagination.page * pagination.limit, pagination.total)} 项，
            共 {pagination.total} 项
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={!pagination.hasPrev}
            >
              <ChevronLeft className="h-4 w-4" />
              上一页
            </Button>

            <span className="text-sm font-medium">
              {pagination.page} / {pagination.totalPages}
            </span>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={!pagination.hasNext}
            >
              下一页
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* 路径配置弹窗 */}
      {configDialogPath && (
        <PathConfigDialog
          path={configDialogPath}
          open={!!configDialogPath}
          onOpenChange={(open) => {
            if (!open) setConfigDialogPath(null)
          }}
        />
      )}

      {/* 批量缓存操作弹窗 */}
      <BatchCacheOperationDialog
        open={batchCacheDialogOpen}
        onOpenChange={setBatchCacheDialogOpen}
        selectedPaths={selectedPaths.filter(path => {
          const pathConfig = data.find(p => p.path === path)
          return pathConfig && isCacheableMethod(pathConfig.method)
        })}
        onComplete={() => {
          setSelectedPaths([])
          setBatchCacheDialogOpen(false)
        }}
      />

      {/* 删除确认弹窗 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除路径配置</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将删除选中路径的所有配置（缓存、限流、地域封锁）。
              共 {pathsToDelete.length} 个路径将受到影响。
              <br />
              <strong>此操作无法撤销。</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 缓存条目对话框 */}
      <CacheEntriesDialog
        path={cacheEntriesDialogPath}
        open={!!cacheEntriesDialogPath}
        onOpenChange={(open: boolean) => !open && setCacheEntriesDialogPath(null)}
      />
    </div>
  )
}