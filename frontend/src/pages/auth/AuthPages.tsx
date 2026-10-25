import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '@/components/Brand'
import { useAuth } from '@/app/AuthProvider'
import { ApiError } from '@/lib/api'
import { validateEmail } from '@/lib/utils'
import { Button, IconButton, InlineNotice, Sheet, TextField } from 'oul-ui'

function AuthLayout({
  title,
  footer,
  children,
}: {
  title: string
  footer: ReactNode
  children: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <div className="app-frame auth">
      <header className="bare-nav bare-nav--back">
        <IconButton label="Back" onClick={() => navigate('/welcome')}>
          <ArrowLeft size={20} />
        </IconButton>
        <Brand to="/welcome" />
      </header>
      <main className="auth__main">
        <h1 className="auth__title">{title}</h1>
        {children}
      </main>
      <footer className="auth__footer">{footer}</footer>
    </div>
  )
}

function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <IconButton label={shown ? 'Hide password' : 'Show password'} size="sm" onClick={onToggle}>
      {shown ? <EyeOff size={18} /> : <Eye size={18} />}
    </IconButton>
  )
}

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    const nextErrors: typeof fieldErrors = {}
    if (!validateEmail(email)) nextErrors.email = 'Enter a valid email'
    if (!password) nextErrors.password = 'Enter your password'
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    setBusy(true)
    try {
      const user = await login(email.trim(), password)
      navigate(user.onboarding_completed ? '/' : '/onboarding', { replace: true })
    } catch (requestError) {
      setError(
        requestError instanceof ApiError ? requestError.message : 'Sign-in failed. Try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      footer={
        <p>
          New here? <Link to="/register">Create account</Link>
        </p>
      }
    >
      {error && <InlineNotice tone="critical">{error}</InlineNotice>}
      <form className="form-stack" onSubmit={submit} noValidate>
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          error={fieldErrors.email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <TextField
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          value={password}
          error={fieldErrors.password}
          onChange={(event) => setPassword(event.target.value)}
          trailing={
            <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />
          }
        />
        <Button type="submit" size="lg" full loading={busy}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  )
}

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [legalOpen, setLegalOpen] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{
    firstName?: string
    lastName?: string
    email?: string
    password?: string
    confirmPassword?: string
    terms?: string
  }>({})

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    const nextErrors: typeof fieldErrors = {}
    if (!firstName.trim()) nextErrors.firstName = 'Enter your first name'
    if (!lastName.trim()) nextErrors.lastName = 'Enter your last name'
    if (!validateEmail(email)) nextErrors.email = 'Enter a valid email'
    if (password.length < 8) nextErrors.password = 'At least 8 characters'
    if (!confirmPassword) nextErrors.confirmPassword = 'Confirm your password'
    else if (confirmPassword !== password) nextErrors.confirmPassword = "Passwords don't match"
    if (!acceptTerms) nextErrors.terms = 'Please accept the terms'
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    setBusy(true)
    try {
      await register({
        email: email.trim(),
        password,
        display_name: `${firstName.trim()} ${lastName.trim()}`,
        accept_terms: true,
      })
      navigate('/onboarding', { replace: true })
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Couldn't create your account. Try again.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Create account"
      footer={
        <p>
          Have an account? <Link to="/login">Sign in</Link>
        </p>
      }
    >
      {error && <InlineNotice tone="critical">{error}</InlineNotice>}
      <form className="form-stack" onSubmit={submit} noValidate>
        <div className="form-row">
          <TextField
            label="First name"
            autoComplete="given-name"
            maxLength={40}
            value={firstName}
            error={fieldErrors.firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
          <TextField
            label="Last name"
            autoComplete="family-name"
            maxLength={39}
            value={lastName}
            error={fieldErrors.lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </div>
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          error={fieldErrors.email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <TextField
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder="8+ characters"
          value={password}
          error={fieldErrors.password}
          onChange={(event) => setPassword(event.target.value)}
          trailing={
            <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />
          }
        />
        <TextField
          label="Confirm password"
          type={showConfirmPassword ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirmPassword}
          error={fieldErrors.confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          trailing={
            <PasswordToggle
              shown={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((v) => !v)}
            />
          }
        />

        <div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(event) => {
                setAcceptTerms(event.target.checked)
                if (event.target.checked) {
                  setFieldErrors((current) => ({ ...current, terms: undefined }))
                }
              }}
            />
            <span className="check-row__box" aria-hidden="true" />
            <span>
              I agree to the{' '}
              <button type="button" className="link" onClick={() => setLegalOpen(true)}>
                terms & privacy
              </button>
            </span>
          </label>
          {fieldErrors.terms && (
            <p className="o-field__error" role="alert">
              {fieldErrors.terms}
            </p>
          )}
        </div>

        <Button type="submit" size="lg" full loading={busy}>
          Create account
        </Button>
      </form>

      <Sheet open={legalOpen} onClose={() => setLegalOpen(false)} title="Terms & privacy">
        <LegalCopy />
        <Button variant="secondary" full onClick={() => setLegalOpen(false)}>
          Got it
        </Button>
      </Sheet>
    </AuthLayout>
  )
}

export function LegalCopy() {
  return (
    <div className="legal-copy">
      <h3>Your photos</h3>
      <p>Stored privately and only viewable when signed in. Used only to create your looks.</p>
      <h3>AI processing</h3>
      <p>
        When you generate looks, the relevant photos and item details are sent to Google Gemini.
        They are never published.
      </p>
      <h3>Your control</h3>
      <p>
        Delete items, looks or your whole account anytime in Me. Deleting your account removes
        every photo.
      </p>
      <h3>Limits</h3>
      <p>Styling suggestions only — not weather safety advice.</p>
    </div>
  )
}
