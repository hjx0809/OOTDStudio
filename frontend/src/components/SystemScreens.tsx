import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { Brand } from '@/components/Brand'
import { Button, Spinner } from 'oul-ui'

export function SplashScreen({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  return (
    <div className="app-frame splash">
      <div className="splash__grain" aria-hidden="true" />
      <div className="splash__center">
        <Brand to="/" light compact />
        <p className="splash__wordmark serif">Tomorrow, styled.</p>
        {error ? (
          <div className="splash__error">
            <p>{error}</p>
            {onRetry && (
              <Button
                variant="accent"
                size="sm"
                leftIcon={<RotateCcw size={15} />}
                onClick={onRetry}
              >
                Reconnect
              </Button>
            )}
          </div>
        ) : (
          <span className="splash__loader">
            <Spinner size="sm" label="Opening OUL" />
            Opening your wardrobe
          </span>
        )}
      </div>
      <p className="splash__footnote">PRIVATE WARDROBE · PERSONAL STYLING · AI TRY-ON</p>
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
        <div className="app-frame fatal-error">
          <Brand to="/" />
          <p className="o-eyebrow">SOMETHING WENT QUIET</p>
          <h1>This page wandered off</h1>
          <p>Refresh and everything will be right where you left it — wardrobe and looks included.</p>
          <Button onClick={() => window.location.reload()}>Reload OUL</Button>
        </div>
      )
    }
    return this.props.children
  }
}
