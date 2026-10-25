import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, Trash2, WandSparkles } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useToast } from '@/app/ToastProvider'
import { ImagePicker } from '@/components/ImagePicker'
import { PageHeader } from '@/components/PageHeader'
import { api, ApiError } from '@/lib/api'
import { queryKeys } from '@/lib/queries'
import {
  CATEGORY_OPTIONS,
  SEASON_OPTIONS,
  STYLE_OPTIONS,
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
  IconButton,
  InlineNotice,
  Segmented,
  Sheet,
  Skeleton,
  Switch,
  TextAreaField,
  TextField,
} from 'oul-ui'

const FORMALITY_OPTIONS = ['Lounge', 'Casual', 'Smart', 'Formal', 'Gala'].map((label, index) => ({
  value: String(index + 1),
  label,
}))
const WARMTH_OPTIONS = ['Airy', 'Light', 'Mid', 'Warm', 'Heavy'].map((label, index) => ({
  value: String(index + 1),
  label,
}))

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
      if (!imageBlob) throw new ApiError('Add a photo first', 422)
      return api.wardrobe.create(payload, imageBlob, imageName)
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.wardrobe })
      queryClient.invalidateQueries({ queryKey: queryKeys.wardrobeSummary })
      toast.success(editing ? 'Saved' : 'Added', saved.name)
      navigate('/wardrobe', { replace: true })
    },
    onError: (requestError) => {
      setError(requestError instanceof ApiError ? requestError.message : "Couldn't save. Try again.")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.wardrobe.remove(item!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.wardrobe })
      queryClient.invalidateQueries({ queryKey: queryKeys.wardrobeSummary })
      toast.success('Removed')
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
    } catch (requestError) {
      setAnalysis({
        available: false,
        reason:
          requestError instanceof ApiError
            ? requestError.message
            : "Couldn't auto-fill — fill in manually",
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
    <div className="page page--bare">
      <PageHeader
        title={editing ? 'Edit item' : 'New item'}
        backTo="/wardrobe"
        action={
          editing && (
            <IconButton label="Delete item" onClick={() => setDeleteOpen(true)}>
              <Trash2 size={18} />
            </IconButton>
          )
        }
      />

      {error && <InlineNotice tone="critical">{error}</InlineNotice>}

      <ImagePicker
        previewUrl={preview}
        title="Add a photo"
        subtitle="AI fills in the details"
        aspect="square"
        variant="garment"
        onSelect={(blob, filename, previewUrl) => {
          setImageBlob(blob)
          setImageName(filename)
          setPreview(previewUrl)
          void analyze(blob, filename)
        }}
      />
      {(analyzing || analysis) && (
        <p className="ai-status">
          {analyzing ? (
            <>
              <span className="o-spinner o-spinner--sm" />
              Reading photo…
            </>
          ) : analysis?.available ? (
            <>
              <Check size={14} />
              Auto-filled
            </>
          ) : (
            <>
              <WandSparkles size={14} />
              {analysis?.reason}
            </>
          )}
        </p>
      )}

      <div className="form-stack">
        <div className="field-block">
          <span className="o-field__label">Category</span>
          <div className="chip-wrap">
            {CATEGORY_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                selected={category === option.value}
                onClick={() => setCategory(option.value)}
              >
                {option.label}
              </Chip>
            ))}
          </div>
        </div>

        <TextField
          label="Name"
          placeholder="e.g. Charcoal wool blazer"
          value={name}
          maxLength={120}
          onChange={(event) => {
            nameEdited.current = true
            setName(event.target.value)
          }}
        />

        <div className="color-row">
          <TextField
            label="Color"
            placeholder="e.g. Charcoal"
            value={colorName}
            maxLength={60}
            onChange={(event) => setColorName(event.target.value)}
          />
          <label className="color-swatch" style={{ background: colorHex || '#8C8C84' }}>
            <input
              type="color"
              value={colorHex || '#8C8C84'}
              onChange={(event) => setColorHex(event.target.value.toUpperCase())}
              aria-label="Pick main color"
            />
          </label>
        </div>

        <div className="field-block">
          <span className="o-field__label">Formality</span>
          <Segmented
            options={FORMALITY_OPTIONS}
            value={String(formality)}
            onChange={(value) => setFormality(Number(value))}
            ariaLabel="Formality"
          />
        </div>

        <div className="field-block">
          <span className="o-field__label">Warmth</span>
          <Segmented
            options={WARMTH_OPTIONS}
            value={String(warmth)}
            onChange={(value) => setWarmth(Number(value))}
            ariaLabel="Warmth"
          />
        </div>

        <div className="field-block">
          <span className="o-field__label">Seasons</span>
          <div className="chip-wrap">
            {SEASON_OPTIONS.map((season) => (
              <Chip
                key={season.value}
                selected={seasons.includes(season.value)}
                onClick={() => toggleSeason(season.value)}
              >
                {season.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="toggle-list">
          <Switch
            checked={available}
            onChange={(checked) => {
              setAvailable(checked)
              if (!checked) setForceInclude(false)
            }}
            label="Available"
            description="Off = in the wash or lent out"
          />
          <Switch
            checked={forceInclude}
            onChange={setForceInclude}
            label="Must-wear"
            description="Include in your next looks"
            disabled={!available}
          />
          <Switch checked={favorite} onChange={setFavorite} label="Favorite" />
        </div>

        <details className="more">
          <summary>
            More details
            <ChevronDown size={16} />
          </summary>
          <div className="form-stack">
            <div className="field-block">
              <span className="o-field__label">
                Style tags
                <span className="o-field__optional">{styleTags.length}/6</span>
              </span>
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
            </div>
            <div className="form-row">
              <TextField
                label="Type"
                placeholder="e.g. Shirt"
                value={subcategory}
                maxLength={80}
                onChange={(event) => setSubcategory(event.target.value)}
              />
              <TextField
                label="Brand"
                value={brand}
                maxLength={80}
                onChange={(event) => setBrand(event.target.value)}
              />
            </div>
            <TextField
              label="Material"
              placeholder="e.g. Wool"
              value={material}
              maxLength={80}
              onChange={(event) => setMaterial(event.target.value)}
            />
            <TextAreaField
              label="Notes"
              value={notes}
              maxLength={1000}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </details>
      </div>

      <footer className="sticky-footer">
        <Button
          size="lg"
          full
          loading={saveMutation.isPending}
          disabled={analyzing}
          onClick={() => {
            setError(null)
            if (!preview) {
              setError('Add a photo first')
              window.scrollTo({ top: 0, behavior: 'smooth' })
              return
            }
            saveMutation.mutate()
          }}
        >
          {editing ? 'Save' : 'Add to closet'}
        </Button>
      </footer>

      <Sheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Remove “${item?.name}”?`}
        description="Past looks keep it; new looks won't use it."
      >
        <div className="button-row">
          <Button variant="secondary" full onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            full
            loading={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            Remove
          </Button>
        </div>
      </Sheet>
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
      <div className="page page--bare">
        <PageHeader title="Edit item" backTo="/wardrobe" />
        <Skeleton className="image-picker image-picker--square" />
      </div>
    )
  }

  if (editing && (itemQuery.isError || !itemQuery.data)) {
    return (
      <div className="page page--bare">
        <PageHeader title="Edit item" backTo="/wardrobe" />
        <InlineNotice tone="critical">This item no longer exists.</InlineNotice>
      </div>
    )
  }

  return <ItemEditorForm item={itemQuery.data ?? null} />
}
