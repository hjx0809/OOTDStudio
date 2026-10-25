import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/app/AuthProvider'
import { GenerationMonitor } from '@/app/GenerationMonitor'
import { ToastProvider } from '@/app/ToastProvider'
import { GenerationIndicator } from '@/components/GenerationIndicator'
import { AppShell, BareLayout, ScrollToTop } from '@/components/Layout'
import { SplashScreen } from '@/components/SystemScreens'
import { LoginPage, RegisterPage } from '@/pages/auth/AuthPages'
import { WelcomePage } from '@/pages/auth/WelcomePage'
import { HistoryPage } from '@/pages/history/HistoryPage'
import { HomePage } from '@/pages/home/HomePage'
import { LooksPage } from '@/pages/looks/LooksPage'
import { OnboardingPage } from '@/pages/onboarding/OnboardingPage'
import { ProfilePage } from '@/pages/profile/ProfilePage'
import { ProfileEditPage } from '@/pages/profile/ProfileEditPage'
import { ItemEditorPage } from '@/pages/wardrobe/ItemEditorPage'
import { WardrobePage } from '@/pages/wardrobe/WardrobePage'
import { Button } from 'oul-ui'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
  },
})

function AuthLoading() {
  const { bootError, retryBoot } = useAuth()
  return <SplashScreen error={bootError} onRetry={retryBoot} />
}

function PublicOnly() {
  const { user, loading } = useAuth()
  if (loading) return <AuthLoading />
  if (user) {
    return <Navigate to={user.onboarding_completed ? '/' : '/onboarding'} replace />
  }
  return <Outlet />
}

function RequireAuth() {
  const { user, loading } = useAuth()
  if (loading) return <AuthLoading />
  if (!user) return <Navigate to="/welcome" replace />
  return <Outlet />
}

function RequireOnboarded() {
  const { user } = useAuth()
  if (!user?.onboarding_completed) return <Navigate to="/onboarding" replace />
  return <Outlet />
}

function OnboardingGate() {
  const { user, loading } = useAuth()
  if (loading) return <AuthLoading />
  if (!user) return <Navigate to="/welcome" replace />
  if (user.onboarding_completed) return <Navigate to="/" replace />
  return <OnboardingPage />
}

function NotFoundPage() {
  const { user } = useAuth()
  return (
    <div className="app-frame splash">
      <h1 className="splash__title">Page not found</h1>
      <Link to={user ? '/' : '/welcome'}>
        <Button>Go home</Button>
      </Link>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <ScrollToTop />
            <GenerationMonitor />
            <GenerationIndicator />
            <Routes>
              <Route element={<PublicOnly />}>
                <Route path="/welcome" element={<WelcomePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
              </Route>

              <Route path="/onboarding" element={<OnboardingGate />} />

              <Route element={<RequireAuth />}>
                <Route element={<RequireOnboarded />}>
                  <Route element={<AppShell />}>
                    <Route index element={<HomePage />} />
                    <Route path="/wardrobe" element={<WardrobePage />} />
                    <Route path="/history" element={<HistoryPage />} />
                    <Route path="/me" element={<ProfilePage />} />
                  </Route>

                  <Route element={<BareLayout />}>
                    <Route path="/wardrobe/new" element={<ItemEditorPage />} />
                    <Route path="/wardrobe/:itemId" element={<ItemEditorPage />} />
                    <Route path="/me/edit" element={<ProfileEditPage />} />
                    <Route path="/looks/:id" element={<LooksPage />} />
                  </Route>
                </Route>
              </Route>

              <Route path="/style" element={<Navigate to="/" replace />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
