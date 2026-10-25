import { LocateFixed } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/app/AuthProvider'
import { useToast } from '@/app/ToastProvider'
import { ImagePicker } from '@/components/ImagePicker'
import { PageHeader } from '@/components/PageHeader'
import { api, ApiError } from '@/lib/api'
import {
  BODY_SHAPES,
  SKIN_TONES,
  STYLE_OPTIONS,
  cn,
} from '@/lib/utils'
import type { FitPreference, User } from '@/lib/types'
import {
  Button,
  Chip,
  InlineNotice,
  Segmented,
  TextField,
} from 'oul-ui'

const FIT_OPTIONS: Array<{ value: FitPreference; label: string; sublabel: string }> = [
  { value: 'tailored', label: 'Tailored', sublabel: 'Close to the line' },
  { value: 'regular', label: 'Regular', sublabel: 'A little room' },
  { value: 'relaxed', label: 'Relaxed', sublabel: 'Easy, roomy volume' },
]

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
  const [city, setCity] = useState(user?.city ?? '')
  const [latitude, setLatitude] = useState<number | null>(user?.latitude ?? null)
  const [longitude, setLongitude] = useState<number | null>(user?.longitude ?? null)
  const [photoPreview, setPhotoPreview] = useState(
    user?.base_photo_url || user?.base_photo_thumb_url || null,
  )
  const [photoBusy, setPhotoBusy] = useState(false)
  const [locating, setLocating] = useState(false)
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
      toast.success('Base photo updated', 'Your next try-on will use this photo.')
    } catch (requestError) {
      setPhotoPreview(user.base_photo_url || user.base_photo_thumb_url)
      toast.error(
        requestError instanceof ApiError ? requestError.message : "Photo didn't upload",
      )
    } finally {
      setPhotoBusy(false)
    }
  }

  const detectLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Your browser can't detect location. Enter a city manually.")
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude)
        setLongitude(position.coords.longitude)
        setLocating(false)
        toast.success('Current location saved', city ? city : 'Weather will use your current location')
      },
      () => {
        setLocating(false)
        toast.error('Location access was denied. Enter a city manually.')
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    )
  }

  const save = async () => {
    setError(null)
    if (!displayName.trim()) {
      setError("Name can't be empty")
      return
    }
    if (!numberOrNull(height) || !numberOrNull(weight)) {
      setError('Height and weight are required')
      return
    }
    if (numberOrNull(height)! < 120 || numberOrNull(height)! > 230) {
      setError('Height must be between 120–230 cm')
      return
    }
    if (numberOrNull(weight)! < 30 || numberOrNull(weight)! > 300) {
      setError('Weight must be between 30–300 kg')
      return
    }
    if (
      !numberOrNull(chest) ||
      !numberOrNull(waist) ||
      !numberOrNull(hip) ||
      !numberOrNull(shoeSize)
    ) {
      setError('Chest, waist, hips, and shoe size are needed for an accurate look')
      return
    }
    if (styles.length < 2) {
      setError('Pick at least two style preferences')
      return
    }
    setSaving(true)
    try {
      const updated = await api.users.update({
        display_name: displayName.trim(),
        height_cm: numberOrNull(height),
        weight_kg: numberOrNull(weight),
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
        city: city.trim() || null,
        latitude,
        longitude,
      } satisfies Partial<User>)
      updateUser(updated)
      toast.success('Profile updated')
      navigate('/me', { replace: true })
    } catch (requestError) {
      setError(
        requestError instanceof ApiError ? requestError.message : "Couldn't save. Try again.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="profile-edit-page">
      <PageHeader title="Edit profile" eyebrow="YOUR BODY, YOUR RULES" backTo="/me" />

      <div className="profile-edit-intro">
        <p className="o-eyebrow">MAKE THE STYLING TRULY YOURS</p>
        <h1>Make every look closer to your real body and life.</h1>
        <p>Your next recommendation will use the new details. Past looks stay as they are.</p>
      </div>

      {error && <InlineNotice tone="critical">{error}</InlineNotice>}

      <section className="profile-edit-section">
        <div className="profile-edit-section__head">
          <span className="o-eyebrow">IDENTITY</span>
          <h2>Name & photo</h2>
        </div>
        <TextField
          label="Name"
          value={displayName}
          maxLength={80}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <ImagePicker
          previewUrl={photoPreview}
          title="Change your full-length base photo"
          subtitle="Full body in frame, even light — this photo is used for your next try-on"
          aspect="tall"
          variant="base"
          disabled={photoBusy}
          onSelect={(blob, filename, previewUrl) => void handlePhoto(blob, filename, previewUrl)}
        />
        {photoBusy && (
          <p className="profile-edit-hint">
            <span className="o-spinner o-spinner--sm" />
            Saving new photo…
          </p>
        )}
      </section>

      <section className="profile-edit-section">
        <div className="profile-edit-section__head">
          <span className="o-eyebrow">MEASUREMENTS</span>
          <h2>Body profile</h2>
        </div>
        <div className="form-row">
          <TextField
            label="Height"
            type="number"
            inputMode="decimal"
            value={height}
            onChange={(event) => setHeight(event.target.value)}
            hint="cm"
          />
          <TextField
            label="Weight"
            type="number"
            inputMode="decimal"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            hint="kg"
          />
        </div>
        <div className="form-row form-row--three">
          <TextField
            label="Chest"
            type="number"
            inputMode="decimal"
            value={chest}
            onChange={(event) => setChest(event.target.value)}
            hint="cm"
          />
          <TextField
            label="Waist"
            type="number"
            inputMode="decimal"
            value={waist}
            onChange={(event) => setWaist(event.target.value)}
            hint="cm"
          />
          <TextField
            label="Hips"
            type="number"
            inputMode="decimal"
            value={hip}
            onChange={(event) => setHip(event.target.value)}
            hint="cm"
          />
        </div>
        <div className="form-row">
          <TextField
            label="Inseam"
            type="number"
            inputMode="decimal"
            value={inseam}
            onChange={(event) => setInseam(event.target.value)}
            hint="cm"
            optional
          />
          <TextField
            label="Shoe size"
            type="number"
            inputMode="decimal"
            value={shoeSize}
            onChange={(event) => setShoeSize(event.target.value)}
            hint="EU"
          />
        </div>
        <div className="profile-edit-field-block">
          <span className="o-field__label">Fit preference</span>
          <Segmented
            options={FIT_OPTIONS}
            value={fit}
            onChange={setFit}
            ariaLabel="Fit preference"
          />
        </div>
        <div className="profile-edit-field-block">
          <span className="o-field__label">Body shape</span>
          <div className="chip-wrap">
            {BODY_SHAPES.map((shape) => (
              <Chip
                key={shape}
                selected={bodyShape === shape}
                onClick={() => setBodyShape(bodyShape === shape ? '' : shape)}
              >
                {shape}
              </Chip>
            ))}
          </div>
        </div>
        <div className="profile-edit-field-block">
          <span className="o-field__label">Skin tone</span>
          <div className="chip-wrap">
            {SKIN_TONES.map((tone) => (
              <Chip
                key={tone}
                selected={skinTone === tone}
                onClick={() => setSkinTone(skinTone === tone ? '' : tone)}
              >
                {tone}
              </Chip>
            ))}
          </div>
        </div>
      </section>

      <section className="profile-edit-section">
        <div className="profile-edit-section__head">
          <span className="o-eyebrow">TASTE</span>
          <h2>Style & colors to avoid</h2>
        </div>
        <div className="profile-edit-field-block">
          <span className="o-field__label">Style preferences (at least two)</span>
          <div className="chip-wrap">
            {STYLE_OPTIONS.map((style) => (
              <Chip
                key={style}
                selected={styles.includes(style)}
                onClick={() => {
                  setStyles((current) => {
                    if (current.includes(style)) {
                      return current.filter((value) => value !== style)
                    }
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
        <TextField
          label="Colors to avoid"
          placeholder="Comma-separated, e.g. neon green, bright yellow"
          value={avoidColors}
          onChange={(event) => setAvoidColors(event.target.value)}
          hint="A preference, not a hard filter — similar shades may still appear"
          optional
        />
      </section>

      <section className="profile-edit-section">
        <div className="profile-edit-section__head">
          <span className="o-eyebrow">WEATHER</span>
          <h2>Weather location</h2>
        </div>
        <div className="location-input-row">
          <span>City</span>
          <input
            type="text"
            value={city}
            placeholder="e.g. Shanghai"
            onChange={(event) => {
              setCity(event.target.value)
              setLatitude(null)
              setLongitude(null)
            }}
          />
          {latitude !== null && (
            <span className="location-pill">
              <LocateFixed size={11} />
              Located
            </span>
          )}
        </div>
        <button type="button" className="text-button" onClick={detectLocation} disabled={locating}>
          <LocateFixed size={14} />
          {locating ? 'Locating…' : 'Use current location'}
        </button>
        <p className="profile-edit-hint">
          Your city or location fetches tomorrow's Open-Meteo weather. Location isn't continuously tracked.
        </p>
      </section>

      <div className={cn('profile-edit-footer', photoBusy && 'is-busy')}>
        <Button full size="lg" loading={saving} disabled={photoBusy} onClick={save}>
          Save profile
        </Button>
      </div>
    </div>
  )
}
