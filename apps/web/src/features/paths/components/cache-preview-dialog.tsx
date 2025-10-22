import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Copy,
  Download,
  RefreshCw,
  Database,
  Clock,
  FileText,
  Zap,
  Eye,
  EyeOff
} from 'lucide-react'
import { toast } from 'sonner'

interface CacheData {
  path: string
  version: number
  createdAt: number
  expiresAt?: number
  ttl?: number
  size: number
  compressed: boolean
  headers: Record<string, string>
  content?: string
  remainingTTL?: number | null
}

interface CachePreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  path: string
  onRefreshCache?: () => void
}

export function CachePreviewDialog({
  open,
  onOpenChange,
  path,
  onRefreshCache
}: CachePreviewDialogProps) {
  const [cacheData, setCacheData] = useState<CacheData | null>(null)
  const [loading, setLoading] = useState(false)
  const [showContent, setShowContent] = useState(false)
  const [includeContent, setIncludeContent] = useState(false)

  // 获取缓存数据
  const fetchCacheData = async (withContent: boolean = false) => {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/admin/cache/preview${path}?includeContent=${withContent}`
      )
      const result = await response.json()

      if (result.success) {
        setCacheData(result.data)
        if (withContent) {
          setIncludeContent(true)
          setShowContent(true)
        }
      } else {
        toast.error('获取缓存信息失败：' + result.message)
      }
    } catch (error) {
      toast.error('获取缓存信息失败：' + error)
    } finally {
      setLoading(false)
    }
  }

  // 当对话框打开时自动获取缓存基本信息
  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen)
    if (newOpen && !cacheData) {
      fetchCacheData(false)
    }
    if (!newOpen) {
      // 关闭时重置状态
      setCacheData(null)
      setShowContent(false)
      setIncludeContent(false)
    }
  }

  // 复制内容到剪贴板
  const handleCopy = async () => {
    if (!cacheData) return

    try {
      const contentToCopy = showContent && cacheData.content
        ? cacheData.content
        : JSON.stringify(cacheData, null, 2)

      await navigator.clipboard.writeText(contentToCopy)
      toast.success('已复制到剪贴板')
    } catch (_error) {
      toast.error('复制失败')
    }
  }

  // 下载内容
  const handleDownload = () => {
    if (!cacheData) return

    const content = showContent && cacheData.content
      ? cacheData.content
      : JSON.stringify(cacheData, null, 2)

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cache-${path.replace(/\//g, '-')}-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('开始下载')
  }

  // 格式化文件大小
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  // 格式化时间
  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString('zh-CN')
  }

  // 格式化TTL
  const formatTTL = (seconds?: number | null): string => {
    if (seconds === null || seconds === undefined) return '默认300秒（5分钟）'
    if (seconds <= 0) return '已过期'

    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) return `${hours}小时 ${minutes}分钟 ${secs}秒`
    if (minutes > 0) return `${minutes}分钟 ${secs}秒`
    return `${secs}秒`
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full max-w-5xl sm:max-w-5xl h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            缓存内容预览
          </DialogTitle>
          <DialogDescription>
            查看路径 <code className="bg-muted px-2 py-1 rounded text-sm">{path}</code> 的缓存信息
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="animate-spin h-6 w-6 border-2 border-current border-t-transparent rounded-full" />
              <span>加载缓存信息中...</span>
            </div>
          </div>
        )}

        {!loading && !cacheData && (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="text-center space-y-3">
              <Database className="h-12 w-12 mx-auto text-muted-foreground" />
              <div className="text-muted-foreground">未找到缓存数据</div>
              <Button variant="outline" onClick={() => fetchCacheData(false)}>
                重试
              </Button>
            </div>
          </div>
        )}

        {!loading && cacheData && (
          <div className="flex-1 flex flex-col space-y-4 min-h-0 overflow-y-auto overflow-x-hidden pr-2">
            {/* 缓存元数据 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">版本号</div>
                <div className="font-mono text-sm">v{cacheData.version}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">大小</div>
                <div className="text-sm flex items-center gap-1">
                  {formatSize(cacheData.size)}
                  {cacheData.compressed && (
                    <Badge variant="secondary" className="text-xs">
                      <Zap className="h-3 w-3 mr-1" />
                      压缩
                    </Badge>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">创建时间</div>
                <div className="text-sm">{formatTime(cacheData.createdAt)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">剩余时间</div>
                <div className="text-sm flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatTTL(cacheData.remainingTTL)}
                </div>
              </div>
            </div>

            <Separator />

            {/* Headers */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span className="text-sm font-medium">响应头信息</span>
                <Badge variant="outline" className="text-xs">
                  {Object.keys(cacheData.headers).length} 个
                </Badge>
              </div>

              <ScrollArea className="h-32 w-full border rounded-md p-3">
                <div className="space-y-1 font-mono text-xs">
                  {Object.entries(cacheData.headers).map(([key, value]) => (
                    <div key={key} className="grid grid-cols-3 gap-2">
                      <div className="text-muted-foreground truncate">{key}:</div>
                      <div className="col-span-2 break-all">{value}</div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* 内容预览 */}
            <div className="flex-1 flex flex-col space-y-3 min-h-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {showContent ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                  <span className="text-sm font-medium">响应内容</span>
                </div>

                <div className="flex items-center gap-2">
                  {!includeContent && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchCacheData(true)}
                      disabled={loading}
                    >
                      {loading ? '加载中...' : '加载内容'}
                    </Button>
                  )}
                  {includeContent && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowContent(!showContent)}
                    >
                      {showContent ? '隐藏内容' : '显示内容'}
                    </Button>
                  )}
                </div>
              </div>

              {showContent && cacheData.content && (
                <ScrollArea className="flex-1 border rounded-md p-3">
                  <pre className="text-xs whitespace-pre-wrap font-mono">
                    {cacheData.content}
                  </pre>
                </ScrollArea>
              )}

              {!showContent && includeContent && (
                <div className="flex-1 flex items-center justify-center border rounded-md py-8 text-muted-foreground">
                  <div className="text-center">
                    <Eye className="h-8 w-8 mx-auto mb-2" />
                    <div>点击"显示内容"查看缓存数据</div>
                  </div>
                </div>
              )}

              {!includeContent && (
                <div className="flex-1 flex items-center justify-center border rounded-md py-8 text-muted-foreground">
                  <div className="text-center">
                    <Database className="h-8 w-8 mx-auto mb-2" />
                    <div>点击"加载内容"查看缓存数据</div>
                    <div className="text-xs mt-1">大文件可能需要较长时间</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              {cacheData && onRefreshCache && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRefreshCache}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  刷新缓存
                </Button>
              )}
            </div>

            {cacheData && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="flex items-center gap-2"
                >
                  <Copy className="h-4 w-4" />
                  复制
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  下载
                </Button>
              </div>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}