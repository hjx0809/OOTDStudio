import { useMutation } from '@tanstack/react-query'
import { KeyRound, LogOut, ShieldCheck, Trash2, UserRoundPen } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/app/AuthProvider'
import { useToast } from '@/app/ToastProvider'
import { ImagePicker } from '@/components/ImagePicker'
import { LegalCopy } from '@/pages/auth/AuthPages'
import { api, ApiError } from '@/lib/api'
import type { User } from '@/lib/types'
import { cn, fitLabel } from '@/lib/utils'
import { Button, InlineNotice, List, ListRow, Sheet, TextField } from 'oul-ui'

type MeasureField = 'height_cm' | 'weight_kg' | 'chest_cm' | 'waist_cm' | 'hip_cm' | 'shoe_size'

interface Measure {
  field: MeasureField
  label: string
  unit: string
  min: number
  max: number
  integer?: boolean
}

// Ranges mirror the backend ProfileUpdate schema.
const MEASUREMENTS: Measure[] = [
  { field: 'height_cm', label: 'Height', unit: 'cm', min: 120, max: 230, integer: true },
  { field: 'weight_kg', label: 'Weight', unit: 'kg', min: 30, max: 300 },
  { field: 'chest_cm', label: 'Chest', unit: 'cm', min: 50, max: 200 },
  { field: 'waist_cm', label: 'Waist', unit: 'cm', min: 40, max: 200 },
  { field: 'hip_cm', label: 'Hips', unit: 'cm', min: 50, max: 220 },
  { field: 'shoe_size', label: 'Shoe', unit: 'EU', min: 30, max: 55 },
]

function MeasureTile({
  measure,
  value,
  onSave,
}: {
  measure: Measure
  value: number | null
  onSave: (value: number) => Promise<boolean>
}) {
  const initial = value == null ? '' : String(value)
  const [draft, setDraft] = useState(initial)

  const commit = async () => {
    const text = draft.trim()
    if (text === initial) return
    const number = Number(text)
    if (!text || !Number.isFinite(number)) {
      setDraft(initial)
      return
    }
    const saved = await onSave(measure.integer ? Math.round(number) : number)
    if (!saved) setDraft(initial)
  }

  return (
    <label className="measure-tile">
      <span className="measure-tile__label">{measure.label}</span>
      <span className="measure-tile__value">
        <input
          type="number"
          inputMode="decimal"
          placeholder="—"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        <em>{measure.unit}</em>
      </span>
    </label>
  )
}

export function ProfilePage() {
  const { user, logout, updateUser } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
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
      toast.success('Account deleted')
      navigate('/welcome', { replace: true })
    },
    onError: (error) =>
      setDeleteError(error instanceof ApiError ? error.message : "Couldn't delete. Try again."),
  })

  const passwordMutation = useMutation({
    mutationFn: () => api.users.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast.success('Password updated')
      setPasswordOpen(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: (error) =>
      setPasswordError(error instanceof ApiError ? error.message : "Couldn't update password"),
  })

  if (!user) return null

  const uploadPhoto = async (blob: Blob, filename: string, previewUrl: string) => {
    setPhotoPreview(previewUrl)
    setPhotoBusy(true)
    try {
      updateUser(await api.users.uploadBasePhoto(blob, filename))
      toast.success('Photo updated')
    } catch (requestError) {
      toast.error(requestError instanceof ApiError ? requestError.message : 'Upload failed')
    } finally {
      setPhotoPreview(null)
      setPhotoBusy(false)
    }
  }

  const saveMeasurement = async (measure: Measure, value: number): Promise<boolean> => {
    if (value < measure.min || value > measure.max) {
      toast.error(`${measure.label}: ${measure.min}–${measure.max} ${measure.unit}`)
      return false
    }
    try {
      updateUser(await api.users.update({ [measure.field]: value }))
      return true
    } catch (requestError) {
      toast.error(requestError instanceof ApiError ? requestError.message : "Couldn't save. Try again.")
      return false
    }
  }

  const submitPassword = (event: FormEvent) => {
    event.preventDefault()
    setPasswordError(null)
    if (!currentPassword) {
      setPasswordError('Enter your current password')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('New password: 8+ characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords don't match")
      return
    }
    passwordMutation.mutate()
  }

  const photo = user.base_photo_url || user.base_photo_thumb_url

  return (
    <div className="page page--tab">
      <header className="tab-head">
        <div>
          <p className="eyebrow">Your account</p>
          <h1 className="tab-head__title">Profile</h1>
        </div>
      </header>

      <section className="profile-card">
        <div className="profile-card__head">
          <div>
            <p className="eyebrow">Base photo</p>
            <h2>Full-body reference</h2>
          </div>
          <span className={cn('status-pill', photo && 'is-done')}>{photo ? 'Added' : 'Required'}</span>
        </div>
        <p className="profile-card__lede">Used to preview recommended outfits on you.</p>
        <div className={cn('base-photo', photo && 'has-photo')}>
          <ImagePicker
            previewUrl={photoPreview ?? photo}
            title="Add full-body photo"
            subtitle="Front view · Good lighting"
            aspect="tall"
            variant="base"
            disabled={photoBusy}
            onSelect={(blob, filename, previewUrl) => void uploadPhoto(blob, filename, previewUrl)}
          />
        </div>
      </section>

      <section className="profile-card">
        <p className="eyebrow">Body measurements</p>
        <div className="measure-grid">
          {MEASUREMENTS.map((measure) => (
            <MeasureTile
              key={`${measure.field}-${user[measure.field] ?? ''}`}
              measure={measure}
              value={user[measure.field]}
              onSave={(value) => saveMeasurement(measure, value)}
            />
          ))}
        </div>
      </section>

      <section className="profile-card">
        <div className="profile-card__head">
          <p className="eyebrow">Style</p>
          <button type="button" className="link link--muted" onClick={() => navigate('/me/edit')}>
            Edit
          </button>
        </div>
        <div className="tag-line">
          <span className="tag">{fitLabel(user.fit_preference)} fit</span>
          {user.style_preferences.map((style) => (
            <span key={style} className="tag">
              {style}
            </span>
          ))}
        </div>
      </section>

      <List className="profile-list">
        <ListRow icon={<UserRoundPen size={18} />} title="Edit profile" onClick={() => navigate('/me/edit')} />
        <ListRow icon={<KeyRound size={18} />} title="Change password" onClick={() => setPasswordOpen(true)} />
        <ListRow icon={<ShieldCheck size={18} />} title="Privacy" onClick={() => setPrivacyOpen(true)} />
        <ListRow
          icon={<LogOut size={18} />}
          title="Log out"
          onClick={() => {
            logout()
            navigate('/welcome', { replace: true })
          }}
        />
        <ListRow
          icon={<Trash2 size={18} />}
          title="Delete account"
          tone="danger"
          onClick={() => setDeleteOpen(true)}
        />
      </List>

      <Sheet
        open={passwordOpen}
        onClose={() => {
          setPasswordOpen(false)
          setPasswordError(null)
        }}
        title="Change password"
      >
        <form className="form-stack" onSubmit={submitPassword}>
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
            placeholder="8+ characters"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <TextField
            label="Confirm"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          <Button type="submit" full loading={passwordMutation.isPending}>
            Update
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
        title="Delete account?"
        description="Removes your wardrobe, looks and all photos. Can't be undone."
      >
        <div className="form-stack">
          {deleteError && <InlineNotice tone="critical">{deleteError}</InlineNotice>}
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={deletePassword}
            onChange={(event) => setDeletePassword(event.target.value)}
          />
          <Button
            full
            variant="danger"
            loading={deleteMutation.isPending}
            onClick={() => {
              setDeleteError(null)
              if (!deletePassword) {
                setDeleteError('Enter your password')
                return
              }
              deleteMutation.mutate()
            }}
          >
            Delete forever
          </Button>
        </div>
      </Sheet>

      <Sheet open={privacyOpen} onClose={() => setPrivacyOpen(false)} title="Privacy">
        <LegalCopy />
        <Button full variant="secondary" onClick={() => setPrivacyOpen(false)}>
          Close
        </Button>
      </Sheet>
    </div>
  )
}
