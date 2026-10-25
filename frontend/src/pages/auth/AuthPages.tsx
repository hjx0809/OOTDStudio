import { Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '@/components/Brand'
import { useAuth } from '@/app/AuthProvider'
import { ApiError } from '@/lib/api'
import { validateEmail } from '@/lib/utils'
import { Button, InlineNotice, Sheet, TextField } from 'oul-ui'

function AuthHeader({ mode }: { mode: 'login' | 'register' }) {
  return (
    <header className="auth__nav">
      <Brand />
      <Link to={mode === 'login' ? '/register' : '/login'} className="auth__switch-link">
        {mode === 'login' ? 'Create account' : 'Sign in'}
      </Link>
    </header>
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
    if (!validateEmail(email)) nextErrors.email = 'Enter a valid email address'
    if (!password) nextErrors.password = 'Enter your password'
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    setBusy(true)
    try {
      const user = await login(email.trim(), password)
      navigate(user.onboarding_completed ? '/' : '/onboarding', { replace: true })
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Sign-in didn't go through. Try again in a moment.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-frame auth">
      <AuthHeader mode="login" />
      <main className="auth__main">
        <div className="auth__heading">
          <p className="o-eyebrow">WELCOME BACK</p>
          <h1>
            Your wardrobe is here,
            <br />
            <span className="serif">and tomorrow is waiting.</span>
          </h1>
          <p>Sign in to pick up your looks and wardrobe where you left off.</p>
        </div>

        {error && (
          <InlineNotice tone="critical" className="auth__notice">
            {error}
          </InlineNotice>
        )}

        <form className="auth__form" onSubmit={submit} noValidate>
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
            placeholder="Enter your password"
            value={password}
            error={fieldErrors.password}
            onChange={(event) => setPassword(event.target.value)}
            trailing={
              <button
                type="button"
                className="input-action"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            }
          />
          <Button type="submit" size="lg" full loading={busy}>
            Enter my wardrobe
          </Button>
        </form>

        <div className="auth__security">
          <LockKeyhole size={14} />
          <span>Your session stays on this device. Photos are accessed with private credentials.</span>
        </div>
      </main>
      <footer className="auth__footer">
        <p>
          New here? <Link to="/register">Build your private wardrobe in 3 minutes</Link>
        </p>
      </footer>
    </div>
  )
}

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [legalOpen, setLegalOpen] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string
    email?: string
    password?: string
    terms?: string
  }>({})

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    const nextErrors: typeof fieldErrors = {}
    if (!displayName.trim()) nextErrors.name = 'What should OUL call you?'
    if (!validateEmail(email)) nextErrors.email = 'Enter a valid email address'
    if (password.length < 8) nextErrors.password = 'Use at least 8 characters'
    if (!acceptTerms) nextErrors.terms = 'Please accept the terms and privacy notice'
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    setBusy(true)
    try {
      await register({
        email: email.trim(),
        password,
        display_name: displayName.trim(),
        accept_terms: true,
      })
      navigate('/onboarding', { replace: true })
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Couldn't create your account. Try again in a moment.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-frame auth">
      <AuthHeader mode="register" />
      <main className="auth__main">
        <div className="auth__heading">
          <p className="o-eyebrow">BEGIN YOUR EDIT</p>
          <h1>
            Let's start with you,
            <br />
            <span className="serif">then your wardrobe.</span>
          </h1>
          <p>Create your body profile and upload one full-length base photo.</p>
        </div>

        {error && (
          <InlineNotice tone="critical" className="auth__notice">
            {error}
          </InlineNotice>
        )}

        <form className="auth__form" onSubmit={submit} noValidate>
          <TextField
            label="What should we call you"
            autoComplete="nickname"
            placeholder="Your name"
            maxLength={80}
            value={displayName}
            error={fieldErrors.name}
            onChange={(event) => setDisplayName(event.target.value)}
          />
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
            placeholder="At least 8 characters"
            value={password}
            error={fieldErrors.password}
            hint={password && password.length < 8 ? 'A little longer — 8 characters minimum' : 'Mix upper and lower case with numbers'}
            onChange={(event) => setPassword(event.target.value)}
            trailing={
              <button
                type="button"
                className="input-action"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            }
          />

          <div className="terms-row">
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
              <span className="check-row__label">
                I agree to the terms and understand my photos are used only to create my private looks.
              </span>
            </label>
            <button type="button" className="text-button" onClick={() => setLegalOpen(true)}>
              Read terms & privacy
            </button>
            {fieldErrors.terms && (
              <p className="o-field__error" role="alert">
                {fieldErrors.terms}
              </p>
            )}
          </div>

          <Button type="submit" size="lg" full loading={busy}>
            Create account & start my profile
          </Button>
        </form>

        <div className="auth__security">
          <ShieldCheck size={14} />
          <span>Your photos never appear publicly and are never used to train our models.</span>
        </div>
      </main>
      <footer className="auth__footer">
        <p>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </footer>

      <Sheet
        open={legalOpen}
        onClose={() => setLegalOpen(false)}
        title="Terms & privacy"
        description="A clear, straightforward look at how OUL handles your data."
      >
        <div className="legal-copy">
          <h3>Your photos</h3>
          <p>
            Your full-length base photo and item photos live in this app's local database and
            upload folder, used only to create your private looks and try-ons. Media URLs require
            sign-in credentials.
          </p>
          <h3>AI processing</h3>
          <p>
            When you create a look or try-on, the relevant photos and structured wardrobe details
            are sent to Google Gemini for composition. They are never published publicly; specific
            handling is also governed by your Gemini API terms.
          </p>
          <h3>You're in control</h3>
          <p>
            You can delete wardrobe items and looks at any time, or permanently delete your account
            under Me → Account & privacy. Deleting your account also removes your wardrobe, looks,
            and all uploaded photos.
          </p>
          <h3>What OUL is for</h3>
          <p>
            OUL offers styling suggestions, not safety or medical advice. In extreme weather or
            outdoor activity, follow guidance from local authorities first.
          </p>
        </div>
        <Button variant="secondary" full onClick={() => setLegalOpen(false)}>
          Got it
        </Button>
      </Sheet>
    </div>
  )
}
