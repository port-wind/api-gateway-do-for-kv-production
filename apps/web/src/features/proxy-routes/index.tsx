import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, Plus, RefreshCw, ExternalLink, Settings2, Zap } from 'lucide-react'
import { ProxyRouteTable } from './components/proxy-route-table'
import { AddProxyRouteDialog } from './components/add-proxy-route-dialog'
import { useProxyRouteManagement } from '@/hooks/use-proxy-route-api'

export default function ProxyRouteManagement() {
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const pageSize = 50

  const {
    routes,
    stats,
    isLoading,
    isUpdating,
    hasError,
    queries
  } = useProxyRouteManagement({
    q: searchQuery,
    page: currentPage,
    limit: pageSize
  })

  // 手动刷新所有数据
  const handleRefresh = () => {
    queries.routes.refetch()
    queries.stats.refetch()
  }

  return (
    <div className="container max-w-7xl mx-auto p-6 space-y-6">
      {/* 页面标题和操作区域 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">代理路由管理</h1>
          <p className="text-muted-foreground mt-2">
            管理反向代理转发规则，配置目标地址和中间件策略
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            添加代理路由
          </Button>
        </div>
      </div>

      {/* 统计信息概览 */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">总路由数</CardTitle>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalRoutes || 0}</div>
              <p className="text-xs text-muted-foreground">
                其中 {stats?.enabledRoutes || 0} 个已启用
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">限流保护</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.routesWithRateLimit || 0}</div>
              <p className="text-xs text-muted-foreground">
                路由启用了限流保护
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">地域限制</CardTitle>
              <Settings2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.routesWithGeo || 0}</div>
              <p className="text-xs text-muted-foreground">
                路由启用了地域限制
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 搜索栏 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">搜索代理路由</CardTitle>
          <CardDescription>
            在 {stats?.totalRoutes || 0} 个代理路由中搜索
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="输入路径或目标地址进行搜索..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1) // 重置页码
              }}
              className="pl-10 pr-4"
            />
          </div>
          
          {/* 搜索结果统计 */}
          {routes && searchQuery && (
            <div className="mt-3 flex items-center gap-2">
              <Badge variant="secondary">
                找到 {routes.pagination.total} 个匹配的路由
              </Badge>
              {routes.pagination.total > routes.pagination.limit && (
                <Badge variant="outline">
                  显示 {Math.min(routes.pagination.limit, routes.pagination.total)} 个结果
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 主内容区域 */}
      <Card>
        <CardHeader>
          <CardTitle>代理路由列表</CardTitle>
          <CardDescription>
            按优先级排序的代理路由配置。
            {isUpdating && (
              <span className="text-orange-600 ml-2">
                正在更新配置...
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasError && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
              <p className="text-red-800 text-sm">
                加载代理路由数据时出错，请刷新页面重试
              </p>
            </div>
          )}
          
          <ProxyRouteTable
            data={routes?.data || []}
            pagination={routes?.pagination}
            isLoading={isLoading}
            searchQuery={searchQuery}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
          />
        </CardContent>
      </Card>

      {/* 添加代理路由对话框 */}
      <AddProxyRouteDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
      />
    </div>
  )
}