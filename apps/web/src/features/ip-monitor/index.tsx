import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search, Plus, RefreshCw, Shield, Activity, AlertTriangle } from 'lucide-react'
import { useIpMonitorManagement } from '@/hooks/use-ip-monitor-api'
import { IpListTable } from './components/ip-list-table'
import { IpRulesTable } from './components/ip-rules-table'
import { CreateRuleDialog } from './components/create-rule-dialog'
import { ConfigDialog } from './components/config-dialog'

export default function IpMonitor() {
    const [searchQuery, setSearchQuery] = useState('')
    const [currentPage, setCurrentPage] = useState(1)
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
    const [createRuleDialogOpen, setCreateRuleDialogOpen] = useState(false)
    const [configDialogOpen, setConfigDialogOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<'ips' | 'rules'>('ips')
    const [selectedIp, setSelectedIp] = useState<string>('')
    const [selectedMode, setSelectedMode] = useState<'block' | 'throttle'>('block')
    const pageSize = 50

    const {
        ipList,
        rules,
        config,
        isLoading,
        hasError,
        queries,
    } = useIpMonitorManagement({
        date: selectedDate,
        page: currentPage,
        limit: pageSize,
        search: searchQuery,
        sortBy: 'requests',
        sortOrder: 'desc',
    })

    // 手动刷新数据
    const handleRefresh = () => {
        queries.ipList.refetch()
        queries.rules.refetch()
        queries.config.refetch()
    }

    // 统计数据
    const stats = {
        totalIps: ipList?.pagination?.total || 0,
        activeRules: rules?.pagination?.total || 0,
        blockedIps: (rules?.data as Array<{ mode: string }>)?.filter(r => r.mode === 'block').length || 0,
        throttledIps: (rules?.data as Array<{ mode: string }>)?.filter(r => r.mode === 'throttle').length || 0,
    }

    return (
        <div className="container max-w-7xl mx-auto p-6 space-y-6">
            {/* 页面标题和操作区域 */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">IP 访问监控</h1>
                    <p className="text-muted-foreground mt-2">
                        监控 IP 访问行为，识别可疑流量，实施全局限流和封禁
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                        disabled={isLoading}
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                        刷新
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfigDialogOpen(true)}
                    >
                        <Shield className="h-4 w-4 mr-2" />
                        配置
                    </Button>

                    <Button size="sm" onClick={() => setCreateRuleDialogOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        添加规则
                    </Button>
                </div>
            </div>

            {/* 统计概览 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">今日访问 IP</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalIps}</div>
                        <p className="text-xs text-muted-foreground">
                            不同的 IP 地址访问
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">活跃规则</CardTitle>
                        <Shield className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.activeRules}</div>
                        <p className="text-xs text-muted-foreground">
                            正在生效的访问规则
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">封禁 IP</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{stats.blockedIps}</div>
                        <p className="text-xs text-muted-foreground">
                            完全阻止访问的 IP
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">限流 IP</CardTitle>
                        <Activity className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-600">{stats.throttledIps}</div>
                        <p className="text-xs text-muted-foreground">
                            限制请求频率的 IP
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* 搜索和日期选择 */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">搜索与筛选</CardTitle>
                    <CardDescription>
                        根据 IP 前缀和日期筛选访问记录
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="输入 IP 地址前缀进行搜索..."
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value)
                                    setCurrentPage(1) // 重置页码
                                }}
                                className="pl-10 pr-4"
                            />
                        </div>

                        <div>
                            <Input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => {
                                    setSelectedDate(e.target.value)
                                    setCurrentPage(1) // 重置页码
                                }}
                            />
                        </div>
                    </div>

                    {/* 搜索结果统计 */}
                    {ipList && searchQuery && (
                        <div className="mt-3 flex items-center gap-2">
                            <Badge variant="secondary">
                                找到 {ipList.pagination.total} 个匹配的 IP
                            </Badge>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* 主内容区域 - 分标签页 */}
            <Card>
                <CardHeader>
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'ips' | 'rules')}>
                        <TabsList>
                            <TabsTrigger value="ips">
                                <Activity className="h-4 w-4 mr-2" />
                                IP 访问列表
                            </TabsTrigger>
                            <TabsTrigger value="rules">
                                <Shield className="h-4 w-4 mr-2" />
                                访问规则
                            </TabsTrigger>
                        </TabsList>

                        {hasError && (
                            <div className="bg-red-50 border border-red-200 rounded-md p-4 mt-4">
                                <p className="text-red-800 text-sm">
                                    加载数据时出错，请刷新页面重试
                                </p>
                            </div>
                        )}

                        <TabsContent value="ips" className="mt-0">
                            <IpListTable
                                data={(ipList?.data as any[]) || []}
                                pagination={ipList?.pagination}
                                isLoading={isLoading}
                                currentPage={currentPage}
                                selectedDate={selectedDate}
                                onPageChange={setCurrentPage}
                                onCreateRule={(ip, mode) => {
                                    setSelectedIp(ip)
                                    setSelectedMode(mode)
                                    setCreateRuleDialogOpen(true)
                                }}
                            />
                        </TabsContent>

                        <TabsContent value="rules" className="mt-0">
                            <IpRulesTable
                                data={(rules?.data as any[]) || []}
                                pagination={rules?.pagination}
                                isLoading={isLoading}
                            />
                        </TabsContent>
                    </Tabs>
                </CardHeader>
            </Card>

            {/* 对话框 */}
            <CreateRuleDialog
                open={createRuleDialogOpen}
                onOpenChange={(open) => {
                    setCreateRuleDialogOpen(open)
                    if (!open) {
                        // 关闭时清空选中状态
                        setSelectedIp('')
                        setSelectedMode('block')
                    }
                }}
                defaultIp={selectedIp}
                defaultMode={selectedMode}
            />

            <ConfigDialog
                open={configDialogOpen}
                onOpenChange={setConfigDialogOpen}
                currentConfig={config?.config as any}
            />
        </div>
    )
}

