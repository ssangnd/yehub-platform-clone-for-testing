import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GlobalRole } from '../api/auth'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: GlobalRole
  avatar?: string
}

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: AuthUser | null
  setTokens: (accessToken: string, refreshToken: string) => void
  setAccessToken: (accessToken: string) => void
  setUser: (user: AuthUser) => void
  clearAuth: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setUser: (user) => set({ user }),
      clearAuth: () => set({ accessToken: null, refreshToken: null, user: null }),
      isAuthenticated: () => !!get().accessToken,
    }),
    {
      name: 'yehub-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    },
  ),
)

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === 'yehub-auth') {
      try {
        const newState = e.newValue ? JSON.parse(e.newValue) : null
        const hasToken = newState?.state?.accessToken
        if (!hasToken) {
          useAuthStore.getState().clearAuth()
          window.location.href = '/login'
        }
      } catch {
        useAuthStore.getState().clearAuth()
        window.location.href = '/login'
      }
    }
  })
}
