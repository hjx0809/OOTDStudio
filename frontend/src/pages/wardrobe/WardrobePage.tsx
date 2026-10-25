import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Lock, Minus, Plus, Shirt } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@/app/ToastProvider'
import { api } from '@/lib/api'
import { queryKeys, useWardrobe } from '@/lib/queries'
import { cn, CATEGORY_META } from '@/lib/utils'
import type { Category, WardrobeItem } from '@/lib/types'
import { Button, EmptyState, Skeleton } from 'oul-ui'

type ClosetFilter = 'all' | 'favorites' | Category

const CATEGORY_KEYS = Object.keys(CATEGORY_META) as Category[]

const CATEGORY_PLURALS: Record<Category, string> = {
  top: 'Tops',
  bottom: 'Bottoms',
  dress: 'Dresses',
  outerwear: 'Outerwear',
  shoes: 'Shoes',
  bag: 'Bags',
  accessory: 'Accessories',
}

function isDark(hex: string | null): boolean {
  const match = hex?.match(/^#?([0-9a-f]{6})$/i)
  if (!match) return false
  const value = parseInt(match[1], 16)
  const luminance = 0.299 * (value >> 16) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255)
  return luminance < 128
}

function ClosetCard({
  item,
  onOpen,
  onToggle,
}: {
  item: WardrobeItem
  onOpen: () => void
  onToggle: () => void
}) {
  const meta = [item.material, item.color_name].filter(Boolean).join(' · ') || CATEGORY_PLURALS[item.category]
  return (
    <div className={cn('closet-card', !item.available && 'is-unavailable')}>
      <button type="button" className="closet-card__open" onClick={onOpen} aria-label={`Edit ${item.name}`}>
        <span
          className={cn('closet-card__image', !item.image_url && isDark(item.color_hex) && 'is-dark')}
          style={!item.image_url && item.color_hex ? { background: item.color_hex } : undefined}
        >
          {item.image_url ? (
            <img src={item.image_url} alt="" loading="lazy" />
          ) : (
            <span className="closet-card__placeholder">{CATEGORY_PLURALS[item.category]}</span>
          )}
          {item.force_include && (
            <span className="closet-card__lock" title="Must-wear">
              <Lock size={13} />
            </span>
          )}
        </span>
        <span className="closet-card__copy">
          <strong>{item.name}</strong>
          <span>{meta}</span>
        </span>
      </button>
      <button
        type="button"
        className={cn('closet-card__status', !item.available && 'is-off')}
        onClick={onToggle}
        aria-pressed={item.available}
        aria-label={`${item.name}: ${item.available ? 'available' : 'unavailable'}. Toggle availability`}
        title={item.available ? 'Available — tap to mark unavailable' : 'Unavailable — tap to mark available'}
      >
        {item.available ? <Check size={18} strokeWidth={2.4} /> : <Minus size={18} strokeWidth={2.4} />}
      </button>
    </div>
  )
}

export function WardrobePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data, isLoading } = useWardrobe()
  const [filter, setFilter] = useState<ClosetFilter>('all')

  const availabilityMutation = useMutation({
    mutationFn: (item: WardrobeItem) => api.wardrobe.setAvailability(item.id, !item.available),
    onMutate: async (item) => {
      // Flip the badge immediately; roll back if the server rejects it.
      await queryClient.cancelQueries({ queryKey: queryKeys.wardrobe })
      const previous = queryClient.getQueryData<WardrobeItem[]>(queryKeys.wardrobe)
      queryClient.setQueryData<WardrobeItem[]>(queryKeys.wardrobe, (current) =>
        current?.map((entry) => (entry.id === item.id ? { ...entry, available: !item.available } : entry)),
      )
      return { previous }
    },
    onError: (_error, _item, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.wardrobe, context.previous)
      toast.error("Couldn't save. Try again.")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.wardrobe })
      queryClient.invalidateQueries({ queryKey: queryKeys.wardrobeSummary })
    },
  })

  const items = data ?? []
  const filtered = useMemo(
    () =>
      items.filter((item) => {
        if (filter === 'all') return true
        if (filter === 'favorites') return item.favorite
        return item.category === filter
      }),
    [items, filter],
  )

  const ready = items.filter((item) => item.available).length
  const filters: Array<{ value: ClosetFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'favorites', label: 'Favorites' },
    ...CATEGORY_KEYS.filter((category) => items.some((item) => item.category === category)).map(
      (category) => ({ value: category as ClosetFilter, label: CATEGORY_PLURALS[category] }),
    ),
  ]

  return (
    <div className="page page--tab">
      <header className="tab-head">
        <h1 className="tab-head__title">Closet</h1>
        <button
          type="button"
          className="round-button round-button--dark"
          aria-label="Add item"
          onClick={() => navigate('/wardrobe/new')}
        >
          <Plus size={24} />
        </button>
      </header>

      <div className="stat-tiles">
        <div>
          <strong>{isLoading ? '—' : items.length}</strong>
          <span>Items</span>
        </div>
        <div>
          <strong>{isLoading ? '—' : ready}</strong>
          <span>Ready</span>
        </div>
        <div>
          <strong>{isLoading ? '—' : items.length - ready}</strong>
          <span>Unavailable</span>
        </div>
      </div>

      {items.length > 0 && (
        <div className="plans__row" aria-label="Filter closet">
          {filters.map((option) => (
            <button
              type="button"
              key={option.value}
              className={cn('plan-chip', filter === option.value && 'is-selected')}
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="closet-grid">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton className="closet-card closet-card--skeleton" key={index} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Shirt size={24} />}
          title="Your closet is empty"
          description="Snap a top, a bottom and shoes to start."
          action={
            <Button leftIcon={<Plus size={16} />} onClick={() => navigate('/wardrobe/new')}>
              Add item
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Shirt size={22} />}
          title={filter === 'favorites' ? 'No favorites yet' : 'Nothing here'}
          action={
            <Button variant="secondary" size="sm" onClick={() => setFilter('all')}>
              Show all
            </Button>
          }
        />
      ) : (
        <div className="closet-grid">
          {filtered.map((item) => (
            <ClosetCard
              key={item.id}
              item={item}
              onOpen={() => navigate(`/wardrobe/${item.id}`)}
              onToggle={() => availabilityMutation.mutate(item)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
