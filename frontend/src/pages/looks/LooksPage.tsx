import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Info,
  Lock,
  LockOpen,
  Plus,
  RefreshCw,
  WandSparkles,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode, type UIEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useToast } from '@/app/ToastProvider'
import { PageHeader } from '@/components/PageHeader'
import { WeatherIcon } from '@/components/WeatherIcon'
import { api, ApiError } from '@/lib/api'
import { trackGeneration } from '@/lib/generation'
import { queryKeys, useRecommendation } from '@/lib/queries'
import type {
  Outfit,
  OutfitItem,
  OutfitWarning,
  Recommendation,
  ShoppingSuggestion,
} from '@/lib/types'
import { CATEGORY_META, OCCASION_META, cn, formatLookDate } from '@/lib/utils'
import { Badge, Button, InlineNotice, Skeleton, Spinner } from 'oul-ui'

function OutfitCollage({ outfit }: { outfit: Outfit }) {
  const items = outfit.items.slice(0, 4)
  return (
    <div className="collage">
      <div className={cn('collage__grid', `collage__grid--${Math.max(items.length, 1)}`)} aria-hidden="true">
        {items.map((item) => (
          <img key={item.id} src={item.image_url} alt="" />
        ))}
      </div>
      <div className="collage__status">
        <Spinner size="sm" />
        Trying it on you…
      </div>
    </div>
  )
}

/** The generated try-on (or lookboard). Hidden when there is no image to show. */
function LookVisual({ outfit }: { outfit: Outfit }) {
  const [imageFailed, setImageFailed] = useState(false)
  const pending = outfit.image_status === 'pending' || outfit.image_status === 'generating'
  const isLookboard = outfit.image_kind === 'lookboard'
  const hasImage =
    Boolean(outfit.image_url) &&
    !imageFailed &&
    (outfit.image_status === 'ready' || outfit.image_status === 'generating')

  useEffect(() => {
    setImageFailed(false)
  }, [outfit.image_url])

  if (!hasImage && !pending) return null

  return (
    <div className="look-visual">
      {hasImage ? (
        <img
          className={cn('look-visual__image', isLookboard && 'look-visual__image--board')}
          src={outfit.image_url as string}
          alt={`${outfit.title} try-on`}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <OutfitCollage outfit={outfit} />
      )}
      {outfit.image_kind === 'ai_tryon' && (
        <div className="look-visual__badges">
          <Badge tone="dark">
            <WandSparkles size={10} />
            AI try-on
          </Badge>
        </div>
      )}
      {pending && hasImage && (
        <div className="collage__status">
          <Spinner size="sm" />
          Updating…
        </div>
      )}
    </div>
  )
}

function categoryLabel(item: OutfitItem): string {
  return item.category_label || CATEGORY_META[item.category]?.label || 'Piece'
}

function PieceRow({
  item,
  onToggleAvailable,
  onToggleForce,
  busyAvailable,
  busyForce,
}: {
  item: OutfitItem
  onToggleAvailable: () => void
  onToggleForce: () => void
  busyAvailable: boolean
  busyForce: boolean
}) {
  const detail = item.available
    ? item.force_include
      ? 'Locked in'
      : item.color_name || 'Available'
    : 'Swapped out next time'
  return (
    <div className={cn('piece', !item.available && 'is-unavailable')}>
      <img className="piece__image" src={item.image_url} alt="" loading="lazy" />
      <div className="piece__copy">
        <strong>{item.name}</strong>
        <span>
          {categoryLabel(item)} · {detail}
        </span>
      </div>
      <div className="piece__actions">
        <button
          type="button"
          className={cn('pill-button', item.force_include && 'is-on')}
          onClick={onToggleForce}
          disabled={busyForce || !item.available}
          aria-pressed={item.force_include}
          aria-label={item.force_include ? `Unlock ${item.name}` : `Lock ${item.name} as must-wear`}
        >
          {item.force_include ? <Lock size={16} /> : <LockOpen size={16} />}
          {item.force_include ? 'Locked' : 'Lock'}
        </button>
        <button
          type="button"
          className="pill-button pill-button--outline"
          onClick={onToggleAvailable}
          disabled={busyAvailable}
          aria-label={item.available ? `Replace ${item.name}` : `Keep ${item.name}`}
        >
          {item.available ? 'Replace item' : 'Keep item'}
        </button>
      </div>
    </div>
  )
}

function LookCard({
  outfit,
  index,
  children,
}: {
  outfit: Outfit
  index: number
  children: ReactNode
}) {
  return (
    <article className="look-card">
      <div className="look-card__head">
        <div className="look-card__title">
          <span className="eyebrow">Option {index + 1}</span>
          <h3>{outfit.title}</h3>
        </div>
        <span className="match">
          <strong>{outfit.score}%</strong>
          <span>Match</span>
        </span>
      </div>

      <LookVisual outfit={outfit} />

      <div className="look-tiles">
        {outfit.items.map((item) => (
          <div className="look-tile" key={item.id}>
            <span className="eyebrow">{categoryLabel(item)}</span>
            <img src={item.image_url} alt="" loading="lazy" />
            <strong>{item.name}</strong>
          </div>
        ))}
      </div>

      {(outfit.rationale || outfit.styling_note) && (
        <div className="why-card">
          <span className="eyebrow">Why it works</span>
          {outfit.rationale && <p>{outfit.rationale}</p>}
          {outfit.styling_note && <p className="why-card__note">{outfit.styling_note}</p>}
        </div>
      )}

      {children}

      <WarningList warnings={outfit.warnings} />
    </article>
  )
}

function WarningList({ warnings }: { warnings: OutfitWarning[] }) {
  if (!warnings.length) return null
  return (
    <div className="stack-sm">
      {warnings.map((warning, index) => (
        <InlineNotice
          key={`${warning.code}-${index}`}
          tone={
            warning.severity === 'critical'
              ? 'critical'
              : warning.severity === 'warning'
                ? 'warning'
                : 'info'
          }
          icon={
            warning.severity === 'info' ? <Info size={15} /> : <AlertTriangle size={15} />
          }
        >
          {warning.message}
        </InlineNotice>
      ))}
    </div>
  )
}

function ShoppingList({ suggestions }: { suggestions: ShoppingSuggestion[] }) {
  return (
    <div className="o-list">
      {suggestions.map((suggestion) => (
        <a
          key={`${suggestion.category}-${suggestion.title}`}
          className="o-list-row"
          href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(suggestion.search_query)}`}
          target="_blank"
          rel="noreferrer"
        >
          <span className="o-list-row__copy">
            <span className="o-list-row__title">
              {suggestion.title}
              {suggestion.priority === 'high' && (
                <Badge tone="dark" className="inline-badge">
                  Key
                </Badge>
              )}
            </span>
            <span className="o-list-row__description">{suggestion.reason}</span>
          </span>
          <span className="o-list-row__trailing">
            <ArrowUpRight size={16} />
          </span>
        </a>
      ))}
    </div>
  )
}

function StateScreen({
  title,
  onBack,
  children,
}: {
  title?: string
  onBack: () => void
  children: ReactNode
}) {
  return (
    <div className="page page--bare">
      <PageHeader title={title} onBack={onBack} />
      {children}
    </div>
  )
}

export function LooksPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const toast = useToast()
  const recommendationQuery = useRecommendation(id)
  const [index, setIndex] = useState(0)
  const [stale, setStale] = useState(false)
  const [rerolling, setRerolling] = useState(false)
  const deckRef = useRef<HTMLDivElement>(null)
  const recommendation = recommendationQuery.data
  const outfits = recommendation?.outfits ?? []

  useEffect(() => {
    setIndex(0)
    setStale(false)
    deckRef.current?.scrollTo({ left: 0 })
  }, [recommendation?.id])

  // Opening any unfinished recommendation (history, another tab, a reload)
  // hands it to the global monitor so progress is visible on every page.
  useEffect(() => {
    if (!recommendation || recommendation.is_complete) return
    trackGeneration(
      recommendation.id,
      recommendation.status === 'planning' ? 'looks' : 'render',
    )
  }, [recommendation?.id, recommendation?.is_complete, recommendation?.status])

  const setCached = (updater: (old: Recommendation) => Recommendation) => {
    if (!id) return
    queryClient.setQueryData<Recommendation>(queryKeys.recommendation(id), (old) =>
      old ? updater(old) : old,
    )
  }

  const availabilityMutation = useMutation({
    mutationFn: (item: OutfitItem) => api.wardrobe.setAvailability(item.id, !item.available),
    onSuccess: (updated) => {
      setCached((current) => ({
        ...current,
        outfits: current.outfits.map((outfit) => ({
          ...outfit,
          items: outfit.items.map((item) =>
            item.id === updated.id
              ? { ...item, available: updated.available, force_include: updated.force_include }
              : item,
          ),
        })),
      }))
      queryClient.invalidateQueries({ queryKey: queryKeys.wardrobe })
      setStale(true)
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Couldn't save"),
  })

  const forceMutation = useMutation({
    mutationFn: (item: OutfitItem) => api.wardrobe.setForce(item.id, !item.force_include),
    onSuccess: (updated) => {
      setCached((current) => ({
        ...current,
        outfits: current.outfits.map((outfit) => ({
          ...outfit,
          items: outfit.items.map((item) =>
            item.id === updated.id ? { ...item, force_include: updated.force_include } : item,
          ),
        })),
      }))
      queryClient.invalidateQueries({ queryKey: queryKeys.wardrobe })
      setStale(true)
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Couldn't save"),
  })

  const reroll = async () => {
    if (!recommendation) return
    setRerolling(true)
    try {
      const fresh = await api.recommendations.reroll(recommendation.id)
      queryClient.setQueryData(queryKeys.recommendation(fresh.id), fresh)
      queryClient.invalidateQueries({ queryKey: queryKeys.history })
      trackGeneration(fresh.id, 'looks')
      setStale(false)
      navigate(`/looks/${fresh.id}`, { replace: true })
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Regenerate failed')
    } finally {
      setRerolling(false)
    }
  }

  const onDeckScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget
    if (!element.clientWidth) return
    const nextIndex = Math.round(element.scrollLeft / element.clientWidth)
    if (nextIndex !== index && nextIndex >= 0 && nextIndex < outfits.length) {
      setIndex(nextIndex)
    }
  }

  const scrollToLook = (target: number) => {
    const deck = deckRef.current
    if (!deck) return
    deck.scrollTo({ left: deck.clientWidth * target, behavior: 'smooth' })
    // The pager sits below a tall card; bring the next card's top into view.
    if (deck.getBoundingClientRect().top < 0) {
      deck.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'smooth' })
    }
    setIndex(target)
  }

  const backToStyle = () => navigate('/')
  // Looks opened from the history tab return there; everything else goes home.
  const backTo = (location.state as { from?: string } | null)?.from ?? '/'
  const goBack = () => navigate(backTo)

  if (recommendationQuery.isLoading) {
    return (
      <StateScreen onBack={() => navigate(-1)}>
        <Skeleton className="look-visual" />
      </StateScreen>
    )
  }

  if (recommendationQuery.isError || !recommendation) {
    return (
      <StateScreen onBack={goBack}>
        <div className="center-state">
          <h2>Look not found</h2>
          <Button onClick={backToStyle}>New look</Button>
        </div>
      </StateScreen>
    )
  }

  if (recommendation.status === 'planning') {
    return (
      <StateScreen onBack={goBack}>
        <div className="center-state">
          <Spinner size="lg" />
          <h2>Styling your looks…</h2>
          <p className="muted">About a minute. You can leave — it keeps going.</p>
        </div>
      </StateScreen>
    )
  }

  if (recommendation.status === 'failed') {
    return (
      <StateScreen onBack={goBack}>
        <div className="center-state">
          <h2>Something went wrong</h2>
          <p className="muted">
            {recommendation.warnings[0]?.message ?? 'Generation stopped.'}
          </p>
          <Button leftIcon={<RefreshCw size={16} />} onClick={backToStyle}>
            Try again
          </Button>
        </div>
      </StateScreen>
    )
  }

  if (recommendation.status === 'wardrobe_gap' || outfits.length === 0) {
    return (
      <StateScreen title="Not enough pieces" onBack={goBack}>
        {recommendation.scenario_note && <p className="muted">{recommendation.scenario_note}</p>}
        <WarningList warnings={recommendation.warnings} />
        {recommendation.shopping_suggestions.length > 0 && (
          <section className="section">
            <div className="section__head">
              <h2>What would help</h2>
            </div>
            <ShoppingList suggestions={recommendation.shopping_suggestions} />
          </section>
        )}
        <div className="stack-sm">
          <Button full leftIcon={<Plus size={16} />} onClick={() => navigate('/wardrobe/new')}>
            Add item
          </Button>
          <Button full variant="ghost" onClick={backToStyle}>
            Change occasion
          </Button>
        </div>
      </StateScreen>
    )
  }

  const weather = recommendation.weather
  const criticalWarnings = recommendation.warnings.filter((w) => w.severity === 'critical')
  const otherWarnings = recommendation.warnings.filter((w) => w.severity !== 'critical')
  const createdOn = formatLookDate(recommendation.created_at)

  return (
    <div className="page page--bare looks">
      <header className="looks__bar">
        <button type="button" className="round-button" aria-label="Back" onClick={goBack}>
          <ArrowLeft size={22} />
        </button>
        <span className="looks__tag">Styled for you</span>
      </header>

      <h1 className="looks__title">
        A plan. A look.
        <br />
        All you.
      </h1>

      <div className="dressing-for">
        <span className="eyebrow">Dressing for</span>
        <p>{recommendation.occasion}</p>
      </div>

      <p className="looks__meta">
        <WeatherIcon condition={weather.condition} size={15} />
        {weather.condition} · {Math.round(weather.temp_min)}°–{Math.round(weather.temp_max)}°
        {' · '}
        {OCCASION_META[recommendation.occasion_type]?.label ?? 'Look'}
        {createdOn && ` · ${createdOn}`}
      </p>

      <WarningList warnings={criticalWarnings} />

      <div className="looks__head">
        <h2 className="eyebrow">Your looks</h2>
        <span>
          {outfits.length} {outfits.length === 1 ? 'option' : 'options'}
          {outfits.length > 1 && ' · swipe to explore'}
        </span>
      </div>

      <div
        className="look-deck"
        ref={deckRef}
        onScroll={onDeckScroll}
        aria-label={`${outfits.length} looks — swipe to explore`}
      >
        {outfits.map((outfit, outfitIndex) => (
          <div className="look-deck__slide" key={outfit.id}>
            <LookCard outfit={outfit} index={outfitIndex}>
              <div className="make-yours">
                <div className="make-yours__head">
                  <h4>Make it yours</h4>
                  <span>
                    {outfit.items.length} closet {outfit.items.length === 1 ? 'piece' : 'pieces'}
                  </span>
                </div>
                {outfit.items.map((item) => (
                  <PieceRow
                    key={item.id}
                    item={item}
                    onToggleAvailable={() => availabilityMutation.mutate(item)}
                    onToggleForce={() => forceMutation.mutate(item)}
                    busyAvailable={
                      availabilityMutation.isPending &&
                      availabilityMutation.variables?.id === item.id
                    }
                    busyForce={forceMutation.isPending && forceMutation.variables?.id === item.id}
                  />
                ))}
              </div>
            </LookCard>
          </div>
        ))}
      </div>

      {outfits.length > 1 && (
        <div className="pager">
          <button
            type="button"
            className="round-button pager__arrow"
            aria-label="Previous look"
            disabled={index === 0}
            onClick={() => scrollToLook(index - 1)}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="pager__dots">
            {outfits.map((outfit, dotIndex) => (
              <button
                key={outfit.id}
                type="button"
                className={cn('pager__dot', dotIndex === index && 'is-active')}
                aria-label={`Look ${dotIndex + 1}`}
                aria-current={dotIndex === index}
                onClick={() => scrollToLook(dotIndex)}
              />
            ))}
          </div>
          <button
            type="button"
            className="round-button pager__arrow"
            aria-label="Next look"
            disabled={index === outfits.length - 1}
            onClick={() => scrollToLook(index + 1)}
          >
            <ArrowRight size={20} />
          </button>
        </div>
      )}

      <WarningList warnings={otherWarnings} />

      {recommendation.shopping_suggestions.length > 0 && (
        <section className="section">
          <div className="section__head">
            <h2>Worth adding</h2>
          </div>
          <ShoppingList suggestions={recommendation.shopping_suggestions} />
        </section>
      )}

      <div className="sticky-footer">
        <Button
          size="lg"
          full
          loading={rerolling}
          leftIcon={<RefreshCw size={16} />}
          onClick={reroll}
        >
          {stale ? 'Create looks with changes' : 'Create more looks'}
        </Button>
      </div>
    </div>
  )
}
