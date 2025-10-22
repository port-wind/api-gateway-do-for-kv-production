/**
 * 创建地区规则对话框
 */

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useCreateGeoRule, type PresetGeoGroup } from '@/hooks/use-geo-rules-api';
import { GeoSelector } from './geo-selector';
import { Ban, Globe, Info } from 'lucide-react';

interface CreateGeoRuleDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    presetGroups: PresetGeoGroup[];
}

interface RuleFormData {
    name: string;
    mode: 'allow' | 'block';
    priority: number;
    geoMatch: {
        type: 'country' | 'continent' | 'custom';
        countries?: string[];
        continents?: string[];
        customGroups?: string[];
    };
    responseMessage?: string;
    comment?: string;
}

export function CreateGeoRuleDialog({
    open,
    onOpenChange,
    presetGroups,
}: CreateGeoRuleDialogProps) {
    const [mode, setMode] = useState<'allow' | 'block'>('block');
    const [geoMatch, setGeoMatch] = useState<RuleFormData['geoMatch']>({
        type: 'country',
        countries: [],
    });

    const { mutate: createRule, isPending } = useCreateGeoRule();
    const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<RuleFormData>({
        defaultValues: {
            name: '',
            mode: 'block',
            priority: 100,
            geoMatch: {
                type: 'country',
                countries: [],
            },
            responseMessage: '',
            comment: '',
        },
    });

    // 当 dialog 打开时，重置表单
    useEffect(() => {
        if (open) {
            reset();
            setMode('block');
            setGeoMatch({
                type: 'country',
                countries: [],
            });
        }
    }, [open, reset]);

    const onSubmit = (data: RuleFormData) => {
        // 验证地区匹配配置
        if (geoMatch.type === 'country' && (!geoMatch.countries || geoMatch.countries.length === 0)) {
            alert('请至少选择一个国家');
            return;
        }

        if (geoMatch.type === 'continent' && (!geoMatch.continents || geoMatch.continents.length === 0)) {
            alert('请至少选择一个大洲');
            return;
        }

        if (geoMatch.type === 'custom' && (!geoMatch.customGroups || geoMatch.customGroups.length === 0)) {
            alert('请至少选择一个地区组');
            return;
        }

        createRule(
            {
                name: data.name,
                mode: mode,
                priority: Number(data.priority),
                geoMatch: geoMatch,
                response: data.responseMessage ? {
                    statusCode: 403,
                    message: data.responseMessage,
                } : undefined,
                metadata: {
                    comment: data.comment,
                },
            },
            {
                onSuccess: () => {
                    reset();
                    onOpenChange(false);
                },
            }
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-full max-w-2xl sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>创建地区访问规则</DialogTitle>
                    <DialogDescription>
                        添加新的地区访问控制规则，支持白名单和黑名单模式
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    {/* 规则名称 */}
                    <div className="space-y-2">
                        <Label htmlFor="name">规则名称 *</Label>
                        <Input
                            id="name"
                            placeholder="例如：阻止高风险地区"
                            {...register('name', {
                                required: '规则名称不能为空',
                                minLength: { value: 2, message: '规则名称至少 2 个字符' },
                                maxLength: { value: 100, message: '规则名称最多 100 个字符' },
                            })}
                        />
                        {errors.name && (
                            <p className="text-xs text-red-500">{errors.name.message}</p>
                        )}
                    </div>

                    {/* 规则模式 */}
                    <div className="space-y-2">
                        <Label htmlFor="mode">规则模式 *</Label>
                        <Select
                            value={mode}
                            onValueChange={(v) => {
                                setMode(v as 'allow' | 'block');
                                setValue('mode', v as 'allow' | 'block');
                            }}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="block">
                                    <div className="flex items-center gap-2">
                                        <Ban className="h-4 w-4 text-red-500" />
                                        <div>
                                            <div className="font-medium">封禁 (Block)</div>
                                            <div className="text-xs text-muted-foreground">
                                                阻止该地区的所有请求 (403)
                                            </div>
                                        </div>
                                    </div>
                                </SelectItem>
                                <SelectItem value="allow">
                                    <div className="flex items-center gap-2">
                                        <Globe className="h-4 w-4 text-green-500" />
                                        <div>
                                            <div className="font-medium">放行 (Allow)</div>
                                            <div className="text-xs text-muted-foreground">
                                                允许该地区访问
                                            </div>
                                        </div>
                                    </div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                        <input type="hidden" {...register('mode')} value={mode} />
                    </div>

                    {/* 优先级 */}
                    <div className="space-y-2">
                        <Label htmlFor="priority">优先级 *</Label>
                        <Input
                            id="priority"
                            type="number"
                            min="0"
                            max="1000"
                            placeholder="100"
                            {...register('priority', {
                                required: '优先级不能为空',
                                min: { value: 0, message: '优先级最小为 0' },
                                max: { value: 1000, message: '优先级最大为 1000' },
                            })}
                        />
                        {errors.priority && (
                            <p className="text-xs text-red-500">{errors.priority.message}</p>
                        )}
                        <p className="text-xs text-muted-foreground flex items-start gap-1">
                            <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            数字越小优先级越高，规则按优先级顺序匹配（0 {'>'} 1 {'>'} 2 {'>'} ...）
                        </p>
                    </div>

                    {/* 地区匹配 */}
                    <div className="space-y-2">
                        <Label>地区匹配 *</Label>
                        <GeoSelector
                            value={geoMatch}
                            onChange={setGeoMatch}
                            customGroups={presetGroups}
                        />
                    </div>

                    {/* 响应消息（可选） */}
                    <div className="space-y-2">
                        <Label htmlFor="responseMessage">自定义响应消息（可选）</Label>
                        <Input
                            id="responseMessage"
                            placeholder="例如：Access denied from your region"
                            {...register('responseMessage')}
                        />
                        <p className="text-xs text-muted-foreground">
                            留空则使用默认消息
                        </p>
                    </div>

                    {/* 备注说明（可选） */}
                    <div className="space-y-2">
                        <Label htmlFor="comment">备注说明（可选）</Label>
                        <Textarea
                            id="comment"
                            placeholder="例如：根据安全策略要求，封禁高风险地区访问..."
                            rows={3}
                            {...register('comment')}
                        />
                        <p className="text-xs text-muted-foreground">
                            记录规则创建原因或说明
                        </p>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isPending}
                        >
                            取消
                        </Button>
                        <Button type="submit" disabled={isPending}>
                            {isPending ? '创建中...' : '创建规则'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

