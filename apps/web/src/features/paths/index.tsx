import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, Plus, Settings, Activity, BarChart3, RefreshCw, Database } from 'lucide-react'
import { UnifiedPathTable } from './components/unified-path-table'
import { AddPathDialog } from './components/add-path-dialog'
import { usePathManagement } from '@/hooks/use-path-api'
import { useEnvironmentStore } from '@/stores/environment-store'
import { toast } from 'sonner'

export default function PathManagement() {
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [isRefreshingSnapshot, setIsRefreshingSnapshot] = useState(false)
  const pageSize = 50
  const currentEnv = useEnvironmentStore((state) => state.currentEnvironment)

  const {
    paths,
    health,
    isLoading,
    isUpdating,
    hasError,
    queries
  } = usePathManagement({
    q: searchQuery,
    page: currentPage,
    limit: pageSize
  })

  // 手动刷新所有数据
  const handleRefresh = () => {
    queries.paths.refetch()
    queries.health.refetch()
  }

  // 刷新快照
  const handleRefreshSnapshot = async () => {
    setIsRefreshingSnapshot(true)
    try {
      const baseURL = currentEnv.id === 'local' && import.meta.env.DEV ? '' : currentEnv.baseURL
      const response = await fetch(`${baseURL}/api/admin/paths/snapshot/refresh`, {
        method: 'POST',
        credentials: 'include',
      })

      const result = await response.json()

      if (result.success) {
        toast.success('快照刷新成功', {
          description: `版本 ${result.data.version}，包含 ${result.data.count} 条路径`,
        })
        // 刷新数据
        handleRefresh()
      } else {
        throw new Error(result.message || '快照刷新失败')
      }
    } catch (error) {
      console.error('快照刷新失败:', error)
      toast.error('快照刷新失败', {
        description: error instanceof Error ? error.message : '未知错误',
      })
    } finally {
      setIsRefreshingSnapshot(false)
    }
  }

  return (
    <div className="container max-w-7xl mx-auto p-6 space-y-6">
      {/* 页面标题和操作区域 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">API路径管理</h1>
          <p className="text-muted-foreground mt-2">
            管理自动发现的API路径和手动添加的路径配置
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

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshSnapshot}
            disabled={isRefreshingSnapshot}
          >
            <Database className={`h-4 w-4 mr-2 ${isRefreshingSnapshot ? 'animate-spin' : ''}`} />
            生成快照
          </Button>

          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            添加路径
          </Button>
        </div>
      </div>

      {/* 系统状态概览 */}
      {health && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">总路径数</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{health?.summary?.totalUniquePaths || 0}</div>
              <p className="text-xs text-muted-foreground">
                包含 {health?.summary?.configuredPaths || 0} 个已配置路径
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">缓存路径</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{health?.summary?.pathsWithCache || 0}</div>
              <p className="text-xs text-muted-foreground">
                启用缓存的路径数量
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">限流路径</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{health?.summary?.pathsWithRateLimit || 0}</div>
              <p className="text-xs text-muted-foreground">
                启用限流的路径数量
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">地域封锁</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{health?.summary?.pathsWithGeo || 0}</div>
              <p className="text-xs text-muted-foreground">
                启用地域封锁的路径数量
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 搜索栏 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">搜索路径</CardTitle>
          <CardDescription>
            在 {health?.summary?.totalUniquePaths || 0} 个路径中搜索
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="输入路径名称进行搜索..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1) // 重置页码
              }}
              className="pl-10 pr-4"
            />
          </div>

          {/* 搜索结果统计 */}
          {paths && searchQuery && (
            <div className="mt-3 flex items-center gap-2">
              <Badge variant="secondary">
                找到 {paths.pagination.total} 个匹配的路径
              </Badge>
              {paths.pagination.total > paths.pagination.limit && (
                <Badge variant="outline">
                  显示 {Math.min(paths.pagination.limit, paths.pagination.total)} 个结果
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 主内容区域 */}
      <Card>
        <CardHeader>
          <CardTitle>路径配置管理</CardTitle>
          <CardDescription>
            管理所有路径的缓存、限流和地域封锁配置。
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
                加载路径数据时出错，请刷新页面重试
              </p>
            </div>
          )}

          <UnifiedPathTable
            data={paths?.data || []}
            pagination={paths?.pagination}
            isLoading={isLoading}
            searchQuery={searchQuery}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
          />
        </CardContent>
      </Card>

      {/* 添加路径对话框 */}
      <AddPathDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
      />
    </div>
  )
}