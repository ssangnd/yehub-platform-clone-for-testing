import { useEffect } from 'react'
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/constants/routes'
import NotFoundPage from '@/pages/NotFoundPage'

const CHUNK_RELOAD_FLAG = 'yehub:chunk-reload-attempted'

function isChunkLoadError(error: unknown): boolean {
  if (!error) return false
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  if (!message) return false
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('error loading dynamically imported module') ||
    /Loading chunk [\w-]+ failed/i.test(message)
  )
}

function getErrorMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Unknown error'
}

export function RouteErrorBoundary() {
  const error = useRouteError()
  const navigate = useNavigate()
  const chunkError = isChunkLoadError(error)

  useEffect(() => {
    if (!chunkError) return
    if (typeof window === 'undefined') return
    const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_FLAG) === '1'
    if (alreadyReloaded) return
    sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1')
    window.location.reload()
  }, [chunkError])

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />
  }

  if (chunkError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-6">
          <RefreshCw className="h-16 w-16 text-muted-foreground mx-auto animate-spin" />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Updating to the latest version…</h1>
            <p className="text-sm text-muted-foreground max-w-md">
              A new version of the app is available. Reloading to pick it up.
            </p>
          </div>
          <Button
            className="cursor-pointer"
            onClick={() => {
              sessionStorage.removeItem(CHUNK_RELOAD_FLAG)
              window.location.reload()
            }}
          >
            Reload now
          </Button>
        </div>
      </div>
    )
  }

  const message = getErrorMessage(error)
  const isDev = import.meta.env.DEV

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-6 max-w-lg">
        <AlertTriangle className="h-16 w-16 text-destructive mx-auto" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred. You can try reloading the page or going back home.
          </p>
          {isDev && (
            <pre className="mt-4 max-h-48 overflow-auto rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
              {message}
            </pre>
          )}
        </div>
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" className="cursor-pointer" onClick={() => navigate(ROUTES.HOME)}>
            Go home
          </Button>
          <Button className="cursor-pointer" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    </div>
  )
}
