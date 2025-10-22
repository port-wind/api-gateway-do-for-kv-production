import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useLogout } from '@/hooks/use-auth-api'
import { ConfirmDialog } from '@/components/confirm-dialog'

interface SignOutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SignOutDialog({ open, onOpenChange }: SignOutDialogProps) {
  const navigate = useNavigate()
  const logoutMutation = useLogout()

  const handleSignOut = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success('已成功退出登录')
        onOpenChange(false)
        // 跳转到登录页（useLogout 内部会处理）
      },
      onError: () => {
        toast.error('退出登录失败')
        // 即使失败也关闭对话框并跳转
        onOpenChange(false)
        navigate({ to: '/sign-in', replace: true })
      },
    })
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title='退出登录'
      desc='确定要退出登录吗？退出后需要重新登录才能访问管理后台。'
      confirmText='退出登录'
      handleConfirm={handleSignOut}
      className='sm:max-w-sm'
    />
  )
}
