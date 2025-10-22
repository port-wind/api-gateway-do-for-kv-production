import { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
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
import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { useIpPaths } from '@/hooks/use-ip-monitor-api'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

interface IpPathsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    ipHash: string
    date: string  // 过滤日期
}

export function IpPathsDialog({ open, onOpenChange, ipHash, date }: IpPathsDialogProps) {
    const [page, setPage] = useState(1)
    const limit = 20  // 每页 20 条，上下滚动查看

    const { data, isLoading, error } = useIpPaths(ipHash, { date, page, limit }, open)

    const handlePrevPage = () => {
        if (page > 1) {
            setPage(page - 1)
        }
    }

    const handleNextPage = () => {
        if (data?.pagination?.hasNext) {
            setPage(page + 1)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-screen h-[95vh] max-w-none px-8 sm:max-w-none sm:w-screen sm:rounded-none overflow-hidden flex flex-col">
                <DialogHeader className="flex-shrink-0 space-y-1 pb-4">
                    <DialogTitle className="text-lg">IP 访问路径详情</DialogTitle>
                    <DialogDescription className="font-mono text-xs">
                        {ipHash}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                    {isLoading ? (
                        <div className="space-y-3">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center py-8 text-destructive">
                            <AlertCircle className="h-5 w-5 mr-2" />
                            <span>加载失败: {(error as Error).message}</span>
                        </div>
                    ) : !data?.data || data.data.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            暂无路径访问记录
                        </div>
                    ) : (
                        <div className="rounded-md border overflow-x-hidden">
                            <Table className="table-fixed w-full">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50%]">路径</TableHead>
                                        <TableHead className="w-[10%] text-center">方法</TableHead>
                                        <TableHead className="w-[10%] text-center">状态</TableHead>
                                        <TableHead className="w-[15%] text-right">响应时间</TableHead>
                                        <TableHead className="w-[15%]">访问时间</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.data.map((record: any, index: number) => {
                                        const isError = record.status >= 400
                                        const statusColor = isError
                                            ? 'text-red-600'
                                            : record.status >= 300
                                                ? 'text-yellow-600'
                                                : 'text-green-600'

                                        return (
                                            <TableRow key={`${record.path}-${record.timestamp}-${index}`} className="text-xs">
                                                <TableCell className="font-mono text-xs break-all py-2">
                                                    {record.path}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap py-2 text-center">
                                                    <Badge variant="outline" className="text-xs">
                                                        {record.method}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-center whitespace-nowrap py-2">
                                                    <span className={`font-semibold text-xs ${statusColor}`}>
                                                        {record.status}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap py-2">
                                                    {record.response_time}ms
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground whitespace-nowrap py-2">
                                                    {formatDistanceToNow(new Date(record.timestamp), {
                                                        addSuffix: true,
                                                        locale: zhCN,
                                                    })}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}

                    {data?.notice && (
                        <div className="mt-4 p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                            {data.notice}
                        </div>
                    )}
                </div>

                {data?.pagination && (
                    <div className="flex items-center justify-between pt-3 mt-3 border-t flex-shrink-0 bg-background">
                        <div className="text-sm text-muted-foreground">
                            第 {data.pagination.page} 页，共 {data.pagination.totalPages} 页
                            <span className="ml-2">
                                （共 {data.pagination.total} 条记录）
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handlePrevPage}
                                disabled={!data.pagination.hasPrev}
                            >
                                <ChevronLeft className="h-4 w-4 mr-1" />
                                上一页
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleNextPage}
                                disabled={!data.pagination.hasNext}
                            >
                                下一页
                                <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}

