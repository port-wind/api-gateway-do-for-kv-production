/**
 * 地区访问列表表格组件
 * 
 * 显示各国家/地区的访问统计数据
 */

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, MoreHorizontal, Eye, Shield } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { GeoAccessStat } from '@/hooks/use-geo-rules-api';
import { getCountryDisplay } from '@/lib/country-names';

interface GeoAccessListTableProps {
    data: GeoAccessStat[];
    pagination?: {
        page: number;
        limit: number;
        total: number;
        hasMore: boolean;
    };
    isLoading?: boolean;
    currentPage: number;
    onPageChange: (page: number) => void;
    onViewDetail?: (country: string) => void;
    onViewPaths?: (country: string) => void;
    onCreateRule?: (country: string, mode: 'block' | 'allow') => void;
}

export function GeoAccessListTable({
    data,
    pagination,
    isLoading,
    currentPage,
    onPageChange,
    onViewDetail,
    onViewPaths,
    onCreateRule,
}: GeoAccessListTableProps) {
    if (isLoading) {
        return (
            <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="text-center py-12">
                <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">暂无地区访问数据</p>
                <p className="text-xs text-muted-foreground mt-1">
                    等待流量产生后将显示访问统计
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>国家/地区</TableHead>
                            <TableHead className="text-right">总请求</TableHead>
                            <TableHead className="text-right">封禁</TableHead>
                            <TableHead className="text-right">限流</TableHead>
                            <TableHead className="text-right">成功率</TableHead>
                            <TableHead className="text-right">封禁率</TableHead>
                            <TableHead className="text-right">平均响应</TableHead>
                            <TableHead className="text-right">路径数</TableHead>
                            <TableHead className="text-right">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.map((country) => (
                            <TableRow key={country.country}>
                                <TableCell className="font-medium">
                                    {getCountryDisplay(country.country)}
                                </TableCell>
                                <TableCell className="text-right">
                                    {country.totalRequests.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right">
                                    {country.blockedRequests > 0 ? (
                                        <Badge variant="destructive">
                                            {country.blockedRequests}
                                        </Badge>
                                    ) : (
                                        <span className="text-muted-foreground">0</span>
                                    )}
                                </TableCell>
                                <TableCell className="text-right">
                                    {country.throttledRequests > 0 ? (
                                        <Badge variant="secondary">
                                            {country.throttledRequests}
                                        </Badge>
                                    ) : (
                                        <span className="text-muted-foreground">0</span>
                                    )}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Badge
                                        variant={country.successRate >= 95 ? 'default' : 'destructive'}
                                    >
                                        {country.successRate.toFixed(1)}%
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    {country.blockRate > 0 ? (
                                        <span className="text-red-600 font-medium">
                                            {country.blockRate.toFixed(1)}%
                                        </span>
                                    ) : (
                                        <span className="text-muted-foreground">0%</span>
                                    )}
                                </TableCell>
                                <TableCell className="text-right">
                                    {country.avgResponseTime.toFixed(0)}ms
                                </TableCell>
                                <TableCell className="text-right">
                                    {country.uniquePaths}
                                </TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem
                                                onClick={() => onViewDetail?.(country.country)}
                                            >
                                                <Eye className="h-4 w-4 mr-2" />
                                                查看详情
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() => onViewPaths?.(country.country)}
                                            >
                                                <Eye className="h-4 w-4 mr-2" />
                                                查看路径
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() => onCreateRule?.(country.country, 'block')}
                                            >
                                                <Shield className="h-4 w-4 mr-2" />
                                                创建封禁规则
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() => onCreateRule?.(country.country, 'allow')}
                                            >
                                                <Shield className="h-4 w-4 mr-2" />
                                                创建白名单规则
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* 分页 */}
            {pagination && pagination.total > pagination.limit && (
                <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                        共 {pagination.total} 个国家/地区，
                        当前第 {currentPage} 页，
                        共 {Math.ceil(pagination.total / pagination.limit)} 页
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onPageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                        >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            上一页
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onPageChange(currentPage + 1)}
                            disabled={!pagination.hasMore}
                        >
                            下一页
                            <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

