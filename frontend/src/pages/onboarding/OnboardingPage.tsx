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
  { index: '01', label: '身体基础' },
  { index: '02', label: '比例细节' },
  { index: '03', label: '风格偏好' },
  { index: '04', label: '照片与天气' },
] as const

const FIT_OPTIONS: Array<{ value: FitPreference; label: string; sublabel: string }> = [
  { value: 'tailored', label: '利落合身', sublabel: '贴合身体线条' },
  { value: 'regular', label: '自然合身', sublabel: '留一点余量' },
  { value: 'relaxed', label: '松弛廓形', sublabel: '宽松、留白' },
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
        errors.height = '请输入 120–230 cm 之间的身高'
      }
      if (!weightNumber || weightNumber < 30 || weightNumber > 300) {
        errors.weight = '请输入 30–300 kg 之间的体重'
      }
      if (!parseNumber(shoeSize)) errors.shoe = '请输入你的鞋码'
    }
    if (step === 1) {
      for (const [key, value, label] of [
        ['chest', chest, '胸围'],
        ['waist', waist, '腰围'],
        ['hip', hip, '臀围'],
      ] as const) {
        const parsed = parseNumber(value)
        if (!parsed || parsed < 40 || parsed > 220) {
          errors[key] = `请输入有效的${label}尺寸`
        }
      }
    }
    if (step === 2 && styles.length < 2) {
      errors.styles = '至少选择两种你常穿或喜欢的风格'
    }
    if (step === 3) {
      if (!photoPreview) errors.photo = '请上传一张全身基础照片'
      if (!hasLocation && !city.trim()) errors.city = '请填写城市，或使用当前位置'
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
          : '这一步没有保存成功，请重试',
      )
    } finally {
      setBusy(false)
    }
  }

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setLocationNote('当前浏览器不支持定位，请手动填写城市。')
      return
    }
    setLocating(true)
    setLocationNote(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude)
        setLongitude(position.coords.longitude)
        setLocationNote('已记录你的位置，用于查看明天的天气。')
        setLocating(false)
        setFieldErrors((current) => ({ ...current, city: '' }))
      },
      () => {
        setLocationNote('没有取得定位权限，请手动填写城市，或在浏览器设置中允许定位。')
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
      toast.success('你的私享衣橱准备好了', '先添加几件常穿的单品，OUL 就能开始造型。')
      navigate('/', { replace: true })
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : '建档没有完成，请稍后重试',
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
          退出
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
                先告诉我们
                <br />
                <span className="serif">身体的真实尺度。</span>
              </h1>
              <p>不是评分，也不做比较。尺寸只用来判断比例、版型与长度。</p>
            </div>

            <div className="measurement-grid">
              <label className="measurement-card">
                <span className="measurement-card__icon">
                  <Ruler size={18} />
                </span>
                <span className="measurement-card__label">身高</span>
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
                <span className="measurement-card__label">体重</span>
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
                <span className="measurement-card__label">鞋码（EU）</span>
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
                <span className="onboarding__group-title">喜欢的廓形</span>
                <span className="onboarding__group-note">{fitLabel(fitPreference)}</span>
              </div>
              <Segmented
                options={FIT_OPTIONS}
                value={fitPreference}
                onChange={setFitPreference}
                ariaLabel="版型偏好"
              />
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="onboarding__panel">
            <div className="onboarding__heading">
              <p className="o-eyebrow">PROPORTION NOTES</p>
              <h1>
                轮廓比数字
                <br />
                <span className="serif">更能说明你。</span>
              </h1>
              <p>这些数据帮助我们处理腰线、肩线和裤长。没有软尺也可以先填大概值。</p>
            </div>

            <div className="measurement-grid measurement-grid--three">
              {[
                { key: 'chest', label: '胸围', value: chest, setter: setChest, placeholder: '88' },
                { key: 'waist', label: '腰围', value: waist, setter: setWaist, placeholder: '72' },
                { key: 'hip', label: '臀围', value: hip, setter: setHip, placeholder: '94' },
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
              <span>内侧裤长</span>
              <span className="measurement-line__input">
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="选填，例如 78"
                  value={inseam}
                  onChange={(event) => setInseam(event.target.value)}
                />
                <em>cm</em>
              </span>
            </label>

            <div className="onboarding__group">
              <div className="onboarding__group-head">
                <span className="onboarding__group-title">身型（选填）</span>
                <span className="onboarding__group-note">只用于廓形建议</span>
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
                <span className="onboarding__group-title">肤色倾向（选填）</span>
                <span className="onboarding__group-note">用来建议更衬你的颜色</span>
              </div>
              <div className="chip-wrap">
                {['冷白', '自然', '暖黄', '小麦', '深肤色', '不确定'].map((tone) => (
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
                你喜欢什么，
                <br />
                <span className="serif">比流行什么更重要。</span>
              </h1>
              <p>选择 2–6 个最接近你的风格。我们会优先用这些语言描述造型。</p>
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
                          toast.toast({ title: '最多选择 6 种风格', description: '聚焦一点，造型会更像你。' })
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
                  ? `已选：${styleSummary}${styles.length > 3 ? ` 等 ${styles.length} 种` : ''}`
                  : '先选两个最常穿的风格'}
              </span>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="onboarding__panel">
            <div className="onboarding__heading">
              <p className="o-eyebrow">THE LAST PIECE</p>
              <h1>
                一张全身照，
                <br />
                <span className="serif">让明天先被看见。</span>
              </h1>
              <p>照片会作为 AI 试穿的人像基准。只用于你的私人造型。</p>
            </div>

            <ImagePicker
              previewUrl={photoPreview}
              title="上传你的全身基础照片"
              subtitle="自然站立，全身入镜，光线均匀，背景尽量干净"
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
              <span>全身从头到脚</span>
              <span>单人、无遮挡</span>
              <span>自然光或明亮室内</span>
            </div>

            <div className="onboarding__group location-block">
              <div className="onboarding__group-head">
                <span className="onboarding__group-title">明天的天气从哪里看？</span>
                <button type="button" className="text-button" onClick={detectLocation} disabled={locating}>
                  <LocateFixed size={14} />
                  {locating ? '定位中…' : '使用当前位置'}
                </button>
              </div>
              <label className="location-input-row">
                <span>城市</span>
                <input
                  type="text"
                  placeholder="例如：上海"
                  value={city}
                  onChange={(event) => {
                    setCity(event.target.value)
                    setLatitude(null)
                    setLongitude(null)
                  }}
                />
                {hasLocation && (
                  <span className="location-pill">
                    <LocateFixed size={11} /> 已定位
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
                天气只在生成造型时使用，不会持续跟踪你的位置。
              </p>
            </div>

            <div className="privacy-note">
              <ShieldCheck size={17} />
              <p>
                照片保存在你的私人空间，访问需要登录凭证。你可以随时在上传页更换。
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
          上一步
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            size="md"
            loading={busy}
            onClick={handleNext}
            rightIcon={<ArrowRight size={17} />}
          >
            下一步
          </Button>
        ) : (
          <Button size="md" loading={busy} onClick={finish} rightIcon={<Check size={17} />}>
            完成建档
          </Button>
        )}
      </footer>
    </div>
  )
}
