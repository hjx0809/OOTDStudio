import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  CloudSun,
  Image as ImageIcon,
  Lock,
  MapPin,
  RefreshCw,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/app/AuthProvider'
import { useToast } from '@/app/ToastProvider'
import { Brand } from '@/components/Brand'
import { WeatherIcon } from '@/components/WeatherIcon'
import { api, ApiError } from '@/lib/api'
import { trackGeneration } from '@/lib/generation'
import { queryKeys, useWardrobe, useWeather } from '@/lib/queries'
import type {
  BackgroundMode,
  OccasionType,
  Weather,
  WardrobeItem,
} from '@/lib/types'
import {
  OCCASION_OPTIONS,
  cn,
  fitLabel,
  inferOccasionType,
  tomorrowISO,
} from '@/lib/utils'
import {
  Badge,
  Button,
  Chip,
  InlineNotice,
  TextAreaField,
} from 'oul-ui'

const OCCASION_SUGGESTIONS = [
  { text: '去公司做季度汇报', type: 'work' as OccasionType },
  { text: '和朋友吃一顿轻松的晚餐', type: 'dinner' as OccasionType },
  { text: '周末在城里散步、看展', type: 'date' as OccasionType },
  { text: '坐高铁去另一个城市出差', type: 'travel' as OccasionType },
]

const BACKGROUND_PROMPTS = [
  '清晨的清水混凝土庭院，柔和的侧光',
  '傍晚城市屋顶，背景轻微虚化',
  '安静的画廊白墙与自然天光',
  '有绿植和木地板的温暖室内',
]

const CONDITION_OPTIONS = ['晴朗', '多云', '阴天', '小雨', '大雨', '小雪', '雷阵雨']

function weatherIconFor(condition: string): string {
  if (condition.includes('雷')) return '⛈️'
  if (condition.includes('雪')) return '🌨️'
  if (condition.includes('雨')) return '🌧️'
  if (condition.includes('阴')) return '☁️'
  if (condition.includes('云')) return '⛅'
  return '☀️'
}

interface ManualWeatherState {
  tempMin: string
  tempMax: string
  apparent: string
  rain: string
  wind: string
  condition: string
  city: string
}

const EMPTY_MANUAL: ManualWeatherState = {
  tempMin: '',
  tempMax: '',
  apparent: '',
  rain: '0',
  wind: '0',
  condition: '晴朗',
  city: '',
}

function ManualWeatherFields({
  state,
  onChange,
}: {
  state: ManualWeatherState
  onChange: (state: ManualWeatherState) => void
}) {
  const set = (key: keyof ManualWeatherState, value: string) =>
    onChange({ ...state, [key]: value })
  return (
    <div className="manual-weather">
      <div className="manual-weather__row">
        <label>
          <span>最低</span>
          <span className="manual-weather__input">
            <input
              type="number"
              inputMode="decimal"
              value={state.tempMin}
              onChange={(event) => set('tempMin', event.target.value)}
              placeholder="16"
            />
            <em>°C</em>
          </span>
        </label>
        <label>
          <span>最高</span>
          <span className="manual-weather__input">
            <input
              type="number"
              inputMode="decimal"
              value={state.tempMax}
              onChange={(event) => set('tempMax', event.target.value)}
              placeholder="23"
            />
            <em>°C</em>
          </span>
        </label>
        <label>
          <span>体感</span>
          <span className="manual-weather__input">
            <input
              type="number"
              inputMode="decimal"
              value={state.apparent}
              onChange={(event) => set('apparent', event.target.value)}
              placeholder="19"
            />
            <em>°C</em>
          </span>
        </label>
      </div>
      <div className="manual-weather__row manual-weather__row--two">
        <label>
          <span>天气</span>
          <select
            value={state.condition}
            onChange={(event) => set('condition', event.target.value)}
          >
            {CONDITION_OPTIONS.map((condition) => (
              <option key={condition} value={condition}>
                {condition}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>降水概率</span>
          <span className="manual-weather__input">
            <input
              type="number"
              inputMode="numeric"
              value={state.rain}
              onChange={(event) => set('rain', event.target.value)}
            />
            <em>%</em>
          </span>
        </label>
        <label>
          <span>风速</span>
          <span className="manual-weather__input">
            <input
              type="number"
              inputMode="decimal"
              value={state.wind}
              onChange={(event) => set('wind', event.target.value)}
            />
            <em>km/h</em>
          </span>
        </label>
      </div>
      <label className="manual-weather__city">
        <span>城市</span>
        <input
          type="text"
          value={state.city}
          onChange={(event) => set('city', event.target.value)}
          placeholder="例如：上海"
        />
      </label>
    </div>
  )
}

export function StylePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const wardrobeQuery = useWardrobe()
  const weatherQuery = useWeather(user)
  const [occasion, setOccasion] = useState('')
  const [occasionType, setOccasionType] = useState<OccasionType>('everyday')
  const [typeTouched, setTypeTouched] = useState(false)
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>('studio')
  const [backgroundPrompt, setBackgroundPrompt] = useState('')
  const [manualWeather, setManualWeather] = useState(false)
  const [manual, setManual] = useState<ManualWeatherState>({
    ...EMPTY_MANUAL,
    city: user?.city ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const items = wardrobeQuery.data ?? []
  const availableItems = items.filter((item) => item.available)
  const forcedItems = availableItems.filter((item) => item.force_include)
  const missingBasics = useMemo(() => {
    const categories = new Set(availableItems.map((item) => item.category))
    const missing: string[] = []
    if (!categories.has('top') && !categories.has('dress')) missing.push('上装或连衣裙')
    if (!categories.has('bottom') && !categories.has('dress')) missing.push('下装')
    if (!categories.has('shoes')) missing.push('鞋履')
    return missing
  }, [availableItems])

  const autoWeather = weatherQuery.data
  const autoUnavailable =
    !weatherQuery.isLoading && !autoWeather && Boolean(user?.city || user?.latitude)

  const effectiveWeather: Weather | null = useMemo(() => {
    if (manualWeather) {
      const tempMin = Number(manual.tempMin)
      const tempMax = Number(manual.tempMax)
      const apparent = Number(manual.apparent)
      if (
        manual.tempMin === '' ||
        manual.tempMax === '' ||
        manual.apparent === '' ||
        !Number.isFinite(tempMin) ||
        !Number.isFinite(tempMax) ||
        !Number.isFinite(apparent) ||
        tempMax < tempMin
      ) {
        return null
      }
      return {
        city: manual.city || user?.city || null,
        date: tomorrowISO(),
        temp_min: tempMin,
        temp_max: tempMax,
        apparent_temp: apparent,
        precipitation_probability: Math.max(0, Math.min(100, Number(manual.rain) || 0)),
        wind_speed: Math.max(0, Number(manual.wind) || 0),
        condition: manual.condition,
        icon: weatherIconFor(manual.condition),
        source: 'manual',
      }
    }
    return autoWeather ?? null
  }, [manualWeather, manual, autoWeather, user?.city])

  const openManualWeather = () => {
    if (autoWeather) {
      setManual({
        tempMin: String(autoWeather.temp_min),
        tempMax: String(autoWeather.temp_max),
        apparent: String(autoWeather.apparent_temp),
        rain: String(autoWeather.precipitation_probability),
        wind: String(autoWeather.wind_speed),
        condition: autoWeather.condition,
        city: autoWeather.city || user?.city || '',
      })
    }
    setManualWeather(true)
  }

  const forceMutation = useMutation({
    mutationFn: (item: WardrobeItem) => api.wardrobe.setForce(item.id, !item.force_include),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.wardrobe })
      queryClient.invalidateQueries({ queryKey: queryKeys.wardrobeSummary })
      toast.toast({
        title: updated.force_include ? '已加入下次必穿' : '已取消必穿',
        description: updated.name,
      })
    },
    onError: () => toast.error('必穿状态没有保存，请重试'),
  })

  const updateOccasionText = (value: string) => {
    setOccasion(value)
    if (!typeTouched && value.trim()) {
      setOccasionType(inferOccasionType(value))
    }
  }

  const generate = async () => {
    setError(null)
    if (!occasion.trim()) {
      setError('先说一说，明天要去哪里、做什么？')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (!effectiveWeather) {
      if (!manualWeather) openManualWeather()
      setError('请先填写明天的天气，或到「我的」设置城市以自动获取。')
      return
    }
    if (backgroundMode === 'custom' && !backgroundPrompt.trim()) {
      setError('自定义背景需要一句画面描述')
      return
    }
    setSubmitting(true)
    try {
      const recommendation = await api.recommendations.create({
        occasion: occasion.trim(),
        occasion_type: occasionType,
        weather: effectiveWeather,
        background_mode: backgroundMode,
        background_prompt:
          backgroundMode === 'custom' ? backgroundPrompt.trim() : null,
        forced_item_ids: forcedItems.map((item) => item.id),
        outfit_count: 3,
      })
      queryClient.setQueryData(queryKeys.recommendation(recommendation.id), recommendation)
      queryClient.invalidateQueries({ queryKey: queryKeys.history })
      // The POST returns a pending job immediately; track it globally so it
      // keeps polling (and stays visible) even if the user moves elsewhere.
      trackGeneration(recommendation.id, 'looks')
      if (mounted.current) navigate(`/looks/${recommendation.id}`)
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : '造型没有生成成功，请稍后再试',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) return null

  return (
    <div className="page style-page">
      <header className="subpage-top">
        <Brand />
        <Badge tone="neutral">
          <CalendarDays size={11} />
          明天
        </Badge>
      </header>

      <section className="style-heading">
        <p className="o-eyebrow">THE TOMORROW EDIT · 03 LOOKS</p>
        <h1>
          明天，
          <br />
          <span className="serif">穿什么？</span>
        </h1>
        <p>描述场景，我们会从你的衣橱里组合三种可能。</p>
      </section>

      {error && (
        <InlineNotice tone="critical" className="style-page__error">
          {error}
        </InlineNotice>
      )}

      <section className="style-block">
        <div className="style-block__head">
          <span className="style-block__index">01</span>
          <div>
            <h2>明天的场景</h2>
            <p>一句真实的描述，比一个标签更有用。</p>
          </div>
        </div>
        <TextAreaField
          label="要去哪里，做什么？"
          placeholder="例如：明天上午去客户公司做提案，下午可能还要一起吃晚饭。想穿得专业，但不要像制服。"
          value={occasion}
          maxLength={200}
          onChange={(event) => updateOccasionText(event.target.value)}
          hint={`${occasion.length}/200`}
          wrapperClassName="occasion-text-field"
        />
        <div className="occasion-suggestions">
          {OCCASION_SUGGESTIONS.map((suggestion) => (
            <Chip
              key={suggestion.text}
              onClick={() => {
                setOccasion(suggestion.text)
                setOccasionType(suggestion.type)
                setTypeTouched(true)
              }}
            >
              {suggestion.text}
            </Chip>
          ))}
        </div>

        <div className="occasion-grid">
          {OCCASION_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                'occasion-option',
                occasionType === option.value && 'is-active',
              )}
              onClick={() => {
                setOccasionType(option.value)
                setTypeTouched(true)
              }}
              aria-pressed={occasionType === option.value}
            >
              <span>{option.label}</span>
              <em>{option.hint}</em>
              {occasionType === option.value && (
                <span className="occasion-option__check">
                  <Check size={11} />
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      <section className="style-block">
        <div className="style-block__head">
          <span className="style-block__index">02</span>
          <div>
            <h2>明天的天气</h2>
            <p>温度决定面料，降水决定鞋履。</p>
          </div>
        </div>

        {weatherQuery.isLoading ? (
          <div className="weather-loading">
            <span className="o-spinner o-spinner--sm" />
            正在查看明天的天气
          </div>
        ) : manualWeather ? (
          <div className="manual-weather-wrap">
            <div className="manual-weather-head">
              <span>
                <MapPin size={13} />
                手动天气
              </span>
              {autoWeather && (
                <button type="button" className="text-button" onClick={() => setManualWeather(false)}>
                  <RefreshCw size={13} />
                  改用自动天气
                </button>
              )}
            </div>
            <ManualWeatherFields state={manual} onChange={setManual} />
          </div>
        ) : autoWeather ? (
          <div className="style-weather-card">
            <div className="style-weather-card__main">
              <span className="style-weather-card__icon">
                <WeatherIcon condition={autoWeather.condition} size={27} />
              </span>
              <div>
                <span className="o-eyebrow">TOMORROW</span>
                <strong>
                  {Math.round(autoWeather.temp_min)}° – {Math.round(autoWeather.temp_max)}°
                </strong>
                <em>
                  {autoWeather.condition} · 体感 {Math.round(autoWeather.apparent_temp)}°
                </em>
              </div>
            </div>
            <div className="style-weather-card__side">
              <span>
                <MapPin size={12} />
                {autoWeather.city || user.city || '当前位置'}
              </span>
              <span>{autoWeather.precipitation_probability}% 降水</span>
            </div>
            <button type="button" className="style-weather-card__edit" onClick={openManualWeather}>
              手动调整
            </button>
          </div>
        ) : (
          <div className="weather-fallback">
            <InlineNotice tone="info" icon={<CloudSun size={17} />}>
              {autoUnavailable
                ? '没有取得自动天气，请手动填写，或到「我的」重新设置城市。'
                : '还没有设置天气位置。手动填写明天的体感温度，也可以开始。'}
            </InlineNotice>
            <button type="button" className="text-button" onClick={openManualWeather}>
              手动填写天气
            </button>
          </div>
        )}
      </section>

      <section className="style-block">
        <div className="style-block__head">
          <span className="style-block__index">03</span>
          <div>
            <h2>试穿背景</h2>
            <p>选择纯净影棚，或给造型一个场景。</p>
          </div>
        </div>
        <div className="background-options">
          <button
            type="button"
            className={cn('background-option', backgroundMode === 'studio' && 'is-active')}
            onClick={() => setBackgroundMode('studio')}
            aria-pressed={backgroundMode === 'studio'}
          >
            <span className="background-option__visual background-option__visual--studio">
              <span>OUL</span>
            </span>
            <span className="background-option__label">
              <strong>纯净影棚</strong>
              <em>留白背景，专注造型</em>
            </span>
            {backgroundMode === 'studio' && (
              <span className="background-option__check">
                <Check size={11} />
              </span>
            )}
          </button>
          <button
            type="button"
            className={cn('background-option', backgroundMode === 'custom' && 'is-active')}
            onClick={() => setBackgroundMode('custom')}
            aria-pressed={backgroundMode === 'custom'}
          >
            <span className="background-option__visual background-option__visual--custom">
              <span />
              <span />
            </span>
            <span className="background-option__label">
              <strong>自定义场景</strong>
              <em>用一句话描述背景</em>
            </span>
            {backgroundMode === 'custom' && (
              <span className="background-option__check">
                <Check size={11} />
              </span>
            )}
          </button>
        </div>
        {backgroundMode === 'custom' && (
          <div className="background-prompt">
            <TextAreaField
              label="画面描述"
              placeholder="例如：清晨的清水混凝土庭院，柔和的侧光，背景干净，不遮挡全身。"
              value={backgroundPrompt}
              maxLength={500}
              onChange={(event) => setBackgroundPrompt(event.target.value)}
            />
            <div className="chip-wrap">
              {BACKGROUND_PROMPTS.map((prompt) => (
                <Chip key={prompt} onClick={() => setBackgroundPrompt(prompt)}>
                  {prompt}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="style-block">
        <div className="style-block__head style-block__head--row">
          <span className="style-block__index">04</span>
          <div>
            <h2>必穿单品</h2>
            <p>标为「必穿」的单品会出现在每套造型中。</p>
          </div>
          <Link to="/wardrobe" className="text-link">
            管理
            <ArrowUpRight size={13} />
          </Link>
        </div>
        {forcedItems.length === 0 ? (
          <Link to="/wardrobe" className="forced-empty">
            <Lock size={16} />
            <span>还没有必穿单品。衣橱里每件单品都可以设为下次必穿。</span>
            <ChevronDown size={15} style={{ transform: 'rotate(-90deg)' }} />
          </Link>
        ) : (
          <div className="forced-items">
            {forcedItems.map((item) => (
              <div className="forced-item" key={item.id}>
                <img src={item.image_url} alt={item.name} />
                <span>
                  <strong>{item.name}</strong>
                  <em>{item.category_label}</em>
                </span>
                <button
                  type="button"
                  className="forced-item__remove"
                  aria-label={`取消 ${item.name} 必穿`}
                  onClick={() => forceMutation.mutate(item)}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        {forcedItems.length > 0 && (
          <div className="forced-list-note">
            <Lock size={12} />
            若必穿单品与天气或场景冲突，OUL 会保留单品并给出明确提示。
          </div>
        )}
      </section>

      <section className="style-profile-strip">
        <div className="style-profile-strip__photo">
          {user.base_photo_thumb_url ? (
            <img src={user.base_photo_thumb_url} alt="你的基础照片" />
          ) : (
            <span>
              <ImageIcon size={17} />
            </span>
          )}
        </div>
        <div>
          <strong>你的身体档案</strong>
          <span>
            {user.height_cm ? `${user.height_cm} cm` : '身高未填'} · {fitLabel(user.fit_preference)}
            {user.style_preferences.length
              ? ` · ${user.style_preferences.slice(0, 2).join('、')}`
              : ''}
          </span>
        </div>
        <Link to="/me/edit" aria-label="编辑身体档案">
          编辑
        </Link>
      </section>

      {missingBasics.length > 0 && (
        <InlineNotice tone="warning" icon={<Sparkles size={16} />}>
          衣橱里暂时缺少{missingBasics.join('、')}。你仍然可以生成造型，
          我们会标出缺口，并给出具体的添置建议。
        </InlineNotice>
      )}

      <footer className="style-generate-footer">
        <div className="style-generate-footer__meta">
          <div>
            <span>3 套造型</span>
            <em>{availableItems.length} 件可用单品</em>
          </div>
          <div className="style-generate-footer__tags">
            <span>{backgroundMode === 'studio' ? '纯净背景' : '自定义背景'}</span>
            {forcedItems.length > 0 && <span>{forcedItems.length} 件必穿</span>}
          </div>
        </div>
        <Button
          variant="accent"
          size="lg"
          full
          loading={submitting}
          leftIcon={!submitting ? <WandSparkles size={18} /> : undefined}
          onClick={generate}
        >
          {submitting ? '正在为你挑选…' : '生成 3 套明日造型'}
        </Button>
      </footer>
    </div>
  )
}
