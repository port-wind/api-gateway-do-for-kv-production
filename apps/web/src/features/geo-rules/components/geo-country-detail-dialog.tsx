/**
 * 国家详情对话框组件
 * 
 * 显示单个国家的详细访问统计、时间线和关联规则
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useGeoCountryDetail } from '@/hooks/use-geo-rules-api';
import { getCountryDisplay } from '@/lib/country-names';

interface GeoCountryDetailDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    country: string;
    date: string;
}

export function GeoCountryDetailDialog({
    open,
    onOpenChange,
    country,
    date,
}: GeoCountryDetailDialogProps) {
    const { data, isLoading } = useGeoCountryDetail(country, date, open);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-xl">
                        {getCountryDisplay(country)} - 访问详情
                    </DialogTitle>
                    <DialogDescription>
                        日期：{date}
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-40 w-full" />
                        <Skeleton className="h-40 w-full" />
                    </div>
                ) : data ? (
                    <div className="space-y-6">
                        {/* 基础统计 */}
                        <div className="grid grid-cols-4 gap-4">
                            <div className="rounded-lg border p-4">
                                <div className="text-sm text-muted-foreground">总请求</div>
                                <div className="text-2xl font-bold">
                                    {data.stats.totalRequests.toLocaleString()}
                                </div>
                            </div>
                            <div className="rounded-lg border p-4">
                                <div className="text-sm text-muted-foreground">封禁</div>
                                <div className="text-2xl font-bold text-red-600">
                                    {data.stats.blockedRequests}
                                </div>
                            </div>
                            <div className="rounded-lg border p-4">
                                <div className="text-sm text-muted-foreground">限流</div>
                                <div className="text-2xl font-bold text-yellow-600">
                                    {data.stats.throttledRequests}
                                </div>
                            </div>
                            <div className="rounded-lg border p-4">
                                <div className="text-sm text-muted-foreground">成功率</div>
                                <div className="text-2xl font-bold">
                                    {data.stats.successRate.toFixed(1)}%
                                </div>
                            </div>
                        </div>

                        {/* 24 小时时间线 */}
                        {data.timeline && data.timeline.length > 0 && (
                            <div>
                                <h3 className="text-lg font-semibold mb-3">24 小时时间线</h3>
                                <div className="rounded-lg border p-4">
                                    <div className="space-y-2">
                                        {data.timeline.map((point) => (
                                            <div key={point.hour} className="flex items-center gap-4 text-sm">
                                                <div className="w-16 text-muted-foreground">
                                                    {point.hour}
                                                </div>
                                                <div className="flex-1 flex items-center gap-2">
                                                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                                                        <div
                                                            className="bg-blue-600 h-2 rounded-full"
                                                            style={{
                                                                width: `${Math.min(100, (point.requests / Math.max(...data.timeline.map(t => t.requests))) * 100)}%`
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="w-20 text-right">
                                                        {point.requests} 次
                                                    </div>
                                                </div>
                                                {point.blocked > 0 && (
                                                    <Badge variant="destructive" className="ml-2">
                                                        封禁 {point.blocked}
                                                    </Badge>
                                                )}
                                                {point.throttled > 0 && (
                                                    <Badge variant="secondary" className="ml-2">
                                                        限流 {point.throttled}
                                                    </Badge>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 路径访问 Top 10 */}
                        {data.pathBreakdown && data.pathBreakdown.length > 0 && (
                            <div>
                                <h3 className="text-lg font-semibold mb-3">访问路径 Top 10</h3>
                                <div className="rounded-lg border overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-2 text-left">路径</th>
                                                <th className="px-4 py-2 text-right">请求数</th>
                                                <th className="px-4 py-2 text-right">封禁</th>
                                                <th className="px-4 py-2 text-right">限流</th>
                                                <th className="px-4 py-2 text-right">成功率</th>
                                                <th className="px-4 py-2 text-right">响应时间</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.pathBreakdown.map((path, idx) => (
                                                <tr key={idx} className="border-t">
                                                    <td className="px-4 py-2 font-mono text-xs">
                                                        {path.path}
                                                    </td>
                                                    <td className="px-4 py-2 text-right">
                                                        {path.totalRequests}
                                                    </td>
                                                    <td className="px-4 py-2 text-right">
                                                        {path.blockedRequests > 0 ? (
                                                            <span className="text-red-600">
                                                                {path.blockedRequests}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground">0</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2 text-right">
                                                        {path.throttledRequests > 0 ? (
                                                            <span className="text-yellow-600">
                                                                {path.throttledRequests}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground">0</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2 text-right">
                                                        <Badge variant={path.successRate >= 95 ? 'default' : 'destructive'}>
                                                            {path.successRate.toFixed(1)}%
                                                        </Badge>
                                                    </td>
                                                    <td className="px-4 py-2 text-right">
                                                        {path.avgResponseTime.toFixed(0)}ms
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* 关联的地区规则 */}
                        {data.existingRules && data.existingRules.length > 0 && (
                            <div>
                                <h3 className="text-lg font-semibold mb-3">关联的地区规则</h3>
                                <div className="space-y-2">
                                    {data.existingRules.map((rule) => (
                                        <div key={rule.id} className="flex items-center gap-3 rounded-lg border p-3">
                                            <Badge variant={rule.mode === 'block' ? 'destructive' : 'default'}>
                                                {rule.mode === 'block' ? '封禁' : rule.mode === 'allow' ? '允许' : '限流'}
                                            </Badge>
                                            <div className="flex-1">
                                                <div className="font-medium">{rule.name}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    优先级：{rule.priority}
                                                </div>
                                            </div>
                                            <Badge variant={rule.enabled ? 'default' : 'secondary'}>
                                                {rule.enabled ? '已启用' : '已禁用'}
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-8 text-muted-foreground">
                        无法加载国家详情
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

