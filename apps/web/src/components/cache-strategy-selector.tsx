import { type CacheKeyStrategy } from '@/types/api'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Card } from '@/components/ui/card'
import { Database, FileText, User, Users } from 'lucide-react'

export interface CacheStrategySelectorProps {
  value: CacheKeyStrategy
  onChange: (value: CacheKeyStrategy) => void
  disabled?: boolean
}

interface StrategyOption {
  value: CacheKeyStrategy
  label: string
  description: string
  icon: React.ReactNode
  useCase: string
}

const strategyOptions: StrategyOption[] = [
  {
    value: 'path-only',
    label: '仅路径',
    description: '所有用户共享同一个缓存',
    icon: <FileText className="h-5 w-5" />,
    useCase: '适用于：静态内容、公共资源'
  },
  {
    value: 'path-params',
    label: '路径 + 参数',
    description: '根据查询参数区分缓存',
    icon: <Database className="h-5 w-5" />,
    useCase: '适用于：列表查询、分页数据'
  },
  {
    value: 'path-headers',
    label: '路径 + Headers',
    description: '根据指定 headers（如 token、cid）区分缓存',
    icon: <User className="h-5 w-5" />,
    useCase: '适用于：用户个人数据、需要身份验证的接口（需配置 header 列表）'
  },
  {
    value: 'path-params-headers',
    label: '路径 + 参数 + Headers',
    description: '同时使用参数和 headers 区分缓存（最精细）',
    icon: <Users className="h-5 w-5" />,
    useCase: '适用于：用户订单查询、个性化列表（需配置 header 列表）'
  }
]

/**
 * 缓存策略选择器组件
 */
export function CacheStrategySelector({ value, onChange, disabled = false }: CacheStrategySelectorProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-base font-medium">缓存键生成策略</Label>
        <p className="text-sm text-muted-foreground mt-1">
          选择如何生成缓存键，不同策略适用于不同场景
        </p>
      </div>

      <RadioGroup
        value={value}
        onValueChange={onChange as (value: string) => void}
        disabled={disabled}
        className="grid gap-4"
      >
        {strategyOptions.map((option) => (
          <Card
            key={option.value}
            className={`relative cursor-pointer transition-all ${value === option.value
              ? 'border-primary ring-2 ring-primary ring-offset-2'
              : 'hover:border-muted-foreground/50'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <label
              htmlFor={option.value}
              className="flex items-start gap-4 p-4 cursor-pointer"
            >
              <RadioGroupItem
                value={option.value}
                id={option.value}
                className="mt-1"
                disabled={disabled}
              />

              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="text-primary">{option.icon}</div>
                  <h3 className="font-semibold text-base">{option.label}</h3>
                </div>

                <p className="text-sm text-muted-foreground">
                  {option.description}
                </p>

                <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded inline-block">
                  {option.useCase}
                </div>
              </div>
            </label>
          </Card>
        ))}
      </RadioGroup>

      {/* 策略说明 */}
      <div className="text-sm text-muted-foreground space-y-2 mt-4 p-4 bg-muted/50 rounded-lg">
        <p className="font-medium">💡 策略选择建议：</p>
        <ul className="space-y-1 ml-4 list-disc">
          <li><strong>path-only</strong>: 性能最优，但所有用户看到相同内容</li>
          <li><strong>path-params</strong>: 默认策略，适合大多数场景</li>
          <li><strong>path-headers</strong>: 实现用户隔离，<strong className="text-amber-600">需手动选择 headers</strong>（如 authorization）</li>
          <li><strong>path-params-headers</strong>: 最精细控制，<strong className="text-amber-600">需配置 headers</strong>，缓存占用最多</li>
        </ul>
      </div>
    </div>
  )
}

