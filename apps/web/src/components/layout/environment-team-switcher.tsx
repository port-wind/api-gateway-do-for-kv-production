import { ChevronsUpDown, Wifi, Globe, WifiOff, Cloud, Loader2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { useEnvironmentStore, type Environment } from '@/stores/environment-store'
import { toast } from 'sonner'
import { getEnvironmentThemeInfo } from '@/hooks/use-environment-theme'
import { useTheme } from '@/context/theme-provider'

/**
 * 环境图标组件
 */
function EnvironmentIcon({ environment }: { environment: Environment }) {
  switch (environment.id) {
    case 'local':
      return <Wifi className="h-4 w-4" />
    case 'dev':
      return <Globe className="h-4 w-4" />
    case 'prod':
      return <WifiOff className="h-4 w-4" />
    case 'workers':
      return <Cloud className="h-4 w-4" />
    default:
      return <Globe className="h-4 w-4" />
  }
}

export function EnvironmentTeamSwitcher() {
  const { isMobile } = useSidebar()
  const { resolvedTheme } = useTheme()
  const { 
    currentEnvironment, 
    environments, 
    setEnvironment, 
    isLoading,
    setLoading,
    setError
  } = useEnvironmentStore()

  const handleEnvironmentChange = async (environment: Environment) => {
    if (environment.id === currentEnvironment.id) {
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      // 模拟环境切换延迟
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // 切换环境
      setEnvironment(environment)
      
      toast.success(`已切换到 ${environment.name} 环境`, {
        description: environment.description
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '环境切换失败'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size='lg'
              className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
              disabled={isLoading}
            >
              <div className='bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg'>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <EnvironmentIcon environment={currentEnvironment} />
                )}
              </div>
              <div className='grid flex-1 text-start text-sm leading-tight'>
                <span className='truncate font-semibold'>
                  API Gateway
                </span>
                <span className='truncate text-xs'>{currentEnvironment.name}</span>
              </div>
              <ChevronsUpDown className='ms-auto' />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className='w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg'
            align='start'
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            <DropdownMenuLabel className='text-muted-foreground text-xs'>
              环境选择
            </DropdownMenuLabel>
            {environments.map((environment) => {
              const themeInfo = getEnvironmentThemeInfo(environment.id, resolvedTheme === 'dark')
              return (
                <DropdownMenuItem
                  key={environment.id}
                  onClick={() => handleEnvironmentChange(environment)}
                  className='gap-2 p-2 cursor-pointer'
                  disabled={isLoading}
                >
                  <div className='flex size-6 items-center justify-center rounded-sm border'>
                    <EnvironmentIcon environment={environment} />
                  </div>
                  <div className="flex flex-col flex-1">
                    <span className="font-medium">{environment.name}</span>
                    {environment.description && (
                      <span className="text-xs text-muted-foreground">
                        {environment.description}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* 环境主题颜色预览 */}
                    <div 
                      className="w-3 h-3 rounded-full border border-border"
                      style={{ backgroundColor: themeInfo.primary }}
                      title={`${environment.name} 主题色`}
                    />
                    {currentEnvironment.id === environment.id && (
                      <div className="w-2 h-2 bg-primary rounded-full" />
                    )}
                  </div>
                </DropdownMenuItem>
              )
            })}
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5">
              <p className="text-xs text-muted-foreground">
                当前: {currentEnvironment.baseURL}
              </p>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}