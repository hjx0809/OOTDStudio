import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/app/AuthProvider'
import { Brand } from '@/components/Brand'
import { ImagePicker } from '@/components/ImagePicker'
import { ChipPicker, FIT_OPTIONS } from '@/components/ProfileFields'
import { useToast } from '@/app/ToastProvider'
import { api, ApiError } from '@/lib/api'
import { BODY_SHAPES, SKIN_TONES, STYLE_OPTIONS, cn } from '@/lib/utils'
import type { FitPreference, User } from '@/lib/types'
import { Button, Chip, IconButton, InlineNotice, Segmented, TextField } from 'oul-ui'

const STEPS = ['Body', 'Measurements', 'Style', 'Photo'] as const

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
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [photoName, setPhotoName] = useState('base-photo.jpg')
  const [photoPreview, setPhotoPreview] = useState(
    user?.base_photo_url || user?.base_photo_thumb_url || null,
  )

  const isLast = step === STEPS.length - 1

  const validateStep = (): boolean => {
    const errors: Record<string, string> = {}
    if (step === 0) {
      const heightNumber = parseNumber(height)
      const weightNumber = parseNumber(weight)
      if (!heightNumber || heightNumber < 120 || heightNumber > 230) errors.height = '120–230 cm'
      if (!weightNumber || weightNumber < 30 || weightNumber > 300) errors.weight = '30–300 kg'
      if (!parseNumber(shoeSize)) errors.shoe = 'Required'
    }
    if (step === 1) {
      for (const [key, value] of [
        ['chest', chest],
        ['waist', waist],
        ['hip', hip],
      ] as const) {
        const parsed = parseNumber(value)
        if (!parsed || parsed < 40 || parsed > 220) errors[key] = '40–220'
      }
    }
    if (step === 2 && styles.length < 2) errors.styles = 'Pick at least 2'
    if (step === 3 && !photoPreview) errors.photo = 'Add a full-body photo'
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
      setError(requestError instanceof ApiError ? requestError.message : "Couldn't save. Try again.")
    } finally {
      setBusy(false)
    }
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
      })
      const completed = await api.users.completeOnboarding()
      updateUser(completed)
      toast.success('All set', 'Now add a few clothes')
      navigate('/', { replace: true })
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Couldn't finish. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-frame onboarding">
      <header className="bare-nav">
        <Brand />
        <button
          type="button"
          className="link link--muted"
          onClick={() => {
            logout()
            navigate('/welcome', { replace: true })
          }}
        >
          Log out
        </button>
      </header>

      <div className="progress" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((label, index) => (
          <span key={label} className={cn('progress__bar', index <= step && 'is-done')} />
        ))}
      </div>

      <main className="onboarding__main" key={step}>
        <p className="onboarding__step">
          {step + 1}/{STEPS.length}
        </p>

        {error && <InlineNotice tone="critical">{error}</InlineNotice>}

        {step === 0 && (
          <section className="form-stack">
            <h1 className="onboarding__title">Your body</h1>
            <div className="form-row">
              <TextField
                label="Height"
                type="number"
                inputMode="decimal"
                placeholder="170"
                suffix="cm"
                value={height}
                error={fieldErrors.height}
                onChange={(event) => setHeight(event.target.value)}
              />
              <TextField
                label="Weight"
                type="number"
                inputMode="decimal"
                placeholder="62"
                suffix="kg"
                value={weight}
                error={fieldErrors.weight}
                onChange={(event) => setWeight(event.target.value)}
              />
            </div>
            <TextField
              label="Shoe size"
              type="number"
              inputMode="decimal"
              placeholder="38"
              suffix="EU"
              value={shoeSize}
              error={fieldErrors.shoe}
              onChange={(event) => setShoeSize(event.target.value)}
            />
            <div className="field-block">
              <span className="o-field__label">Fit</span>
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
          <section className="form-stack">
            <h1 className="onboarding__title">Measurements</h1>
            <div className="form-row form-row--three">
              {[
                { key: 'chest', label: 'Chest', value: chest, setter: setChest, placeholder: '88' },
                { key: 'waist', label: 'Waist', value: waist, setter: setWaist, placeholder: '72' },
                { key: 'hip', label: 'Hips', value: hip, setter: setHip, placeholder: '94' },
              ].map((field) => (
                <TextField
                  key={field.key}
                  label={field.label}
                  type="number"
                  inputMode="decimal"
                  placeholder={field.placeholder}
                  suffix="cm"
                  value={field.value}
                  error={fieldErrors[field.key]}
                  onChange={(event) => field.setter(event.target.value)}
                />
              ))}
            </div>
            <TextField
              label="Inseam"
              type="number"
              inputMode="decimal"
              placeholder="78"
              suffix="cm"
              optional
              value={inseam}
              onChange={(event) => setInseam(event.target.value)}
            />
            <ChipPicker
              label="Body shape"
              options={BODY_SHAPES}
              value={bodyShape}
              onChange={setBodyShape}
            />
            <ChipPicker
              label="Skin tone"
              options={SKIN_TONES}
              value={skinTone}
              onChange={setSkinTone}
            />
          </section>
        )}

        {step === 2 && (
          <section className="form-stack">
            <div className="onboarding__title-row">
              <h1 className="onboarding__title">Your style</h1>
              <span className="counter">{styles.length}/6</span>
            </div>
            <p className="o-field__hint">Pick 2 to 6 styles you like.</p>
            <div className="chip-wrap chip-wrap--lg">
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
                    setFieldErrors((current) => ({ ...current, styles: '' }))
                  }}
                >
                  {style}
                </Chip>
              ))}
            </div>
            {fieldErrors.styles && (
              <p className="o-field__error" role="alert">
                {fieldErrors.styles}
              </p>
            )}
          </section>
        )}

        {step === 3 && (
          <section className="form-stack">
            <h1 className="onboarding__title">Your photo</h1>
            <ImagePicker
              previewUrl={photoPreview}
              title="Full-body photo"
              subtitle="Head to toe, good light"
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
          </section>
        )}
      </main>

      <footer className="sticky-footer onboarding__footer">
        {step > 0 && (
          <IconButton
            label="Back"
            variant="surface"
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            disabled={busy}
          >
            <ArrowLeft size={18} />
          </IconButton>
        )}
        <Button
          size="lg"
          full
          loading={busy}
          onClick={isLast ? finish : handleNext}
          rightIcon={isLast ? <Check size={18} /> : <ArrowRight size={18} />}
        >
          {isLast ? 'Finish' : 'Next'}
        </Button>
      </footer>
    </div>
  )
}
