import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  Image as ImageIcon,
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
  BackgroundMode,
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
  Sheet,
  Skeleton,
  Spinner,
  TextAreaField,
} from 'oul-ui'

const BACKGROUND_PROMPTS = [
  '清晨的清水混凝土庭院，柔和的侧光',
  '傍晚城市屋顶，背景轻微虚化',
  '安静的画廊白墙与自然天光',
  '有绿植和木地板的温暖室内',
]

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
            <strong>正在为你试穿</strong>
            <span>AI 正在把整套衣服放到你的照片上</span>
          </>
        ) : (
          <>
            <Sparkles size={16} />
            <strong>造型预览</strong>
            <span>完整试穿图暂时不可用，这是真实的单品组合预览</span>
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
  onBackground,
}: {
  outfit: Outfit
  index: number
  total: number
  onBackground: () => void
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
          alt={`${outfit.title} 的试穿效果`}
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
                AI 试穿
              </Badge>
            ) : outfit.image_status === 'ready' ? (
              <Badge tone="neutral">造型预览</Badge>
            ) : null}
            {pending && <Badge tone="dark">生成中</Badge>}
          </div>
        </div>
      )}
      {pending && hasImage && (
        <div className="look-visual__processing">
          <Spinner size="sm" />
          正在更换背景…
        </div>
      )}
      <div className={cn('look-visual__shade', isLookboard && 'look-visual__shade--soft')} />
      {!isLookboard && (
        <div className="look-visual__bottom">
          <div>
            <span className="look-visual__kicker serif">OUL / LOOK {String(index + 1).padStart(2, '0')}</span>
            <h2>{outfit.title}</h2>
          </div>
          <button
            type="button"
            className="look-visual__background-btn"
            onClick={onBackground}
            disabled={pending}
          >
            <ImageIcon size={14} />
            背景
          </button>
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
          aria-label={item.force_include ? `取消 ${item.name} 必穿` : `将 ${item.name} 设为必穿`}
          title={item.force_include ? '下次必穿' : '设为下次必穿'}
        >
          {item.force_include ? <Lock size={14} /> : <LockOpen size={14} />}
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={item.available}
          aria-label={`${item.name} 现在${item.available ? '可穿' : '不可穿'}`}
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
          {suggestion.priority === 'high' ? '优先添置' : suggestion.priority === 'medium' ? '值得考虑' : '可选'}
        </span>
        <ArrowUpRight size={15} />
      </div>
      <h3>{suggestion.title}</h3>
      <p>{suggestion.reason}</p>
      <span className="shopping-card__search">
        <ShoppingBag size={12} />
        搜索类似单品
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
        <button type="button" className="looks-header__back" onClick={onBack} aria-label="返回">
          <ArrowLeft size={19} />
        </button>
        <div>
          <span className="o-eyebrow">THE TOMORROW EDIT</span>
          <h1>还差一点</h1>
        </div>
        <span className="looks-header__spacer" />
      </header>

      <div className="gap-hero">
        <div className="gap-hero__mark serif">OUL</div>
        <div className="gap-hero__rings" aria-hidden="true" />
        <span className="o-eyebrow">WARDROBE ALGORITHM, HONESTLY</span>
        <h2>
          这组场景，
          <br />
          <span className="serif">衣橱还差几件。</span>
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
            <h2>补齐这几件，明天就能成立。</h2>
          </div>
          <div className="shopping-list">
            {recommendation.shopping_suggestions.map((suggestion) => (
              <ShoppingCard key={`${suggestion.category}-${suggestion.title}`} suggestion={suggestion} />
            ))}
          </div>
        </section>
      ) : (
        <InlineNotice tone="info">
          先添加几件上装、下装和鞋履，再生成一次造型会更有帮助。
        </InlineNotice>
      )}

      <div className="gap-actions">
        <Button
          variant="primary"
          onClick={() => navigate('/wardrobe/new')}
          rightIcon={<ArrowUpRight size={15} />}
        >
          去衣橱添置
        </Button>
        <Button variant="ghost" onClick={onBack}>
          重新描述场景
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
  const [backgroundOpen, setBackgroundOpen] = useState(false)
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>('studio')
  const [backgroundPrompt, setBackgroundPrompt] = useState('')
  const [rendering, setRendering] = useState(false)
  const deckRef = useRef<HTMLDivElement>(null)
  const recommendation = recommendationQuery.data
  const outfits = recommendation?.outfits ?? []
  const activeOutfit = outfits[index] ?? outfits[0]

  useEffect(() => {
    setIndex(0)
    setStale(false)
    setBackgroundOpen(false)
    deckRef.current?.scrollTo({ left: 0 })
  }, [recommendation?.id])

  useEffect(() => {
    if (activeOutfit) {
      setBackgroundMode(activeOutfit.background_mode)
      setBackgroundPrompt(activeOutfit.background_prompt ?? '')
    }
  }, [activeOutfit?.id, activeOutfit?.background_mode, activeOutfit?.background_prompt])

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
        title: updated.available ? '已恢复可穿' : '已标记为不可穿',
        description: '点「重新推荐」后，新的造型会排除不可穿的单品。',
      })
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : '可穿状态没有保存'),
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
        title: updated.force_include ? '已设为下次必穿' : '已取消必穿',
        description: '点「重新推荐」让新的造型应用这个选择。',
      })
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : '必穿状态没有保存'),
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
      toast.success('重新组合好了', '可用状态与必穿单品已经更新。')
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '重新推荐没有完成')
    } finally {
      setRerolling(false)
    }
  }

  const applyBackground = async () => {
    if (!recommendation || !activeOutfit) return
    if (backgroundMode === 'custom' && !backgroundPrompt.trim()) {
      toast.error('写一句背景描述再生成')
      return
    }
    setRendering(true)
    try {
      const updated = await api.recommendations.render(
        recommendation.id,
        activeOutfit.id,
        backgroundMode,
        backgroundMode === 'custom' ? backgroundPrompt.trim() : null,
      )
      queryClient.setQueryData(queryKeys.recommendation(recommendation.id), updated)
      trackGeneration(recommendation.id, 'render')
      setBackgroundOpen(false)
      toast.success('正在重新生成试穿图', '画面会在几十秒内更新，你可以继续查看其他造型。')
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '背景调整没有完成')
    } finally {
      setRendering(false)
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
            aria-label="返回"
          >
            <ArrowLeft size={19} />
          </button>
          <div>
            <span className="o-eyebrow">THE TOMORROW EDIT</span>
            <h1>明日造型</h1>
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
            <h1>找不到这组造型</h1>
          </div>
          <span className="looks-header__spacer" />
        </header>
        <div className="looks-error">
          <InlineNotice tone="critical">
            这条推荐可能已经删除，或者链接不正确。
          </InlineNotice>
          <Button onClick={() => navigate('/style')}>重新开始造型</Button>
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
            aria-label="返回造型"
          >
            <ArrowLeft size={19} />
          </button>
          <div>
            <span className="o-eyebrow">THE TOMORROW EDIT</span>
            <h1>正在挑选造型</h1>
          </div>
          <span className="looks-header__spacer" />
        </header>
        <div className="looks-planning">
          <span className="looks-planning__spinner">
            <Spinner size="lg" />
          </span>
          <span className="o-eyebrow">OUL ATELIER</span>
          <h2 className="serif">
            正在从你的衣橱里，
            <br />
            挑选三套可能。
          </h2>
          <p>
            通常需要几十秒。你可以先去衣橱或首页逛一逛，
            生成会在后台继续，完成后我们会提醒你。
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
            aria-label="返回造型"
          >
            <ArrowLeft size={19} />
          </button>
          <div>
            <span className="o-eyebrow">THE TOMORROW EDIT</span>
            <h1>这次没有生成成功</h1>
          </div>
          <span className="looks-header__spacer" />
        </header>
        <div className="looks-error">
          <InlineNotice tone="critical">
            {recommendation.warnings[0]?.message ??
              '造型生成中断了，请回到造型页再试一次。'}
          </InlineNotice>
          <Button onClick={() => navigate('/style')}>重新生成</Button>
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
          aria-label="返回造型"
        >
          <ArrowLeft size={19} />
        </button>
        <div className="looks-header__center">
          <span className="o-eyebrow">
            {formatDateLabel(
              new Date(`${recommendation.weather.date ?? tomorrowISO()}T12:00:00`),
            )}{' '}
            · 明天
          </span>
          <h1>{OCCASION_META[recommendation.occasion_type]?.label ?? '明日造型'}</h1>
        </div>
        <button
          type="button"
          className="looks-header__refresh"
          onClick={reroll}
          disabled={rerolling}
          aria-label="换一组造型"
          title="换一组造型"
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
            换一组
          </button>
        </div>
      )}

      <div
        className="look-deck"
        ref={deckRef}
        onScroll={onDeckScroll}
        aria-label={`${outfits.length} 套造型，左右滑动查看`}
      >
        {outfits.map((outfit, outfitIndex) => (
          <div className="look-slide" key={outfit.id}>
            <LookVisual
              outfit={outfit}
              index={outfitIndex}
              total={outfits.length}
              onBackground={() => {
                setIndex(outfitIndex)
                setBackgroundOpen(true)
              }}
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
              aria-label={`查看第 ${dotIndex + 1} 套`}
              onClick={() => scrollToLook(dotIndex)}
            />
          ))}
        </div>
        <div className="look-pager__meta">
          {activeOutfit?.image_kind === 'lookboard' && (
            <span className="look-pager__preview">造型预览</span>
          )}
          <span className="look-pager__hint">
            <MoveHorizontal size={13} />
            左右滑动选择
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
              契合度
            </span>
          </div>

          <p className="look-detail__rationale">{activeOutfit.rationale}</p>

          {activeOutfit.styling_note && (
            <div className="styling-note">
              <span className="styling-note__icon">
                <Sparkles size={15} />
              </span>
              <div>
                <span>造型手法</span>
                <p>{activeOutfit.styling_note}</p>
              </div>
            </div>
          )}

          <div className="look-detail__section-head">
            <span className="o-eyebrow">THE PIECES</span>
            <span className="look-detail__piece-count">
              <Layers3 size={13} />
              {activeOutfit.items.length} 件
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
            切换「可穿」会更新你的衣橱；点「重新推荐」后，下一组造型会遵循新的状态。
          </p>

          <div className="look-detail__background-row">
            <div>
              <span className="o-eyebrow">BACKGROUND</span>
              <p>
                {activeOutfit.background_mode === 'studio'
                  ? '纯净影棚'
                  : activeOutfit.background_prompt || '自定义场景'}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<ImageIcon size={15} />}
              onClick={() => setBackgroundOpen(true)}
            >
              调整背景
            </Button>
          </div>

          <WarningsBlock outfits={[activeOutfit]} />
        </div>
      )}

      {recommendation.warnings.length > 0 && (
        <section className="look-advice">
          <div className="look-advice__head">
            <span className="o-eyebrow">THINGS WORTH KNOWING</span>
            <h2>明天的提醒</h2>
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
            <h2>衣橱还差一点。</h2>
            <p>这些不是广告，而是能解锁更多造型的具体缺口。</p>
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
            再想一个场景
          </Button>
          <Link to="/wardrobe" className="text-link">
            去衣橱看看
            <ArrowUpRight size={13} />
          </Link>
        </div>
      </section>

      {stale && (
        <div className="reroll-bar">
          <div>
            <span>衣橱状态已更新</span>
            <em>重新推荐以应用新的可穿与必穿设置</em>
          </div>
          <Button
            variant="accent"
            size="sm"
            loading={rerolling}
            leftIcon={<RefreshCw size={14} />}
            onClick={reroll}
          >
            重新推荐
          </Button>
        </div>
      )}

      <Sheet
        open={backgroundOpen}
        onClose={() => setBackgroundOpen(false)}
        title="调整试穿背景"
        description="只为当前这套造型重新生成，不会改变其他两套。"
        footer={
          <Button full size="lg" loading={rendering} onClick={applyBackground}>
            应用并重新生成
          </Button>
        }
      >
        <div className="background-sheet-options">
          <button
            type="button"
            className={cn(
              'background-sheet-option',
              backgroundMode === 'studio' && 'is-active',
            )}
            onClick={() => setBackgroundMode('studio')}
          >
            <span className="background-sheet-option__visual background-sheet-option__visual--studio">
              <span>OUL</span>
            </span>
            <span>
              <strong>纯净影棚</strong>
              <em>浅灰无缝背景，聚焦人物和衣服</em>
            </span>
            {backgroundMode === 'studio' && (
              <span className="background-sheet-option__check">
                <Check size={12} />
              </span>
            )}
          </button>
          <button
            type="button"
            className={cn(
              'background-sheet-option',
              backgroundMode === 'custom' && 'is-active',
            )}
            onClick={() => setBackgroundMode('custom')}
          >
            <span className="background-sheet-option__visual background-sheet-option__visual--custom">
              <span />
              <span />
            </span>
            <span>
              <strong>自定义场景</strong>
              <em>描述一个背景，让造型走进那个画面</em>
            </span>
            {backgroundMode === 'custom' && (
              <span className="background-sheet-option__check">
                <Check size={12} />
              </span>
            )}
          </button>
        </div>
        {backgroundMode === 'custom' && (
          <div className="background-sheet-prompt">
            <TextAreaField
              label="背景画面"
              placeholder="例如：傍晚城市屋顶，远处灯光轻微虚化，人物全身清晰。"
              value={backgroundPrompt}
              maxLength={500}
              onChange={(event) => setBackgroundPrompt(event.target.value)}
            />
            <div className="chip-wrap">
              {BACKGROUND_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="o-chip"
                  onClick={() => setBackgroundPrompt(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {activeOutfit?.image_kind === 'lookboard' && (
          <InlineNotice tone="info" icon={<Info size={15} />}>
            当前是造型预览板：已按你的背景描述合成场景，但身上的服装仍来自基础照片。完整 AI 换装会在图像服务可用时自动启用。
          </InlineNotice>
        )}
      </Sheet>
    </div>
  )
}
