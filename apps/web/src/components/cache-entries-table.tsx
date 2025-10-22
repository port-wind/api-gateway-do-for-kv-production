import { useState } from 'react'
import { type CacheEntryMetadata } from '@/types/api'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RefreshCw, Trash2, Clock, HardDrive } from 'lucide-react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'

export interface CacheEntriesTableProps {
  entries: CacheEntryMetadata[]
  loading?: boolean
  onRefresh?: () => void
  onDelete?: (cacheKey: string) => void
}

/**
 * 格式化文件大小
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp: number): string {
  return format(new Date(timestamp), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN })
}

/**
 * 计算剩余 TTL
 * 新契约（2025-10-14）：没有 expiresAt 时，默认使用创建时间 + 5分钟
 */
function getRemainingTTL(entry: CacheEntryMetadata): string | null {
  const now = Date.now()
  let expiresAt = entry.expiresAt

  // 如果没有 expiresAt，使用默认 5 分钟 TTL
  if (!expiresAt && entry.createdAt) {
    expiresAt = entry.createdAt + (300 * 1000) // 300秒 = 5分钟
  }

  if (!expiresAt) return null

  const remaining = expiresAt - now

  if (remaining <= 0) return '已过期'

  const seconds = Math.floor(remaining / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days} 天`
  if (hours > 0) return `${hours} 小时`
  if (minutes > 0) return `${minutes} 分钟`
  return `${seconds} 秒`
}

/**
 * 缓存条目表格组件
 */
export function CacheEntriesTable({
  entries,
  loading = false,
  onRefresh,
  onDelete
}: CacheEntriesTableProps) {
  const [deletingKey, setDeletingKey] = useState<string | null>(null)

  const handleDelete = async (cacheKey: string) => {
    if (!onDelete) return

    setDeletingKey(cacheKey)
    try {
      await onDelete(cacheKey)
    } finally {
      setDeletingKey(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <HardDrive className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium">暂无缓存条目</p>
        <p className="text-sm mt-2">该路径还没有任何缓存数据</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <HardDrive className="h-4 w-4" />
          <span>共 {entries.length} 个缓存条目</span>
        </div>

        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        )}
      </div>

      {/* 表格 */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hash</TableHead>
              <TableHead>大小</TableHead>
              <TableHead>请求次数</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead>TTL 状态</TableHead>
              {onDelete && <TableHead className="w-[100px]">操作</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const remainingTTL = getRemainingTTL(entry)
              const isExpired = remainingTTL === '已过期'

              return (
                <TableRow key={entry.cacheKey} className={isExpired ? 'opacity-50' : ''}>
                  {/* Hash */}
                  <TableCell className="font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <code className="bg-muted px-2 py-1 rounded">
                        {entry.hash}
                      </code>
                      {isExpired && (
                        <Badge variant="destructive" className="text-xs">
                          已过期
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  {/* 大小 */}
                  <TableCell>
                    <span className="text-sm">{formatBytes(entry.size)}</span>
                  </TableCell>

                  {/* 请求次数 */}
                  <TableCell>
                    <Badge variant="secondary">
                      {entry.requestCount.toLocaleString()}
                    </Badge>
                  </TableCell>

                  {/* 创建时间 */}
                  <TableCell className="text-sm text-muted-foreground">
                    {formatTimestamp(entry.createdAt)}
                  </TableCell>

                  {/* TTL 状态 */}
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">
                          {remainingTTL || '默认5分钟'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {entry.ttl ? `TTL: ${entry.ttl}秒` : 'TTL: 默认300秒'}
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  {/* 操作 */}
                  {onDelete && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(entry.cacheKey)}
                        disabled={deletingKey === entry.cacheKey}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* 统计信息 */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4" />
          <span>
            总大小: {formatBytes(entries.reduce((sum, e) => sum + e.size, 0))}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span>
            总请求: {entries.reduce((sum, e) => sum + e.requestCount, 0).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  )
}

