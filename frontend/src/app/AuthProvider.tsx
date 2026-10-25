import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { tokenStore, UNAUTHORIZED_EVENT } from '@/lib/token'
import type { AuthResponse, User } from '@/lib/types'

interface AuthContextValue {
  user: User | null
  token: string | null
  loading: boolean
  bootError: string | null
  login: (email: string, password: string) => Promise<User>
  register: (payload: {
    email: string
    password: string
    display_name: string
    accept_terms: boolean
  }) => Promise<User>
  logout: () => void
  refreshUser: () => Promise<User | null>
  updateUser: (user: User) => void
  retryBoot: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setTokenState] = useState<string | null>(() => tokenStore.get())
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [bootError, setBootError] = useState<string | null>(null)
  const [bootNonce, setBootNonce] = useState(0)

  const applyAuth = useCallback((response: AuthResponse) => {
    tokenStore.set(response.access_token)
    setTokenState(response.access_token)
    setUser(response.user)
    setBootError(null)
  }, [])

  const logout = useCallback(() => {
    tokenStore.clear()
    setTokenState(null)
    setUser(null)
    queryClient.clear()
  }, [queryClient])

  useEffect(() => {
    const onUnauthorized = () => {
      setTokenState(null)
      setUser(null)
      queryClient.clear()
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [queryClient])

  useEffect(() => {
    let cancelled = false
    const existing = tokenStore.get()
    if (!existing) {
      setLoading(false)
      setUser(null)
      setBootError(null)
      return
    }
    setLoading(true)
    api.auth
      .me()
      .then((response) => {
        if (cancelled) return
        setTokenState(response.access_token)
        setUser(response.user)
        setBootError(null)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 401) {
          tokenStore.clear()
          setTokenState(null)
          setUser(null)
        } else {
          setBootError(error instanceof Error ? error.message : 'Couldn’t restore your session')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [bootNonce])

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await api.auth.login({ email, password })
      applyAuth(response)
      return response.user
    },
    [applyAuth],
  )

  const register = useCallback(
    async (payload: {
      email: string
      password: string
      display_name: string
      accept_terms: boolean
    }) => {
      const response = await api.auth.register(payload)
      applyAuth(response)
      return response.user
    },
    [applyAuth],
  )

  const refreshUser = useCallback(async () => {
    if (!tokenStore.get()) return null
    const fresh = await api.users.me()
    setUser(fresh)
    return fresh
  }, [])

  const updateUser = useCallback((fresh: User) => {
    setUser(fresh)
  }, [])

  const retryBoot = useCallback(() => {
    setBootNonce((value) => value + 1)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      bootError,
      login,
      register,
      logout,
      refreshUser,
      updateUser,
      retryBoot,
    }),
    [
      user,
      token,
      loading,
      bootError,
      login,
      register,
      logout,
      refreshUser,
      updateUser,
      retryBoot,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
