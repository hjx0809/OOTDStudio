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
                重新连接
              </Button>
            )}
          </div>
        ) : (
          <span className="splash__loader">
            <Spinner size="sm" label="正在打开 OUL" />
            正在打开你的衣橱
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
          <h1>页面暂时走神了</h1>
          <p>刷新一下，你的衣橱和造型记录都还在。</p>
          <Button onClick={() => window.location.reload()}>重新载入 OUL</Button>
        </div>
      )
    }
    return this.props.children
  }
}
