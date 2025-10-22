import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, LogIn, Server } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'
import { useLogin, useInitAdmin } from '@/hooks/use-auth-api'
import { useEnvironmentStore, ENVIRONMENTS } from '@/stores/environment-store'

const formSchema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z
    .string()
    .min(1, '请输入密码')
    .min(6, '密码至少 6 个字符'),
})

interface UserAuthFormProps extends React.HTMLAttributes<HTMLFormElement> {
  redirectTo?: string
}

export function UserAuthForm({
  className,
  redirectTo,
  ...props
}: UserAuthFormProps) {
  const navigate = useNavigate()
  const loginMutation = useLogin()
  const initAdminMutation = useInitAdmin()

  // 环境管理
  const { currentEnvironment, setEnvironment } = useEnvironmentStore()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  })

  function onSubmit(data: z.infer<typeof formSchema>) {
    loginMutation.mutate(data, {
      onSuccess: () => {
        toast.success(`欢迎回来，${data.username}！`)
        // 重定向到目标页面或仪表板
        const targetPath = redirectTo || '/'
        navigate({ to: targetPath, replace: true })
      },
      onError: (error) => {
        toast.error(error.message || '登录失败，请检查用户名和密码')
      },
    })
  }

  function handleInitAdmin() {
    initAdminMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success('默认管理员账号已创建：admin / admin123', {
          description: '⚠️ 登录后请立即修改密码！',
          duration: 5000,
        })
        // 自动填充表单
        form.setValue('username', 'admin')
        form.setValue('password', 'admin123')
      },
      onError: (error) => {
        toast.error(error.message || '初始化失败')
      },
    })
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-4', className)}
        {...props}
      >
        {/* 环境选择器 */}
        <div className='space-y-2'>
          <div className='flex items-center gap-2'>
            <Server className='h-4 w-4 text-primary' />
            <label className='text-sm font-medium leading-none'>
              环境
            </label>
          </div>
          <Select
            value={currentEnvironment.id}
            onValueChange={(value) => {
              const env = ENVIRONMENTS.find(e => e.id === value)
              if (env) {
                setEnvironment(env)
                toast.success(`已切换到${env.name}环境`)
              }
            }}
            disabled={loginMutation.isPending}
          >
            <SelectTrigger className='h-10'>
              <SelectValue>
                <div className='flex items-center justify-between w-full'>
                  <span>{currentEnvironment.name}</span>
                  <span className='text-xs text-muted-foreground ml-2'>
                    {currentEnvironment.id === 'local' ? '本地开发' : currentEnvironment.id === 'prod' ? '⚠️ 生产' : '测试'}
                  </span>
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ENVIRONMENTS.map((env) => (
                <SelectItem key={env.id} value={env.id}>
                  <div className='flex items-center justify-between gap-4 min-w-[250px]'>
                    <div className='flex flex-col'>
                      <span className='font-medium'>{env.name}</span>
                      <span className='text-xs text-muted-foreground'>{env.description}</span>
                    </div>
                    {env.id === 'prod' && (
                      <span className='text-xs px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded'>
                        生产
                      </span>
                    )}
                    {env.id === 'local' && (
                      <span className='text-xs px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded'>
                        本地
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <FormField
          control={form.control}
          name='username'
          render={({ field }) => (
            <FormItem>
              <FormLabel>用户名</FormLabel>
              <FormControl>
                <Input placeholder='请输入用户名' autoComplete='username' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem>
              <FormLabel>密码</FormLabel>
              <FormControl>
                <PasswordInput placeholder='请输入密码' autoComplete='current-password' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className='mt-2' disabled={loginMutation.isPending}>
          {loginMutation.isPending ? <Loader2 className='animate-spin' /> : <LogIn />}
          登录
        </Button>
        <Button
          type='button'
          variant='link'
          className='text-sm text-muted-foreground'
          onClick={handleInitAdmin}
          disabled={initAdminMutation.isPending}
        >
          {initAdminMutation.isPending ? '初始化中...' : '首次使用？初始化管理员账号'}
        </Button>
      </form>
    </Form>
  )
}
