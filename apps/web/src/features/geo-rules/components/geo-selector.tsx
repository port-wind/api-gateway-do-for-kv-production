/**
 * 地区选择器组件
 * 支持三种选择模式：按国家、按大洲、按自定义组
 */

import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface GeoMatch {
    type: 'country' | 'continent' | 'custom';
    countries?: string[];
    continents?: string[];
    customGroups?: string[];
}

interface GeoSelectorProps {
    value: GeoMatch;
    onChange: (value: GeoMatch) => void;
    customGroups?: Array<{ id: string; name: string; description: string; countries: string[] }>;
}

/**
 * 国家选项（常用国家）
 */
const COUNTRY_OPTIONS: MultiSelectOption[] = [
    { value: 'CN', label: '🇨🇳 中国' },
    { value: 'US', label: '🇺🇸 美国' },
    { value: 'JP', label: '🇯🇵 日本' },
    { value: 'KR', label: '🇰🇷 韩国' },
    { value: 'GB', label: '🇬🇧 英国' },
    { value: 'DE', label: '🇩🇪 德国' },
    { value: 'FR', label: '🇫🇷 法国' },
    { value: 'IN', label: '🇮🇳 印度' },
    { value: 'SG', label: '🇸🇬 新加坡' },
    { value: 'AU', label: '🇦🇺 澳大利亚' },
    { value: 'CA', label: '🇨🇦 加拿大' },
    { value: 'RU', label: '🇷🇺 俄罗斯' },
    { value: 'BR', label: '🇧🇷 巴西' },
    { value: 'IT', label: '🇮🇹 意大利' },
    { value: 'ES', label: '🇪🇸 西班牙' },
    { value: 'MX', label: '🇲🇽 墨西哥' },
    { value: 'ID', label: '🇮🇩 印度尼西亚' },
    { value: 'NL', label: '🇳🇱 荷兰' },
    { value: 'TH', label: '🇹🇭 泰国' },
    { value: 'PH', label: '🇵🇭 菲律宾' },
    { value: 'VN', label: '🇻🇳 越南' },
    { value: 'MY', label: '🇲🇾 马来西亚' },
    { value: 'TR', label: '🇹🇷 土耳其' },
    { value: 'SA', label: '🇸🇦 沙特阿拉伯' },
    { value: 'AE', label: '🇦🇪 阿联酋' },
    { value: 'ZA', label: '🇿🇦 南非' },
    { value: 'EG', label: '🇪🇬 埃及' },
    { value: 'NG', label: '🇳🇬 尼日利亚' },
    { value: 'AR', label: '🇦🇷 阿根廷' },
    { value: 'CL', label: '🇨🇱 智利' },
];

/**
 * 大洲选项
 */
const CONTINENT_OPTIONS = [
    { value: 'AS', label: '🌏 亚洲 (Asia)' },
    { value: 'EU', label: '🇪🇺 欧洲 (Europe)' },
    { value: 'NA', label: '🌎 北美洲 (North America)' },
    { value: 'SA', label: '🌎 南美洲 (South America)' },
    { value: 'AF', label: '🌍 非洲 (Africa)' },
    { value: 'OC', label: '🌏 大洋洲 (Oceania)' },
];

export function GeoSelector({ value, onChange, customGroups = [] }: GeoSelectorProps) {
    return (
        <Tabs
            value={value.type}
            onValueChange={(t) => onChange({ ...value, type: t as 'country' | 'continent' | 'custom' })}
        >
            <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="country">按国家</TabsTrigger>
                <TabsTrigger value="continent">按大洲</TabsTrigger>
                <TabsTrigger value="custom">预定义组</TabsTrigger>
            </TabsList>

            <TabsContent value="country" className="mt-4">
                <div className="space-y-2">
                    <Label>选择国家（支持多选）</Label>
                    <MultiSelect
                        options={COUNTRY_OPTIONS}
                        value={value.countries || []}
                        onValueChange={(countries) => onChange({ ...value, countries })}
                        placeholder="选择一个或多个国家..."
                        maxCount={5}
                    />
                    <p className="text-xs text-muted-foreground">
                        已选择 {value.countries?.length || 0} 个国家
                    </p>
                </div>
            </TabsContent>

            <TabsContent value="continent" className="mt-4">
                <div className="space-y-2">
                    <Label>选择大洲（支持多选）</Label>
                    <div className="space-y-3 mt-2">
                        {CONTINENT_OPTIONS.map((continent) => (
                            <div key={continent.value} className="flex items-center space-x-2">
                                <Checkbox
                                    id={`continent-${continent.value}`}
                                    checked={value.continents?.includes(continent.value)}
                                    onCheckedChange={(checked) => {
                                        const newContinents = checked
                                            ? [...(value.continents || []), continent.value]
                                            : (value.continents || []).filter((c) => c !== continent.value);
                                        onChange({ ...value, continents: newContinents });
                                    }}
                                />
                                <Label
                                    htmlFor={`continent-${continent.value}`}
                                    className="cursor-pointer font-normal"
                                >
                                    {continent.label}
                                </Label>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        已选择 {value.continents?.length || 0} 个大洲
                    </p>
                </div>
            </TabsContent>

            <TabsContent value="custom" className="mt-4">
                <div className="space-y-2">
                    <Label>选择预定义地区组（支持多选）</Label>
                    {customGroups.length > 0 ? (
                        <>
                            <MultiSelect
                                options={customGroups.map(g => ({
                                    value: g.id,
                                    label: `${g.name} (${g.countries.length} 国家)`
                                }))}
                                value={value.customGroups || []}
                                onValueChange={(groups) => onChange({ ...value, customGroups: groups })}
                                placeholder="选择一个或多个地区组..."
                                maxCount={5}
                            />
                            <p className="text-xs text-muted-foreground">
                                已选择 {value.customGroups?.length || 0} 个地区组
                            </p>

                            {/* 显示选中地区组的详情 */}
                            {value.customGroups && value.customGroups.length > 0 && (
                                <div className="mt-3 space-y-2">
                                    {value.customGroups.map(groupId => {
                                        const group = customGroups.find(g => g.id === groupId);
                                        if (!group) return null;
                                        return (
                                            <div key={groupId} className="text-xs p-2 bg-muted rounded">
                                                <div className="font-medium">{group.name}</div>
                                                <div className="text-muted-foreground">{group.description}</div>
                                                <div className="mt-1 text-muted-foreground">
                                                    包含 {group.countries.length} 个国家
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-sm text-muted-foreground p-4 border rounded-md">
                            暂无预定义地区组，请先在后端配置。
                        </div>
                    )}
                </div>
            </TabsContent>
        </Tabs>
    );
}

