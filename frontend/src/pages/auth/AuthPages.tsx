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
        {mode === 'login' ? '创建账号' : '已有账号'}
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
    if (!validateEmail(email)) nextErrors.email = '请输入有效的邮箱地址'
    if (!password) nextErrors.password = '请输入密码'
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
          : '登录没有完成，请稍后再试',
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
            衣橱还在，
            <br />
            <span className="serif">明天也在等你。</span>
          </h1>
          <p>登录后继续查看你的造型与衣橱。</p>
        </div>

        {error && (
          <InlineNotice tone="critical" className="auth__notice">
            {error}
          </InlineNotice>
        )}

        <form className="auth__form" onSubmit={submit} noValidate>
          <TextField
            label="邮箱"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            error={fieldErrors.email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <TextField
            label="密码"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="输入你的密码"
            value={password}
            error={fieldErrors.password}
            onChange={(event) => setPassword(event.target.value)}
            trailing={
              <button
                type="button"
                className="input-action"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            }
          />
          <Button type="submit" size="lg" full loading={busy}>
            进入我的衣橱
          </Button>
        </form>

        <div className="auth__security">
          <LockKeyhole size={14} />
          <span>登录状态仅保存在本机，照片通过私人凭证访问。</span>
        </div>
      </main>
      <footer className="auth__footer">
        <p>
          还没有账号？ <Link to="/register">用 3 分钟建立你的私享衣橱</Link>
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
    if (!displayName.trim()) nextErrors.name = '想让 OUL 怎么称呼你？'
    if (!validateEmail(email)) nextErrors.email = '请输入有效的邮箱地址'
    if (password.length < 8) nextErrors.password = '密码至少需要 8 位'
    if (!acceptTerms) nextErrors.terms = '请先同意服务条款与隐私说明'
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
          : '创建账号没有完成，请稍后再试',
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
            先认识你，
            <br />
            <span className="serif">再认识你的衣橱。</span>
          </h1>
          <p>注册后建立身体档案，并上传一张全身基础照片。</p>
        </div>

        {error && (
          <InlineNotice tone="critical" className="auth__notice">
            {error}
          </InlineNotice>
        )}

        <form className="auth__form" onSubmit={submit} noValidate>
          <TextField
            label="怎么称呼你"
            autoComplete="nickname"
            placeholder="你的名字"
            maxLength={80}
            value={displayName}
            error={fieldErrors.name}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <TextField
            label="邮箱"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            error={fieldErrors.email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <TextField
            label="密码"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="至少 8 位"
            value={password}
            error={fieldErrors.password}
            hint={password && password.length < 8 ? '再长一点，至少 8 位' : '建议混合大小写与数字'}
            onChange={(event) => setPassword(event.target.value)}
            trailing={
              <button
                type="button"
                className="input-action"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
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
                我同意服务条款，并了解照片仅用于生成我的私人造型。
              </span>
            </label>
            <button type="button" className="text-button" onClick={() => setLegalOpen(true)}>
              查看条款与隐私说明
            </button>
            {fieldErrors.terms && (
              <p className="o-field__error" role="alert">
                {fieldErrors.terms}
              </p>
            )}
          </div>

          <Button type="submit" size="lg" full loading={busy}>
            创建账号，开始建档
          </Button>
        </form>

        <div className="auth__security">
          <ShieldCheck size={14} />
          <span>你的照片不会出现在公共区域，也不会用于训练我们的模型。</span>
        </div>
      </main>
      <footer className="auth__footer">
        <p>
          已经有账号？ <Link to="/login">直接登录</Link>
        </p>
      </footer>

      <Sheet
        open={legalOpen}
        onClose={() => setLegalOpen(false)}
        title="服务与隐私说明"
        description="用清楚、直接的方式说明 OUL 如何处理你的资料。"
      >
        <div className="legal-copy">
          <h3>你的照片</h3>
          <p>
            全身基础照片与单品照片保存在本应用的本地数据库与上传目录中，
            仅用于生成你的私人造型和试穿效果。媒体地址需要登录凭证才能访问。
          </p>
          <h3>AI 处理</h3>
          <p>
            当你触发造型或试穿时，相关照片与结构化衣橱信息会发送至 Google Gemini
            进行合成。它们不会被用于公开发布；具体数据处理也受你的 Gemini API 服务条款约束。
          </p>
          <h3>你的控制权</h3>
          <p>
            你可以随时删除衣橱单品、造型记录，或在「我的 → 账户与隐私」中永久删除账户。
            删除账户会同时移除衣橱、造型记录与全部上传照片。
          </p>
          <h3>服务范围</h3>
          <p>
            OUL 提供穿搭建议，不构成安全防护或医疗建议。极端天气与户外活动请优先遵循专业机构指引。
          </p>
        </div>
        <Button variant="secondary" full onClick={() => setLegalOpen(false)}>
          我知道了
        </Button>
      </Sheet>
    </div>
  )
}
