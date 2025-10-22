import { useEffect } from 'react'
import { useEnvironmentStore } from '@/stores/environment-store'
import { useTheme } from '@/context/theme-provider'

/**
 * Hook 用于管理环境特定的主题
 * 自动应用环境主题类到 document 根元素
 */
export function useEnvironmentTheme() {
  const { currentEnvironment } = useEnvironmentStore()
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const root = document.documentElement
    
    // 移除所有环境主题类
    root.classList.remove('env-local', 'env-dev', 'env-prod', 'env-workers')
    
    // 应用当前环境的主题类
    const envClass = `env-${currentEnvironment.id}`
    root.classList.add(envClass)
    
    // 清理函数
    return () => {
      root.classList.remove('env-local', 'env-dev', 'env-prod', 'env-workers')
    }
  }, [currentEnvironment.id, resolvedTheme])

  // 返回当前环境的主题信息
  return {
    environmentId: currentEnvironment.id,
    environmentName: currentEnvironment.name,
    themeClass: `env-${currentEnvironment.id}`,
    getEnvironmentColor: () => {
      // 根据环境返回对应的颜色，用于预览等场景
      switch (currentEnvironment.id) {
        case 'local':
          return resolvedTheme === 'dark' ? '#7dd3fc' : '#0284c7' // Blue
        case 'dev':
          return resolvedTheme === 'dark' ? '#6ee7b7' : '#059669' // Green
        case 'prod':
          return resolvedTheme === 'dark' ? '#fbbf24' : '#ea580c' // Orange/Red
        case 'workers':
          return resolvedTheme === 'dark' ? '#c084fc' : '#7c3aed' // Purple
        default:
          return resolvedTheme === 'dark' ? '#94a3b8' : '#475569' // Default gray
      }
    }
  }
}

/**
 * 获取环境对应的颜色信息
 */
export function getEnvironmentThemeInfo(environmentId: string, isDark: boolean = false) {
  const colors = {
    local: {
      light: { primary: '#0284c7', accent: '#0891b2' },
      dark: { primary: '#7dd3fc', accent: '#67e8f9' }
    },
    dev: {
      light: { primary: '#059669', accent: '#10b981' },
      dark: { primary: '#6ee7b7', accent: '#34d399' }
    },
    prod: {
      light: { primary: '#ea580c', accent: '#f97316' },
      dark: { primary: '#fbbf24', accent: '#fb923c' }
    },
    workers: {
      light: { primary: '#7c3aed', accent: '#8b5cf6' },
      dark: { primary: '#c084fc', accent: '#a78bfa' }
    }
  }

  const envColors = colors[environmentId as keyof typeof colors]
  if (!envColors) {
    return { primary: '#475569', accent: '#64748b' }
  }

  return isDark ? envColors.dark : envColors.light
}