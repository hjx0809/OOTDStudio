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
  { value: 'tailored', label: '利落合身', sublabel: '贴合线条' },
  { value: 'regular', label: '自然合身', sublabel: '留一点余量' },
  { value: 'relaxed', label: '松弛廓形', sublabel: '宽松留白' },
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
      toast.success('基础照片已更新', '下一组试穿会使用这张照片。')
    } catch (requestError) {
      setPhotoPreview(user.base_photo_url || user.base_photo_thumb_url)
      toast.error(
        requestError instanceof ApiError ? requestError.message : '照片没有上传成功',
      )
    } finally {
      setPhotoBusy(false)
    }
  }

  const detectLocation = () => {
    if (!navigator.geolocation) {
      toast.error('当前浏览器不支持定位，请手动填写城市')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude)
        setLongitude(position.coords.longitude)
        setLocating(false)
        toast.success('已记录当前位置', city ? city : '天气会使用当前位置获取')
      },
      () => {
        setLocating(false)
        toast.error('没有取得定位权限，请手动填写城市')
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    )
  }

  const save = async () => {
    setError(null)
    if (!displayName.trim()) {
      setError('称呼不能为空')
      return
    }
    if (!numberOrNull(height) || !numberOrNull(weight)) {
      setError('身高和体重不能为空')
      return
    }
    if (numberOrNull(height)! < 120 || numberOrNull(height)! > 230) {
      setError('身高需要在 120–230 cm 之间')
      return
    }
    if (numberOrNull(weight)! < 30 || numberOrNull(weight)! > 300) {
      setError('体重需要在 30–300 kg 之间')
      return
    }
    if (
      !numberOrNull(chest) ||
      !numberOrNull(waist) ||
      !numberOrNull(hip) ||
      !numberOrNull(shoeSize)
    ) {
      setError('胸围、腰围、臀围和鞋码需要保持完整，才能给出准确造型')
      return
    }
    if (styles.length < 2) {
      setError('请至少选择两种风格偏好')
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
          .split(/[,，]/)
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 10),
        city: city.trim() || null,
        latitude,
        longitude,
      } satisfies Partial<User>)
      updateUser(updated)
      toast.success('档案已更新')
      navigate('/me', { replace: true })
    } catch (requestError) {
      setError(
        requestError instanceof ApiError ? requestError.message : '保存没有完成，请重试',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="profile-edit-page">
      <PageHeader title="编辑档案" eyebrow="YOUR BODY, YOUR RULES" backTo="/me" />

      <div className="profile-edit-intro">
        <p className="o-eyebrow">MAKE THE STYLING TRULY YOURS</p>
        <h1>让造型更贴近真实的身体与生活。</h1>
        <p>更新后，下一组推荐会使用新的参数。历史造型不会被改动。</p>
      </div>

      {error && <InlineNotice tone="critical">{error}</InlineNotice>}

      <section className="profile-edit-section">
        <div className="profile-edit-section__head">
          <span className="o-eyebrow">IDENTITY</span>
          <h2>称呼与照片</h2>
        </div>
        <TextField
          label="称呼"
          value={displayName}
          maxLength={80}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <ImagePicker
          previewUrl={photoPreview}
          title="更换全身基础照片"
          subtitle="保持全身入镜、光线均匀；新照片会用于下一次试穿"
          aspect="tall"
          variant="base"
          disabled={photoBusy}
          onSelect={(blob, filename, previewUrl) => void handlePhoto(blob, filename, previewUrl)}
        />
        {photoBusy && (
          <p className="profile-edit-hint">
            <span className="o-spinner o-spinner--sm" />
            正在保存新照片…
          </p>
        )}
      </section>

      <section className="profile-edit-section">
        <div className="profile-edit-section__head">
          <span className="o-eyebrow">MEASUREMENTS</span>
          <h2>身体参数</h2>
        </div>
        <div className="form-row">
          <TextField
            label="身高"
            type="number"
            inputMode="decimal"
            value={height}
            onChange={(event) => setHeight(event.target.value)}
            hint="cm"
          />
          <TextField
            label="体重"
            type="number"
            inputMode="decimal"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            hint="kg"
          />
        </div>
        <div className="form-row form-row--three">
          <TextField
            label="胸围"
            type="number"
            inputMode="decimal"
            value={chest}
            onChange={(event) => setChest(event.target.value)}
            hint="cm"
          />
          <TextField
            label="腰围"
            type="number"
            inputMode="decimal"
            value={waist}
            onChange={(event) => setWaist(event.target.value)}
            hint="cm"
          />
          <TextField
            label="臀围"
            type="number"
            inputMode="decimal"
            value={hip}
            onChange={(event) => setHip(event.target.value)}
            hint="cm"
          />
        </div>
        <div className="form-row">
          <TextField
            label="内侧裤长"
            type="number"
            inputMode="decimal"
            value={inseam}
            onChange={(event) => setInseam(event.target.value)}
            hint="cm"
            optional
          />
          <TextField
            label="鞋码"
            type="number"
            inputMode="decimal"
            value={shoeSize}
            onChange={(event) => setShoeSize(event.target.value)}
            hint="EU"
          />
        </div>
        <div className="profile-edit-field-block">
          <span className="o-field__label">版型偏好</span>
          <Segmented
            options={FIT_OPTIONS}
            value={fit}
            onChange={setFit}
            ariaLabel="版型偏好"
          />
        </div>
        <div className="profile-edit-field-block">
          <span className="o-field__label">身型</span>
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
          <span className="o-field__label">肤色倾向</span>
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
          <h2>风格与避雷色</h2>
        </div>
        <div className="profile-edit-field-block">
          <span className="o-field__label">风格偏好（至少两种）</span>
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
          label="不想穿的颜色"
          placeholder="用逗号分隔，例如：荧光绿，明黄"
          value={avoidColors}
          onChange={(event) => setAvoidColors(event.target.value)}
          hint="只作为偏好参考，不会硬性排除所有相近颜色"
          optional
        />
      </section>

      <section className="profile-edit-section">
        <div className="profile-edit-section__head">
          <span className="o-eyebrow">WEATHER</span>
          <h2>天气位置</h2>
        </div>
        <div className="location-input-row">
          <span>城市</span>
          <input
            type="text"
            value={city}
            placeholder="例如：上海"
            onChange={(event) => {
              setCity(event.target.value)
              setLatitude(null)
              setLongitude(null)
            }}
          />
          {latitude !== null && (
            <span className="location-pill">
              <LocateFixed size={11} />
              已定位
            </span>
          )}
        </div>
        <button type="button" className="text-button" onClick={detectLocation} disabled={locating}>
          <LocateFixed size={14} />
          {locating ? '正在定位…' : '使用当前位置'}
        </button>
        <p className="profile-edit-hint">
          城市或定位用于获取明天的 Open-Meteo 天气。造型生成时不会持续追踪位置。
        </p>
      </section>

      <div className={cn('profile-edit-footer', photoBusy && 'is-busy')}>
        <Button full size="lg" loading={saving} disabled={photoBusy} onClick={save}>
          保存档案
        </Button>
      </div>
    </div>
  )
}
