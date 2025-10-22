import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { useCreateProxyRoute } from '@/hooks/use-proxy-route-api'

const formSchema = z.object({
  pattern: z.string()
    .min(1, '路径模式不能为空')
    .regex(/^\//, '路径模式必须以 / 开头'),
  target: z.string()
    .url('请输入有效的目标地址'),
  stripPrefix: z.boolean().default(false),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
  rateLimitEnabled: z.boolean().optional(),
  rateLimit: z.number().int().min(1).optional(),
  geoEnabled: z.boolean().optional(),
})

type FormData = z.infer<typeof formSchema>

interface AddProxyRouteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddProxyRouteDialog({
  open,
  onOpenChange,
}: AddProxyRouteDialogProps) {
  const createRoute = useCreateProxyRoute()

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      pattern: '',
      target: '',
      stripPrefix: false,
      enabled: true,
      priority: 0,
      rateLimitEnabled: false,
      geoEnabled: false,
    },
  })

  const onSubmit = async (data: FormData) => {
    try {
      await createRoute.mutateAsync(data)
      form.reset()
      onOpenChange(false)
    } catch (_error) {
      // 错误已经在 hook 中处理了
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-4xl sm:max-w-4xl h-[90vh] overflow-hidden flex flex-col" showCloseButton={false}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>添加代理路由</DialogTitle>
          <DialogDescription>
            创建新的代理路由转发规则
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-6 pr-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="pattern"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>路径模式</FormLabel>
                    <FormControl>
                      <Input placeholder="/api/v1/*" {...field} />
                    </FormControl>
                    <FormDescription>
                      请求匹配的路径模式，如 /api/* 或 /kv/*（支持通配符）
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="target"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>目标地址</FormLabel>
                    <FormControl>
                      <Input placeholder="https://api.example.com" {...field} />
                    </FormControl>
                    <FormDescription>
                      代理转发的目标地址
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>优先级</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormDescription>
                      数值越小优先级越高，默认为 0
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rateLimit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>限流值（可选）</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        placeholder="100"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormDescription>
                      每分钟最大请求数
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4">
              <FormField
                control={form.control}
                name="stripPrefix"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        移除路径前缀
                      </FormLabel>
                      <FormDescription>
                        转发时是否移除匹配的路径前缀
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        启用路由
                      </FormLabel>
                      <FormDescription>
                        是否立即启用此代理路由
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />


              <FormField
                control={form.control}
                name="rateLimitEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        启用限流
                      </FormLabel>
                      <FormDescription>
                        为此路由启用请求限流保护
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value || false}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="geoEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        启用地域限制
                      </FormLabel>
                      <FormDescription>
                        为此路由启用基于地理位置的访问控制
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value || false}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>

        <div className="flex justify-end space-x-2 pt-4 mt-4 border-t flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            取消
          </Button>
          <Button
            onClick={form.handleSubmit(onSubmit)}
            disabled={createRoute.isPending}
          >
            {createRoute.isPending ? '创建中...' : '创建路由'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}