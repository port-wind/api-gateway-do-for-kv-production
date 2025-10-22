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
import { MultiSelect } from '@/components/ui/multi-select'
import {
  Shield,
  Globe,
  Save,
  AlertCircle
} from 'lucide-react'
import { useUpdateProxyRoute } from '@/hooks/use-proxy-route-api'
import type { ProxyRoute } from '@/types/api'

interface ProxyRouteConfigDialogProps {
  route: ProxyRoute
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

export function ProxyRouteConfigDialog({ route, open, onOpenChange }: ProxyRouteConfigDialogProps) {
  const updateRoute = useUpdateProxyRoute()

  // 本地状态管理
  const [config, setConfig] = useState<Partial<ProxyRoute>>({})
  const [hasChanges, setHasChanges] = useState(false)

  // 当组件打开时，初始化本地状态
  useEffect(() => {
    if (open && route) {
      setConfig(route)
      setHasChanges(false)
    }
  }, [route, open])

  // 配置更新辅助函数
  const updateConfigField = (field: string, value: unknown) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }))
    setHasChanges(true)
  }

  // 保存配置
  const handleSave = async () => {
    if (!config || !hasChanges || !route.id) return

    // 直接通过代理路由API保存配置
    updateRoute.mutate(
      { id: route.id, data: config },
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
    if (route) {
      setConfig(route)
      setHasChanges(false)
    }
  }

  if (!route) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-screen h-[95vh] max-w-none px-8 sm:max-w-none sm:w-screen sm:rounded-none overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            代理路由配置
            {hasChanges && (
              <Badge variant="secondary">有未保存的更改</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            为代理路由 <code className="bg-muted px-2 py-1 rounded text-sm">{route.pattern}</code> 配置详细参数
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-4 pr-2">
          {/* 基本信息 */}
          <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">基本配置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>路径模式</Label>
                <Input
                  value={config.pattern || ''}
                  onChange={(e) => updateConfigField('pattern', e.target.value)}
                  placeholder="例如: /api/v1/*"
                />
                <div className="text-xs text-muted-foreground">
                  请求匹配的路径模式，支持通配符
                </div>
              </div>

              <div className="space-y-2">
                <Label>目标地址</Label>
                <Input
                  value={config.target || ''}
                  onChange={(e) => updateConfigField('target', e.target.value)}
                  placeholder="例如: https://api.example.com"
                />
                <div className="text-xs text-muted-foreground">
                  请求转发的目标服务器地址
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>优先级</Label>
                <Input
                  type="number"
                  value={config.priority || 0}
                  onChange={(e) => updateConfigField('priority', parseInt(e.target.value) || 0)}
                  min="0"
                />
                <div className="text-xs text-muted-foreground">
                  数值越小优先级越高
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>移除路径前缀</Label>
                  <div className="text-xs text-muted-foreground">
                    转发时是否移除匹配的路径前缀
                  </div>
                </div>
                <Switch
                  checked={config.stripPrefix || false}
                  onCheckedChange={(checked) => updateConfigField('stripPrefix', checked)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>启用路由</Label>
                <div className="text-xs text-muted-foreground">
                  是否启用此代理路由
                </div>
              </div>
              <Switch
                checked={config.enabled !== false}
                onCheckedChange={(checked) => updateConfigField('enabled', checked)}
              />
            </div>
          </CardContent>
        </Card>

        {/* 功能配置选项卡 */}
        <Tabs defaultValue="rateLimit" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="rateLimit" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              限流配置
            </TabsTrigger>
            <TabsTrigger value="geo" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              地域封锁
            </TabsTrigger>
          </TabsList>


          {/* 限流配置 */}
          <TabsContent value="rateLimit">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  限流配置
                </CardTitle>
                <CardDescription>
                  配置此代理路由的请求频率限制
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>启用限流</Label>
                    <div className="text-sm text-muted-foreground">
                      为此代理路由启用请求频率限制
                    </div>
                  </div>
                  <Switch
                    checked={config.rateLimitEnabled || false}
                    onCheckedChange={(checked) => updateConfigField('rateLimitEnabled', checked)}
                  />
                </div>

                {config.rateLimitEnabled && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <Label>请求限制（每分钟）</Label>
                      <Input
                        type="number"
                        value={config.rateLimit || 100}
                        onChange={(e) => updateConfigField('rateLimit', parseInt(e.target.value) || 100)}
                        min="1"
                        max="10000"
                      />
                      <div className="text-xs text-muted-foreground">
                        每分钟最大请求数
                      </div>
                    </div>

                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                        <div className="text-sm text-amber-800">
                          <strong>限流说明：</strong>
                          <div className="mt-1 text-xs">
                            当前配置：每分钟最多 {config.rateLimit || 100} 个请求
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
                  根据用户地理位置限制此代理路由的访问
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>启用地域封锁</Label>
                    <div className="text-sm text-muted-foreground">
                      为此代理路由启用基于地理位置的访问控制
                    </div>
                  </div>
                  <Switch
                    checked={config.geoEnabled || false}
                    onCheckedChange={(checked) => updateConfigField('geoEnabled', checked)}
                  />
                </div>

                {config.geoEnabled && (
                  <>
                    <Separator />
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>国家/地区选择</Label>
                        <MultiSelect
                          options={COUNTRY_OPTIONS}
                          value={config.geoCountries || []}
                          onValueChange={(countries) => updateConfigField('geoCountries', countries)}
                          placeholder="选择要阻止的国家/地区..."
                          maxCount={5}
                        />
                        <div className="text-xs text-muted-foreground">
                          选择要阻止访问的国家/地区（黑名单模式）
                        </div>
                      </div>

                      {config.geoCountries && config.geoCountries.length > 0 && (
                        <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                          <div className="text-sm text-orange-800">
                            <strong>当前配置：</strong>
                            <div className="mt-1">
                              阻止 {config.geoCountries.length} 个国家/地区的用户访问
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {config.geoCountries.map(country => (
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
              disabled={!hasChanges || updateRoute.isPending}
            >
              重置
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || updateRoute.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {updateRoute.isPending ? '保存中...' : '保存配置'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}