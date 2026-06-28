import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex items-center justify-center min-h-[400px] p-6">
          <Card className="max-w-md w-full">
            <CardContent className="p-6 text-center space-y-4">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
              <div className="space-y-2">
                <h2 className="text-lg font-semibold font-mono">Something went wrong</h2>
                <p className="text-sm text-muted-foreground">
                  An unexpected error occurred. Please try again.
                </p>
              </div>
              <Button
                variant="outline"
                className="cursor-pointer"
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                Try again
              </Button>
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
