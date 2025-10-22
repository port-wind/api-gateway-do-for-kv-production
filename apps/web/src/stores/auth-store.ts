import { create } from 'zustand'

const ACCESS_TOKEN = 'auth_token'
const REFRESH_TOKEN = 'refresh_token'
const AUTH_USER = 'auth_user'

interface AuthUser {
  username: string
  role: string
  createdAt: string
  // 为了兼容旧的路由守卫，添加 exp 字段（永不过期）
  exp: number
}

interface AuthState {
  auth: {
    user: AuthUser | null
    setUser: (user: AuthUser | null) => void
    accessToken: string
    refreshToken: string
    setTokens: (accessToken: string, refreshToken: string, user?: AuthUser) => void
    setAccessToken: (accessToken: string, user?: AuthUser) => void
    resetAccessToken: () => void
    reset: () => void
  }
}

export const useAuthStore = create<AuthState>()((set) => {
  // 从 localStorage 读取初始状态
  const initAccessToken = localStorage.getItem(ACCESS_TOKEN) || ''
  const initRefreshToken = localStorage.getItem(REFRESH_TOKEN) || ''
  const initUserStr = localStorage.getItem(AUTH_USER)
  let initUser: AuthUser | null = null

  if (initUserStr) {
    try {
      const user = JSON.parse(initUserStr)
      // 添加一个超长的过期时间（10年后），实际过期由后端 token 控制
      initUser = { ...user, exp: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000 }
    } catch {
      // 解析失败，initUser 保持 null
    }
  }

  return {
    auth: {
      user: initUser,
      accessToken: initAccessToken,
      refreshToken: initRefreshToken,
      setUser: (user) =>
        set((state) => {
          if (user) {
            localStorage.setItem(AUTH_USER, JSON.stringify(user))
          } else {
            localStorage.removeItem(AUTH_USER)
          }
          return { ...state, auth: { ...state.auth, user } }
        }),
      setTokens: (accessToken, refreshToken, user) =>
        set((state) => {
          localStorage.setItem(ACCESS_TOKEN, accessToken)
          localStorage.setItem(REFRESH_TOKEN, refreshToken)
          if (user) {
            // 添加一个超长的过期时间，实际过期由后端 token 控制
            const userWithExp = { ...user, exp: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000 }
            localStorage.setItem(AUTH_USER, JSON.stringify(userWithExp))
            return { ...state, auth: { ...state.auth, accessToken, refreshToken, user: userWithExp } }
          }
          return { ...state, auth: { ...state.auth, accessToken, refreshToken } }
        }),
      setAccessToken: (accessToken, user) =>
        set((state) => {
          localStorage.setItem(ACCESS_TOKEN, accessToken)
          if (user) {
            const userWithExp = { ...user, exp: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000 }
            localStorage.setItem(AUTH_USER, JSON.stringify(userWithExp))
            return { ...state, auth: { ...state.auth, accessToken, user: userWithExp } }
          }
          return { ...state, auth: { ...state.auth, accessToken } }
        }),
      resetAccessToken: () =>
        set((state) => {
          localStorage.removeItem(ACCESS_TOKEN)
          return { ...state, auth: { ...state.auth, accessToken: '' } }
        }),
      reset: () =>
        set((state) => {
          localStorage.removeItem(ACCESS_TOKEN)
          localStorage.removeItem(REFRESH_TOKEN)
          localStorage.removeItem(AUTH_USER)
          return {
            ...state,
            auth: { ...state.auth, user: null, accessToken: '', refreshToken: '' },
          }
        }),
    },
  }
})
