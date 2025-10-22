import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, Lock, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import { PasswordInput } from '@/components/password-input'
import { useChangePassword } from '@/hooks/use-auth-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/stores/auth-store'

const changePasswordSchema = z.object({
    oldPassword: z
        .string()
        .min(1, '请输入当前密码'),
    newPassword: z
        .string()
        .min(6, '新密码至少 6 个字符')
        .max(50, '新密码不能超过 50 个字符'),
    confirmPassword: z
        .string()
        .min(1, '请确认新密码'),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
})

type ChangePasswordValues = z.infer<typeof changePasswordSchema>

export function ChangePasswordForm() {
    const navigate = useNavigate()
    const { auth } = useAuthStore()
    const changePasswordMutation = useChangePassword()

    const form = useForm<ChangePasswordValues>({
        resolver: zodResolver(changePasswordSchema),
        defaultValues: {
            oldPassword: '',
            newPassword: '',
            confirmPassword: '',
        },
    })

    function onSubmit(data: ChangePasswordValues) {
        changePasswordMutation.mutate(
            {
                oldPassword: data.oldPassword,
                newPassword: data.newPassword,
            },
            {
                onSuccess: () => {
                    toast.success('密码修改成功', {
                        description: '请使用新密码重新登录',
                        icon: <CheckCircle2 className="h-5 w-5" />,
                    })
                    // 清空表单
                    form.reset()
                    // 跳转到登录页
                    setTimeout(() => {
                        navigate({ to: '/sign-in' })
                    }, 1500)
                },
                onError: (error) => {
                    toast.error('修改密码失败', {
                        description: error.message || '请检查当前密码是否正确',
                    })
                },
            }
        )
    }

    return (
        <div className="space-y-6">
            {/* 当前用户信息 */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Lock className="h-5 w-5" />
                        当前账户
                    </CardTitle>
                    <CardDescription>
                        你正在为以下账户修改密码
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                            <span className="text-lg font-semibold text-primary">
                                {auth.user?.username?.charAt(0).toUpperCase() || 'U'}
                            </span>
                        </div>
                        <div>
                            <p className="font-medium">{auth.user?.username || '未知用户'}</p>
                            <p className="text-sm text-muted-foreground">
                                {auth.user?.role === 'admin' ? '管理员' : '用户'}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* 修改密码表单 */}
            <Card>
                <CardHeader>
                    <CardTitle>修改密码</CardTitle>
                    <CardDescription>
                        为了保护账户安全，请设置一个强密码
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <FormField
                                control={form.control}
                                name="oldPassword"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>当前密码</FormLabel>
                                        <FormControl>
                                            <PasswordInput
                                                placeholder="请输入当前密码"
                                                autoComplete="current-password"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            请输入你当前使用的密码
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="newPassword"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>新密码</FormLabel>
                                        <FormControl>
                                            <PasswordInput
                                                placeholder="请输入新密码（至少 6 个字符）"
                                                autoComplete="new-password"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            新密码长度至少为 6 个字符，建议使用字母、数字和特殊字符的组合
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="confirmPassword"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>确认新密码</FormLabel>
                                        <FormControl>
                                            <PasswordInput
                                                placeholder="请再次输入新密码"
                                                autoComplete="new-password"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            请再次输入新密码以确认
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="flex gap-4">
                                <Button
                                    type="submit"
                                    disabled={changePasswordMutation.isPending}
                                    className="min-w-32"
                                >
                                    {changePasswordMutation.isPending ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            修改中...
                                        </>
                                    ) : (
                                        <>
                                            <Lock className="mr-2 h-4 w-4" />
                                            修改密码
                                        </>
                                    )}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => form.reset()}
                                    disabled={changePasswordMutation.isPending}
                                >
                                    重置
                                </Button>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>

            {/* 安全提示 */}
            <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950">
                <CardContent className="pt-6">
                    <div className="flex gap-3">
                        <div className="text-yellow-600 dark:text-yellow-500">
                            <Lock className="h-5 w-5" />
                        </div>
                        <div className="flex-1 space-y-1">
                            <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                                安全提示
                            </p>
                            <ul className="text-sm text-yellow-800 dark:text-yellow-200 space-y-1 list-disc list-inside">
                                <li>修改密码后需要重新登录</li>
                                <li>建议定期更换密码以保护账户安全</li>
                                <li>不要使用过于简单或容易被猜到的密码</li>
                                <li>不要与他人分享你的密码</li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

