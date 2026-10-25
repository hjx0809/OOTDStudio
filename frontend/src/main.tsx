import '@fontsource-variable/manrope'
import '@/styles/tokens.css'
import 'oul-ui/oul.css'
import '@/styles/app.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/app/App'
import { ErrorBoundary } from '@/components/SystemScreens'

if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is a progressive enhancement; the app works without it.
    })
  })
}
