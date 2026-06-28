import { useState, useCallback, type ReactNode } from 'react'
import { AuthContext, type AuthContextType } from '@/hooks/useAuth'
import type { User } from '@/types/auth'

const STORAGE_KEY = 'auth_token'
const USER_KEY = 'auth_user'

function getStoredAuth(): { user: User | null; token: string | null } {
  try {
    const token = localStorage.getItem(STORAGE_KEY)
    const userStr = localStorage.getItem(USER_KEY)
    const user = userStr ? JSON.parse(userStr) : null
    // Clear stale user data from before globalRole migration
    if (user && !('globalRole' in user)) {
      localStorage.removeItem(USER_KEY)
      localStorage.removeItem(STORAGE_KEY)
      return { token: null, user: null }
    }
    return { token, user }
  } catch {
    return { token: null, user: null }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<{ user: User | null; token: string | null }>(() => getStoredAuth())

  const login = useCallback(async (email: string, _password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: _password }),
    })

    if (!response.ok) {
      throw new Error('Invalid credentials')
    }

    const data = await response.json()
    localStorage.setItem(STORAGE_KEY, data.token)
    localStorage.setItem(USER_KEY, JSON.stringify(data.user))
    setAuthState({ user: data.user, token: data.token })
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(USER_KEY)
    setAuthState({ user: null, token: null })
  }, [])

  const value: AuthContextType = {
    user: authState.user,
    token: authState.token,
    isAuthenticated: !!authState.token,
    login,
    logout,
  }

  return <AuthContext value={value}>{children}</AuthContext>
}
