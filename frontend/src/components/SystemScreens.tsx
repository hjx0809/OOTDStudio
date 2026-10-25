import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { Brand } from '@/components/Brand'
import { Button, Spinner } from 'oul-ui'

export function SplashScreen({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  return (
    <div className="app-frame splash">
      <Brand />
      {error ? (
        <div className="splash__error">
          <p>{error}</p>
          {onRetry && (
            <Button size="sm" variant="secondary" leftIcon={<RotateCcw size={15} />} onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>
      ) : (
        <Spinner size="sm" label="Loading" />
      )}
    </div>
  )
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('OUL UI error', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-frame splash">
          <h1 className="splash__title">Something went wrong</h1>
          <Button onClick={() => window.location.reload()} leftIcon={<RotateCcw size={16} />}>
            Reload
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
