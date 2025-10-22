import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import {
  Database,
  Shield,
  Globe,
  Save,
  AlertCircle,
  Info,
  Hash,
  ExternalLink,
  RefreshCw,
  Eye,
  Trash2
} from 'lucide-react'
import { useUnifiedPathConfig, useUpdateUnifiedPathConfig } from '@/hooks/use-path-api'
import type { UnifiedPathConfig } from '@/types/api'
import { CachePreviewDialog } from './cache-preview-dialog'
import { toast } from 'sonner'
import { CacheStrategySelector } from '@/components/cache-strategy-selector'
import { MultiInput } from '@/components/ui/multi-input'

interface PathConfigDialogProps {
  path: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// 常用国家选项
const COUNTRY_OPTIONS = [
  { value: 'US', label: '美国 (US)' },
  { value: 'CN', label: '中国 (CN)' },
  { value: 'JP', label: '日本 (JP)' },
  { value: 'DE', label: '德国 (DE)' },
  { value: 'GB', label: '英国 (GB)' },
  { value: 'FR', label: '法国 (FR)' },
  { value: 'CA', label: '加拿大 (CA)' },
  { value: 'AU', label: '澳大利亚 (AU)' },
  { value: 'BR', label: '巴西 (BR)' },
  { value: 'IN', label: '印度 (IN)' },
  { value: 'KR', label: '韩国 (KR)' },
  { value: 'RU', label: '俄罗斯 (RU)' },
  { value: 'IT', label: '意大利 (IT)' },
  { value: 'ES', label: '西班牙 (ES)' },
  { value: 'NL', label: '荷兰 (NL)' },
  { value: 'SE', label: '瑞典 (SE)' },
  { value: 'NO', label: '挪威 (NO)' },
  { value: 'DK', label: '丹麦 (DK)' },
  { value: 'FI', label: '芬兰 (FI)' },
  { value: 'SG', label: '新加坡 (SG)' },
]

export function PathConfigDialog({ path, open, onOpenChange }: PathConfigDialogProps) {
  const { data: pathConfigData, isLoading } = useUnifiedPathConfig(path, open)
  const updateConfig = useUpdateUnifiedPathConfig()

  // 本地状态管理
  const [config, setConfig] = useState<Partial<UnifiedPathConfig>>({})
  const [hasChanges, setHasChanges] = useState(false)
  const [cachePreviewOpen, setCachePreviewOpen] = useState(false)

  // 判断HTTP方法是否可以缓存
  const isCacheableMethod = (method?: string): boolean => {
    if (!method) return true // 无method信息时允许（手动配置路径）
    return method === 'GET' || method === 'HEAD' || method === 'POST'
  }

  // 当获取到数据时，初始化本地状态
  useEffect(() => {
    if (pathConfigData?.data) {
      setConfig(pathConfigData.data)
      setHasChanges(false)
    }
  }, [pathConfigData])

  // 配置更新辅助函数
  const updateConfigSection = (section: string, updates: Record<string, unknown>) => {
    setConfig(prev => ({
      ...prev,
      [section]: {
        ...(prev as Record<string, Record<string, unknown>>)[section],
        ...updates
      }
    }))
    setHasChanges(true)
  }


  // 保存配置
  const handleSave = async () => {
    if (!config || !hasChanges) return

    // 直接通过统一API保存配置
    updateConfig.mutate(
      { path, config },
      {
        onSuccess: () => {
          setHasChanges(false)
          onOpenChange(false)
        }
      }
    )
  }

  // 重置配置
  const handleReset = () => {
    if (pathConfigData?.data) {
      setConfig(pathConfigData.data)
      setHasChanges(false)
    }
  }

  // 缓存操作函数
  const handleCachePreview = () => {
    setCachePreviewOpen(true)
  }

  const handleCacheFlush = async () => {
    try {
      const response = await fetch('/api/admin/cache/flush', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keys: [path]
        })
      })
      const result = await response.json()

      if (result.success) {
        toast.success(`缓存刷新成功！已刷新 ${result.result.flushedCount} 个缓存条目`)
      } else {
        toast.error('缓存刷新失败：' + result.message)
      }
    } catch (error) {
      toast.error('缓存刷新失败：' + error)
    }
  }

  const handleCacheDelete = async () => {
    if (!confirm(`确定要删除路径 ${path} 的缓存吗？此操作不可恢复。`)) {
      return
    }

    try {
      const response = await fetch('/api/admin/cache/invalidate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pattern: path + '*'
        })
      })
      const result = await response.json()

      if (result.success) {
        toast.success(`缓存删除成功！已删除 ${result.invalidatedCount} 个缓存条目`)
      } else {
        toast.error('缓存删除失败：' + result.message)
      }
    } catch (error) {
      toast.error('缓存删除失败：' + error)
    }
  }

  if (isLoading || !config) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-screen h-[95vh] max-w-none px-8 sm:max-w-none sm:w-screen sm:rounded-none overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>路径配置</DialogTitle>
            <DialogDescription>加载配置中...</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-screen h-[95vh] max-w-none px-8 sm:max-w-none sm:w-screen sm:rounded-none overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            路径配置
            {hasChanges && (
              <Badge variant="secondary">有未保存的更改</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            为路径 <code className="bg-muted px-2 py-1 rounded text-sm">{path}</code> 配置缓存、限流和地域封锁功能
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-4 pr-2">
          {/* 基本信息 */}
          <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">基本信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium text-muted-foreground">路径</Label>
                <div className="font-mono text-sm">{path}</div>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">来源</Label>
                <div>
                  <Badge variant={config.metadata?.source === 'manual' ? 'default' : 'secondary'}>
                    {config.metadata?.source === 'manual' ? '手动配置' : '自动发现'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* 所属代理路由信息 */}
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  所属代理路由
                </Label>
                <div className="mt-1">
                  {config.proxyId ? (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">
                        {config.proxyPattern || '未知模式'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        → {config.proxyTarget || '未知目标'}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      此路径未关联任何代理路由
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    路径的代理目标由其所属的代理路由决定，如需修改请前往代理路由管理
                  </p>
                </div>
              </div>
            </div>

            {(config.requestCount || config.lastAccessed) && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">访问次数</Label>
                  <div className="text-sm">
                    {config.requestCount?.toLocaleString() || '无数据'}
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">最后访问</Label>
                  <div className="text-sm">
                    {config.lastAccessed
                      ? new Date(config.lastAccessed).toLocaleString('zh-CN')
                      : '无数据'
                    }
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 功能配置选项卡 */}
        <Tabs defaultValue="cache" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="cache" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              缓存配置
            </TabsTrigger>
            <TabsTrigger value="rateLimit" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              限流配置
            </TabsTrigger>
            <TabsTrigger value="geo" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              地域封锁
            </TabsTrigger>
          </TabsList>

          {/* 缓存配置 */}
          <TabsContent value="cache">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  缓存配置
                </CardTitle>
                <CardDescription>
                  配置此路径的缓存行为和参数
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>启用缓存</Label>
                    <div className="text-sm text-muted-foreground">
                      为此路径启用响应缓存
                      {config.method && (
                        <Badge className="ml-2 text-xs">
                          {config.method}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="inline-block">
                          <Switch
                            checked={config.cache?.enabled || false}
                            onCheckedChange={(checked) =>
                              updateConfigSection('cache', { enabled: checked })
                            }
                            disabled={!isCacheableMethod(config.method)}
                          />
                        </div>
                      </TooltipTrigger>
                      {!isCacheableMethod(config.method) && (
                        <TooltipContent>
                          <p>仅 GET、HEAD 和 POST 请求可启用缓存</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {config.cache?.enabled && isCacheableMethod(config.method) && (
                  <>
                    <Separator />
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Hash className="h-4 w-4" />
                          版本号
                        </Label>
                        <Input
                          type="number"
                          value={config.cache?.version || 1}
                          onChange={(e) =>
                            updateConfigSection('cache', {
                              version: parseInt(e.target.value) || 1
                            })
                          }
                          min="1"
                        />
                        <div className="text-xs text-muted-foreground">
                          缓存版本，用于强制更新
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>TTL（秒）</Label>
                        <Input
                          type="number"
                          value={config.cache?.ttl || ''}
                          onChange={(e) =>
                            updateConfigSection('cache', {
                              ttl: e.target.value ? parseInt(e.target.value) || undefined : undefined
                            })
                          }
                          min="1"
                          max="86400"
                          placeholder="默认300秒（5分钟）"
                        />
                        <div className="text-xs text-muted-foreground">
                          缓存存活时间，留空默认5分钟（需永久缓存请设置超大值如31536000）
                        </div>
                      </div>
                    </div>

                    {/* 灵活缓存键策略配置 */}
                    <Separator />
                    <div className="space-y-4">
                      <CacheStrategySelector
                        value={config.cache?.keyStrategy || 'path-params'}
                        onChange={(value) =>
                          updateConfigSection('cache', { keyStrategy: value })
                        }
                        disabled={false}
                      />

                      {/* 根据策略显示 Headers 配置 */}
                      {(config.cache?.keyStrategy === 'path-headers' ||
                        config.cache?.keyStrategy === 'path-params-headers') && (
                          <div className="space-y-3">
                            <div>
                              <Label className="text-base">Header 列表</Label>
                              <p className="text-sm text-muted-foreground mt-1">
                                选择或输入要参与缓存键生成的 header 名称
                              </p>
                            </div>

                            {/* 全部/指定 Headers 选择 */}
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">Headers 范围</Label>
                              <div className="flex gap-4">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    checked={(config.cache?.keyHeaders as 'all' | string[] | undefined) === 'all'}
                                    onChange={() => {
                                      updateConfigSection('cache', { keyHeaders: 'all' as 'all' | string[] })
                                    }}
                                    className="h-4 w-4"
                                  />
                                  <span className="text-sm">全部 Headers</span>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    checked={Array.isArray(config.cache?.keyHeaders) || !config.cache?.keyHeaders}
                                    onChange={() => {
                                      updateConfigSection('cache', { keyHeaders: [] as 'all' | string[] })
                                    }}
                                    className="h-4 w-4"
                                  />
                                  <span className="text-sm">指定 Headers</span>
                                </label>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {(config.cache?.keyHeaders as 'all' | string[] | undefined) === 'all'
                                  ? '⚠️ 使用所有请求 headers 生成缓存键（极细粒度，可能导致缓存命中率降低）'
                                  : '选择特定的 headers 参与缓存键生成（推荐）'}
                              </p>
                            </div>

                            {/* 仅在选择"指定 Headers"时显示以下选项 */}
                            {Array.isArray(config.cache?.keyHeaders) && (
                              <>
                                {/* 常用 Header 快速选择 */}
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium">常用 Headers（点击添加）</Label>
                                  <div className="flex flex-wrap gap-2">
                                    {['authorization', 'x-token', 'x-user-id', 'x-tenant-id', 'cid', 'x-client-id', 'x-device-id'].map((header) => {
                                      const isSelected = config.cache?.keyHeaders?.includes(header)
                                      return (
                                        <Button
                                          key={header}
                                          type="button"
                                          size="sm"
                                          variant={isSelected ? 'default' : 'outline'}
                                          onClick={() => {
                                            const current = (config.cache?.keyHeaders as string[]) || []
                                            if (isSelected) {
                                              // 移除
                                              updateConfigSection('cache', {
                                                keyHeaders: current.filter(h => h !== header)
                                              })
                                            } else {
                                              // 添加
                                              updateConfigSection('cache', {
                                                keyHeaders: [...current, header]
                                              })
                                            }
                                          }}
                                          className="h-8"
                                        >
                                          {header}
                                        </Button>
                                      )
                                    })}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    💡 提示：authorization 用于 JWT token，cid 用于客户端 ID，x-user-id 用于用户隔离
                                  </p>
                                </div>

                                {/* 自定义 Header 输入 */}
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium">自定义 Headers</Label>
                                  <MultiInput
                                    value={(config.cache?.keyHeaders as string[]) || []}
                                    onChange={(value) =>
                                      updateConfigSection('cache', { keyHeaders: value })
                                    }
                                    placeholder="输入自定义 header 名称，如: x-custom-header"
                                    validate={(value) => /^[a-z0-9-]+$/i.test(value)}
                                    errorMessage="Header 名称只能包含字母、数字和连字符"
                                  />
                                </div>

                                {/* 当前已选择的 Headers */}
                                {config.cache?.keyHeaders && (config.cache.keyHeaders as string[]).length > 0 && (
                                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                    <div className="flex items-start gap-2">
                                      <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                                      <div className="text-sm text-blue-800 flex-1">
                                        <strong>当前配置：</strong>
                                        <div className="mt-1">
                                          系统将使用以下 {(config.cache.keyHeaders as string[]).length} 个 header 来区分缓存条目：
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-1">
                                          {(config.cache.keyHeaders as string[]).map(header => (
                                            <Badge key={header} variant="secondary" className="text-xs font-mono">
                                              {header}
                                            </Badge>
                                          ))}
                                        </div>
                                        <div className="mt-2 text-xs">
                                          这意味着：不同的 header 值会产生不同的缓存条目（实现用户隔离）
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* 警告：未配置 Headers */}
                                {(!config.cache?.keyHeaders || (Array.isArray(config.cache.keyHeaders) && config.cache.keyHeaders.length === 0)) && (
                                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                                    <div className="flex items-start gap-2">
                                      <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                                      <div className="text-sm text-amber-800">
                                        <strong>警告：</strong>
                                        <div className="mt-1">
                                          您选择了基于 Header 的缓存策略，但未配置任何 header。
                                          请至少选择或输入一个 header，否则缓存将无法正常工作。
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </>
                            )}

                            {/* 显示"全部 Headers"的提示信息 */}
                            {(config.cache?.keyHeaders as 'all' | string[] | undefined) === 'all' && (
                              <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                                <div className="flex items-start gap-2">
                                  <Info className="h-4 w-4 text-purple-600 mt-0.5" />
                                  <div className="text-sm text-purple-800">
                                    <strong>全部 Headers 模式：</strong>
                                    <div className="mt-1">
                                      系统将使用请求中的所有 headers 来生成缓存键。这提供了最细粒度的缓存隔离，
                                      但可能导致缓存命中率降低（因为不同的 headers 组合会产生不同的缓存条目）。
                                    </div>
                                    <div className="mt-2 text-xs">
                                      💡 建议：仅在需要极高安全性或完全隔离的场景下使用此模式。
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                      {/* 根据策略显示参数配置 */}
                      {(config.cache?.keyStrategy === 'path-params' ||
                        config.cache?.keyStrategy === 'path-params-headers') && (
                          <div className="space-y-2">
                            <Label>参数配置</Label>
                            <div className="flex items-center gap-4 mb-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  checked={config.cache?.keyParams === 'all' || !config.cache?.keyParams}
                                  onChange={() =>
                                    updateConfigSection('cache', { keyParams: 'all' })
                                  }
                                  className="h-4 w-4"
                                />
                                <span className="text-sm">所有参数</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  checked={Array.isArray(config.cache?.keyParams)}
                                  onChange={() =>
                                    updateConfigSection('cache', { keyParams: [] })
                                  }
                                  className="h-4 w-4"
                                />
                                <span className="text-sm">指定参数</span>
                              </label>
                            </div>

                            {Array.isArray(config.cache?.keyParams) && (
                              <>
                                <MultiInput
                                  value={config.cache?.keyParams || []}
                                  onChange={(value) =>
                                    updateConfigSection('cache', { keyParams: value })
                                  }
                                  placeholder="输入参数名称，如: id, page, limit"
                                  validate={(value) => /^[a-zA-Z0-9_]+$/.test(value)}
                                  errorMessage="参数名称只能包含字母、数字和下划线"
                                />
                                <p className="text-xs text-muted-foreground">
                                  只有这些参数会用于生成缓存键
                                </p>
                              </>
                            )}

                            {(config.cache?.keyParams === 'all' || !config.cache?.keyParams) && (
                              <p className="text-xs text-muted-foreground">
                                所有查询参数都会用于生成缓存键
                              </p>
                            )}
                          </div>
                        )}
                    </div>

                    {/* 缓存操作区块 */}
                    <Separator />
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">缓存操作</Label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCachePreview()}
                          className="flex items-center gap-2"
                        >
                          <Eye className="h-4 w-4" />
                          查看缓存
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCacheFlush()}
                          className="flex items-center gap-2"
                        >
                          <RefreshCw className="h-4 w-4" />
                          刷新缓存
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCacheDelete()}
                          className="flex items-center gap-2 text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                          删除缓存
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        这些操作将立即生效，无需保存配置
                      </div>
                    </div>

                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-start gap-2">
                        <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                        <div className="text-sm text-blue-800">
                          <strong>缓存说明：</strong>
                          <ul className="mt-1 space-y-1 text-xs">
                            <li>• 版本号变更会使现有缓存失效</li>
                            <li>• 只有 GET、HEAD 和 POST 请求会被缓存</li>
                            <li>• TTL为空时默认5分钟，需永久缓存请设置超大值（如31536000秒=1年）</li>
                            <li>• 当前TTL配置：{config.cache?.ttl ? `${config.cache.ttl}秒 (${Math.floor(config.cache.ttl / 60)}分钟)` : '默认300秒（5分钟）'}</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* 非可缓存方法的提示 */}
                {!isCacheableMethod(config.method) && config.method && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                    <div className="text-sm text-amber-800">
                      <strong>缓存不可用：</strong>
                      <p className="mt-1">
                        当前路径使用 <Badge className="mx-1 text-xs">{config.method}</Badge> 方法，
                        只有 GET、HEAD 和 POST 请求才支持缓存功能。
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 限流配置 */}
          <TabsContent value="rateLimit">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  限流配置
                </CardTitle>
                <CardDescription>
                  配置此路径的请求频率限制
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>启用限流</Label>
                    <div className="text-sm text-muted-foreground">
                      为此路径启用请求频率限制
                    </div>
                  </div>
                  <Switch
                    checked={config.rateLimit?.enabled || false}
                    onCheckedChange={(checked) =>
                      updateConfigSection('rateLimit', { enabled: checked })
                    }
                  />
                </div>

                {config.rateLimit?.enabled && (
                  <>
                    <Separator />
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>请求限制</Label>
                        <Input
                          type="number"
                          value={config.rateLimit?.limit || 60}
                          onChange={(e) =>
                            updateConfigSection('rateLimit', {
                              limit: parseInt(e.target.value) || 60
                            })
                          }
                          min="1"
                          max="10000"
                        />
                        <div className="text-xs text-muted-foreground">
                          每个时间窗口内的最大请求数
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>时间窗口（秒）</Label>
                        <Input
                          type="number"
                          value={config.rateLimit?.window || 60}
                          onChange={(e) =>
                            updateConfigSection('rateLimit', {
                              window: parseInt(e.target.value) || 60
                            })
                          }
                          min="1"
                          max="3600"
                        />
                        <div className="text-xs text-muted-foreground">
                          限流统计的时间窗口大小
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                        <div className="text-sm text-amber-800">
                          <strong>限流说明：</strong>
                          <div className="mt-1 text-xs">
                            当前配置：每 {config.rateLimit?.window || 60} 秒内最多 {config.rateLimit?.limit || 60} 个请求
                            （平均 {((config.rateLimit?.limit || 60) / (config.rateLimit?.window || 60) * 60).toFixed(1)} 请求/分钟）
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 地域封锁配置 */}
          <TabsContent value="geo">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  地域封锁配置
                </CardTitle>
                <CardDescription>
                  根据用户地理位置限制访问
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>启用地域封锁</Label>
                    <div className="text-sm text-muted-foreground">
                      为此路径启用基于地理位置的访问控制
                    </div>
                  </div>
                  <Switch
                    checked={config.geo?.enabled || false}
                    onCheckedChange={(checked) =>
                      updateConfigSection('geo', { enabled: checked })
                    }
                  />
                </div>

                {config.geo?.enabled && (
                  <>
                    <Separator />
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>封锁模式</Label>
                        <Select
                          value={config.geo?.mode || 'blacklist'}
                          onValueChange={(value: 'whitelist' | 'blacklist') =>
                            updateConfigSection('geo', { mode: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="blacklist">黑名单模式</SelectItem>
                            <SelectItem value="whitelist">白名单模式</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="text-xs text-muted-foreground">
                          {config.geo?.mode === 'whitelist'
                            ? '只允许选中的国家/地区访问'
                            : '阻止选中的国家/地区访问'
                          }
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>国家/地区选择</Label>
                        <MultiSelect
                          options={COUNTRY_OPTIONS}
                          value={config.geo?.countries || []}
                          onValueChange={(countries) =>
                            updateConfigSection('geo', { countries })
                          }
                          placeholder="选择国家/地区..."
                          maxCount={5}
                        />
                        <div className="text-xs text-muted-foreground">
                          选择要{config.geo?.mode === 'whitelist' ? '允许' : '阻止'}访问的国家/地区
                        </div>
                      </div>

                      {config.geo?.countries && config.geo.countries.length > 0 && (
                        <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                          <div className="text-sm text-orange-800">
                            <strong>当前配置：</strong>
                            <div className="mt-1">
                              {config.geo.mode === 'whitelist' ? '仅允许' : '阻止'}
                              {config.geo.countries.length} 个国家/地区
                              {config.geo.mode === 'whitelist' ? '访问' : '的用户访问'}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {config.geo.countries.map(country => (
                                <Badge key={country} variant="outline" className="text-xs">
                                  {country}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        </div>

        {/* 底部操作按钮 */}
        <div className="flex items-center justify-between pt-4 border-t flex-shrink-0 bg-background">
          <div className="text-sm text-muted-foreground">
            {hasChanges ? '有未保存的更改' : '配置已同步'}
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={!hasChanges || updateConfig.isPending}
            >
              重置
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || updateConfig.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {updateConfig.isPending ? '保存中...' : '保存配置'}
            </Button>
          </div>
        </div>

        {/* 缓存预览对话框 */}
        <CachePreviewDialog
          open={cachePreviewOpen}
          onOpenChange={setCachePreviewOpen}
          path={path}
          onRefreshCache={handleCacheFlush}
        />
      </DialogContent>
    </Dialog>
  )
}