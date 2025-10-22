import { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RefreshCw, X } from 'lucide-react'
import { CacheEntriesTable } from '@/components/cache-entries-table'
import { useCacheEntries, useRefreshPathCache, useDeleteCacheEntry } from '@/hooks/use-cache-entries'
import { Skeleton } from '@/components/ui/skeleton'

export interface CacheEntriesDialogProps {
    path: string | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function CacheEntriesDialog({
    path,
    open,
    onOpenChange
}: CacheEntriesDialogProps) {
    const [page] = useState(1) // TODO: 未来可以添加分页功能
    const limit = 50

    const { data, isLoading, refetch } = useCacheEntries(path, {
        limit,
        offset: (page - 1) * limit,
        enabled: open && !!path
    })

    const refreshMutation = useRefreshPathCache()
    const deleteMutation = useDeleteCacheEntry()

    const handleRefresh = async () => {
        if (!path) return
        await refreshMutation.mutateAsync(path)
        refetch()
    }

    const handleDelete = async (cacheKey: string) => {
        await deleteMutation.mutateAsync(cacheKey)
        refetch()
    }

    if (!path) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-full max-w-5xl sm:max-w-5xl h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader className="flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <DialogTitle>缓存条目详情</DialogTitle>
                            <DialogDescription className="mt-1">
                                路径: <code className="bg-muted px-1 py-0.5 rounded text-xs">{path}</code>
                            </DialogDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => refetch()}
                                disabled={isLoading}
                            >
                                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                                刷新
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onOpenChange(false)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden mt-4 pr-2">
                    {isLoading ? (
                        <div className="space-y-2">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-20 w-full" />
                        </div>
                    ) : (
                        <>
                            {data && data.entries.length > 0 ? (
                                <>
                                    <div className="mb-4 flex items-center justify-between">
                                        <p className="text-sm text-muted-foreground">
                                            共 <span className="font-semibold text-foreground">{data.entries.length}</span> 个缓存条目
                                        </p>
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={handleRefresh}
                                            disabled={refreshMutation.isPending}
                                        >
                                            {refreshMutation.isPending ? '刷新中...' : '刷新所有缓存'}
                                        </Button>
                                    </div>

                                    <CacheEntriesTable
                                        entries={data.entries}
                                        loading={isLoading}
                                        onRefresh={() => refetch()}
                                        onDelete={handleDelete}
                                    />
                                </>
                            ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                    该路径暂无缓存条目
                                </div>
                            )}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

