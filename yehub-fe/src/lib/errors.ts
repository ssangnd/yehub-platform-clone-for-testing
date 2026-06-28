import axios from 'axios'
import { toast } from 'sonner'

/**
 * Extract a user-facing error message from an unknown error.
 * Prefers the backend-provided `message` (string or array-of-strings, as
 * NestJS validation pipes return). Falls back to `fallback` if no backend
 * message is present.
 *
 * Use `overrideMessage` to force a specific message regardless of what the
 * backend returned (rare — reserve for cases where the backend message is
 * user-hostile or leaks detail).
 */
export function getApiErrorMessage(
  error: unknown,
  {
    fallback = 'Something went wrong. Please try again.',
    overrideMessage,
  }: { fallback?: string; overrideMessage?: string } = {},
): string {
  if (overrideMessage) return overrideMessage

  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined
    const message = Array.isArray(data?.message) ? data?.message[0] : data?.message
    if (typeof message === 'string' && message.length > 0) return message
  }

  return fallback
}

/**
 * Show an error toast using the backend-provided message by default.
 * Pass `fallback` for when the backend doesn't return a message.
 * Pass `overrideMessage` only if you deliberately want to ignore the backend.
 */
export function showApiError(error: unknown, options?: { fallback?: string; overrideMessage?: string }): void {
  toast.error(getApiErrorMessage(error, options))
}

export interface LoginErrorDetails {
  message: string
  attemptsRemaining?: number
  locked?: boolean
}

/**
 * Parse a login 401 error response and extract structured details.
 * The backend serialises UnauthorizedException bodies as:
 *   { message, attempts_remaining?, locked?, statusCode, error }
 * Returns a typed object with camelCase fields for frontend consumption.
 */
export function getLoginErrorDetails(error: unknown): LoginErrorDetails {
  const fallback: LoginErrorDetails = { message: 'Invalid email or password' }
  if (!axios.isAxiosError(error) || !error.response) return fallback

  const data = error.response.data as { message?: string; attempts_remaining?: number; locked?: boolean } | undefined

  return {
    message: data?.message ?? fallback.message,
    attemptsRemaining: data?.attempts_remaining,
    locked: data?.locked,
  }
}
