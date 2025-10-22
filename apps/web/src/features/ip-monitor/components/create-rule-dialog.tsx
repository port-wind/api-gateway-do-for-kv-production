import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateIpRule } from '@/hooks/use-ip-monitor-api'
import { Ban, Gauge, Info } from 'lucide-react'

interface CreateRuleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultIp?: string
  defaultMode?: 'block' | 'throttle'
}

interface RuleFormData {
  ipPattern: string
  mode: 'block' | 'throttle'
  limit?: number
  window?: number
  reason?: string
  expiresInDays?: number
}

export function CreateRuleDialog({
  open,
  onOpenChange,
  defaultIp = '',
  defaultMode = 'block',
}: CreateRuleDialogProps) {
  const [mode, setMode] = useState<'block' | 'throttle'>(defaultMode)
  const { mutate: createRule, isPending } = useCreateIpRule()
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<RuleFormData>({
    defaultValues: {
      ipPattern: defaultIp,
      mode: defaultMode,
      limit: 10,
      window: 3600,
      reason: '',
      expiresInDays: 7,
    },
  })

  // 当 dialog 打开时，更新表单值
  useEffect(() => {
    if (open) {
      if (defaultIp) {
        setValue('ipPattern', defaultIp)
      }
      setValue('mode', defaultMode)
      setMode(defaultMode)
    }
  }, [open, defaultIp, defaultMode, setValue])

  const onSubmit = (data: RuleFormData) => {
    // 转换为 Unix timestamp（秒）
    const expiresAt = data.expiresInDays
      ? Math.floor((Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000) / 1000)
      : undefined

    createRule(
      {
        ipPattern: data.ipPattern,
        mode: data.mode,
        limit: data.mode === 'throttle' ? Number(data.limit) : undefined,
        window: data.mode === 'throttle' ? Number(data.window) : undefined,
        reason: data.reason,
        expiresAt,
      },
      {
        onSuccess: () => {
          reset()
          onOpenChange(false)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl sm:max-w-2xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>创建 IP 访问规则</DialogTitle>
          <DialogDescription>
            添加新的 IP 封禁或限流规则，支持单个 IP 或 CIDR 网段
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* IP 地址/CIDR */}
          <div className="space-y-2">
            <Label htmlFor="ipPattern">IP 地址 / CIDR 网段 *</Label>
            <Input
              id="ipPattern"
              placeholder="例如：192.168.1.100 或 2a09:bac5::3a 或 10.0.0.0/24"
              {...register('ipPattern', {
                required: 'IP 地址不能为空',
                pattern: {
                  value: /^((\d{1,3}\.){3}\d{1,3}|([0-9a-fA-F:]+))(\/([\d]{1,3}))?$/,
                  message: 'IP 地址格式不正确（支持 IPv4 和 IPv6）',
                },
              })}
            />
            {errors.ipPattern && (
              <p className="text-xs text-red-500">{errors.ipPattern.message}</p>
            )}
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
              支持 IPv4（如 192.168.1.100）、IPv6（如 2a09:bac5::3a）和 CIDR 网段（如 10.0.0.0/24）
            </p>
          </div>

          {/* 规则模式 */}
          <div className="space-y-2">
            <Label htmlFor="mode">规则模式 *</Label>
            <Select
              value={mode}
              onValueChange={(v) => {
                setMode(v as 'block' | 'throttle')
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
                        完全阻止该 IP 的所有请求 (403)
                      </div>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="throttle">
                  <div className="flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-orange-500" />
                    <div>
                      <div className="font-medium">限流 (Throttle)</div>
                      <div className="text-xs text-muted-foreground">
                        限制该 IP 的请求频率 (429)
                      </div>
                    </div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <input type="hidden" {...register('mode')} value={mode} />
          </div>

          {/* 限流配置（仅限流模式显示） */}
          {mode === 'throttle' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="limit">请求限制 *</Label>
                <Input
                  id="limit"
                  type="number"
                  min="1"
                  placeholder="10"
                  {...register('limit', {
                    required: mode === 'throttle',
                    min: { value: 1, message: '至少为 1' },
                  })}
                />
                <p className="text-xs text-muted-foreground">每个时间窗口允许的请求数</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="window">时间窗口（秒） *</Label>
                <Input
                  id="window"
                  type="number"
                  min="1"
                  placeholder="3600"
                  {...register('window', {
                    required: mode === 'throttle',
                    min: { value: 1, message: '至少为 1 秒' },
                  })}
                />
                <p className="text-xs text-muted-foreground">统计时间窗口（秒）</p>
              </div>
            </div>
          )}

          {/* 原因说明 */}
          <div className="space-y-2">
            <Label htmlFor="reason">原因说明</Label>
            <Textarea
              id="reason"
              placeholder="例如：扫描攻击、恶意爬虫、DDoS 攻击..."
              rows={3}
              {...register('reason')}
            />
            <p className="text-xs text-muted-foreground">记录封禁/限流的原因（可选）</p>
          </div>

          {/* 过期时间 */}
          <div className="space-y-2">
            <Label htmlFor="expiresInDays">有效期（天）</Label>
            <Input
              id="expiresInDays"
              type="number"
              min="1"
              max="365"
              placeholder="7"
              {...register('expiresInDays', {
                min: { value: 1, message: '至少 1 天' },
                max: { value: 365, message: '最多 365 天' },
              })}
            />
            <p className="text-xs text-muted-foreground">
              规则自动过期时间（留空则永久有效）
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
  )
}

