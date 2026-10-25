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
  { text: 'A quarterly review at the office', type: 'work' as OccasionType },
  { text: 'A relaxed dinner with friends', type: 'dinner' as OccasionType },
  { text: 'A weekend walk and gallery visit', type: 'date' as OccasionType },
  { text: 'A train to another city for work', type: 'travel' as OccasionType },
]

const CONDITION_OPTIONS = ['Clear', 'Partly cloudy', 'Overcast', 'Light rain', 'Heavy rain', 'Light snow', 'Thunderstorm']

function weatherIconFor(condition: string): string {
  const value = condition.toLowerCase()
  if (value.includes('thunder') || value.includes('storm')) return '⛈️'
  if (value.includes('snow')) return '🌨️'
  if (value.includes('rain')) return '🌧️'
  if (value.includes('overcast')) return '☁️'
  if (value.includes('cloud')) return '⛅'
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
  condition: 'Clear',
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
          <span>Low</span>
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
          <span>High</span>
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
          <span>Feels like</span>
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
          <span>Condition</span>
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
          <span>Chance of rain</span>
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
          <span>Wind</span>
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
        <span>City</span>
        <input
          type="text"
          value={state.city}
          onChange={(event) => set('city', event.target.value)}
          placeholder="e.g. Shanghai"
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
    if (!categories.has('top') && !categories.has('dress')) missing.push('a top or dress')
    if (!categories.has('bottom') && !categories.has('dress')) missing.push('a bottom')
    if (!categories.has('shoes')) missing.push('shoes')
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
        title: updated.force_include ? 'Added to must-wear' : 'Must-wear removed',
        description: updated.name,
      })
    },
    onError: () => toast.error("Must-wear didn't save. Try again."),
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
      setError("Tell us where you're going and what you're doing tomorrow.")
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (!effectiveWeather) {
      if (!manualWeather) openManualWeather()
      setError("Add tomorrow's weather, or set your city in Profile to fetch it automatically.")
      return
    }
    setSubmitting(true)
    try {
      const recommendation = await api.recommendations.create({
        occasion: occasion.trim(),
        occasion_type: occasionType,
        weather: effectiveWeather,
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
          : "Your looks didn't generate. Please try again.",
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
          Tomorrow
        </Badge>
      </header>

      <section className="style-heading">
        <p className="o-eyebrow">THE TOMORROW EDIT · 03 LOOKS</p>
        <h1>
          Tomorrow,
          <br />
          <span className="serif">what to wear?</span>
        </h1>
        <p>Describe the occasion and we'll style three possibilities from your wardrobe.</p>
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
            <h2>Tomorrow's occasion</h2>
            <p>A real sentence works better than a label.</p>
          </div>
        </div>
        <TextAreaField
          label="Where are you going, and what are you doing?"
          placeholder="e.g. A client pitch tomorrow morning, then dinner with the team. I want to look professional, but not like a uniform."
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
            <h2>Tomorrow's weather</h2>
            <p>Temperature sets the fabric; rain sets the shoes.</p>
          </div>
        </div>

        {weatherQuery.isLoading ? (
          <div className="weather-loading">
            <span className="o-spinner o-spinner--sm" />
            Checking tomorrow's weather
          </div>
        ) : manualWeather ? (
          <div className="manual-weather-wrap">
            <div className="manual-weather-head">
              <span>
                <MapPin size={13} />
                Manual weather
              </span>
              {autoWeather && (
                <button type="button" className="text-button" onClick={() => setManualWeather(false)}>
                  <RefreshCw size={13} />
                  Use auto weather
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
                  {autoWeather.condition} · feels like {Math.round(autoWeather.apparent_temp)}°
                </em>
              </div>
            </div>
            <div className="style-weather-card__side">
              <span>
                <MapPin size={12} />
                {autoWeather.city || user.city || 'Current location'}
              </span>
              <span>{autoWeather.precipitation_probability}% rain</span>
            </div>
            <button type="button" className="style-weather-card__edit" onClick={openManualWeather}>
              Adjust manually
            </button>
          </div>
        ) : (
          <div className="weather-fallback">
            <InlineNotice tone="info" icon={<CloudSun size={17} />}>
              {autoUnavailable
                ? "We couldn't fetch the weather. Enter it manually, or reset your city in Profile."
                : "No weather location set yet. You can still start by entering tomorrow's feels-like temperature."}
            </InlineNotice>
            <button type="button" className="text-button" onClick={openManualWeather}>
              Enter weather manually
            </button>
          </div>
        )}
      </section>

      <section className="style-block">
        <div className="style-block__head style-block__head--row">
          <span className="style-block__index">03</span>
          <div>
            <h2>Must-wear pieces</h2>
            <p>Pieces marked must-wear appear in every look.</p>
          </div>
          <Link to="/wardrobe" className="text-link">
            Manage
            <ArrowUpRight size={13} />
          </Link>
        </div>
        {forcedItems.length === 0 ? (
          <Link to="/wardrobe" className="forced-empty">
            <Lock size={16} />
            <span>No must-wear pieces yet. Any wardrobe item can be set as must-wear for the next look.</span>
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
                  aria-label={`Remove ${item.name} from must-wear`}
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
            If a must-wear piece clashes with the weather or occasion, OUL keeps it in and tells you why.
          </div>
        )}
      </section>

      <section className="style-profile-strip">
        <div className="style-profile-strip__photo">
          {user.base_photo_thumb_url ? (
            <img src={user.base_photo_thumb_url} alt="Your base photo" />
          ) : (
            <span>
              <ImageIcon size={17} />
            </span>
          )}
        </div>
        <div>
          <strong>Your body profile</strong>
          <span>
            {user.height_cm ? `${user.height_cm} cm` : 'Height not set'} · {fitLabel(user.fit_preference)}
            {user.style_preferences.length
              ? ` · ${user.style_preferences.slice(0, 2).join(', ')}`
              : ''}
          </span>
        </div>
        <Link to="/me/edit" aria-label="Edit body profile">
          Edit
        </Link>
      </section>

      {missingBasics.length > 0 && (
        <InlineNotice tone="warning" icon={<Sparkles size={16} />}>
          Your wardrobe is missing {missingBasics.join(', ')} right now. You can still generate
          looks — we'll flag the gap and suggest specific pieces to add.
        </InlineNotice>
      )}

      <footer className="style-generate-footer">
        <div className="style-generate-footer__meta">
          <div>
            <span>3 looks</span>
            <em>{availableItems.length} available items</em>
          </div>
          <div className="style-generate-footer__tags">
            <span>White background</span>
            {forcedItems.length > 0 && <span>{forcedItems.length} must-wear</span>}
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
          {submitting ? 'Styling your looks…' : 'Generate 3 looks for tomorrow'}
        </Button>
      </footer>
    </div>
  )
}
