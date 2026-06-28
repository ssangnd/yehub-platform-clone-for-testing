import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('AppErrorBoundary caught error:', error, info)
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const isDev = import.meta.env.DEV
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-6 max-w-lg">
          <AlertTriangle className="h-16 w-16 text-destructive mx-auto" />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              The app hit an unexpected error. Reloading the page usually fixes it.
            </p>
            {isDev && (
              <pre className="mt-4 max-h-48 overflow-auto rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
                {error.message}
              </pre>
            )}
          </div>
          <Button className="cursor-pointer" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    )
  }
}
