/**
 * 国家路径列表对话框组件
 * 
 * 显示特定国家访问的所有路径（分页）
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useGeoCountryPaths } from '@/hooks/use-geo-rules-api';
import { getCountryDisplay } from '@/lib/country-names';

interface GeoCountryPathsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    country: string;
    date: string;
}

export function GeoCountryPathsDialog({
    open,
    onOpenChange,
    country,
    date,
}: GeoCountryPathsDialogProps) {
    const [page, setPage] = useState(1);
    const limit = 20;

    const { data, isLoading } = useGeoCountryPaths(
        country,
        { date, page, limit },
        open
    );

    const handlePrevPage = () => {
        if (page > 1) {
            setPage(page - 1);
        }
    };

    const handleNextPage = () => {
        if (data?.pagination?.hasMore) {
            setPage(page + 1);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(open) => {
            onOpenChange(open);
            if (!open) setPage(1); // 关闭时重置页码
        }}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader className="flex-shrink-0">
                    <DialogTitle className="text-xl">
                        {getCountryDisplay(country)} - 访问路径列表
                    </DialogTitle>
                    <DialogDescription>
                        日期：{date}
                        {data?.pagination && (
                            <span className="ml-4">
                                共 {data.pagination.total} 条路径
                            </span>
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto">
                    {isLoading ? (
                        <div className="space-y-2">
                            {Array.from({ length: 10 }).map((_, i) => (
                                <Skeleton key={i} className="h-16 w-full" />
                            ))}
                        </div>
                    ) : data && data.data.length > 0 ? (
                        <div className="rounded-lg border overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3 text-left">路径</th>
                                        <th className="px-4 py-3 text-right">总请求</th>
                                        <th className="px-4 py-3 text-right">封禁</th>
                                        <th className="px-4 py-3 text-right">限流</th>
                                        <th className="px-4 py-3 text-right">允许</th>
                                        <th className="px-4 py-3 text-right">成功率</th>
                                        <th className="px-4 py-3 text-right">响应时间</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.data.map((path, idx) => (
                                        <tr key={idx} className="border-t hover:bg-gray-50">
                                            <td className="px-4 py-3 font-mono text-xs max-w-md truncate">
                                                {path.path}
                                            </td>
                                            <td className="px-4 py-3 text-right font-medium">
                                                {path.totalRequests.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {path.blockedRequests > 0 ? (
                                                    <Badge variant="destructive">
                                                        {path.blockedRequests}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground">0</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {path.throttledRequests > 0 ? (
                                                    <Badge variant="secondary">
                                                        {path.throttledRequests}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground">0</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {path.allowedRequests.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <Badge
                                                    variant={path.successRate >= 95 ? 'default' : 'destructive'}
                                                >
                                                    {path.successRate.toFixed(1)}%
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {path.avgResponseTime.toFixed(0)}ms
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            暂无路径数据
                        </div>
                    )}
                </div>

                {/* 分页控制 */}
                {data?.pagination && data.pagination.total > limit && (
                    <div className="flex-shrink-0 flex items-center justify-between pt-4 border-t">
                        <div className="text-sm text-muted-foreground">
                            第 {page} 页，
                            共 {Math.ceil(data.pagination.total / limit)} 页
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handlePrevPage}
                                disabled={page === 1}
                            >
                                <ChevronLeft className="h-4 w-4 mr-1" />
                                上一页
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleNextPage}
                                disabled={!data.pagination.hasMore}
                            >
                                下一页
                                <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

