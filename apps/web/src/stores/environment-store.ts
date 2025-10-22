import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * 环境配置类型
 */
export interface Environment {
  id: string
  name: string
  baseURL: string
  description?: string
}

/**
 * 预定义的环境配置
 * 注意：数组顺序不影响默认环境，默认始终为 local
 */
export const ENVIRONMENTS: Environment[] = [
  {
    id: 'local',
    name: '本地',
    baseURL: 'http://localhost:8787',
    description: '本地开发环境'
  },
  {
    id: 'test',
    name: '测试',
    baseURL: 'https://api-proxy.pwtk.cc',
    description: '测试环境'
  },
  {
    id: 'dev',
    name: '开发',
    baseURL: 'https://api-gateway-do-for-kv-dev.andy-zhan.workers.dev',
    description: 'Cloudflare Workers 开发环境'
  },
  {
    id: 'prod',
    name: '生产',
    baseURL: 'https://api-proxy.bugacard.com',
    description: '生产环境（域名代理）'
  },
  {
    id: 'workers-prod',
    name: 'Workers 生产',
    baseURL: 'https://api-gateway-do-for-kv-prod.andy-zhan.workers.dev',
    description: 'Cloudflare Workers 生产环境（直连）'
  }
]

/**
 * 环境状态接口
 */
interface EnvironmentState {
  currentEnvironment: Environment
  environments: Environment[]
  isLoading: boolean
  error: string | null
}

/**
 * 环境操作接口
 */
interface EnvironmentActions {
  setEnvironment: (environment: Environment) => void
  getEnvironmentById: (id: string) => Environment | undefined
  resetEnvironment: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

/**
 * 环境管理 Store
 */
export const useEnvironmentStore = create<EnvironmentState & EnvironmentActions>()(
  persist(
    (set, get) => ({
      // 状态
      currentEnvironment: ENVIRONMENTS.find(env => env.id === 'local') || ENVIRONMENTS[0], // 默认本地环境
      environments: ENVIRONMENTS,
      isLoading: false,
      error: null,

      // 操作
      setEnvironment: (environment: Environment) => {
        set({
          currentEnvironment: environment,
          error: null
        })
      },

      getEnvironmentById: (id: string) => {
        return get().environments.find(env => env.id === id)
      },

      resetEnvironment: () => {
        set({
          currentEnvironment: ENVIRONMENTS.find(env => env.id === 'local') || ENVIRONMENTS[0],
          error: null
        })
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading })
      },

      setError: (error: string | null) => {
        set({ error })
      }
    }),
    {
      name: 'environment-storage',
      // 只持久化当前环境ID，避免配置变更时的冲突
      partialize: (state) => ({
        currentEnvironmentId: state.currentEnvironment.id
      }),
      // 从存储恢复时重建完整环境对象
      onRehydrateStorage: () => (state) => {
        if (state) {
          const storedData = state as unknown as { currentEnvironmentId?: string }
          const storedId = storedData.currentEnvironmentId
          if (storedId) {
            const environment = ENVIRONMENTS.find(env => env.id === storedId)
            if (environment) {
              state.currentEnvironment = environment
            }
          }
          // 确保environments数组始终是最新的
          state.environments = ENVIRONMENTS
        }
      }
    }
  )
)

/**
 * Hook：获取当前环境的基础URL
 */
export const useCurrentBaseURL = () => {
  return useEnvironmentStore(state => state.currentEnvironment.baseURL)
}

/**
 * Hook：检查是否为本地环境
 */
export const useIsLocalEnvironment = () => {
  return useEnvironmentStore(state => state.currentEnvironment.id === 'local')
}

/**
 * Hook：检查是否为生产环境
 */
export const useIsProductionEnvironment = () => {
  return useEnvironmentStore(state => state.currentEnvironment.id === 'prod')
}