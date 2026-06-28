import axios, { type InternalAxiosRequestConfig } from 'axios'
import { toast } from 'sonner'
import { env } from '@/env'
import { useAuthStore } from '@/store/auth.store'

function forceLogout() {
  toast.error('Your session has expired. Please log in again.')
  useAuthStore.getState().clearAuth()
  window.location.href = '/login'
}

let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => {
    if (error) {
      p.reject(error)
    } else {
      p.resolve(token!)
    }
  })
  failedQueue = []
}

export const apiClient = axios.create({
  baseURL: env.API_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach access token to every request
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// On 401: try refresh, then retry; on failure clear auth and redirect
apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error)

    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean
    }

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error)
    }

    // Don't attempt refresh on the refresh-token or login endpoints themselves
    const url = originalRequest.url ?? ''
    if (url.includes('/auth/refresh-token') || url.includes('/auth/login') || url.includes('/auth/register')) {
      return Promise.reject(error)
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      })
        .then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return apiClient(originalRequest)
        })
        .catch((err) => Promise.reject(err))
    }

    originalRequest._retry = true
    isRefreshing = true

    const refreshToken = useAuthStore.getState().refreshToken

    if (!refreshToken) {
      isRefreshing = false
      forceLogout()
      return Promise.reject(error)
    }

    try {
      const { data } = await axios.post<{ access_token: string }>(`${env.API_URL}/auth/refresh-token`, {
        refresh_token: refreshToken,
      })
      const newToken = data.access_token
      useAuthStore.getState().setAccessToken(newToken)
      processQueue(null, newToken)
      originalRequest.headers.Authorization = `Bearer ${newToken}`
      return apiClient(originalRequest)
    } catch (refreshError) {
      processQueue(refreshError, null)
      forceLogout()
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  },
)
