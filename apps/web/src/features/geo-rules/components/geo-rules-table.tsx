/**
 * 地区规则列表表格
 */

import { useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Shield, Trash2, Ban, Globe, ArrowUpDown } from 'lucide-react';
import { useDeleteGeoRule, useUpdateGeoRule, type GeoAccessRule, type PresetGeoGroup } from '@/hooks/use-geo-rules-api';

interface GeoRulesTableProps {
    data: GeoAccessRule[];
    isLoading?: boolean;
    presetGroups: PresetGeoGroup[];
}

export function GeoRulesTable({ data, isLoading, presetGroups }: GeoRulesTableProps) {
    const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
    const { mutate: deleteRule, isPending: isDeleting } = useDeleteGeoRule();
    const { mutate: updateRule, isPending: isUpdating } = useUpdateGeoRule();

    if (isLoading) {
        return (
            <div className="space-y-3">
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
                <p className="text-muted-foreground">暂无地区规则</p>
                <p className="text-xs text-muted-foreground mt-1">
                    点击"创建规则"添加地区访问控制规则
                </p>
            </div>
        );
    }

    const handleDeleteConfirm = () => {
        if (deleteRuleId) {
            deleteRule(deleteRuleId, {
                onSuccess: () => {
                    setDeleteRuleId(null);
                },
            });
        }
    };

    const handleToggleEnabled = (ruleId: string, enabled: boolean) => {
        updateRule({
            ruleId,
            updates: { enabled },
        });
    };

    const formatGeoMatch = (rule: GeoAccessRule) => {
        const { geoMatch } = rule;

        if (geoMatch.type === 'country' && geoMatch.countries) {
            return `${geoMatch.countries.length} 个国家`;
        }

        if (geoMatch.type === 'continent' && geoMatch.continents) {
            return `${geoMatch.continents.length} 个大洲`;
        }

        if (geoMatch.type === 'custom' && geoMatch.customGroups) {
            const groupNames = geoMatch.customGroups
                .map(id => presetGroups.find(g => g.id === id)?.name || id)
                .join(', ');
            return `预定义组: ${groupNames}`;
        }

        return '-';
    };

    // 按优先级排序
    const sortedData = [...data].sort((a, b) => a.priority - b.priority);

    return (
        <div className="space-y-4">
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[60px]">
                                <div className="flex items-center">
                                    <ArrowUpDown className="h-3 w-3 mr-1" />
                                    优先级
                                </div>
                            </TableHead>
                            <TableHead>规则名称</TableHead>
                            <TableHead>模式</TableHead>
                            <TableHead>地区匹配</TableHead>
                            <TableHead>状态</TableHead>
                            <TableHead>创建时间</TableHead>
                            <TableHead className="text-right">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedData.map((rule) => (
                            <TableRow key={rule.id}>
                                <TableCell>
                                    <Badge variant="outline">{rule.priority}</Badge>
                                </TableCell>
                                <TableCell>
                                    <div className="font-medium">{rule.name}</div>
                                    {rule.metadata.comment && (
                                        <div className="text-xs text-muted-foreground mt-1">
                                            {rule.metadata.comment}
                                        </div>
                                    )}
                                </TableCell>
                                <TableCell>
                                    {rule.mode === 'block' ? (
                                        <Badge variant="destructive">
                                            <Ban className="h-3 w-3 mr-1" />
                                            封禁
                                        </Badge>
                                    ) : rule.mode === 'allow' ? (
                                        <Badge variant="default">
                                            <Globe className="h-3 w-3 mr-1" />
                                            放行
                                        </Badge>
                                    ) : (
                                        <Badge variant="secondary">限流</Badge>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <span className="text-sm text-muted-foreground">
                                        {formatGeoMatch(rule)}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            checked={rule.enabled}
                                            onCheckedChange={(enabled) => handleToggleEnabled(rule.id, enabled)}
                                            disabled={isUpdating}
                                        />
                                        <span className="text-sm">
                                            {rule.enabled ? '已启用' : '已禁用'}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <span className="text-sm text-muted-foreground">
                                        {new Date(rule.metadata.createdAt).toLocaleString('zh-CN', {
                                            year: 'numeric',
                                            month: '2-digit',
                                            day: '2-digit',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })}
                                    </span>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setDeleteRuleId(rule.id)}
                                        disabled={isDeleting}
                                    >
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* 说明文字 */}
            <div className="text-xs text-muted-foreground">
                <p>
                    💡 提示：规则按优先级（数字越小越优先）顺序执行，匹配到第一条规则后立即生效。
                </p>
            </div>

            {/* 删除确认对话框 */}
            <AlertDialog open={!!deleteRuleId} onOpenChange={() => setDeleteRuleId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认删除规则</AlertDialogTitle>
                        <AlertDialogDescription>
                            删除后，该规则将不再生效。此操作无法撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            disabled={isDeleting}
                            className="bg-red-500 hover:bg-red-600"
                        >
                            {isDeleting ? '删除中...' : '确认删除'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

