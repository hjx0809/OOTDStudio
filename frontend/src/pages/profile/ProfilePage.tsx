import { useMutation } from '@tanstack/react-query'
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  KeyRound,
  Lock,
  LogOut,
  Pencil,
  ShieldCheck,
  Shirt,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/app/AuthProvider'
import { useToast } from '@/app/ToastProvider'
import { Brand } from '@/components/Brand'
import { api, ApiError } from '@/lib/api'
import { useWardrobeSummary } from '@/lib/queries'
import { useQueryClient } from '@tanstack/react-query'
import {
  fitLabel,
  formatCompactDate,
} from '@/lib/utils'
import {
  Avatar,
  Badge,
  Button,
  InlineNotice,
  Sheet,
  Skeleton,
  TextField,
} from 'oul-ui'

export function ProfilePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const summaryQuery = useWardrobeSummary()
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const deleteMutation = useMutation({
    mutationFn: () => api.users.deleteAccount(deletePassword),
    onSuccess: () => {
      logout()
      toast.success('账户与照片已删除')
      navigate('/welcome', { replace: true })
    },
    onError: (error) =>
      setDeleteError(error instanceof ApiError ? error.message : '账户没有删除，请重试'),
  })

  const passwordMutation = useMutation({
    mutationFn: () => api.users.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast.success('密码已更新', '下次登录请使用新密码。')
      setPasswordOpen(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: (error) =>
      setPasswordError(error instanceof ApiError ? error.message : '密码没有更新'),
  })

  if (!user) return null
  const summary = summaryQuery.data

  const submitPassword = (event: FormEvent) => {
    event.preventDefault()
    setPasswordError(null)
    if (!currentPassword) {
      setPasswordError('请输入当前密码')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('新密码至少需要 8 位')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的新密码不一致')
      return
    }
    passwordMutation.mutate()
  }

  return (
    <div className="page profile-page">
      <header className="subpage-top">
        <Brand />
        <Badge tone="neutral">
          <UserRound size={11} />
          OUL MEMBER
        </Badge>
      </header>

      <section className="profile-identity">
        <Avatar
          src={user.base_photo_thumb_url || user.base_photo_url}
          name={user.display_name}
          size="lg"
        />
        <div className="profile-identity__copy">
          <p className="o-eyebrow">YOUR PRIVATE PROFILE</p>
          <h1>{user.display_name}</h1>
          <span>{user.email}</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Pencil size={14} />}
          onClick={() => navigate('/me/edit')}
        >
          编辑
        </Button>
      </section>

      <button
        type="button"
        className="profile-portrait"
        onClick={() => navigate('/me/edit')}
      >
        {user.base_photo_url ? (
          <>
            <span
              className="profile-portrait__backdrop"
              style={{ backgroundImage: `url("${user.base_photo_url}")` }}
              aria-hidden="true"
            />
            <img
              className="profile-portrait__full"
              src={user.base_photo_url}
              alt="你的全身基础照片"
            />
          </>
        ) : (
          <span className="profile-portrait__empty">
            <UserRound size={28} />
            添加全身基础照片
          </span>
        )}
        <span className="profile-portrait__shade" />
        <span className="profile-portrait__badge">
          <CheckCircle2 size={12} />
          AI 试穿人像基准
        </span>
        <span className="profile-portrait__caption">
          <span className="serif">THE FOUNDATION</span>
          <em>用于生成你的私人试穿画面</em>
        </span>
        <span className="profile-portrait__edit">
          <Pencil size={14} />
        </span>
      </button>

      <section className="profile-section">
        <div className="profile-section__head">
          <div>
            <p className="o-eyebrow">BODY ARCHIVE</p>
            <h2>身体档案</h2>
          </div>
          <button type="button" className="text-link" onClick={() => navigate('/me/edit')}>
            调整
            <ChevronRight size={14} />
          </button>
        </div>

        <div className="body-stats">
          <div>
            <span>身高</span>
            <strong>{user.height_cm ?? '—'}<em>{user.height_cm ? 'cm' : ''}</em></strong>
          </div>
          <div>
            <span>体重</span>
            <strong>{user.weight_kg ?? '—'}<em>{user.weight_kg ? 'kg' : ''}</em></strong>
          </div>
          <div>
            <span>鞋码</span>
            <strong>{user.shoe_size ?? '—'}<em>{user.shoe_size ? 'EU' : ''}</em></strong>
          </div>
        </div>

        <div className="body-detail-grid">
          <div>
            <span>胸 / 腰 / 臀</span>
            <strong>
              {user.chest_cm ?? '—'} / {user.waist_cm ?? '—'} / {user.hip_cm ?? '—'}
              <em>cm</em>
            </strong>
          </div>
          <div>
            <span>版型偏好</span>
            <strong>{fitLabel(user.fit_preference)}</strong>
          </div>
          <div>
            <span>身型</span>
            <strong>{user.body_shape || '暂未填写'}</strong>
          </div>
          <div>
            <span>肤色倾向</span>
            <strong>{user.skin_tone || '暂未填写'}</strong>
          </div>
        </div>

        <div className="profile-tag-block">
          <div className="profile-tag-block__head">
            <span>风格偏好</span>
            <Sparkles size={13} />
          </div>
          {user.style_preferences.length ? (
            <div className="chip-wrap">
              {user.style_preferences.map((style) => (
                <span key={style} className="o-chip is-selected o-chip--static">
                  {style}
                </span>
              ))}
            </div>
          ) : (
            <p className="profile-muted">还没有选择风格偏好。</p>
          )}
        </div>
      </section>

      <section className="profile-section profile-section--wardrobe">
        <div className="profile-section__head">
          <div>
            <p className="o-eyebrow">WARDROBE PULSE</p>
            <h2>衣橱状态</h2>
          </div>
          <button type="button" className="text-link" onClick={() => navigate('/wardrobe')}>
            进入衣橱
            <ArrowUpRight size={14} />
          </button>
        </div>
        {summaryQuery.isLoading ? (
          <Skeleton className="profile-summary-skeleton" />
        ) : (
          <div className="profile-wardrobe-stats">
            <div>
              <Shirt size={18} />
              <strong>{summary?.total ?? 0}</strong>
              <span>全部单品</span>
            </div>
            <div>
              <CheckCircle2 size={18} />
              <strong>{summary?.available ?? 0}</strong>
              <span>现在可穿</span>
            </div>
            <div>
              <Lock size={18} />
              <strong>{summary?.forced ?? 0}</strong>
              <span>下次必穿</span>
            </div>
          </div>
        )}
      </section>

      <section className="profile-section">
        <div className="profile-section__head">
          <div>
            <p className="o-eyebrow">ACCOUNT & PRIVACY</p>
            <h2>账户与隐私</h2>
          </div>
        </div>
        <div className="profile-menu">
          <button type="button" onClick={() => setPasswordOpen(true)}>
            <span className="profile-menu__icon">
              <KeyRound size={17} />
            </span>
            <span>
              <strong>修改密码</strong>
              <em>上次登录设备会保持登录状态</em>
            </span>
            <ChevronRight size={16} />
          </button>
          <button type="button" onClick={() => setPrivacyOpen(true)}>
            <span className="profile-menu__icon">
              <ShieldCheck size={17} />
            </span>
            <span>
              <strong>照片与隐私</strong>
              <em>了解你的照片如何被保存和使用</em>
            </span>
            <ChevronRight size={16} />
          </button>
          <button type="button" className="profile-menu__logout" onClick={() => {
            logout()
            navigate('/welcome', { replace: true })
          }}>
            <span className="profile-menu__icon">
              <LogOut size={17} />
            </span>
            <span>
              <strong>退出登录</strong>
              <em>衣橱和造型会保留在下一次登录中</em>
            </span>
            <ChevronRight size={16} />
          </button>
          <button type="button" className="profile-menu__delete" onClick={() => setDeleteOpen(true)}>
            <span className="profile-menu__icon">
              <Trash2 size={17} />
            </span>
            <span>
              <strong>删除账户</strong>
              <em>永久移除衣橱、造型与全部照片</em>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      </section>

      <section className="profile-meta">
        <div>
          <span className="serif">OUL Studio</span>
          <em>Version 1.0 · Built for your real wardrobe.</em>
        </div>
        <div className="profile-meta__joined">
          加入于 {formatCompactDate(user.created_at)}
        </div>
      </section>

      <Sheet
        open={passwordOpen}
        onClose={() => {
          setPasswordOpen(false)
          setPasswordError(null)
        }}
        title="修改密码"
        description="至少 8 位。修改后，当前设备的登录仍然有效。"
      >
        <form className="password-form" onSubmit={submitPassword}>
          {passwordError && <InlineNotice tone="critical">{passwordError}</InlineNotice>}
          <TextField
            label="当前密码"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
          <TextField
            label="新密码"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            hint="至少 8 位"
          />
          <TextField
            label="确认新密码"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          <Button type="submit" full loading={passwordMutation.isPending}>
            更新密码
          </Button>
        </form>
      </Sheet>

      <Sheet
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false)
          setDeletePassword('')
          setDeleteError(null)
        }}
        title="永久删除账户"
        description="这会移除你的衣橱、造型历史和所有上传照片，无法撤销。"
        footer={
          <Button
            full
            variant="danger"
            loading={deleteMutation.isPending}
            onClick={() => {
              setDeleteError(null)
              if (!deletePassword) {
                setDeleteError('请输入密码以确认删除')
                return
              }
              deleteMutation.mutate()
            }}
          >
            永久删除我的账户
          </Button>
        }
      >
        <div className="password-form">
          {deleteError && <InlineNotice tone="critical">{deleteError}</InlineNotice>}
          <InlineNotice tone="warning" icon={<Trash2 size={15} />}>
            删除后，所有私人照片会从服务器移除，无法恢复。请确认你不再需要这些造型记录。
          </InlineNotice>
          <TextField
            label="输入密码以确认"
            type="password"
            autoComplete="current-password"
            value={deletePassword}
            onChange={(event) => setDeletePassword(event.target.value)}
          />
        </div>
      </Sheet>

      <Sheet
        open={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        title="照片与隐私"
        description="简短、清楚地说明 OUL 如何处理你的影像。"
      >
        <div className="legal-copy">
          <h3>私人空间</h3>
          <p>
            衣橱照片、基础照片与试穿图保存在 OUL 的本地上传目录中。
            每个媒体文件都需要你的登录凭证才能读取，其他账号无法访问。
          </p>
          <h3>AI 合成</h3>
          <p>
            生成造型或试穿时，OUL 会将基础照片与相关单品照片发送至 Google
            Gemini，以完成文字规划与图像合成。我们不会将照片发布到公共区域。
          </p>
          <h3>你的选择</h3>
          <p>
            你可以随时删除单品、删除造型记录，或在账户设置中永久删除账户。
            删除账户会同步移除衣橱、推荐历史与上传目录中的全部照片。
          </p>
          <h3>边界</h3>
          <p>
            造型建议不会代替天气预警或户外安全判断。极端天气下，请优先遵循当地专业机构指引。
          </p>
        </div>
        <Button full variant="secondary" onClick={() => setPrivacyOpen(false)}>
          关闭
        </Button>
      </Sheet>
    </div>
  )
}
