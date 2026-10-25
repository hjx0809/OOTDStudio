import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  Heart,
  Lock,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useToast } from '@/app/ToastProvider'
import { ImagePicker } from '@/components/ImagePicker'
import { PageHeader } from '@/components/PageHeader'
import { api, ApiError } from '@/lib/api'
import { queryKeys } from '@/lib/queries'
import {
  CATEGORY_META,
  CATEGORY_OPTIONS,
  SEASON_LABELS,
  SEASON_OPTIONS,
  STYLE_OPTIONS,
  cn,
  currentSeason,
} from '@/lib/utils'
import type {
  Category,
  GarmentAnalysis,
  Season,
  WardrobeItem,
  WardrobeItemInput,
} from '@/lib/types'
import {
  Button,
  Chip,
  InlineNotice,
  Skeleton,
  Switch,
  TextAreaField,
  TextField,
} from 'oul-ui'

const FORMALITY_LABELS = ['Loungewear', 'Casual', 'Workwear', 'Formal', 'Black tie']
const WARMTH_LABELS = ['Ultra light', 'Light', 'Medium', 'Warm', 'Heavy']

function ValueScale({
  value,
  onChange,
  labels,
  title,
  hint,
}: {
  value: number
  onChange: (value: number) => void
  labels: string[]
  title: string
  hint: string
}) {
  return (
    <div className="value-scale">
      <div className="value-scale__head">
        <span className="value-scale__title">{title}</span>
        <span className="value-scale__value">{labels[value - 1]}</span>
      </div>
      <div className="value-scale__steps" role="radiogroup" aria-label={title}>
        {labels.map((label, index) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={value === index + 1}
            className={cn('value-scale__step', value === index + 1 && 'is-active')}
            onClick={() => onChange(index + 1)}
          >
            <span>{index + 1}</span>
            <em>{label}</em>
          </button>
        ))}
      </div>
      <p>{hint}</p>
    </div>
  )
}

function ItemEditorForm({ item }: { item: WardrobeItem | null }) {
  const editing = Boolean(item)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState(item?.name ?? '')
  const [category, setCategory] = useState<Category>(item?.category ?? 'top')
  const [subcategory, setSubcategory] = useState(item?.subcategory ?? '')
  const [colorName, setColorName] = useState(item?.color_name ?? '')
  const [colorHex, setColorHex] = useState(item?.color_hex ?? '#8C8C84')
  const [material, setMaterial] = useState(item?.material ?? '')
  const [brand, setBrand] = useState(item?.brand ?? '')
  const [formality, setFormality] = useState(item?.formality ?? 3)
  const [warmth, setWarmth] = useState(item?.warmth ?? 3)
  const [seasons, setSeasons] = useState<Season[]>(
    item?.seasons?.length ? item.seasons : [currentSeason()],
  )
  const [styleTags, setStyleTags] = useState<string[]>(item?.style_tags ?? [])
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [available, setAvailable] = useState(item?.available ?? true)
  const [forceInclude, setForceInclude] = useState(item?.force_include ?? false)
  const [favorite, setFavorite] = useState(item?.favorite ?? false)
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [imageName, setImageName] = useState('garment.jpg')
  const [preview, setPreview] = useState(item?.image_url ?? null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<GarmentAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const nameEdited = useRef(Boolean(item?.name))

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: WardrobeItemInput = {
        name: name.trim() || undefined,
        category,
        subcategory: subcategory.trim() || undefined,
        color_name: colorName.trim() || undefined,
        color_hex: colorHex || undefined,
        material: material.trim() || undefined,
        brand: brand.trim() || undefined,
        formality,
        warmth,
        seasons,
        style_tags: styleTags,
        notes: notes.trim() || undefined,
        available,
        force_include: forceInclude,
        favorite,
      }
      if (editing && item) {
        let updated = await api.wardrobe.update(item.id, payload)
        if (imageBlob) {
          updated = await api.wardrobe.replaceImage(item.id, imageBlob, imageName)
        }
        return updated
      }
      if (!imageBlob) throw new ApiError('Add a photo of this item first', 422)
      return api.wardrobe.create(payload, imageBlob, imageName)
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.wardrobe })
      queryClient.invalidateQueries({ queryKey: queryKeys.wardrobeSummary })
      toast.success(editing ? 'Item updated' : 'Item added to your wardrobe', saved.name)
      navigate('/wardrobe', { replace: true })
    },
    onError: (requestError) => {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Couldn't save. Please try again.",
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.wardrobe.remove(item!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.wardrobe })
      queryClient.invalidateQueries({ queryKey: queryKeys.wardrobeSummary })
      toast.success('Removed from your wardrobe')
      navigate('/wardrobe', { replace: true })
    },
    onError: () => toast.error("Couldn't delete. Try again."),
  })

  const analyze = async (blob: Blob, filename: string) => {
    setAnalyzing(true)
    setAnalysis(null)
    try {
      const result = await api.wardrobe.analyze(blob, filename)
      setAnalysis(result)
      if (result.color_name) setColorName(result.color_name)
      if (result.color_hex) setColorHex(result.color_hex)
      if (result.category) setCategory(result.category)
      if (result.formality) setFormality(result.formality)
      if (result.warmth) setWarmth(result.warmth)
      if (result.seasons?.length) setSeasons(result.seasons)
      if (result.style_tags?.length) setStyleTags(result.style_tags)
      if (result.subcategory) setSubcategory(result.subcategory)
      if (result.material && result.material.toLowerCase() !== 'unknown') setMaterial(result.material)
      if (result.name && !nameEdited.current) {
        setName(result.name)
      }
      toast.success('Photo scanned', result.available ? 'AI filled in what it could — adjust anything you like.' : 'Main color captured. Please add the category.')
    } catch (requestError) {
      setAnalysis({
        available: false,
        reason:
          requestError instanceof ApiError
            ? requestError.message
            : "We couldn't read this photo automatically. Please fill it in manually.",
        name: null,
        category: null,
        subcategory: null,
        color_name: null,
        color_hex: null,
        pattern: null,
        material: null,
        formality: null,
        warmth: null,
        seasons: [],
        style_tags: [],
      })
    } finally {
      setAnalyzing(false)
    }
  }

  const toggleSeason = (season: Season) => {
    setSeasons((current) =>
      current.includes(season)
        ? current.filter((value) => value !== season)
        : [...current, season],
    )
  }

  const toggleStyle = (style: string) => {
    setStyleTags((current) => {
      if (current.includes(style)) return current.filter((value) => value !== style)
      if (current.length >= 6) return current
      return [...current, style]
    })
  }

  return (
    <div className="editor-page">
      <PageHeader
        title={editing ? 'Edit item' : 'Add item'}
        eyebrow={editing ? 'WARDROBE PIECE' : 'NEW WARDROBE PIECE'}
        backTo="/wardrobe"
      />

      <div className="editor-page__intro">
        <p className="o-eyebrow">CAPTURE THE REAL PIECE</p>
        <h1>
          {editing ? 'Make this item more accurate.' : 'Photograph the one you actually wear.'}
        </h1>
        <p>The background doesn't need to be perfect. If the color, cut and fabric read clearly, that's enough.</p>
      </div>

      {error && (
        <InlineNotice tone="critical" className="editor-page__notice">
          {error}
        </InlineNotice>
      )}

      <div className="editor-image-block">
        <ImagePicker
          previewUrl={preview}
          title={editing ? 'Replace item photo' : 'Photograph this item'}
          subtitle="Flat lay, on a hanger or worn — all fine. Just keep other people out of frame."
          aspect="square"
          variant="garment"
          onSelect={(blob, filename, previewUrl) => {
            setImageBlob(blob)
            setImageName(filename)
            setPreview(previewUrl)
            void analyze(blob, filename)
          }}
        />
        <div className="editor-image-aside">
          <div className="ai-reader">
            <span className="ai-reader__icon">
              {analyzing ? <span className="o-spinner o-spinner--sm" /> : <WandSparkles size={18} />}
            </span>
            <strong>{analyzing ? 'Reading the details' : 'AI wardrobe assistant'}</strong>
            <p>
              {analyzing
                ? 'Detecting category, color and formality…'
                : "Upload a photo and we'll suggest category, color and formality. You can change anything."}
            </p>
          </div>
          {analysis && (
            <p className={cn('ai-result', analysis.available ? 'is-success' : 'is-neutral')}>
              {analysis.available ? <Check size={13} /> : <Sparkles size={13} />}
              {analysis.available ? 'Auto-filled — adjust as needed' : analysis.reason}
            </p>
          )}
        </div>
      </div>

      <section className="editor-section">
        <div className="editor-section__head">
          <span className="editor-section__index">01</span>
          <h2>The basics</h2>
        </div>

        <div className="editor-section__body">
          <div className="form-field-block">
            <span className="o-field__label">Category</span>
            <div className="category-picker">
              {CATEGORY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn('category-pick', category === option.value && 'is-active')}
                  onClick={() => setCategory(option.value)}
                  aria-pressed={category === option.value}
                >
                  <span className="category-pick__abbr">{option.role}</span>
                  <span>{CATEGORY_META[option.value].label}</span>
                  {category === option.value && <Check size={12} />}
                </button>
              ))}
            </div>
          </div>

          <TextField
            label="Item name"
            placeholder="e.g. Charcoal wool blazer"
            value={name}
            maxLength={120}
            onChange={(event) => {
              nameEdited.current = true
              setName(event.target.value)
            }}
            optional
          />

          <div className="form-row">
            <TextField
              label="Subcategory"
              placeholder="Shirt / straight-leg trousers"
              value={subcategory}
              maxLength={80}
              onChange={(event) => setSubcategory(event.target.value)}
              optional
            />
            <TextField
              label="Brand"
              placeholder="Optional"
              value={brand}
              maxLength={80}
              onChange={(event) => setBrand(event.target.value)}
              optional
            />
          </div>

          <div className="color-field-row">
            <TextField
              label="Color name"
              placeholder="e.g. Charcoal"
              value={colorName}
              maxLength={60}
              onChange={(event) => setColorName(event.target.value)}
              optional
            />
            <label className="color-swatch-field">
              <span>Main color</span>
              <span className="color-swatch-field__control">
                <input
                  type="color"
                  value={colorHex || '#8C8C84'}
                  onChange={(event) => setColorHex(event.target.value.toUpperCase())}
                  aria-label="Choose the item's main color"
                />
                <em>{colorHex || '#8C8C84'}</em>
              </span>
            </label>
          </div>

          <TextField
            label="Material"
            placeholder="Wool / cotton / leather…"
            value={material}
            maxLength={80}
            onChange={(event) => setMaterial(event.target.value)}
            optional
          />
        </div>
      </section>

      <section className="editor-section">
        <div className="editor-section__head">
          <span className="editor-section__index">02</span>
          <h2>Formality and warmth</h2>
        </div>
        <div className="editor-section__body">
          <ValueScale
            title="Formality"
            value={formality}
            onChange={setFormality}
            labels={FORMALITY_LABELS}
            hint="Helps us judge whether it works for interviews, the office or weekends."
          />
          <ValueScale
            title="Warmth"
            onChange={setWarmth}
            value={warmth}
            labels={WARMTH_LABELS}
            hint="Thicker isn't better — right for tomorrow's feels-like temperature is."
          />
        </div>
      </section>

      <section className="editor-section">
        <div className="editor-section__head">
          <span className="editor-section__index">03</span>
          <h2>Season and style</h2>
        </div>
        <div className="editor-section__body">
          <div className="form-field-block">
            <span className="o-field__label">Seasons</span>
            <div className="chip-wrap">
              {SEASON_OPTIONS.map((season) => (
                <Chip
                  key={season.value}
                  selected={seasons.includes(season.value)}
                  onClick={() => toggleSeason(season.value)}
                >
                  {SEASON_LABELS[season.value]}
                </Chip>
              ))}
            </div>
          </div>
          <div className="form-field-block">
            <span className="o-field__label">Style tags</span>
            <div className="chip-wrap">
              {STYLE_OPTIONS.map((style) => (
                <Chip
                  key={style}
                  selected={styleTags.includes(style)}
                  onClick={() => toggleStyle(style)}
                >
                  {style}
                </Chip>
              ))}
            </div>
            <p className="o-field__hint">Up to 6 — they help us understand how you wear it.</p>
          </div>
          <TextAreaField
            label="Notes"
            placeholder="e.g. Sleeves run long; dry clean only; most often worn with black trousers."
            value={notes}
            maxLength={1000}
            onChange={(event) => setNotes(event.target.value)}
            optional
          />
        </div>
      </section>

      <section className="editor-section">
        <div className="editor-section__head">
          <span className="editor-section__index">04</span>
          <h2>Availability</h2>
        </div>
        <div className="editor-section__body">
          <div className="settings-list">
            <Switch
              checked={available}
              onChange={(checked) => {
                setAvailable(checked)
                if (!checked) setForceInclude(false)
              }}
              label="Available now"
              description="Items in the wash, lent out or simply off-duty are left out of your next recommendation."
            />
            <Switch
              checked={forceInclude}
              onChange={setForceInclude}
              label="Must-wear for the next look"
              description="OUL will include this piece in your next set of looks — and will tell you if it clashes with the occasion."
              disabled={!available}
            />
            <Switch
              checked={favorite}
              onChange={setFavorite}
              label="Favorite this item"
              description="Favorites don't affect recommendations — they're just a marker for the pieces you love."
            />
          </div>
          {forceInclude && (
            <InlineNotice tone="info" icon={<Lock size={16} />}>
              Must-wear pieces appear in your next set of looks. If one clashes with the
              weather or occasion, OUL keeps it in and suggests how to make it work.
            </InlineNotice>
          )}
        </div>
      </section>

      {editing && (
        <button type="button" className="danger-row" onClick={() => setDeleteOpen(true)}>
          <Trash2 size={16} />
          Remove this item from your wardrobe
        </button>
      )}

      <footer className="editor-footer">
        <div className="editor-footer__meta">
          {favorite ? <Heart size={13} fill="currentColor" /> : <Sparkles size={13} />}
          <span>{preview ? 'Photo ready' : 'One photo to go'}</span>
        </div>
        <Button
          size="lg"
          loading={saveMutation.isPending}
          onClick={() => {
            setError(null)
            if (!preview) {
              setError('Photograph this item or choose one from your library first')
              window.scrollTo({ top: 0, behavior: 'smooth' })
              return
            }
            saveMutation.mutate()
          }}
        >
          {editing ? 'Save changes' : 'Add to wardrobe'}
        </Button>
      </footer>

      {deleteOpen && (
        <div className="inline-modal" role="dialog" aria-modal="true" aria-label="Confirm removing item">
          <button
            type="button"
            className="inline-modal__backdrop"
            aria-label="Cancel"
            onClick={() => setDeleteOpen(false)}
          />
          <div className="inline-modal__panel">
            <p className="o-eyebrow">REMOVE FROM WARDROBE</p>
            <h3>Remove “{item?.name}”?</h3>
            <p>Past looks will keep this piece in their history, but it won't appear in new recommendations.</p>
            <div className="inline-modal__actions">
              <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
                Keep it
              </Button>
              <Button
                variant="danger"
                loading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function ItemEditorPage() {
  const { itemId } = useParams<{ itemId: string }>()
  const editing = Boolean(itemId)
  const itemQuery = useQuery({
    queryKey: ['wardrobe', 'item', itemId],
    queryFn: () => api.wardrobe.get(itemId as string),
    enabled: editing,
    staleTime: 30_000,
  })

  if (editing && itemQuery.isLoading) {
    return (
      <div className="editor-page">
        <PageHeader title="Edit item" backTo="/wardrobe" />
        <div className="editor-loading">
          <Skeleton className="editor-loading__image" />
          <Skeleton className="editor-loading__line" />
          <Skeleton className="editor-loading__line editor-loading__line--short" />
        </div>
      </div>
    )
  }

  if (editing && (itemQuery.isError || !itemQuery.data)) {
    return (
      <div className="editor-page">
        <PageHeader title="Edit item" backTo="/wardrobe" />
        <InlineNotice tone="critical">
          We couldn't find this item — it may have been removed from your wardrobe.
        </InlineNotice>
      </div>
    )
  }

  return <ItemEditorForm item={itemQuery.data ?? null} />
}
