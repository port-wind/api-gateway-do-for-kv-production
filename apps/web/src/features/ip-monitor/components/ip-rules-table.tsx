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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Ban, Gauge, Trash2, Shield } from 'lucide-react'
import { useDeleteIpRule } from '@/hooks/use-ip-monitor-api'

interface IpRule {
  id: number
  ip_pattern: string
  ip_hash?: string | null
  mode: 'block' | 'throttle'
  limit: number | null
  window: number | null
  reason: string | null
  expires_at: number | null  // Unix timestamp (秒)
  created_at: number  // Unix timestamp (秒)
  created_by?: string
}

interface IpRulesTableProps {
  data: IpRule[]
  pagination?: {
    page: number
    limit: number
    total: number
  }
  isLoading?: boolean
}

export function IpRulesTable({ data, pagination, isLoading }: IpRulesTableProps) {
  const [deleteRuleId, setDeleteRuleId] = useState<number | null>(null)
  const { mutate: deleteRule, isPending } = useDeleteIpRule()

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
        <p className="text-muted-foreground">暂无访问规则</p>
        <p className="text-xs text-muted-foreground mt-1">
          点击"添加规则"创建 IP 封禁或限流规则
        </p>
      </div>
    )
  }

  const handleDeleteConfirm = () => {
    if (deleteRuleId) {
      deleteRule(String(deleteRuleId), {
        onSuccess: () => {
          setDeleteRuleId(null)
        },
      })
    }
  }

  const formatExpiry = (expiresAt: number | null) => {
    if (!expiresAt) return '永久'
    // 将 Unix timestamp（秒）转为毫秒
    const date = new Date(expiresAt * 1000)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays < 0) return '已过期'
    if (diffDays === 0) return '今天到期'
    if (diffDays === 1) return '明天到期'
    return `${diffDays} 天后`
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">IP/CIDR</TableHead>
              <TableHead>模式</TableHead>
              <TableHead>限制配置</TableHead>
              <TableHead>原因</TableHead>
              <TableHead>到期时间</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-mono text-xs">
                  {rule.ip_pattern}
                </TableCell>
                <TableCell>
                  {rule.mode === 'block' ? (
                    <Badge variant="destructive">
                      <Ban className="h-3 w-3 mr-1" />
                      封禁
                    </Badge>
                  ) : (
                    <Badge variant="default" className="bg-orange-500">
                      <Gauge className="h-3 w-3 mr-1" />
                      限流
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {rule.mode === 'throttle' && rule.limit && rule.window ? (
                    <span className="text-sm text-muted-foreground">
                      {rule.limit} 次 / {rule.window} 秒
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {rule.reason || '-'}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {formatExpiry(rule.expires_at)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {new Date(rule.created_at * 1000).toLocaleString('zh-CN')}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteRuleId(rule.id)}
                    disabled={isPending}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 统计信息 */}
      {pagination && (
        <div className="text-sm text-muted-foreground">
          共 {pagination.total} 条规则
        </div>
      )}

      {/* 删除确认对话框 */}
      <AlertDialog open={!!deleteRuleId} onOpenChange={() => setDeleteRuleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除规则</AlertDialogTitle>
            <AlertDialogDescription>
              删除后，该 IP 将不再受此规则限制。此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isPending}
              className="bg-red-500 hover:bg-red-600"
            >
              {isPending ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

