import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/app/AuthProvider'
import { useToast } from '@/app/ToastProvider'
import { ImagePicker } from '@/components/ImagePicker'
import { PageHeader } from '@/components/PageHeader'
import { ChipPicker, FIT_OPTIONS } from '@/components/ProfileFields'
import { api, ApiError } from '@/lib/api'
import { BODY_SHAPES, SKIN_TONES, STYLE_OPTIONS } from '@/lib/utils'
import type { FitPreference, User } from '@/lib/types'
import { Button, Chip, InlineNotice, Segmented, TextField } from 'oul-ui'

function valueText(value: number | null): string {
  return value === null || value === undefined ? '' : String(value)
}

function numberOrNull(value: string): number | null {
  if (value.trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function ProfileEditPage() {
  const { user, updateUser } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [displayName, setDisplayName] = useState(user?.display_name ?? '')
  const [height, setHeight] = useState(valueText(user?.height_cm ?? null))
  const [weight, setWeight] = useState(valueText(user?.weight_kg ?? null))
  const [chest, setChest] = useState(valueText(user?.chest_cm ?? null))
  const [waist, setWaist] = useState(valueText(user?.waist_cm ?? null))
  const [hip, setHip] = useState(valueText(user?.hip_cm ?? null))
  const [inseam, setInseam] = useState(valueText(user?.inseam_cm ?? null))
  const [shoeSize, setShoeSize] = useState(valueText(user?.shoe_size ?? null))
  const [fit, setFit] = useState<FitPreference>(
    (user?.fit_preference as FitPreference) || 'regular',
  )
  const [bodyShape, setBodyShape] = useState(user?.body_shape ?? '')
  const [skinTone, setSkinTone] = useState(user?.skin_tone ?? '')
  const [styles, setStyles] = useState<string[]>(user?.style_preferences ?? [])
  const [avoidColors, setAvoidColors] = useState((user?.avoid_colors ?? []).join(', '))
  const [photoPreview, setPhotoPreview] = useState(
    user?.base_photo_url || user?.base_photo_thumb_url || null,
  )
  const [photoBusy, setPhotoBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!user) return null

  const handlePhoto = async (blob: Blob, filename: string, previewUrl: string) => {
    setPhotoPreview(previewUrl)
    setPhotoBusy(true)
    try {
      const updated = await api.users.uploadBasePhoto(blob, filename)
      updateUser(updated)
      setPhotoPreview(updated.base_photo_url || updated.base_photo_thumb_url)
      toast.success('Photo updated')
    } catch (requestError) {
      setPhotoPreview(user.base_photo_url || user.base_photo_thumb_url)
      toast.error(requestError instanceof ApiError ? requestError.message : 'Upload failed')
    } finally {
      setPhotoBusy(false)
    }
  }

  const save = async () => {
    setError(null)
    if (!displayName.trim()) {
      setError('Name is required')
      return
    }
    const heightNumber = numberOrNull(height)
    const weightNumber = numberOrNull(weight)
    if (!heightNumber || heightNumber < 120 || heightNumber > 230) {
      setError('Height: 120–230 cm')
      return
    }
    if (!weightNumber || weightNumber < 30 || weightNumber > 300) {
      setError('Weight: 30–300 kg')
      return
    }
    if (
      !numberOrNull(chest) ||
      !numberOrNull(waist) ||
      !numberOrNull(hip) ||
      !numberOrNull(shoeSize)
    ) {
      setError('Chest, waist, hips and shoe size are required')
      return
    }
    if (styles.length < 2) {
      setError('Pick at least 2 styles')
      return
    }
    setSaving(true)
    try {
      const updated = await api.users.update({
        display_name: displayName.trim(),
        height_cm: heightNumber,
        weight_kg: weightNumber,
        chest_cm: numberOrNull(chest),
        waist_cm: numberOrNull(waist),
        hip_cm: numberOrNull(hip),
        inseam_cm: numberOrNull(inseam),
        shoe_size: numberOrNull(shoeSize),
        fit_preference: fit,
        body_shape: bodyShape || null,
        skin_tone: skinTone || null,
        style_preferences: styles,
        avoid_colors: avoidColors
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 10),
      } satisfies Partial<User>)
      updateUser(updated)
      toast.success('Saved')
      navigate('/me', { replace: true })
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Couldn't save. Try again.")
    } finally {
      setSaving(false)
    }
  }

  const numberProps = { type: 'number', inputMode: 'decimal' as const }

  return (
    <div className="page page--bare">
      <PageHeader title="Edit profile" backTo="/me" />

      {error && <InlineNotice tone="critical">{error}</InlineNotice>}

      <div className="profile-photo">
        <ImagePicker
          previewUrl={photoPreview}
          title="Full-body photo"
          subtitle="Used for AI try-on"
          aspect="tall"
          variant="base"
          disabled={photoBusy}
          onSelect={(blob, filename, previewUrl) => void handlePhoto(blob, filename, previewUrl)}
        />
      </div>

      <div className="form-stack">
        <TextField
          label="Name"
          value={displayName}
          maxLength={80}
          onChange={(event) => setDisplayName(event.target.value)}
        />

        <div className="form-row">
          <TextField {...numberProps} label="Height" suffix="cm" value={height} onChange={(e) => setHeight(e.target.value)} />
          <TextField {...numberProps} label="Weight" suffix="kg" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
        <div className="form-row form-row--three">
          <TextField {...numberProps} label="Chest" suffix="cm" value={chest} onChange={(e) => setChest(e.target.value)} />
          <TextField {...numberProps} label="Waist" suffix="cm" value={waist} onChange={(e) => setWaist(e.target.value)} />
          <TextField {...numberProps} label="Hips" suffix="cm" value={hip} onChange={(e) => setHip(e.target.value)} />
        </div>
        <div className="form-row">
          <TextField {...numberProps} label="Inseam" suffix="cm" optional value={inseam} onChange={(e) => setInseam(e.target.value)} />
          <TextField {...numberProps} label="Shoe" suffix="EU" value={shoeSize} onChange={(e) => setShoeSize(e.target.value)} />
        </div>

        <div className="field-block">
          <span className="o-field__label">Fit</span>
          <Segmented options={FIT_OPTIONS} value={fit} onChange={setFit} ariaLabel="Fit preference" />
        </div>

        <div className="field-block">
          <span className="o-field__label">
            Style
            <span className="o-field__optional">{styles.length}/6</span>
          </span>
          <div className="chip-wrap">
            {STYLE_OPTIONS.map((style) => (
              <Chip
                key={style}
                selected={styles.includes(style)}
                onClick={() => {
                  setStyles((current) => {
                    if (current.includes(style)) return current.filter((value) => value !== style)
                    if (current.length >= 6) return current
                    return [...current, style]
                  })
                }}
              >
                {style}
              </Chip>
            ))}
          </div>
        </div>

        <ChipPicker label="Body shape" options={BODY_SHAPES} value={bodyShape} onChange={setBodyShape} />
        <ChipPicker label="Skin tone" options={SKIN_TONES} value={skinTone} onChange={setSkinTone} />

        <TextField
          label="Avoid colors"
          placeholder="e.g. neon green, mustard"
          optional
          value={avoidColors}
          onChange={(event) => setAvoidColors(event.target.value)}
        />
      </div>

      <footer className="sticky-footer">
        <Button full size="lg" loading={saving} disabled={photoBusy} onClick={save}>
          Save
        </Button>
      </footer>
    </div>
  )
}
