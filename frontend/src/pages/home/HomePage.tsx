import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Check, Lock, Plus, UserRound } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/app/AuthProvider'
import { useToast } from '@/app/ToastProvider'
import {
  ManualWeatherFields,
  emptyManualWeather,
  manualFromWeather,
  weatherFromManual,
  type ManualWeatherState,
} from '@/components/ManualWeather'
import { WeatherIcon } from '@/components/WeatherIcon'
import { api, ApiError } from '@/lib/api'
import { trackGeneration } from '@/lib/generation'
import { queryKeys, useHistory, useWardrobe, useWeather } from '@/lib/queries'
import type { OccasionType, Weather, WardrobeItem } from '@/lib/types'
import { cn, getGreetingName, greeting, inferOccasionType } from '@/lib/utils'
import { Avatar, Button, InlineNotice, Sheet, Skeleton } from 'oul-ui'

interface Plan {
  label: string
  type: OccasionType
}

const POPULAR_PLANS: Plan[] = [
  { label: 'Job interview', type: 'interview' },
  { label: 'Office day', type: 'work' },
  { label: 'Dinner date', type: 'date' },
  { label: 'City weekend', type: 'outdoor' },
  { label: 'Night out', type: 'party' },
  { label: 'Travel day', type: 'travel' },
  { label: 'Wedding guest', type: 'formal' },
]

const MAX_OCCASION = 200

function windLabel(speed: number): string {
  if (speed < 12) return 'Light wind'
  if (speed < 30) return 'Breezy'
  return 'Windy'
}

function weatherDetail(weather: Weather): string {
  const extra =
    weather.precipitation_probability >= 30
      ? `${Math.round(weather.precipitation_probability)}% rain`
      : windLabel(weather.wind_speed)
  return `${weather.condition} · ${extra}`
}

function PlanRow({
  label,
  plans,
  selectedKey,
  onSelect,
}: {
  label: string
  plans: Plan[]
  selectedKey: string | null
  onSelect: (key: string, plan: Plan) => void
}) {
  return (
    <section className="plans">
      <h2 className="eyebrow">{label}</h2>
      <div className="plans__row">
        {plans.map((plan) => {
          const key = `${label}:${plan.label}`
          const selected = selectedKey === key
          return (
            <button
              type="button"
              key={key}
              className={cn('plan-chip', selected && 'is-selected')}
              aria-pressed={selected}
              onClick={() => onSelect(key, plan)}
            >
              {plan.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const weatherQuery = useWeather(user)
  const wardrobeQuery = useWardrobe()
  const historyQuery = useHistory(Boolean(user))
  const [planKey, setPlanKey] = useState<string | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [details, setDetails] = useState('')
  const [manual, setManual] = useState<ManualWeatherState | null>(null)
  const [weatherOpen, setWeatherOpen] = useState(false)
  const [draft, setDraft] = useState<ManualWeatherState>(() => emptyManualWeather(user?.city ?? ''))
  const [weatherError, setWeatherError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
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
  const looks = historyQuery.data ?? []
  const availableItems = items.filter((item) => item.available)
  const forcedItems = availableItems.filter((item) => item.force_include)
  // The API lists must-wear items first; the picker needs a stable order so a
  // tile doesn't jump away from the finger after it is toggled.
  const pickerItems = [...availableItems].sort(
    (a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id),
  )
  const autoWeather = weatherQuery.data ?? null
  const weather = manual ? weatherFromManual(manual, user?.city ?? null) : autoWeather

  const frequentPlans = useMemo(() => {
    const counts = new Map<string, Plan & { count: number }>()
    for (const look of looks) {
      const label = look.occasion.trim()
      const key = label.toLowerCase()
      if (!label) continue
      const entry = counts.get(key)
      if (entry) entry.count += 1
      else counts.set(key, { label, type: look.occasion_type, count: 1 })
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 6)
  }, [looks])

  const missingBasics = useMemo(() => {
    const categories = new Set(availableItems.map((item) => item.category))
    const missing: string[] = []
    if (!categories.has('top') && !categories.has('dress')) missing.push('top')
    if (!categories.has('bottom') && !categories.has('dress')) missing.push('bottom')
    if (!categories.has('shoes')) missing.push('shoes')
    return missing
  }, [availableItems])

  const forceMutation = useMutation({
    mutationFn: (item: WardrobeItem) => api.wardrobe.setForce(item.id, !item.force_include),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.wardrobe })
      queryClient.invalidateQueries({ queryKey: queryKeys.wardrobeSummary })
    },
    onError: () => toast.error("Couldn't save. Try again."),
  })

  if (!user) return null

  const trimmedDetails = details.trim()
  const occasion = (
    plan ? (trimmedDetails ? `${plan.label}. ${trimmedDetails}` : plan.label) : trimmedDetails
  ).slice(0, MAX_OCCASION)
  const canGenerate = occasion.length >= 2

  const selectPlan = (key: string, next: Plan) => {
    setError(null)
    if (planKey === key) {
      setPlanKey(null)
      setPlan(null)
    } else {
      setPlanKey(key)
      setPlan(next)
    }
  }

  const openWeather = (message: string | null = null) => {
    setDraft(
      manual ?? (autoWeather ? manualFromWeather(autoWeather, user.city ?? '') : emptyManualWeather(user.city ?? '')),
    )
    setWeatherError(message)
    setWeatherOpen(true)
  }

  const applyWeather = () => {
    if (!weatherFromManual(draft, user.city)) {
      setWeatherError('Add low, high and feels-like temperatures')
      return
    }
    setManual(draft)
    setWeatherOpen(false)
  }

  const generate = async () => {
    setError(null)
    if (!canGenerate) return
    if (!weather) {
      openWeather('Add tomorrow’s weather first')
      return
    }
    setSubmitting(true)
    try {
      const recommendation = await api.recommendations.create({
        occasion,
        occasion_type: plan?.type ?? inferOccasionType(trimmedDetails),
        weather,
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
        requestError instanceof ApiError ? requestError.message : 'Generation failed. Try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const photo = user.base_photo_thumb_url || user.base_photo_url

  return (
    <div className="page page--tab">
      <header className="for-you__head">
        <p className="for-you__greeting">
          {greeting()}, {getGreetingName(user.display_name)}
        </p>
        <Link to="/me" className="round-button" aria-label="Open profile">
          {photo ? <Avatar src={photo} name={user.display_name} size="md" /> : <UserRound size={22} />}
        </Link>
      </header>

      <h1 className="display-title">What are you dressing for?</h1>

      {weatherQuery.isLoading && !manual ? (
        <Skeleton className="weather-card weather-card--skeleton" />
      ) : weather ? (
        <button type="button" className="weather-card" onClick={() => openWeather()}>
          <span className="weather-card__icon">
            <WeatherIcon condition={weather.condition} size={24} strokeWidth={1.5} />
          </span>
          <span className="weather-card__copy">
            <span className="eyebrow">
              {weather.city || user.city || 'Tomorrow'} · {manual ? 'Your forecast' : 'Tomorrow'}
            </span>
            <strong>{weatherDetail(weather)}</strong>
          </span>
          <span className="weather-card__temp">
            <strong>{Math.round(weather.apparent_temp)}°</strong>
            <span>
              H {Math.round(weather.temp_max)}° · L {Math.round(weather.temp_min)}°
            </span>
          </span>
        </button>
      ) : (
        <button type="button" className="weather-card" onClick={() => openWeather()}>
          <span className="weather-card__icon">
            <Plus size={22} strokeWidth={1.6} />
          </span>
          <span className="weather-card__copy">
            <span className="eyebrow">Weather</span>
            <strong>Add tomorrow’s forecast</strong>
          </span>
        </button>
      )}

      {frequentPlans.length > 0 && (
        <PlanRow
          label="Your frequent plans"
          plans={frequentPlans}
          selectedKey={planKey}
          onSelect={selectPlan}
        />
      )}
      <PlanRow label="Popular plans" plans={POPULAR_PLANS} selectedKey={planKey} onSelect={selectPlan} />

      <button type="button" className="must-wear" onClick={() => setPickerOpen(true)}>
        <Lock size={18} strokeWidth={1.8} />
        <strong>Must-wear pieces</strong>
        {forcedItems.length > 0 ? (
          <span className="must-wear__picked">
            {forcedItems.slice(0, 3).map((item) => (
              <img key={item.id} src={item.image_url} alt="" />
            ))}
            <span>{forcedItems.length}</span>
            <ArrowRight size={14} />
          </span>
        ) : (
          <span className="must-wear__action">
            Choose items <ArrowRight size={14} />
          </span>
        )}
      </button>

      {missingBasics.length > 0 && !wardrobeQuery.isLoading && (
        <InlineNotice tone="warning">
          Your closet is missing {missingBasics.join(', ')} —{' '}
          <Link to="/wardrobe/new" className="link">
            add
          </Link>
        </InlineNotice>
      )}

      <div className="composer">
        {error && <InlineNotice tone="critical">{error}</InlineNotice>}
        <textarea
          className="composer__input"
          aria-label="Describe your plans"
          placeholder="Tell me when, where, and what you have planned. Include anything you want to wear."
          value={details}
          maxLength={MAX_OCCASION}
          rows={4}
          onChange={(event) => {
            setDetails(event.target.value)
            setError(null)
          }}
        />
        <Button
          className="composer__submit"
          disabled={!canGenerate}
          loading={submitting}
          rightIcon={!submitting ? <ArrowRight size={18} /> : undefined}
          onClick={generate}
        >
          Generate looks
        </Button>
      </div>

      <Sheet open={weatherOpen} onClose={() => setWeatherOpen(false)} title="Tomorrow’s weather">
        <div className="form-stack">
          {weatherError && <InlineNotice tone="critical">{weatherError}</InlineNotice>}
          <ManualWeatherFields state={draft} onChange={setDraft} />
          <Button full onClick={applyWeather}>
            Use this weather
          </Button>
          {manual && autoWeather && (
            <Button
              full
              variant="secondary"
              onClick={() => {
                setManual(null)
                setWeatherOpen(false)
              }}
            >
              Back to forecast
            </Button>
          )}
        </div>
      </Sheet>

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Must-wear pieces">
        {availableItems.length === 0 ? (
          <p className="muted">No available items yet.</p>
        ) : (
          <div className="pick-grid">
            {pickerItems.map((item) => (
              <button
                type="button"
                key={item.id}
                className={cn('pick-grid__item', item.force_include && 'is-selected')}
                aria-pressed={item.force_include}
                aria-label={item.name}
                disabled={forceMutation.isPending && forceMutation.variables?.id === item.id}
                onClick={() => forceMutation.mutate(item)}
              >
                <img src={item.image_url} alt="" loading="lazy" />
                {item.force_include && (
                  <span className="pick-grid__check">
                    <Check size={13} />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        <Button full onClick={() => setPickerOpen(false)}>
          Done
        </Button>
      </Sheet>
    </div>
  )
}
