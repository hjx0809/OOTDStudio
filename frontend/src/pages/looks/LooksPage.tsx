import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Info,
  Layers3,
  Lock,
  LockOpen,
  MoveHorizontal,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  WandSparkles,
} from 'lucide-react'
import { useEffect, useRef, useState, type UIEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useToast } from '@/app/ToastProvider'
import { WeatherIcon } from '@/components/WeatherIcon'
import { api, ApiError } from '@/lib/api'
import { trackGeneration } from '@/lib/generation'
import { queryKeys, useRecommendation } from '@/lib/queries'
import type {
  Outfit,
  OutfitItem,
  Recommendation,
  ShoppingSuggestion,
} from '@/lib/types'
import { OCCASION_META, cn, formatDateLabel, tomorrowISO } from '@/lib/utils'
import {
  Badge,
  Button,
  InlineNotice,
  Skeleton,
  Spinner,
} from 'oul-ui'

function OutfitCollage({
  outfit,
  pending = false,
  compact = false,
}: {
  outfit: Outfit
  pending?: boolean
  compact?: boolean
}) {
  const items = outfit.items.slice(0, 4)
  return (
    <div className={cn('outfit-collage', compact && 'outfit-collage--compact')}>
      <div className="outfit-collage__grid" aria-hidden="true">
        {items.map((item, index) => (
          <div className={`outfit-collage__tile outfit-collage__tile--${index}`} key={item.id}>
            <img src={item.image_url} alt="" />
          </div>
        ))}
        {items.length === 0 && <div className="outfit-collage__empty" />}
      </div>
      <div className="outfit-collage__overlay" />
      <div className="outfit-collage__brand serif">OUL</div>
      <div className="outfit-collage__copy">
        {pending ? (
          <>
            <span className="outfit-collage__spinner">
              <Spinner size="sm" />
            </span>
            <strong>Trying it on you</strong>
            <span>AI is placing the full outfit on your photo</span>
          </>
        ) : (
          <>
            <Sparkles size={16} />
            <strong>Look preview</strong>
            <span>Full try-on isn't available yet — this is a real preview of the pieces together</span>
          </>
        )}
      </div>
    </div>
  )
}

function LookVisual({
  outfit,
  index,
  total,
}: {
  outfit: Outfit
  index: number
  total: number
}) {
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

  return (
    <article className="look-visual">
      {hasImage ? (
        <img
          className="look-visual__image"
          src={outfit.image_url as string}
          alt={`${outfit.title} try-on`}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <OutfitCollage outfit={outfit} pending={pending} />
      )}
      {!isLookboard && (
        <div className="look-visual__top">
          <span className="look-visual__count">
            {String(index + 1).padStart(2, '0')}
            <em>/ {String(total).padStart(2, '0')}</em>
          </span>
          <div className="look-visual__badges">
            {outfit.image_kind === 'ai_tryon' ? (
              <Badge tone="accent">
                <WandSparkles size={10} />
                AI try-on
              </Badge>
            ) : outfit.image_status === 'ready' ? (
              <Badge tone="neutral">Look preview</Badge>
            ) : null}
            {pending && <Badge tone="dark">Generating</Badge>}
          </div>
        </div>
      )}
      {pending && hasImage && (
        <div className="look-visual__processing">
          <Spinner size="sm" />
          Generating your try-on…
        </div>
      )}
      <div className={cn('look-visual__shade', isLookboard && 'look-visual__shade--soft')} />
      {!isLookboard && (
        <div className="look-visual__bottom">
          <div>
            <span className="look-visual__kicker serif">OUL / LOOK {String(index + 1).padStart(2, '0')}</span>
            <h2>{outfit.title}</h2>
          </div>
        </div>
      )}
      {outfit.image_error && !pending && outfit.image_kind === 'lookboard' && (
        <div className="look-visual__preview-note">
          <Info size={12} />
          <span>{outfit.image_error}</span>
        </div>
      )}
    </article>
  )
}

function ItemRow({
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
  return (
    <div className={cn('outfit-item-row', !item.available && 'is-unavailable')}>
      <div className="outfit-item-row__image">
        <img src={item.image_url} alt={item.name} loading="lazy" />
      </div>
      <div className="outfit-item-row__copy">
        <span className="outfit-item-row__role">{item.role || item.category_label}</span>
        <strong>{item.name}</strong>
        <em>
          {item.color_name}
          {item.category_label ? ` · ${item.category_label}` : ''}
        </em>
      </div>
      <div className="outfit-item-row__actions">
        <button
          type="button"
          className={cn('item-lock-btn', item.force_include && 'is-on')}
          onClick={onToggleForce}
          disabled={busyForce || !item.available}
          aria-label={item.force_include ? `Remove ${item.name} from must-wear` : `Mark ${item.name} as must-wear`}
          title={item.force_include ? 'Must-wear next time' : 'Set as must-wear next time'}
        >
          {item.force_include ? <Lock size={14} /> : <LockOpen size={14} />}
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={item.available}
          aria-label={`${item.name} is ${item.available ? 'available' : 'unavailable'}`}
          className={cn('mini-switch', item.available && 'is-on')}
          onClick={onToggleAvailable}
          disabled={busyAvailable}
        >
          <span />
        </button>
      </div>
    </div>
  )
}

function WarningsBlock({ outfits }: { outfits: Outfit[] }) {
  const warnings = outfits.flatMap((outfit) => outfit.warnings)
  if (!warnings.length) return null
  return (
    <div className="look-warnings">
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
            <>
              {warning.severity === 'critical' ? (
                <AlertTriangle size={16} />
              ) : warning.severity === 'warning' ? (
                <AlertTriangle size={15} />
              ) : (
                <Info size={15} />
              )}
            </>
          }
        >
          {warning.message}
        </InlineNotice>
      ))}
    </div>
  )
}

function ShoppingCard({ suggestion }: { suggestion: ShoppingSuggestion }) {
  const link = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(
    suggestion.search_query,
  )}`
  return (
    <a className="shopping-card" href={link} target="_blank" rel="noreferrer">
      <div className="shopping-card__head">
        <span className={cn('shopping-card__priority', `is-${suggestion.priority}`)}>
          {suggestion.priority === 'high' ? 'Priority buy' : suggestion.priority === 'medium' ? 'Worth considering' : 'Optional'}
        </span>
        <ArrowUpRight size={15} />
      </div>
      <h3>{suggestion.title}</h3>
      <p>{suggestion.reason}</p>
      <span className="shopping-card__search">
        <ShoppingBag size={12} />
        Search similar items
      </span>
    </a>
  )
}

function WardrobeGap({
  recommendation,
  onBack,
}: {
  recommendation: Recommendation
  onBack: () => void
}) {
  const navigate = useNavigate()
  return (
    <div className="gap-page">
      <header className="looks-header">
        <button type="button" className="looks-header__back" onClick={onBack} aria-label="Back">
          <ArrowLeft size={19} />
        </button>
        <div>
          <span className="o-eyebrow">THE TOMORROW EDIT</span>
          <h1>Almost there</h1>
        </div>
        <span className="looks-header__spacer" />
      </header>

      <div className="gap-hero">
        <div className="gap-hero__mark serif">OUL</div>
        <div className="gap-hero__rings" aria-hidden="true" />
        <span className="o-eyebrow">WARDROBE ALGORITHM, HONESTLY</span>
        <h2>
          For this occasion,
          <br />
          <span className="serif">your wardrobe is a few pieces short.</span>
        </h2>
        <p>{recommendation.scenario_note}</p>
      </div>

      {recommendation.warnings.map((warning, index) => (
        <InlineNotice
          key={`${warning.code}-${index}`}
          tone={warning.severity === 'critical' ? 'critical' : 'warning'}
        >
          {warning.message}
        </InlineNotice>
      ))}

      {recommendation.shopping_suggestions.length > 0 ? (
        <section className="gap-shopping">
          <div className="gap-shopping__head">
            <span className="o-eyebrow">WHAT WOULD UNLOCK THIS</span>
            <h2>Add these pieces and tomorrow works.</h2>
          </div>
          <div className="shopping-list">
            {recommendation.shopping_suggestions.map((suggestion) => (
              <ShoppingCard key={`${suggestion.category}-${suggestion.title}`} suggestion={suggestion} />
            ))}
          </div>
        </section>
      ) : (
        <InlineNotice tone="info">
          Add a few tops, bottoms and shoes first — then generate again for better results.
        </InlineNotice>
      )}

      <div className="gap-actions">
        <Button
          variant="primary"
          onClick={() => navigate('/wardrobe/new')}
          rightIcon={<ArrowUpRight size={15} />}
        >
          Add to wardrobe
        </Button>
        <Button variant="ghost" onClick={onBack}>
          Describe another occasion
        </Button>
      </div>
    </div>
  )
}

export function LooksPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const recommendationQuery = useRecommendation(id)
  const [index, setIndex] = useState(0)
  const [stale, setStale] = useState(false)
  const [rerolling, setRerolling] = useState(false)
  const deckRef = useRef<HTMLDivElement>(null)
  const recommendation = recommendationQuery.data
  const outfits = recommendation?.outfits ?? []
  const activeOutfit = outfits[index] ?? outfits[0]

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
      toast.toast({
        title: updated.available ? 'Available again' : 'Marked unavailable',
        description: 'Tap “Recommend again” and new looks will leave out unavailable items.',
      })
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Availability didn't save"),
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
      toast.toast({
        title: updated.force_include ? 'Set as must-wear' : 'Must-wear removed',
        description: 'Tap “Recommend again” so your next looks follow this choice.',
      })
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Must-wear didn't save"),
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
      toast.success('New looks ready', 'Availability and must-wear pieces are updated.')
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Recommendation didn't complete")
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
    setIndex(target)
  }

  if (recommendationQuery.isLoading) {
    return (
      <div className="looks-page">
        <header className="looks-header">
          <button
            type="button"
            className="looks-header__back"
            onClick={() => navigate(-1)}
            aria-label="Back"
          >
            <ArrowLeft size={19} />
          </button>
          <div>
            <span className="o-eyebrow">THE TOMORROW EDIT</span>
            <h1>Tomorrow's looks</h1>
          </div>
          <span className="looks-header__spacer" />
        </header>
        <div className="looks-loading">
          <Skeleton className="looks-loading__hero" />
          <Skeleton className="looks-loading__line" />
          <Skeleton className="looks-loading__line looks-loading__line--short" />
        </div>
      </div>
    )
  }

  if (recommendationQuery.isError || !recommendation) {
    return (
      <div className="looks-page">
        <header className="looks-header">
          <button type="button" className="looks-header__back" onClick={() => navigate('/')}>
            <ArrowLeft size={19} />
          </button>
          <div>
            <span className="o-eyebrow">THE TOMORROW EDIT</span>
            <h1>Looks not found</h1>
          </div>
          <span className="looks-header__spacer" />
        </header>
        <div className="looks-error">
          <InlineNotice tone="critical">
            This recommendation may have been deleted, or the link is incorrect.
          </InlineNotice>
          <Button onClick={() => navigate('/style')}>Start a new look</Button>
        </div>
      </div>
    )
  }

  if (recommendation.status === 'planning') {
    return (
      <div className="looks-page">
        <header className="looks-header">
          <button
            type="button"
            className="looks-header__back"
            onClick={() => navigate('/style')}
            aria-label="Back to styling"
          >
            <ArrowLeft size={19} />
          </button>
          <div>
            <span className="o-eyebrow">THE TOMORROW EDIT</span>
            <h1>Choosing your looks</h1>
          </div>
          <span className="looks-header__spacer" />
        </header>
        <div className="looks-planning">
          <span className="looks-planning__spinner">
            <Spinner size="lg" />
          </span>
          <span className="o-eyebrow">OUL ATELIER</span>
          <h2 className="serif">
            Looking through your wardrobe,
            <br />
            choosing three possibilities.
          </h2>
          <p>
            This usually takes under a minute. Browse your wardrobe or home while we work —
            it keeps running in the background, and we'll let you know when it's ready.
          </p>
        </div>
        <div className="looks-loading">
          <Skeleton className="looks-loading__hero" />
          <Skeleton className="looks-loading__line" />
          <Skeleton className="looks-loading__line looks-loading__line--short" />
        </div>
      </div>
    )
  }

  if (recommendation.status === 'failed') {
    return (
      <div className="looks-page">
        <header className="looks-header">
          <button
            type="button"
            className="looks-header__back"
            onClick={() => navigate('/style')}
            aria-label="Back to styling"
          >
            <ArrowLeft size={19} />
          </button>
          <div>
            <span className="o-eyebrow">THE TOMORROW EDIT</span>
            <h1>Something went wrong</h1>
          </div>
          <span className="looks-header__spacer" />
        </header>
        <div className="looks-error">
          <InlineNotice tone="critical">
            {recommendation.warnings[0]?.message ??
              'Your looks stopped generating. Head back to the stylist and try again.'}
          </InlineNotice>
          <Button onClick={() => navigate('/style')}>Try again</Button>
        </div>
      </div>
    )
  }

  if (recommendation.status === 'wardrobe_gap' || outfits.length === 0) {
    return (
      <div className="looks-page">
        <WardrobeGap recommendation={recommendation} onBack={() => navigate('/style')} />
      </div>
    )
  }

  return (
    <div className="looks-page">
      <header className="looks-header looks-header--sticky">
        <button
          type="button"
          className="looks-header__back"
          onClick={() => navigate('/style')}
          aria-label="Back to styling"
        >
          <ArrowLeft size={19} />
        </button>
        <div className="looks-header__center">
          <span className="o-eyebrow">
            {formatDateLabel(
              new Date(`${recommendation.weather.date ?? tomorrowISO()}T12:00:00`),
            )}{' '}
            · Tomorrow
          </span>
          <h1>{OCCASION_META[recommendation.occasion_type]?.label ?? "Tomorrow's looks"}</h1>
        </div>
        <button
          type="button"
          className="looks-header__refresh"
          onClick={reroll}
          disabled={rerolling}
          aria-label="Try another set of looks"
          title="Try another set of looks"
        >
          {rerolling ? <Spinner size="sm" /> : <RefreshCw size={17} />}
        </button>
      </header>

      <div className="look-context">
        <div className="look-context__occasion">
          <span className="o-eyebrow">SCENE</span>
          <p>{recommendation.occasion}</p>
        </div>
        <div className="look-context__weather">
          <WeatherIcon condition={recommendation.weather.condition} size={17} />
          <span>
            {Math.round(recommendation.weather.temp_min)}° –{' '}
            {Math.round(recommendation.weather.temp_max)}°
          </span>
          <em>{recommendation.weather.condition}</em>
        </div>
      </div>

      {recommendation.warnings.some((warning) => warning.severity === 'critical') && (
        <div className="look-critical-banner">
          <AlertTriangle size={16} />
          <span>
            {recommendation.warnings.find((warning) => warning.severity === 'critical')?.message}
          </span>
          <button type="button" onClick={reroll} disabled={rerolling}>
            Shuffle
          </button>
        </div>
      )}

      <div
        className="look-deck"
        ref={deckRef}
        onScroll={onDeckScroll}
        aria-label={`${outfits.length} looks — swipe to explore`}
      >
        {outfits.map((outfit, outfitIndex) => (
          <div className="look-slide" key={outfit.id}>
            <LookVisual
              outfit={outfit}
              index={outfitIndex}
              total={outfits.length}
            />
          </div>
        ))}
      </div>

      <div className="look-pager">
        <div className="look-pager__dots">
          {outfits.map((outfit, dotIndex) => (
            <button
              key={outfit.id}
              type="button"
              className={cn('look-pager__dot', dotIndex === index && 'is-active')}
              aria-label={`View look ${dotIndex + 1}`}
              onClick={() => scrollToLook(dotIndex)}
            />
          ))}
        </div>
        <div className="look-pager__meta">
          {activeOutfit?.image_kind === 'lookboard' && (
            <span className="look-pager__preview">Look preview</span>
          )}
          <span className="look-pager__hint">
            <MoveHorizontal size={13} />
            Swipe to choose
          </span>
        </div>
      </div>

      {activeOutfit && (
        <div className="look-detail" key={activeOutfit.id}>
          <div className="look-detail__title-row">
            <div>
              <span className="o-eyebrow">
                LOOK {String(index + 1).padStart(2, '0')} /{' '}
                {recommendation.ai_source === 'gemini' ? 'GEMINI STYLED' : 'OUL ATELIER'}
              </span>
              <h2>{activeOutfit.title}</h2>
            </div>
            <span className="look-score">
              <em>{activeOutfit.score}</em>
              match
            </span>
          </div>

          <p className="look-detail__rationale">{activeOutfit.rationale}</p>

          {activeOutfit.styling_note && (
            <div className="styling-note">
              <span className="styling-note__icon">
                <Sparkles size={15} />
              </span>
              <div>
                <span>Styling note</span>
                <p>{activeOutfit.styling_note}</p>
              </div>
            </div>
          )}

          <div className="look-detail__section-head">
            <span className="o-eyebrow">THE PIECES</span>
            <span className="look-detail__piece-count">
              <Layers3 size={13} />
              {activeOutfit.items.length} pieces
            </span>
          </div>
          <div className="outfit-items">
            {activeOutfit.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onToggleAvailable={() => availabilityMutation.mutate(item)}
                onToggleForce={() => forceMutation.mutate(item)}
                busyAvailable={
                  availabilityMutation.isPending &&
                  availabilityMutation.variables?.id === item.id
                }
                busyForce={
                  forceMutation.isPending && forceMutation.variables?.id === item.id
                }
              />
            ))}
          </div>
          <p className="outfit-items__hint">
            Toggling availability updates your wardrobe. Tap “Recommend again” and the next
            set of looks will follow your new settings.
          </p>

          <WarningsBlock outfits={[activeOutfit]} />
        </div>
      )}

      {recommendation.warnings.length > 0 && (
        <section className="look-advice">
          <div className="look-advice__head">
            <span className="o-eyebrow">THINGS WORTH KNOWING</span>
            <h2>Notes for tomorrow</h2>
          </div>
          <div className="look-warnings">
            {recommendation.warnings.map((warning, warningIndex) => (
              <InlineNotice
                key={`${warning.code}-${warningIndex}`}
                tone={
                  warning.severity === 'critical'
                    ? 'critical'
                    : warning.severity === 'warning'
                      ? 'warning'
                      : 'info'
                }
                icon={
                  warning.severity === 'critical' || warning.severity === 'warning' ? (
                    <AlertTriangle size={15} />
                  ) : (
                    <Info size={15} />
                  )
                }
              >
                {warning.message}
              </InlineNotice>
            ))}
          </div>
        </section>
      )}

      {recommendation.shopping_suggestions.length > 0 && (
        <section className="look-shopping">
          <div className="look-shopping__head">
            <span className="o-eyebrow">IF YOU WANT MORE OPTIONS</span>
            <h2>Your wardrobe is a few pieces short.</h2>
            <p>No ads here — just the specific gaps that unlock more outfits.</p>
          </div>
          <div className="shopping-list">
            {recommendation.shopping_suggestions.map((suggestion) => (
              <ShoppingCard
                key={`${suggestion.category}-${suggestion.title}`}
                suggestion={suggestion}
              />
            ))}
          </div>
        </section>
      )}

      <section className="look-closing">
        <span className="serif">Made for your real wardrobe.</span>
        <div className="look-closing__actions">
          <Button variant="secondary" size="sm" onClick={() => navigate('/style')}>
            Try another occasion
          </Button>
          <Link to="/wardrobe" className="text-link">
            Browse your wardrobe
            <ArrowUpRight size={13} />
          </Link>
        </div>
      </section>

      {stale && (
        <div className="reroll-bar">
          <div>
            <span>Wardrobe updated</span>
            <em>Recommend again to apply your new availability and must-wear settings</em>
          </div>
          <Button
            variant="accent"
            size="sm"
            loading={rerolling}
            leftIcon={<RefreshCw size={14} />}
            onClick={reroll}
          >
            Recommend again
          </Button>
        </div>
      )}
    </div>
  )
}
