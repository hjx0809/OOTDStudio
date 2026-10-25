import {
  ArrowLeft,
  ArrowRight,
  Check,
  Footprints,
  LocateFixed,
  Ruler,
  ShieldCheck,
  Sparkles,
  Weight,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/app/AuthProvider'
import { Brand } from '@/components/Brand'
import { ImagePicker } from '@/components/ImagePicker'
import { useToast } from '@/app/ToastProvider'
import { api, ApiError } from '@/lib/api'
import {
  BODY_SHAPES,
  STYLE_OPTIONS,
  cn,
  fitLabel,
} from '@/lib/utils'
import type { FitPreference, User } from '@/lib/types'
import { Button, Chip, InlineNotice, Segmented } from 'oul-ui'

const STEPS = [
  { index: '01', label: 'Body' },
  { index: '02', label: 'Proportions' },
  { index: '03', label: 'Style' },
  { index: '04', label: 'Photo & weather' },
] as const

const FIT_OPTIONS: Array<{ value: FitPreference; label: string; sublabel: string }> = [
  { value: 'tailored', label: 'Tailored', sublabel: 'Close to the line' },
  { value: 'regular', label: 'Regular', sublabel: 'A little room' },
  { value: 'relaxed', label: 'Relaxed', sublabel: 'Easy, roomy volume' },
]

function asText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

function parseNumber(value: string): number | null {
  const number = Number(value)
  return Number.isFinite(number) && value.trim() !== '' ? number : null
}

export function OnboardingPage() {
  const { user, updateUser, logout } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const [height, setHeight] = useState(asText(user?.height_cm))
  const [weight, setWeight] = useState(asText(user?.weight_kg))
  const [shoeSize, setShoeSize] = useState(asText(user?.shoe_size))
  const [fitPreference, setFitPreference] = useState<FitPreference>(
    (user?.fit_preference as FitPreference) || 'regular',
  )
  const [chest, setChest] = useState(asText(user?.chest_cm))
  const [waist, setWaist] = useState(asText(user?.waist_cm))
  const [hip, setHip] = useState(asText(user?.hip_cm))
  const [inseam, setInseam] = useState(asText(user?.inseam_cm))
  const [bodyShape, setBodyShape] = useState(user?.body_shape || '')
  const [skinTone, setSkinTone] = useState(user?.skin_tone || '')
  const [styles, setStyles] = useState<string[]>(user?.style_preferences || [])
  const [city, setCity] = useState(user?.city || '')
  const [latitude, setLatitude] = useState<number | null>(user?.latitude ?? null)
  const [longitude, setLongitude] = useState<number | null>(user?.longitude ?? null)
  const [locating, setLocating] = useState(false)
  const [locationNote, setLocationNote] = useState<string | null>(null)
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [photoName, setPhotoName] = useState('base-photo.jpg')
  const [photoPreview, setPhotoPreview] = useState(
    user?.base_photo_url || user?.base_photo_thumb_url || null,
  )

  const progress = ((step + 1) / STEPS.length) * 100
  const hasLocation = latitude !== null && longitude !== null
  const styleSummary = useMemo(() => styles.slice(0, 3).join(' · '), [styles])

  const goToStep = (target: number) => {
    if (target < step) {
      setError(null)
      setFieldErrors({})
      setStep(target)
    }
  }

  const validateStep = (): boolean => {
    const errors: Record<string, string> = {}
    if (step === 0) {
      const heightNumber = parseNumber(height)
      const weightNumber = parseNumber(weight)
      if (!heightNumber || heightNumber < 120 || heightNumber > 230) {
        errors.height = 'Enter a height between 120–230 cm'
      }
      if (!weightNumber || weightNumber < 30 || weightNumber > 300) {
        errors.weight = 'Enter a weight between 30–300 kg'
      }
      if (!parseNumber(shoeSize)) errors.shoe = 'Enter your shoe size'
    }
    if (step === 1) {
      for (const [key, value, label] of [
        ['chest', chest, 'chest'],
        ['waist', waist, 'waist'],
        ['hip', hip, 'hip'],
      ] as const) {
        const parsed = parseNumber(value)
        if (!parsed || parsed < 40 || parsed > 220) {
          errors[key] = `Enter a valid ${label} measurement`
        }
      }
    }
    if (step === 2 && styles.length < 2) {
      errors.styles = 'Pick at least two styles you wear or love'
    }
    if (step === 3) {
      if (!photoPreview) errors.photo = 'Upload a full-length base photo'
      if (!hasLocation && !city.trim()) errors.city = 'Enter a city or use your current location'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const persistStep = async (): Promise<User | null> => {
    if (step === 0) {
      return api.users.update({
        height_cm: parseNumber(height),
        weight_kg: parseNumber(weight),
        shoe_size: parseNumber(shoeSize),
        fit_preference: fitPreference,
      })
    }
    if (step === 1) {
      return api.users.update({
        chest_cm: parseNumber(chest),
        waist_cm: parseNumber(waist),
        hip_cm: parseNumber(hip),
        inseam_cm: parseNumber(inseam),
        body_shape: bodyShape || null,
        skin_tone: skinTone || null,
      })
    }
    if (step === 2) {
      return api.users.update({ style_preferences: styles })
    }
    return null
  }

  const handleNext = async () => {
    setError(null)
    if (!validateStep()) return
    setBusy(true)
    try {
      const updated = await persistStep()
      if (updated) updateUser(updated)
      setStep((current) => Math.min(current + 1, STEPS.length - 1))
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Couldn't save this step. Try again.",
      )
    } finally {
      setBusy(false)
    }
  }

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setLocationNote("Your browser can't detect location. Enter a city manually.")
      return
    }
    setLocating(true)
    setLocationNote(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude)
        setLongitude(position.coords.longitude)
        setLocationNote("Location saved for tomorrow's weather.")
        setLocating(false)
        setFieldErrors((current) => ({ ...current, city: '' }))
      },
      () => {
        setLocationNote(
          'Location access was denied. Enter a city manually, or allow location in browser settings.',
        )
        setLocating(false)
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    )
  }

  const finish = async () => {
    setError(null)
    if (!validateStep()) return
    setBusy(true)
    try {
      let currentUser = user
      if (photoBlob) {
        currentUser = await api.users.uploadBasePhoto(photoBlob, photoName)
        updateUser(currentUser)
        setPhotoBlob(null)
        setPhotoPreview(currentUser.base_photo_url || currentUser.base_photo_thumb_url)
      }
      currentUser = await api.users.update({
        height_cm: parseNumber(height),
        weight_kg: parseNumber(weight),
        shoe_size: parseNumber(shoeSize),
        fit_preference: fitPreference,
        chest_cm: parseNumber(chest),
        waist_cm: parseNumber(waist),
        hip_cm: parseNumber(hip),
        inseam_cm: parseNumber(inseam),
        body_shape: bodyShape || null,
        skin_tone: skinTone || null,
        style_preferences: styles,
        city: city.trim() || null,
        latitude,
        longitude,
      })
      const completed = await api.users.completeOnboarding()
      updateUser(completed)
      toast.success('Your private wardrobe is ready', 'Add a few favorite items and OUL can start styling.')
      navigate('/', { replace: true })
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Couldn't finish your profile. Try again in a moment.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-frame onboarding">
      <header className="onboarding__nav">
        <Brand />
        <button
          type="button"
          className="text-button"
          onClick={() => {
            logout()
            navigate('/welcome', { replace: true })
          }}
        >
          Log out
        </button>
      </header>

      <div className="onboarding__progress">
        <div className="onboarding__progress-meta">
          <span>
            {STEPS[step].index} / {STEPS.length.toString().padStart(2, '0')}
          </span>
          <span>{STEPS[step].label}</span>
        </div>
        <div className="onboarding__progress-track" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="onboarding__step-tabs">
          {STEPS.map((item, index) => (
            <button
              key={item.index}
              type="button"
              className={cn(
                'onboarding__step-tab',
                index === step && 'is-current',
                index < step && 'is-done',
              )}
              onClick={() => goToStep(index)}
              disabled={index > step}
            >
              <span>{index < step ? <Check size={12} /> : item.index}</span>
              <em>{item.label}</em>
            </button>
          ))}
        </div>
      </div>

      <main className="onboarding__main" key={step}>
        {error && <InlineNotice tone="critical">{error}</InlineNotice>}

        {step === 0 && (
          <section className="onboarding__panel">
            <div className="onboarding__heading">
              <p className="o-eyebrow">BODY, IN YOUR OWN WORDS</p>
              <h1>
                First, the real numbers.
                <br />
                <span className="serif">Your body, as it is.</span>
              </h1>
              <p>No scores, no comparisons. Measurements only guide proportion, fit, and length.</p>
            </div>

            <div className="measurement-grid">
              <label className="measurement-card">
                <span className="measurement-card__icon">
                  <Ruler size={18} />
                </span>
                <span className="measurement-card__label">Height</span>
                <span className="measurement-card__value">
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="170"
                    value={height}
                    onChange={(event) => setHeight(event.target.value)}
                    aria-invalid={Boolean(fieldErrors.height)}
                  />
                  <em>cm</em>
                </span>
                {fieldErrors.height && <span className="field-error">{fieldErrors.height}</span>}
              </label>
              <label className="measurement-card">
                <span className="measurement-card__icon">
                  <Weight size={18} />
                </span>
                <span className="measurement-card__label">Weight</span>
                <span className="measurement-card__value">
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="62"
                    value={weight}
                    onChange={(event) => setWeight(event.target.value)}
                    aria-invalid={Boolean(fieldErrors.weight)}
                  />
                  <em>kg</em>
                </span>
                {fieldErrors.weight && <span className="field-error">{fieldErrors.weight}</span>}
              </label>
              <label className="measurement-card measurement-card--wide">
                <span className="measurement-card__icon">
                  <Footprints size={18} />
                </span>
                <span className="measurement-card__label">Shoe size (EU)</span>
                <span className="measurement-card__value">
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="38"
                    value={shoeSize}
                    onChange={(event) => setShoeSize(event.target.value)}
                    aria-invalid={Boolean(fieldErrors.shoe)}
                  />
                  <em>EU</em>
                </span>
                {fieldErrors.shoe && <span className="field-error">{fieldErrors.shoe}</span>}
              </label>
            </div>

            <div className="onboarding__group">
              <div className="onboarding__group-head">
                <span className="onboarding__group-title">Fit preference</span>
                <span className="onboarding__group-note">{fitLabel(fitPreference)}</span>
              </div>
              <Segmented
                options={FIT_OPTIONS}
                value={fitPreference}
                onChange={setFitPreference}
                ariaLabel="Fit preference"
              />
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="onboarding__panel">
            <div className="onboarding__heading">
              <p className="o-eyebrow">PROPORTION NOTES</p>
              <h1>
                Silhouette says more
                <br />
                <span className="serif">than numbers do.</span>
              </h1>
              <p>These guide waistline, shoulder line, and trouser length. No tape measure? Rough numbers are fine.</p>
            </div>

            <div className="measurement-grid measurement-grid--three">
              {[
                { key: 'chest', label: 'Chest', value: chest, setter: setChest, placeholder: '88' },
                { key: 'waist', label: 'Waist', value: waist, setter: setWaist, placeholder: '72' },
                { key: 'hip', label: 'Hips', value: hip, setter: setHip, placeholder: '94' },
              ].map((field) => (
                <label className="measurement-card measurement-card--compact" key={field.key}>
                  <span className="measurement-card__label">{field.label}</span>
                  <span className="measurement-card__value">
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder={field.placeholder}
                      value={field.value}
                      onChange={(event) => field.setter(event.target.value)}
                    />
                    <em>cm</em>
                  </span>
                  {fieldErrors[field.key] && (
                    <span className="field-error">{fieldErrors[field.key]}</span>
                  )}
                </label>
              ))}
            </div>

            <label className="measurement-line">
              <span>Inseam</span>
              <span className="measurement-line__input">
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="Optional, e.g. 78"
                  value={inseam}
                  onChange={(event) => setInseam(event.target.value)}
                />
                <em>cm</em>
              </span>
            </label>

            <div className="onboarding__group">
              <div className="onboarding__group-head">
                <span className="onboarding__group-title">Body shape (optional)</span>
                <span className="onboarding__group-note">Shapes silhouette advice</span>
              </div>
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

            <div className="onboarding__group">
              <div className="onboarding__group-head">
                <span className="onboarding__group-title">Skin tone (optional)</span>
                <span className="onboarding__group-note">For colors that flatter you</span>
              </div>
              <div className="chip-wrap">
                {['Cool', 'Natural', 'Warm', 'Tan', 'Deep', 'Not sure'].map((tone) => (
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
        )}

        {step === 2 && (
          <section className="onboarding__panel">
            <div className="onboarding__heading">
              <p className="o-eyebrow">YOUR TASTE, EDITED</p>
              <h1>
                What you love
                <br />
                <span className="serif">matters more than what's trending.</span>
              </h1>
              <p>Choose 2–6 styles that feel like you. We'll describe looks in that language first.</p>
            </div>

            <div className="style-pick-grid">
              {STYLE_OPTIONS.map((style, index) => {
                const selected = styles.includes(style)
                return (
                  <button
                    key={style}
                    type="button"
                    className={cn(
                      'style-pick',
                      selected && 'is-selected',
                      `style-pick--${index % 3}`,
                    )}
                    aria-pressed={selected}
                    onClick={() => {
                      setStyles((current) => {
                        if (current.includes(style)) {
                          return current.filter((value) => value !== style)
                        }
                        if (current.length >= 6) {
                          toast.toast({ title: 'Up to six styles', description: 'A tighter edit feels more like you.' })
                          return current
                        }
                        return [...current, style]
                      })
                      setFieldErrors((current) => ({ ...current, styles: '' }))
                    }}
                  >
                    <span className="style-pick__word">{style}</span>
                    <span className="style-pick__mark">
                      {selected ? <Check size={12} /> : '+ '}
                    </span>
                  </button>
                )
              })}
            </div>
            {fieldErrors.styles && (
              <p className="o-field__error" role="alert">
                {fieldErrors.styles}
              </p>
            )}
            <div className="style-summary">
              <Sparkles size={14} />
              <span>
                {styleSummary
                  ? `Selected: ${styleSummary}${styles.length > 3 ? ` · ${styles.length} styles` : ''}`
                  : 'Pick two styles you wear most'}
              </span>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="onboarding__panel">
            <div className="onboarding__heading">
              <p className="o-eyebrow">THE LAST PIECE</p>
              <h1>
                One full-length photo,
                <br />
                <span className="serif">and tomorrow looks like you.</span>
              </h1>
              <p>This is the portrait base for AI try-on, used only for your private looks.</p>
            </div>

            <ImagePicker
              previewUrl={photoPreview}
              title="Upload your full-length base photo"
              subtitle="Stand naturally, full body in frame, even light, clean background"
              aspect="tall"
              variant="base"
              onSelect={(blob, filename, previewUrl) => {
                setPhotoBlob(blob)
                setPhotoName(filename)
                setPhotoPreview(previewUrl)
                setFieldErrors((current) => ({ ...current, photo: '' }))
              }}
            />
            {fieldErrors.photo && (
              <p className="o-field__error" role="alert">
                {fieldErrors.photo}
              </p>
            )}

            <div className="photo-guidance">
              <span>Head to toe</span>
              <span>One person, nothing blocking</span>
              <span>Daylight or bright indoor light</span>
            </div>

            <div className="onboarding__group location-block">
              <div className="onboarding__group-head">
                <span className="onboarding__group-title">Where's tomorrow's weather from?</span>
                <button type="button" className="text-button" onClick={detectLocation} disabled={locating}>
                  <LocateFixed size={14} />
                  {locating ? 'Locating…' : 'Use current location'}
                </button>
              </div>
              <label className="location-input-row">
                <span>City</span>
                <input
                  type="text"
                  placeholder="e.g. Shanghai"
                  value={city}
                  onChange={(event) => {
                    setCity(event.target.value)
                    setLatitude(null)
                    setLongitude(null)
                  }}
                />
                {hasLocation && (
                  <span className="location-pill">
                    <LocateFixed size={11} /> Located
                  </span>
                )}
              </label>
              {fieldErrors.city && (
                <p className="o-field__error" role="alert">
                  {fieldErrors.city}
                </p>
              )}
              {locationNote && <p className="onboarding__help">{locationNote}</p>}
              <p className="onboarding__help">
                Weather is only checked when creating a look. We don't track you continuously.
              </p>
            </div>

            <div className="privacy-note">
              <ShieldCheck size={17} />
              <p>
                Your photos live in your private space, accessible only with sign-in credentials. You can replace them on the upload page anytime.
              </p>
            </div>
          </section>
        )}
      </main>

      <footer className="onboarding__footer">
        <Button
          variant="secondary"
          size="md"
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          disabled={step === 0 || busy}
          leftIcon={<ArrowLeft size={17} />}
        >
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            size="md"
            loading={busy}
            onClick={handleNext}
            rightIcon={<ArrowRight size={17} />}
          >
            Next
          </Button>
        ) : (
          <Button size="md" loading={busy} onClick={finish} rightIcon={<Check size={17} />}>
            Finish profile
          </Button>
        )}
      </footer>
    </div>
  )
}
