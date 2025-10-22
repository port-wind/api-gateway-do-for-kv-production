/**
 * 地区访问控制规则管理页面
 * 
 * MVP 功能：
 * - 全局规则列表展示
 * - 创建/编辑/删除规则
 * - 批量启用/禁用规则
 * - 支持 allow/block 模式
 * - 地区访问监控列表
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Plus, RefreshCw, Shield, Globe, AlertTriangle, Activity } from 'lucide-react';
import { useGeoRulesManagement, useGeoAccessManagement } from '@/hooks/use-geo-rules-api';
import { GeoRulesTable } from './components/geo-rules-table';
import { CreateGeoRuleDialog } from './components/create-geo-rule-dialog';
import { GeoAccessListTable } from './components/geo-access-list-table';
import { GeoCountryDetailDialog } from './components/geo-country-detail-dialog';
import { GeoCountryPathsDialog } from './components/geo-country-paths-dialog';

export default function GeoRulesManagement() {
    // 规则管理状态
    const [searchQuery, setSearchQuery] = useState('');
    const [createDialogOpen, setCreateDialogOpen] = useState(false);

    // 访问列表状态
    const [activeTab, setActiveTab] = useState<'access-list' | 'rules'>('access-list');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [accessListPage, setAccessListPage] = useState(1);
    const [accessListSearch, setAccessListSearch] = useState('');

    // 对话框状态
    const [detailDialogOpen, setDetailDialogOpen] = useState(false);
    const [pathsDialogOpen, setPathsDialogOpen] = useState(false);
    const [selectedCountry, setSelectedCountry] = useState('');

    // 规则管理数据
    const {
        rules,
        ruleSet,
        presetGroups,
        isLoading: isLoadingRules,
        hasError: hasRulesError,
        queries: ruleQueries,
    } = useGeoRulesManagement();

    // 访问列表数据
    const {
        accessList,
        pagination,
        summary,
        isLoading: isLoadingAccessList,
        hasError: hasAccessListError,
        queries: accessQueries,
    } = useGeoAccessManagement({
        date: selectedDate,
        page: accessListPage,
        limit: 50,
        sortBy: 'total_requests',
        sortOrder: 'desc',
        search: accessListSearch,
    });

    // 手动刷新数据
    const handleRefresh = () => {
        if (activeTab === 'access-list') {
            accessQueries.accessList.refetch();
        } else {
            ruleQueries.rules.refetch();
            ruleQueries.presetGroups.refetch();
        }
    };

    // 过滤规则
    const filteredRules = rules.filter(rule =>
        rule.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rule.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // 规则统计数据
    const ruleStats = {
        totalRules: rules.length,
        enabledRules: rules.filter(r => r.enabled).length,
        blockRules: rules.filter(r => r.mode === 'block').length,
        allowRules: rules.filter(r => r.mode === 'allow').length,
    };

    // 访问列表操作
    const handleViewDetail = (country: string) => {
        setSelectedCountry(country);
        setDetailDialogOpen(true);
    };

    const handleViewPaths = (country: string) => {
        setSelectedCountry(country);
        setPathsDialogOpen(true);
    };

    const handleCreateRuleFromCountry = (_country: string, _mode: 'block' | 'allow') => {
        // TODO: 打开创建规则对话框并预填国家
        setCreateDialogOpen(true);
    };

    return (
        <div className="w-full px-6 py-6 space-y-6">
            {/* 页面标题 */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">地区访问控制</h1>
                    <p className="text-muted-foreground">
                        按国家/地区批量管理访问权限，支持白名单和黑名单模式
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={handleRefresh}
                        disabled={activeTab === 'access-list' ? isLoadingAccessList : isLoadingRules}
                    >
                        <RefreshCw className={`h-4 w-4 ${(activeTab === 'access-list' ? isLoadingAccessList : isLoadingRules) ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button onClick={() => setCreateDialogOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        创建规则
                    </Button>
                </div>
            </div>

            {/* 统计卡片 - 根据当前 Tab 显示不同数据 */}
            {activeTab === 'access-list' && summary ? (
                <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">访问国家</CardTitle>
                            <Globe className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{summary.totalCountries}</div>
                            <p className="text-xs text-muted-foreground">
                                不同国家/地区
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">总请求</CardTitle>
                            <Activity className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{summary.totalRequests.toLocaleString()}</div>
                            <p className="text-xs text-muted-foreground">
                                当日总计
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">封禁请求</CardTitle>
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-red-600">{summary.totalBlocked}</div>
                            <p className="text-xs text-muted-foreground">
                                被地区规则封禁
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">平均封禁率</CardTitle>
                            <Shield className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{summary.avgBlockRate.toFixed(1)}%</div>
                            <p className="text-xs text-muted-foreground">
                                各国家平均值
                            </p>
                        </CardContent>
                    </Card>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">规则总数</CardTitle>
                            <Shield className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{ruleStats.totalRules}</div>
                            <p className="text-xs text-muted-foreground">
                                {ruleStats.enabledRules} 条已启用
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">封禁规则</CardTitle>
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{ruleStats.blockRules}</div>
                            <p className="text-xs text-muted-foreground">
                                Block 模式
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">白名单规则</CardTitle>
                            <Globe className="h-4 w-4 text-green-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{ruleStats.allowRules}</div>
                            <p className="text-xs text-muted-foreground">
                                Allow 模式
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">默认动作</CardTitle>
                            <Shield className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {ruleSet?.defaultAction === 'allow' ? (
                                    <Badge variant="default">放行</Badge>
                                ) : (
                                    <Badge variant="destructive">封禁</Badge>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                规则都不匹配时的动作
                            </p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* 主内容区域 - Tabs 切换 */}
            <Card>
                <CardHeader>
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'access-list' | 'rules')}>
                        <TabsList>
                            <TabsTrigger value="access-list">
                                <Activity className="h-4 w-4 mr-2" />
                                访问列表
                            </TabsTrigger>
                            <TabsTrigger value="rules">
                                <Shield className="h-4 w-4 mr-2" />
                                规则管理
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="access-list" className="space-y-4">
                            {/* 日期选择和搜索 */}
                            <div className="flex items-center gap-4">
                                <div>
                                    <Input
                                        type="date"
                                        value={selectedDate}
                                        onChange={(e) => setSelectedDate(e.target.value)}
                                        className="w-40"
                                    />
                                </div>
                                <div className="flex-1">
                                    <div className="relative">
                                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="搜索国家代码..."
                                            value={accessListSearch}
                                            onChange={(e) => setAccessListSearch(e.target.value)}
                                            className="pl-8"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* 访问列表表格 */}
                            {hasAccessListError ? (
                                <div className="text-center py-8">
                                    <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                                    <p className="text-muted-foreground">加载访问列表失败，请刷新重试</p>
                                </div>
                            ) : (
                                <GeoAccessListTable
                                    data={accessList}
                                    pagination={pagination}
                                    isLoading={isLoadingAccessList}
                                    currentPage={accessListPage}
                                    onPageChange={setAccessListPage}
                                    onViewDetail={handleViewDetail}
                                    onViewPaths={handleViewPaths}
                                    onCreateRule={handleCreateRuleFromCountry}
                                />
                            )}
                        </TabsContent>

                        <TabsContent value="rules" className="space-y-4">
                            {/* 搜索框 */}
                            <div className="flex items-center justify-between">
                                <div className="w-64">
                                    <div className="relative">
                                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="搜索规则名称或 ID..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-8"
                                        />
                                    </div>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    按优先级（Priority）顺序执行，匹配到第一条规则后立即生效
                                </div>
                            </div>

                            {/* 规则表格 */}
                            {hasRulesError ? (
                                <div className="text-center py-8">
                                    <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                                    <p className="text-muted-foreground">加载规则失败，请刷新重试</p>
                                </div>
                            ) : (
                                <GeoRulesTable
                                    data={filteredRules}
                                    isLoading={isLoadingRules}
                                    presetGroups={presetGroups}
                                />
                            )}
                        </TabsContent>
                    </Tabs>
                </CardHeader>
            </Card>

            {/* 对话框 */}
            <CreateGeoRuleDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                presetGroups={presetGroups}
            />

            <GeoCountryDetailDialog
                open={detailDialogOpen}
                onOpenChange={setDetailDialogOpen}
                country={selectedCountry}
                date={selectedDate}
            />

            <GeoCountryPathsDialog
                open={pathsDialogOpen}
                onOpenChange={setPathsDialogOpen}
                country={selectedCountry}
                date={selectedDate}
            />
        </div>
    );
}

