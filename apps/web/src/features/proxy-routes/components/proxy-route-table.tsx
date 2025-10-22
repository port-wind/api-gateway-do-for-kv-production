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
import { Input } from '@/components/ui/input'
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
  ExternalLink,
  Power,
  PowerOff
} from 'lucide-react'
import { ProxyRouteConfigDialog } from './proxy-route-config-dialog'
import { 
  useUpdateProxyRoute, 
  useBatchProxyRouteOperation, 
  useDeleteProxyRoute,
} from '@/hooks/use-proxy-route-api'
import type { ProxyRoute } from '@/types/api'

interface ProxyRouteTableProps {
  data: ProxyRoute[]
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

export function ProxyRouteTable({
  data,
  pagination,
  isLoading,
  searchQuery,
  currentPage,
  onPageChange,
}: ProxyRouteTableProps) {
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([])
  const [configDialogRoute, setConfigDialogRoute] = useState<ProxyRoute | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [routesToDelete, setRoutesToDelete] = useState<string[]>([])
  const [priorityEditing, setPriorityEditing] = useState<{ [key: string]: number }>({})

  const updateRoute = useUpdateProxyRoute()
  const batchOperation = useBatchProxyRouteOperation()
  const deleteRoute = useDeleteProxyRoute()

  // 选择相关的处理函数
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRoutes(data.map(route => route.id!))
    } else {
      setSelectedRoutes([])
    }
  }

  const handleSelectRoute = (routeId: string, checked: boolean) => {
    if (checked) {
      setSelectedRoutes(prev => [...prev, routeId])
    } else {
      setSelectedRoutes(prev => prev.filter(id => id !== routeId))
    }
  }

  // 单个路由切换
  const handleToggleRoute = async (route: ProxyRoute) => {
    updateRoute.mutate({ 
      id: route.id!, 
      data: { enabled: !route.enabled } 
    })
  }

  const handleToggleFeature = async (route: ProxyRoute, feature: 'rateLimit' | 'geo') => {
    const updates: Partial<ProxyRoute> = {}
    
    switch (feature) {
      case 'rateLimit':
        updates.rateLimitEnabled = !route.rateLimitEnabled
        break
      case 'geo':
        updates.geoEnabled = !route.geoEnabled
        break
    }

    updateRoute.mutate({ id: route.id!, data: updates })
  }

  // 优先级编辑
  const handlePriorityChange = (routeId: string, priority: number) => {
    setPriorityEditing(prev => ({ ...prev, [routeId]: priority }))
  }

  const handlePrioritySave = async (route: ProxyRoute) => {
    const newPriority = priorityEditing[route.id!]
    if (newPriority !== undefined && newPriority !== route.priority) {
      updateRoute.mutate({ 
        id: route.id!, 
        data: { priority: newPriority } 
      })
    }
    setPriorityEditing(prev => {
      const updated = { ...prev }
      delete updated[route.id!]
      return updated
    })
  }

  // 批量操作
  const handleBatchToggle = (operation: 'enable' | 'disable') => {
    if (selectedRoutes.length === 0) return
    batchOperation.mutate({ operation, ids: selectedRoutes })
    setSelectedRoutes([])
  }

  const handleBatchDelete = () => {
    setRoutesToDelete(selectedRoutes)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    if (routesToDelete.length === 1) {
      deleteRoute.mutate(routesToDelete[0])
    } else if (routesToDelete.length > 1) {
      batchOperation.mutate({ operation: 'delete', ids: routesToDelete })
    }
    setSelectedRoutes([])
    setRoutesToDelete([])
    setDeleteDialogOpen(false)
  }

  // 获取状态显示
  const getStatusBadge = (route: ProxyRoute) => {
    if (route.enabled === false) {
      return <Badge variant="secondary">已禁用</Badge>
    }
    return <Badge className="bg-green-100 text-green-800">已启用</Badge>
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
      {selectedRoutes.length > 0 && (
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">
            已选择 {selectedRoutes.length} 个代理路由
          </span>
          
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBatchToggle('enable')}
              disabled={batchOperation.isPending}
            >
              <Power className="h-4 w-4 mr-2" />
              批量启用
            </Button>
            
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBatchToggle('disable')}
              disabled={batchOperation.isPending}
            >
              <PowerOff className="h-4 w-4 mr-2" />
              批量禁用
            </Button>
            
            <Button
              size="sm"
              variant="destructive"
              onClick={handleBatchDelete}
              disabled={batchOperation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              批量删除
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
                  checked={selectedRoutes.length === data.length && data.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead className="w-[60px]">优先级</TableHead>
              <TableHead>路径模式</TableHead>
              <TableHead>目标地址</TableHead>
              <TableHead className="w-[80px] text-center">状态</TableHead>
              <TableHead className="w-[80px] text-center">限流</TableHead>
              <TableHead className="w-[80px] text-center">地域</TableHead>
              <TableHead className="w-[100px] text-center">前缀处理</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  {searchQuery ? `没有找到匹配 "${searchQuery}" 的代理路由` : '暂无代理路由'}
                </TableCell>
              </TableRow>
            ) : (
              data.map((route) => (
                <TableRow key={route.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedRoutes.includes(route.id!)}
                      onCheckedChange={(checked) => 
                        handleSelectRoute(route.id!, checked as boolean)
                      }
                    />
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {priorityEditing[route.id!] !== undefined ? (
                        <Input
                          type="number"
                          min="0"
                          className="w-16 h-8 text-xs"
                          value={priorityEditing[route.id!]}
                          onChange={(e) => handlePriorityChange(route.id!, parseInt(e.target.value) || 0)}
                          onBlur={() => handlePrioritySave(route)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              handlePrioritySave(route)
                            }
                          }}
                          autoFocus
                        />
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 font-mono text-xs"
                          onClick={() => handlePriorityChange(route.id!, route.priority || 0)}
                        >
                          {route.priority || 0}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="font-mono text-sm">
                      {route.pattern}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm truncate max-w-[200px]">
                        {route.target}
                      </span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </TableCell>
                  
                  <TableCell className="text-center">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(route)}
                      <Switch
                        checked={route.enabled !== false}
                        onCheckedChange={() => handleToggleRoute(route)}
                        disabled={updateRoute.isPending}
                      />
                    </div>
                  </TableCell>
                  
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Switch
                        checked={route.rateLimitEnabled || false}
                        onCheckedChange={() => handleToggleFeature(route, 'rateLimit')}
                        disabled={updateRoute.isPending}
                      />
                      {route.rateLimit && (
                        <span className="text-xs text-muted-foreground ml-1">
                          {route.rateLimit}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  
                  <TableCell className="text-center">
                    <Switch
                      checked={route.geoEnabled || false}
                      onCheckedChange={() => handleToggleFeature(route, 'geo')}
                      disabled={updateRoute.isPending}
                    />
                  </TableCell>
                  
                  <TableCell className="text-center">
                    {route.stripPrefix ? (
                      <Badge variant="secondary" className="text-xs">
                        移除前缀
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        保留前缀
                      </Badge>
                    )}
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
                          onClick={() => setConfigDialogRoute(route)}
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          详细配置
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleToggleRoute(route)}
                        >
                          {route.enabled !== false ? (
                            <><PowerOff className="h-4 w-4 mr-2" />禁用路由</>
                          ) : (
                            <><Power className="h-4 w-4 mr-2" />启用路由</>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-red-600"
                          onClick={() => {
                            setRoutesToDelete([route.id!])
                            setDeleteDialogOpen(true)
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          删除路由
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

      {/* 代理路由配置弹窗 */}
      {configDialogRoute && (
        <ProxyRouteConfigDialog
          route={configDialogRoute}
          open={!!configDialogRoute}
          onOpenChange={(open) => {
            if (!open) setConfigDialogRoute(null)
          }}
        />
      )}

      {/* 删除确认弹窗 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除代理路由</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将删除选中的代理路由配置。
              共 {routesToDelete.length} 个路由将受到影响。
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
    </div>
  )
}