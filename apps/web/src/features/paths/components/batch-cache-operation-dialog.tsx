import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  RefreshCw,
  Clock,
  Database,
  Trash2,
  Info,
  AlertCircle
} from 'lucide-react'
import { toast } from 'sonner'

interface BatchCacheOperationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedPaths: string[]
  onComplete: () => void
}

export function BatchCacheOperationDialog({
  open,
  onOpenChange,
  selectedPaths,
  onComplete
}: BatchCacheOperationDialogProps) {
  const [loading, setLoading] = useState(false)
  const [batchTTL, setBatchTTL] = useState<string>('')

  // 批量设置TTL
  const handleBatchSetTTL = async () => {
    if (!batchTTL || selectedPaths.length === 0) {
      toast.error('请输入有效的TTL值')
      return
    }

    const ttlValue = parseInt(batchTTL)
    if (isNaN(ttlValue) || ttlValue < 1 || ttlValue > 86400) {
      toast.error('TTL值必须在1到86400秒之间')
      return
    }

    setLoading(true)
    let successCount = 0
    let errorCount = 0

    try {
      // 为每个路径设置TTL
      const promises = selectedPaths.map(async (path) => {
        try {
          const response = await fetch(`/api/admin/unified-paths/${encodeURIComponent(path)}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              cache: {
                enabled: true,
                ttl: ttlValue
              }
            })
          })

          if (response.ok) {
            successCount++
          } else {
            errorCount++
          }
        } catch (_error) {
          errorCount++
        }
      })

      await Promise.all(promises)

      if (successCount > 0) {
        toast.success(`成功设置 ${successCount} 个路径的TTL为 ${ttlValue} 秒`)
      }
      if (errorCount > 0) {
        toast.error(`${errorCount} 个路径设置失败`)
      }

      if (successCount > 0) {
        onComplete()
      }
    } catch (error) {
      toast.error('批量设置TTL失败：' + error)
    } finally {
      setLoading(false)
    }
  }

  // 批量刷新缓存
  const handleBatchFlush = async () => {
    if (selectedPaths.length === 0) return

    setLoading(true)
    try {
      const response = await fetch('/api/admin/cache/flush', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keys: selectedPaths
        })
      })
      const result = await response.json()

      if (result.success) {
        toast.success(`批量刷新完成！已刷新 ${result.result.flushedCount} 个缓存条目`)
        onComplete()
      } else {
        toast.error('批量刷新失败：' + result.message)
      }
    } catch (error) {
      toast.error('批量刷新失败：' + error)
    } finally {
      setLoading(false)
    }
  }

  // 批量删除缓存
  const handleBatchDelete = async () => {
    if (selectedPaths.length === 0) return

    setLoading(true)
    try {
      const deletePromises = selectedPaths.map(async (path) => {
        const response = await fetch('/api/admin/cache/invalidate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pattern: path + '*'
          })
        })
        return response.json()
      })

      const results = await Promise.all(deletePromises)
      const totalDeleted = results.reduce((sum, result) =>
        sum + (result.success ? result.invalidatedCount || 0 : 0), 0
      )

      if (totalDeleted > 0) {
        toast.success(`批量删除完成！已删除 ${totalDeleted} 个缓存条目`)
        onComplete()
      } else {
        toast.error('没有找到可删除的缓存')
      }
    } catch (error) {
      toast.error('批量删除失败：' + error)
    } finally {
      setLoading(false)
    }
  }

  const formatTTL = (seconds: string): string => {
    const num = parseInt(seconds)
    if (isNaN(num)) return ''

    const hours = Math.floor(num / 3600)
    const minutes = Math.floor((num % 3600) / 60)
    const secs = num % 60

    const result = []
    if (hours > 0) result.push(`${hours}小时`)
    if (minutes > 0) result.push(`${minutes}分钟`)
    if (secs > 0 || result.length === 0) result.push(`${secs}秒`)

    return result.join(' ')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-4xl sm:max-w-4xl h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            批量缓存操作
          </DialogTitle>
          <DialogDescription>
            对选中的 {selectedPaths.length} 个路径执行缓存操作
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-4 pr-2">
        {/* 选中路径列表 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">选中的路径</CardTitle>
            <CardDescription>
              以下路径将受到批量操作的影响
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-32 overflow-y-auto">
              <div className="space-y-1">
                {selectedPaths.map((path) => (
                  <div
                    key={path}
                    className="text-sm font-mono bg-muted px-2 py-1 rounded"
                  >
                    {path}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 操作选项卡 */}
        <Tabs defaultValue="ttl" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="ttl" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              TTL设置
            </TabsTrigger>
            <TabsTrigger value="flush" className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              刷新缓存
            </TabsTrigger>
            <TabsTrigger value="delete" className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              删除缓存
            </TabsTrigger>
          </TabsList>

          {/* TTL设置 */}
          <TabsContent value="ttl">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">批量设置TTL</CardTitle>
                <CardDescription>
                  为所有选中的路径设置相同的缓存过期时间
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>TTL（秒）</Label>
                  <Input
                    type="number"
                    value={batchTTL}
                    onChange={(e) => setBatchTTL(e.target.value)}
                    placeholder="输入TTL秒数"
                    min="1"
                    max="86400"
                  />
                  {batchTTL && (
                    <div className="text-sm text-muted-foreground">
                      预览：{formatTTL(batchTTL)}
                    </div>
                  )}
                </div>

                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                    <div className="text-sm text-blue-800">
                      <strong>说明：</strong>
                      <ul className="mt-1 space-y-1 text-xs">
                        <li>• TTL范围：1-86400秒（1秒到24小时）</li>
                        <li>• 设置后将立即生效，新缓存将使用该TTL</li>
                        <li>• 现有缓存不会立即过期，需要等待自然过期或手动刷新</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleBatchSetTTL}
                  disabled={loading || !batchTTL || selectedPaths.length === 0}
                  className="w-full"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  {loading ? '设置中...' : `设置 ${selectedPaths.length} 个路径的TTL`}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 刷新缓存 */}
          <TabsContent value="flush">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">批量刷新缓存</CardTitle>
                <CardDescription>
                  清除所有选中路径的缓存数据，下次访问时重新获取
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                    <div className="text-sm text-amber-800">
                      <strong>注意：</strong>
                      <ul className="mt-1 space-y-1 text-xs">
                        <li>• 刷新缓存会立即清除现有的缓存数据</li>
                        <li>• 下次访问这些路径时会重新从上游获取数据</li>
                        <li>• 可能导致短暂的响应时间增加</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleBatchFlush}
                  disabled={loading || selectedPaths.length === 0}
                  className="w-full"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {loading ? '刷新中...' : `刷新 ${selectedPaths.length} 个路径的缓存`}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 删除缓存 */}
          <TabsContent value="delete">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">批量删除缓存</CardTitle>
                <CardDescription>
                  永久删除所有选中路径的缓存数据
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                    <div className="text-sm text-red-800">
                      <strong>警告：</strong>
                      <ul className="mt-1 space-y-1 text-xs">
                        <li>• 此操作将永久删除缓存数据，无法撤销</li>
                        <li>• 删除后无法恢复，需重新从上游获取数据</li>
                        <li>• 建议在维护期间或确认不再需要时使用</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleBatchDelete}
                  disabled={loading || selectedPaths.length === 0}
                  variant="destructive"
                  className="w-full"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {loading ? '删除中...' : `删除 ${selectedPaths.length} 个路径的缓存`}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}