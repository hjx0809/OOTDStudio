import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { BottomNav } from './BottomNav'

export function AppShell() {
  return (
    <div className="app-frame">
      <main className="app-shell">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}

export function BareLayout() {
  return (
    <div className="app-frame">
      <Outlet />
    </div>
  )
}

export function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    const frame = document.querySelector<HTMLElement>('.app-frame')
    if (frame) frame.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])
  return null
}
