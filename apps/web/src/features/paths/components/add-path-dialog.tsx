import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { 
  Plus, 
  X, 
  Database, 
  Shield, 
  Globe, 
  ExternalLink
} from 'lucide-react'
import { useUpdateUnifiedPathConfig } from '@/hooks/use-path-api'
import type { UnifiedPathConfig } from '@/types/api'

interface AddPathDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddPathDialog({ open, onOpenChange }: AddPathDialogProps) {
  // 表单状态
  const [path, setPath] = useState('')
  const [proxyTarget, setProxyTarget] = useState('')
  
  // 缓存配置
  const [cacheEnabled, setCacheEnabled] = useState(true)
  const [cacheVersion, setCacheVersion] = useState(1)
  
  // 限流配置
  const [rateLimitEnabled, setRateLimitEnabled] = useState(false)
  const [rateLimitValue, setRateLimitValue] = useState(60)
  const [rateLimitWindow, setRateLimitWindow] = useState(60)
  
  // 地域封锁配置
  const [geoEnabled, setGeoEnabled] = useState(false)
  const [geoMode, setGeoMode] = useState<'whitelist' | 'blacklist'>('blacklist')
  const [geoCountries, setGeoCountries] = useState<string[]>([])
  const [geoInput, setGeoInput] = useState('')

  const updateConfig = useUpdateUnifiedPathConfig()

  // 重置表单
  const resetForm = () => {
    setPath('')
    setProxyTarget('')
    setCacheEnabled(true)
    setCacheVersion(1)
    setRateLimitEnabled(false)
    setRateLimitValue(60)
    setRateLimitWindow(60)
    setGeoEnabled(false)
    setGeoMode('blacklist')
    setGeoCountries([])
    setGeoInput('')
  }

  // 处理地域国家添加
  const handleAddCountry = () => {
    if (geoInput.trim() && !geoCountries.includes(geoInput.trim().toUpperCase())) {
      setGeoCountries(prev => [...prev, geoInput.trim().toUpperCase()])
      setGeoInput('')
    }
  }

  // 删除地域国家
  const handleRemoveCountry = (countryToRemove: string) => {
    setGeoCountries(prev => prev.filter(country => country !== countryToRemove))
  }

  // 提交表单
  const handleSubmit = async () => {
    if (!path.trim()) {
      return
    }

    const trimmedPath = path.trim()
    const trimmedProxyTarget = proxyTarget.trim()

    try {
      // 构建路径配置对象，包含代理目标
      const config: Partial<UnifiedPathConfig> = {
        proxyTarget: trimmedProxyTarget || undefined,
        cache: {
          enabled: cacheEnabled,
          version: cacheVersion
        },
        rateLimit: {
          enabled: rateLimitEnabled,
          limit: rateLimitValue,
          window: rateLimitWindow
        },
        geo: {
          enabled: geoEnabled,
          mode: geoMode,
          countries: geoCountries
        },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: 'manual'
        }
      }

      // 创建路径配置（统一保存所有配置包括代理目标）
      updateConfig.mutate(
        { path: trimmedPath, config },
        {
          onSuccess: () => {
            onOpenChange(false)
            resetForm()
          }
        }
      )

    } catch (_error) {
      // 创建路径失败
    }
  }

  // 关闭对话框
  const handleClose = () => {
    onOpenChange(false)
    resetForm()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-full max-w-3xl sm:max-w-3xl h-[90vh] overflow-hidden flex flex-col" showCloseButton={false}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            添加路径配置
          </DialogTitle>
          <DialogDescription>
            为新的 API 路径创建缓存、限流和地域封锁配置。可选择添加代理转发规则。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-6 pr-2">
          {/* 基本配置 */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="path">
                路径模式 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="path"
                placeholder="例如: /api/*, /kv/*, /users"
                value={path}
                onChange={(e) => setPath(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                支持通配符 (*)，例如 /api/* 匹配所有以 /api/ 开头的路径
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="proxy-target" className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                代理目标 (选填)
              </Label>
              <Input
                id="proxy-target"
                placeholder="例如: https://api.example.com"
                value={proxyTarget}
                onChange={(e) => setProxyTarget(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                设置后，该路径的请求会被转发到指定的目标服务器
              </p>
            </div>
          </div>

          <Separator />

          {/* 缓存配置 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              <h3 className="text-lg font-semibold">缓存配置</h3>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label>启用缓存</Label>
                <p className="text-sm text-muted-foreground">
                  开启后会缓存响应内容提升性能
                </p>
              </div>
              <Switch
                checked={cacheEnabled}
                onCheckedChange={setCacheEnabled}
              />
            </div>

            {cacheEnabled && (
              <div className="space-y-2">
                <Label htmlFor="cache-version">缓存版本</Label>
                <Input
                  id="cache-version"
                  type="number"
                  min="1"
                  value={cacheVersion}
                  onChange={(e) => setCacheVersion(Number(e.target.value) || 1)}
                />
                <p className="text-xs text-muted-foreground">
                  版本号用于缓存失效，修改版本号会清除旧缓存
                </p>
              </div>
            )}
          </div>

          <Separator />

          {/* 限流配置 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <h3 className="text-lg font-semibold">限流配置</h3>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label>启用限流</Label>
                <p className="text-sm text-muted-foreground">
                  限制每个 IP 的访问频率
                </p>
              </div>
              <Switch
                checked={rateLimitEnabled}
                onCheckedChange={setRateLimitEnabled}
              />
            </div>

            {rateLimitEnabled && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rate-limit-value">请求限制</Label>
                  <Input
                    id="rate-limit-value"
                    type="number"
                    min="1"
                    value={rateLimitValue}
                    onChange={(e) => setRateLimitValue(Number(e.target.value) || 60)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rate-limit-window">时间窗口(秒)</Label>
                  <Input
                    id="rate-limit-window"
                    type="number"
                    min="1"
                    value={rateLimitWindow}
                    onChange={(e) => setRateLimitWindow(Number(e.target.value) || 60)}
                  />
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* 地域封锁配置 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              <h3 className="text-lg font-semibold">地域封锁</h3>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label>启用地域封锁</Label>
                <p className="text-sm text-muted-foreground">
                  根据访问者地理位置控制访问权限
                </p>
              </div>
              <Switch
                checked={geoEnabled}
                onCheckedChange={setGeoEnabled}
              />
            </div>

            {geoEnabled && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>封锁模式</Label>
                  <Select value={geoMode} onValueChange={(value: 'whitelist' | 'blacklist') => setGeoMode(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="blacklist">黑名单 (阻止指定国家)</SelectItem>
                      <SelectItem value="whitelist">白名单 (仅允许指定国家)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>国家代码</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="例如: CN, US, JP"
                      value={geoInput}
                      onChange={(e) => setGeoInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddCountry()}
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddCountry}
                    >
                      添加
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    使用 ISO 3166-1 alpha-2 国家代码，如 CN(中国)、US(美国)
                  </p>
                </div>

                {geoCountries.length > 0 && (
                  <div className="space-y-2">
                    <Label>已添加的国家</Label>
                    <div className="flex flex-wrap gap-2">
                      {geoCountries.map((country) => (
                        <Badge key={country} variant="secondary" className="flex items-center gap-1">
                          {country}
                          <button
                            type="button"
                            onClick={() => handleRemoveCountry(country)}
                            className="ml-1 hover:text-red-500"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={updateConfig.isPending}
          >
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!path.trim() || updateConfig.isPending}
          >
            {updateConfig.isPending ? '创建中...' : '创建路径'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}