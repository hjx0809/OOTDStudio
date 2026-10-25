import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Heart,
  Lock,
  Plus,
  Search,
  Shirt,
  Sparkles,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@/app/ToastProvider'
import { Brand } from '@/components/Brand'
import { api } from '@/lib/api'
import { queryKeys, useWardrobe } from '@/lib/queries'
import { cn, CATEGORY_META } from '@/lib/utils'
import type { Category, WardrobeItem } from '@/lib/types'
import { Button, Chip, EmptyState, Skeleton } from 'oul-ui'

type CategoryFilter = 'all' | Category

const CATEGORY_KEYS = Object.keys(CATEGORY_META) as Category[]

const FILTERS: Array<{ value: CategoryFilter; label: string }> = [
  { value: 'all', label: 'All' },
  ...CATEGORY_KEYS.map((category) => ({
    value: category,
    label: CATEGORY_META[category].label,
  })),
]

function WardrobeCard({
  item,
  onOpen,
  onFavorite,
  favoriteBusy,
}: {
  item: WardrobeItem
  onOpen: () => void
  onFavorite: () => void
  favoriteBusy: boolean
}) {
  return (
    <article className={cn('item-card', !item.available && 'is-unavailable')}>
      <button
        type="button"
        className="item-card__image"
        onClick={onOpen}
        aria-label={`Edit ${item.name}`}
      >
        <img src={item.image_url} alt={item.name} loading="lazy" />
        <span className="item-card__shade" />
        {!item.available && <span className="item-card__unavailable">Unavailable</span>}
        <span className="item-card__category">{item.category_label}</span>
        {item.force_include && (
          <span className="item-card__force">
            <Lock size={10} />
            Must-wear
          </span>
        )}
      </button>
      <div className="item-card__actions">
        <button
          type="button"
          className={cn('item-card__favorite', item.favorite && 'is-active')}
          aria-label={item.favorite ? 'Remove from favorites' : 'Favorite this item'}
          onClick={onFavorite}
          disabled={favoriteBusy}
        >
          <Heart size={16} fill={item.favorite ? 'currentColor' : 'none'} />
        </button>
      </div>
      <button type="button" className="item-card__body" onClick={onOpen}>
        <span className="item-card__name">{item.name}</span>
        <span className="item-card__meta">
          {item.color_name}
          {item.brand ? ` · ${item.brand}` : ''}
          <span className="item-card__dot" />
          {item.formality >= 4 ? 'Formal' : item.formality >= 3 ? 'Workwear' : 'Casual'}
        </span>
      </button>
    </article>
  )
}

export function WardrobePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data, isLoading } = useWardrobe()
  const [filter, setFilter] = useState<CategoryFilter>('all')
  const [search, setSearch] = useState('')

  const items = data ?? []
  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase()
    return items.filter((item) => {
      if (filter !== 'all' && item.category !== filter) return false
      if (!normalized) return true
      return [item.name, item.subcategory, item.color_name, item.brand, ...item.style_tags]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized))
    })
  }, [items, filter, search])

  const availableCount = items.filter((item) => item.available).length
  const forcedCount = items.filter((item) => item.force_include).length

  const favoriteMutation = useMutation({
    mutationFn: ({ item }: { item: WardrobeItem }) =>
      api.wardrobe.setFavorite(item.id, !item.favorite),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.wardrobe })
      queryClient.invalidateQueries({ queryKey: queryKeys.wardrobeSummary })
      toast.toast({
        title: updated.favorite ? 'Added to favorites' : 'Removed from favorites',
      })
    },
    onError: () => toast.error("Favorite didn't save. Try again."),
  })

  return (
    <div className="page wardrobe-page">
      <header className="subpage-top">
        <Brand />
        <Button
          size="sm"
          variant="primary"
          leftIcon={<Plus size={15} />}
          onClick={() => navigate('/wardrobe/new')}
        >
          Add item
        </Button>
      </header>

      <section className="wardrobe-heading">
        <p className="o-eyebrow">PRIVATE WARDROBE</p>
        <h1>
          Wardrobe<span className="wardrobe-heading__count">{items.length}</span>
        </h1>
        <p>What you actually own is what's worth styling.</p>
      </section>

      <div className="wardrobe-stats">
        <div>
          <strong>{availableCount}</strong>
          <span>available now</span>
        </div>
        <div>
          <strong>{forcedCount}</strong>
          <span>must-wear next</span>
        </div>
        <div>
          <strong>{items.filter((item) => !item.available).length}</strong>
          <span>in the wash or stored</span>
        </div>
      </div>

      <div className="wardrobe-toolbar">
        <div className="wardrobe-search">
          <Search size={16} />
          <input
            type="search"
            placeholder="Search name, color or tag"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search wardrobe"
          />
        </div>
      </div>

      <div className="filter-scroll" aria-label="Filter by category">
        {FILTERS.map((option) => {
          const count =
            option.value === 'all'
              ? items.length
              : items.filter((item) => item.category === option.value).length
          return (
            <Chip
              key={option.value}
              selected={filter === option.value}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
              {count > 0 && <em className="chip-count">{count}</em>}
            </Chip>
          )
        })}
      </div>

      {isLoading ? (
        <div className="wardrobe-grid">
          {[0, 1, 2, 3].map((index) => (
            <div className="item-card-skeleton" key={index}>
              <Skeleton className="item-card-skeleton__image" />
              <Skeleton className="item-card-skeleton__line" />
              <Skeleton className="item-card-skeleton__line item-card-skeleton__line--short" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Shirt size={22} />}
          eyebrow="START WITH WHAT YOU WEAR"
          title="Start with the three things you wear most"
          description="Photograph a top, a bottom and a pair of shoes. The photos don't have to be perfect — a real wardrobe makes real looks."
          action={
            <Button leftIcon={<Plus size={16} />} onClick={() => navigate('/wardrobe/new')}>
              Add your first item
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search size={20} />}
          title="No items found"
          description="Try another keyword, or clear the category filter."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setFilter('all')
                setSearch('')
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="wardrobe-grid">
          {filtered.map((item) => (
            <WardrobeCard
              key={item.id}
              item={item}
              onOpen={() => navigate(`/wardrobe/${item.id}`)}
              onFavorite={() => favoriteMutation.mutate({ item })}
              favoriteBusy={
                favoriteMutation.isPending && favoriteMutation.variables?.item.id === item.id
              }
            />
          ))}
          <button
            type="button"
            className="wardrobe-add-tile"
            onClick={() => navigate('/wardrobe/new')}
          >
            <span>
              <Plus size={20} />
            </span>
            <strong>Add item</strong>
            <em>Capture a piece</em>
          </button>
        </div>
      )}

      {items.length > 0 && (
        <button type="button" className="wardrobe-styling-hint" onClick={() => navigate('/style')}>
          <span className="wardrobe-styling-hint__icon">
            <Sparkles size={17} />
          </span>
          <span>
            <strong>Style looks from your wardrobe now</strong>
            <em>
              {availableCount} available
              {forcedCount ? ` · ${forcedCount} must-wear` : ''}
            </em>
          </span>
          <span className="wardrobe-styling-hint__arrow">→</span>
        </button>
      )}
    </div>
  )
}
