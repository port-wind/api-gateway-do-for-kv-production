import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
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
import { useUpdateIpMonitorConfig } from '@/hooks/use-ip-monitor-api'
import { Info } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

interface ConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentConfig?: {
    retentionDays: number
    alerts?: {
      webhookUrl?: string
      cooldownMinutes?: number
      globalRps?: { enabled: boolean; threshold: number }
      ipSpike?: { enabled: boolean; threshold: number }
    }
  }
}

interface ConfigFormData {
  retentionDays: number
  alerts: {
    webhookUrl: string
    cooldownMinutes: number
    globalRps: {
      enabled: boolean
      threshold: number
    }
    ipSpike: {
      enabled: boolean
      threshold: number
    }
  }
}

export function ConfigDialog({ open, onOpenChange, currentConfig }: ConfigDialogProps) {
  const { mutate: updateConfig, isPending } = useUpdateIpMonitorConfig()
  const { register, handleSubmit, control, reset, watch, formState: { errors } } = useForm<ConfigFormData>({
    defaultValues: {
      retentionDays: currentConfig?.retentionDays || 7,
      alerts: {
        webhookUrl: currentConfig?.alerts?.webhookUrl || '',
        cooldownMinutes: currentConfig?.alerts?.cooldownMinutes || 10,
        globalRps: {
          enabled: currentConfig?.alerts?.globalRps?.enabled ?? false,
          threshold: currentConfig?.alerts?.globalRps?.threshold ?? 0,
        },
        ipSpike: {
          enabled: currentConfig?.alerts?.ipSpike?.enabled ?? false,
          threshold: currentConfig?.alerts?.ipSpike?.threshold ?? 0,
        },
      },
    },
  })

  useEffect(() => {
    if (currentConfig) {
      reset({
        retentionDays: currentConfig.retentionDays || 7,
        alerts: {
          webhookUrl: currentConfig.alerts?.webhookUrl || '',
          cooldownMinutes: currentConfig.alerts?.cooldownMinutes || 10,
          globalRps: {
            enabled: currentConfig.alerts?.globalRps?.enabled ?? false,
            threshold: currentConfig.alerts?.globalRps?.threshold ?? 0,
          },
          ipSpike: {
            enabled: currentConfig.alerts?.ipSpike?.enabled ?? false,
            threshold: currentConfig.alerts?.ipSpike?.threshold ?? 0,
          },
        },
      })
    }
  }, [currentConfig, reset])

  const onSubmit = (data: ConfigFormData) => {
    updateConfig(
      {
        retentionDays: data.retentionDays,
        alerts: {
          webhookUrl: data.alerts.webhookUrl?.trim() || '',
          cooldownMinutes: data.alerts.cooldownMinutes,
          globalRps: data.alerts.globalRps,
          ipSpike: data.alerts.ipSpike,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false)
        },
      }
    )
  }

  const watchedAlerts = watch('alerts')
  const alerts = watchedAlerts ?? {
    webhookUrl: '',
    cooldownMinutes: 10,
    globalRps: { enabled: false, threshold: 0 },
    ipSpike: { enabled: false, threshold: 0 },
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl sm:max-w-2xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>IP 监控配置</DialogTitle>
          <DialogDescription>
            配置 IP 访问数据的保留策略和存储设置
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* 数据保留天数 */}
          <div className="space-y-2">
            <Label htmlFor="retentionDays">数据保留天数 *</Label>
            <Input
              id="retentionDays"
              type="number"
              min="1"
              max="30"
              placeholder="7"
              {...register('retentionDays', {
                required: '保留天数不能为空',
                min: { value: 1, message: '至少保留 1 天' },
                max: { value: 30, message: '最多保留 30 天' },
                valueAsNumber: true,
              })}
            />
            {errors.retentionDays && (
              <p className="text-xs text-red-500">{errors.retentionDays.message}</p>
            )}
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
              超过此天数的 IP 访问数据将自动清理（默认 7 天）
            </p>
          </div>

          <div className="space-y-4 border rounded-md p-4">
            <div>
              <h3 className="text-sm font-medium">告警通知</h3>
              <p className="text-xs text-muted-foreground mt-1">
                配置全站流量与单 IP 异常的告警阈值，并通过 Lark Webhook 接收通知
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhookUrl">Lark Webhook URL</Label>
              <Input
                id="webhookUrl"
                placeholder="https://open.larksuite.com/open-apis/bot/v2/hook/..."
                {...register('alerts.webhookUrl')}
              />
              <p className="text-xs text-muted-foreground">
                dev/测试环境填写：{'\u00A0'}
                <span className="font-mono">
                  https://open.larksuite.com/open-apis/bot/v2/hook/675ace5d-f9ef-432c-b039-ed41f3dc3cee
                </span>
                <br />
                生产环境填写：{'\u00A0'}
                <span className="font-mono">
                  https://open.larksuite.com/open-apis/bot/v2/hook/6aaed4eb-368e-436c-9ab1-b18094be2f09
                </span>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cooldownMinutes">告警冷却时间（分钟）</Label>
              <Input
                id="cooldownMinutes"
                type="number"
                min={1}
                max={60}
                {...register('alerts.cooldownMinutes', {
                  valueAsNumber: true,
                  min: { value: 1, message: '至少 1 分钟' },
                  max: { value: 60, message: '最多 60 分钟' },
                })}
              />
              <p className="text-xs text-muted-foreground">
                相同类型告警的最小间隔时间，避免重复通知
              </p>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">全站 RPS 阈值</Label>
                  <p className="text-xs text-muted-foreground">
                    当前每秒请求数超过该阈值时触发告警
                  </p>
                </div>
                <Controller
                  control={control}
                  name="alerts.globalRps.enabled"
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} disabled={isPending} />
                  )}
                />
              </div>
              <Input
                type="number"
                min={0}
                step={10}
                {...register('alerts.globalRps.threshold', {
                  valueAsNumber: true,
                  min: { value: 0, message: '阈值不可为负数' },
                })}
                disabled={!alerts.globalRps.enabled || isPending}
              />
              <p className={cn('text-xs', alerts.globalRps.enabled ? 'text-muted-foreground' : 'text-muted-foreground/70')}>
                建议根据业务峰值设置，例如 500 表示 500 RPS
              </p>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">单 IP 请求阈值</Label>
                  <p className="text-xs text-muted-foreground">
                    某个 IP 当日累计请求数超过该值时触发告警
                  </p>
                </div>
                <Controller
                  control={control}
                  name="alerts.ipSpike.enabled"
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} disabled={isPending} />
                  )}
                />
              </div>
              <Input
                type="number"
                min={0}
                step={100}
                {...register('alerts.ipSpike.threshold', {
                  valueAsNumber: true,
                  min: { value: 0, message: '阈值不可为负数' },
                })}
                disabled={!alerts.ipSpike.enabled || isPending}
              />
              <p className={cn('text-xs', alerts.ipSpike.enabled ? 'text-muted-foreground' : 'text-muted-foreground/70')}>
                例如设置为 2000，当日超过 2000 次请求的 IP 会触发告警
              </p>
            </div>
          </div>

          {/* 当前配置信息 */}
          {currentConfig && (
            <div className="bg-muted/50 border rounded-md p-3 space-y-1.5">
              <h4 className="text-sm font-medium">当前配置</h4>
              <div className="text-xs space-y-1 text-muted-foreground">
                <div>数据保留天数：{currentConfig.retentionDays} 天</div>
                <div>
                  全站 RPS 阈值：{currentConfig.alerts?.globalRps?.enabled
                    ? `${currentConfig.alerts.globalRps.threshold} RPS`
                    : '未启用'}
                </div>
                <div>
                  单 IP 阈值：{currentConfig.alerts?.ipSpike?.enabled
                    ? `${currentConfig.alerts.ipSpike.threshold} 次/天`
                    : '未启用'}
                </div>
                <div>
                  自动清理时间：每日凌晨 2:00（UTC）
                </div>
                <div>
                  数据存储位置：Cloudflare D1 数据库
                </div>
              </div>
            </div>
          )}

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
              {isPending ? '保存中...' : '保存配置'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
