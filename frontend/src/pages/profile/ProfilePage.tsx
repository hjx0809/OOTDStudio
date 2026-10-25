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
      toast.success('Account and photos deleted')
      navigate('/welcome', { replace: true })
    },
    onError: (error) =>
      setDeleteError(error instanceof ApiError ? error.message : "Account wasn't deleted. Try again."),
  })

  const passwordMutation = useMutation({
    mutationFn: () => api.users.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast.success('Password updated', 'Use your new password next time you sign in.')
      setPasswordOpen(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: (error) =>
      setPasswordError(error instanceof ApiError ? error.message : "Password wasn't updated"),
  })

  if (!user) return null
  const summary = summaryQuery.data

  const submitPassword = (event: FormEvent) => {
    event.preventDefault()
    setPasswordError(null)
    if (!currentPassword) {
      setPasswordError('Enter your current password')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('New password needs at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match")
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
          Edit
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
              alt="Your full-length base photo"
            />
          </>
        ) : (
          <span className="profile-portrait__empty">
            <UserRound size={28} />
            Add full-length base photo
          </span>
        )}
        <span className="profile-portrait__shade" />
        <span className="profile-portrait__badge">
          <CheckCircle2 size={12} />
          AI try-on portrait base
        </span>
        <span className="profile-portrait__caption">
          <span className="serif">THE FOUNDATION</span>
          <em>Used to create your private try-on</em>
        </span>
        <span className="profile-portrait__edit">
          <Pencil size={14} />
        </span>
      </button>

      <section className="profile-section">
        <div className="profile-section__head">
          <div>
            <p className="o-eyebrow">BODY ARCHIVE</p>
            <h2>Body profile</h2>
          </div>
          <button type="button" className="text-link" onClick={() => navigate('/me/edit')}>
            Adjust
            <ChevronRight size={14} />
          </button>
        </div>

        <div className="body-stats">
          <div>
            <span>Height</span>
            <strong>{user.height_cm ?? '—'}<em>{user.height_cm ? 'cm' : ''}</em></strong>
          </div>
          <div>
            <span>Weight</span>
            <strong>{user.weight_kg ?? '—'}<em>{user.weight_kg ? 'kg' : ''}</em></strong>
          </div>
          <div>
            <span>Shoe size</span>
            <strong>{user.shoe_size ?? '—'}<em>{user.shoe_size ? 'EU' : ''}</em></strong>
          </div>
        </div>

        <div className="body-detail-grid">
          <div>
            <span>Chest / Waist / Hips</span>
            <strong>
              {user.chest_cm ?? '—'} / {user.waist_cm ?? '—'} / {user.hip_cm ?? '—'}
              <em>cm</em>
            </strong>
          </div>
          <div>
            <span>Fit preference</span>
            <strong>{fitLabel(user.fit_preference)}</strong>
          </div>
          <div>
            <span>Body shape</span>
            <strong>{user.body_shape || 'Not set'}</strong>
          </div>
          <div>
            <span>Skin tone</span>
            <strong>{user.skin_tone || 'Not set'}</strong>
          </div>
        </div>

        <div className="profile-tag-block">
          <div className="profile-tag-block__head">
            <span>Style preferences</span>
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
            <p className="profile-muted">No style preferences yet.</p>
          )}
        </div>
      </section>

      <section className="profile-section profile-section--wardrobe">
        <div className="profile-section__head">
          <div>
            <p className="o-eyebrow">WARDROBE PULSE</p>
            <h2>Wardrobe snapshot</h2>
          </div>
          <button type="button" className="text-link" onClick={() => navigate('/wardrobe')}>
            Open wardrobe
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
              <span>Total items</span>
            </div>
            <div>
              <CheckCircle2 size={18} />
              <strong>{summary?.available ?? 0}</strong>
              <span>Wearable now</span>
            </div>
            <div>
              <Lock size={18} />
              <strong>{summary?.forced ?? 0}</strong>
              <span>Must-wear next</span>
            </div>
          </div>
        )}
      </section>

      <section className="profile-section">
        <div className="profile-section__head">
          <div>
            <p className="o-eyebrow">ACCOUNT & PRIVACY</p>
            <h2>Account & privacy</h2>
          </div>
        </div>
        <div className="profile-menu">
          <button type="button" onClick={() => setPasswordOpen(true)}>
            <span className="profile-menu__icon">
              <KeyRound size={17} />
            </span>
            <span>
              <strong>Change password</strong>
              <em>Other signed-in devices stay logged in</em>
            </span>
            <ChevronRight size={16} />
          </button>
          <button type="button" onClick={() => setPrivacyOpen(true)}>
            <span className="profile-menu__icon">
              <ShieldCheck size={17} />
            </span>
            <span>
              <strong>Photos & privacy</strong>
              <em>See how your photos are stored and used</em>
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
              <strong>Log out</strong>
              <em>Your wardrobe and looks will be here next time</em>
            </span>
            <ChevronRight size={16} />
          </button>
          <button type="button" className="profile-menu__delete" onClick={() => setDeleteOpen(true)}>
            <span className="profile-menu__icon">
              <Trash2 size={17} />
            </span>
            <span>
              <strong>Delete account</strong>
              <em>Permanently removes your wardrobe, looks, and photos</em>
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
          Joined {formatCompactDate(user.created_at)}
        </div>
      </section>

      <Sheet
        open={passwordOpen}
        onClose={() => {
          setPasswordOpen(false)
          setPasswordError(null)
        }}
        title="Change password"
        description="At least 8 characters. You'll stay signed in on this device."
      >
        <form className="password-form" onSubmit={submitPassword}>
          {passwordError && <InlineNotice tone="critical">{passwordError}</InlineNotice>}
          <TextField
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            hint="At least 8 characters"
          />
          <TextField
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          <Button type="submit" full loading={passwordMutation.isPending}>
            Update password
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
        title="Delete account permanently"
        description="This removes your wardrobe, look history, and every uploaded photo. It can't be undone."
        footer={
          <Button
            full
            variant="danger"
            loading={deleteMutation.isPending}
            onClick={() => {
              setDeleteError(null)
              if (!deletePassword) {
                setDeleteError('Enter your password to confirm')
                return
              }
              deleteMutation.mutate()
            }}
          >
            Permanently delete my account
          </Button>
        }
      >
        <div className="password-form">
          {deleteError && <InlineNotice tone="critical">{deleteError}</InlineNotice>}
          <InlineNotice tone="warning" icon={<Trash2 size={15} />}>
            All private photos will be removed from the server and can't be recovered. Make sure you no longer need these looks.
          </InlineNotice>
          <TextField
            label="Enter password to confirm"
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
        title="Photos & privacy"
        description="A short, clear note on how OUL handles your images."
      >
        <div className="legal-copy">
          <h3>Private space</h3>
          <p>
            Wardrobe photos, your base photo, and try-on images live in OUL's local upload folder.
            Every media file requires your sign-in credentials — no other account can open it.
          </p>
          <h3>AI composition</h3>
          <p>
            When you create a look or try-on, OUL sends your base photo and the relevant item photos
            to Google Gemini for text planning and image composition. We never post your photos
            publicly.
          </p>
          <h3>Your choices</h3>
          <p>
            You can delete items, delete looks, or permanently delete your account in settings at
            any time. Deleting your account also removes your wardrobe, look history, and every
            uploaded photo.
          </p>
          <h3>Limits</h3>
          <p>
            Styling advice is not a weather warning or outdoor safety guidance. In extreme weather,
            follow local authorities first.
          </p>
        </div>
        <Button full variant="secondary" onClick={() => setPrivacyOpen(false)}>
          Close
        </Button>
      </Sheet>
    </div>
  )
}
