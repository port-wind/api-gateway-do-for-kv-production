import { useState, KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { Input } from './input'
import { Badge } from './badge'
import { Button } from './button'
import { cn } from '@/lib/utils'

export interface MultiInputProps {
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  /**
   * 验证函数，返回 true 表示有效
   */
  validate?: (value: string) => boolean
  /**
   * 错误提示
   */
  errorMessage?: string
  /**
   * 是否允许重复值
   */
  allowDuplicates?: boolean
}

/**
 * MultiInput 组件
 * 用于输入多个值，例如 header 名称列表、参数列表等
 */
export function MultiInput({
  value = [],
  onChange,
  placeholder = '输入后按 Enter 添加',
  disabled = false,
  className,
  validate,
  errorMessage = '无效的输入',
  allowDuplicates = false
}: MultiInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // 按 Enter 或逗号添加值
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addValue()
    }
    // 按 Backspace 且输入框为空时，删除最后一个值
    else if (e.key === 'Backspace' && inputValue === '' && value.length > 0) {
      removeValue(value.length - 1)
    }
  }

  const addValue = () => {
    const trimmedValue = inputValue.trim()

    // 空值检查
    if (!trimmedValue) {
      return
    }

    // 重复值检查
    if (!allowDuplicates && value.includes(trimmedValue)) {
      setError('该值已存在')
      setTimeout(() => setError(null), 2000)
      return
    }

    // 自定义验证
    if (validate && !validate(trimmedValue)) {
      setError(errorMessage)
      setTimeout(() => setError(null), 2000)
      return
    }

    // 添加值
    onChange([...value, trimmedValue])
    setInputValue('')
    setError(null)
  }

  const removeValue = (index: number) => {
    const newValue = [...value]
    newValue.splice(index, 1)
    onChange(newValue)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pastedText = e.clipboardData.getData('text')

    // 支持粘贴多个值（逗号或换行符分隔）
    const values = pastedText
      .split(/[,\n]/)
      .map(v => v.trim())
      .filter(v => v !== '')

    if (values.length > 0) {
      const newValues = allowDuplicates
        ? [...value, ...values]
        : [...value, ...values.filter(v => !value.includes(v))]

      onChange(newValues)
      setInputValue('')
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* 输入框 */}
      <div className="relative">
        <Input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={addValue}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(error && 'border-red-500')}
        />
        {error && (
          <p className="text-sm text-red-500 mt-1">{error}</p>
        )}
      </div>

      {/* 值列表 */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((item, index) => (
            <Badge
              key={`${item}-${index}`}
              variant="secondary"
              className="gap-1 pr-1"
            >
              <span>{item}</span>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 hover:bg-transparent"
                  onClick={() => removeValue(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {/* 提示信息 */}
      <p className="text-xs text-muted-foreground">
        按 Enter 或逗号添加，粘贴可批量添加
      </p>
    </div>
  )
}

