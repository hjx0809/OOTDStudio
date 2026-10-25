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

const FORMALITY_LABELS = ['居家', '休闲', '通勤', '正式', '礼服']
const WARMTH_LABELS = ['极轻', '轻薄', '适中', '保暖', '厚重']

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
      if (!imageBlob) throw new ApiError('请先为这件单品拍一张照片', 422)
      return api.wardrobe.create(payload, imageBlob, imageName)
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.wardrobe })
      queryClient.invalidateQueries({ queryKey: queryKeys.wardrobeSummary })
      toast.success(editing ? '单品已更新' : '单品已放进衣橱', saved.name)
      navigate('/wardrobe', { replace: true })
    },
    onError: (requestError) => {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : '保存没有完成，请稍后再试',
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.wardrobe.remove(item!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.wardrobe })
      queryClient.invalidateQueries({ queryKey: queryKeys.wardrobeSummary })
      toast.success('已从衣橱移除')
      navigate('/wardrobe', { replace: true })
    },
    onError: () => toast.error('删除没有完成，请重试'),
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
      if (result.material && result.material !== '未知') setMaterial(result.material)
      if (result.name && !nameEdited.current) {
        setName(result.name)
      }
      toast.success('照片已读取', result.available ? 'AI 已填好能识别的信息，可继续微调。' : '已提取主色，请补充分类。')
    } catch (requestError) {
      setAnalysis({
        available: false,
        reason:
          requestError instanceof ApiError
            ? requestError.message
            : '暂时无法自动识别，请手动填写。',
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
        title={editing ? '编辑单品' : '添加单品'}
        eyebrow={editing ? 'WARDROBE PIECE' : 'NEW WARDROBE PIECE'}
        backTo="/wardrobe"
      />

      <div className="editor-page__intro">
        <p className="o-eyebrow">CAPTURE THE REAL PIECE</p>
        <h1>
          {editing ? '让这件单品更准确。' : '拍下你真正会穿的那一件。'}
        </h1>
        <p>背景不用完美。看得清颜色、版型和材质，就足够开始。</p>
      </div>

      {error && (
        <InlineNotice tone="critical" className="editor-page__notice">
          {error}
        </InlineNotice>
      )}

      <div className="editor-image-block">
        <ImagePicker
          previewUrl={preview}
          title={editing ? '替换单品照片' : '为这件单品拍照'}
          subtitle="平铺、挂拍或穿着拍摄都可以；避免多人入镜"
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
            <strong>{analyzing ? '正在读取细节' : 'AI 衣橱助理'}</strong>
            <p>
              {analyzing
                ? '识别品类、颜色与正式度…'
                : '上传后自动建议分类、颜色和正式度，你随时可以改。'}
            </p>
          </div>
          {analysis && (
            <p className={cn('ai-result', analysis.available ? 'is-success' : 'is-neutral')}>
              {analysis.available ? <Check size={13} /> : <Sparkles size={13} />}
              {analysis.available ? '已自动填写，可继续微调' : analysis.reason}
            </p>
          )}
        </div>
      </div>

      <section className="editor-section">
        <div className="editor-section__head">
          <span className="editor-section__index">01</span>
          <h2>基本信息</h2>
        </div>

        <div className="editor-section__body">
          <div className="form-field-block">
            <span className="o-field__label">分类</span>
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
            label="单品名称"
            placeholder="例如：炭灰羊毛西装外套"
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
              label="子类"
              placeholder="衬衫 / 直筒裤"
              value={subcategory}
              maxLength={80}
              onChange={(event) => setSubcategory(event.target.value)}
              optional
            />
            <TextField
              label="品牌"
              placeholder="不填也可以"
              value={brand}
              maxLength={80}
              onChange={(event) => setBrand(event.target.value)}
              optional
            />
          </div>

          <div className="color-field-row">
            <TextField
              label="颜色名称"
              placeholder="例如：炭灰"
              value={colorName}
              maxLength={60}
              onChange={(event) => setColorName(event.target.value)}
              optional
            />
            <label className="color-swatch-field">
              <span>主色</span>
              <span className="color-swatch-field__control">
                <input
                  type="color"
                  value={colorHex || '#8C8C84'}
                  onChange={(event) => setColorHex(event.target.value.toUpperCase())}
                  aria-label="选择单品主色"
                />
                <em>{colorHex || '#8C8C84'}</em>
              </span>
            </label>
          </div>

          <TextField
            label="材质"
            placeholder="羊毛 / 棉 / 皮革…"
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
          <h2>正式度与保暖</h2>
        </div>
        <div className="editor-section__body">
          <ValueScale
            title="正式度"
            value={formality}
            onChange={setFormality}
            labels={FORMALITY_LABELS}
            hint="用于判断是否能覆盖面试、通勤或周末等场景。"
          />
          <ValueScale
            title="保暖度"
            onChange={setWarmth}
            value={warmth}
            labels={WARMTH_LABELS}
            hint="不是越厚越好，刚刚适合明天的体感才是。"
          />
        </div>
      </section>

      <section className="editor-section">
        <div className="editor-section__head">
          <span className="editor-section__index">03</span>
          <h2>季节与风格</h2>
        </div>
        <div className="editor-section__body">
          <div className="form-field-block">
            <span className="o-field__label">适合季节</span>
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
            <span className="o-field__label">风格标签</span>
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
            <p className="o-field__hint">最多 6 个，帮助我们理解你如何使用它。</p>
          </div>
          <TextAreaField
            label="备注"
            placeholder="例如：袖子略长；只适合干洗；和黑色西裤最常一起穿。"
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
          <h2>使用状态</h2>
        </div>
        <div className="editor-section__body">
          <div className="settings-list">
            <Switch
              checked={available}
              onChange={(checked) => {
                setAvailable(checked)
                if (!checked) setForceInclude(false)
              }}
              label="现在可穿"
              description="清洗中、借出或暂时不想穿的单品会被排除在下一次推荐外。"
            />
            <Switch
              checked={forceInclude}
              onChange={setForceInclude}
              label="下次推荐必穿"
              description="OUL 会把这件单品加入下一组造型；如果不适合场景，会明确提示。"
              disabled={!available}
            />
            <Switch
              checked={favorite}
              onChange={setFavorite}
              label="收藏这件单品"
              description="收藏不会改变推荐，只用于标记你最喜欢的单品。"
            />
          </div>
          {forceInclude && (
            <InlineNotice tone="info" icon={<Lock size={16} />}>
              必穿单品会同时出现在下一组造型里。若与天气或场合冲突，OUL
              会保留单品并给出调整建议。
            </InlineNotice>
          )}
        </div>
      </section>

      {editing && (
        <button type="button" className="danger-row" onClick={() => setDeleteOpen(true)}>
          <Trash2 size={16} />
          从衣橱移除这件单品
        </button>
      )}

      <footer className="editor-footer">
        <div className="editor-footer__meta">
          {favorite ? <Heart size={13} fill="currentColor" /> : <Sparkles size={13} />}
          <span>{preview ? '照片已准备好' : '还差一张单品照片'}</span>
        </div>
        <Button
          size="lg"
          loading={saveMutation.isPending}
          onClick={() => {
            setError(null)
            if (!preview) {
              setError('请先为这件单品拍照或从相册选择')
              window.scrollTo({ top: 0, behavior: 'smooth' })
              return
            }
            saveMutation.mutate()
          }}
        >
          {editing ? '保存修改' : '放进衣橱'}
        </Button>
      </footer>

      {deleteOpen && (
        <div className="inline-modal" role="dialog" aria-modal="true" aria-label="确认删除单品">
          <button
            type="button"
            className="inline-modal__backdrop"
            aria-label="取消"
            onClick={() => setDeleteOpen(false)}
          />
          <div className="inline-modal__panel">
            <p className="o-eyebrow">REMOVE FROM WARDROBE</p>
            <h3>确定移除「{item?.name}」？</h3>
            <p>历史造型中的这张搭配记录仍会保留，但这件单品不会再参与新的推荐。</p>
            <div className="inline-modal__actions">
              <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
                再想想
              </Button>
              <Button
                variant="danger"
                loading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                确认移除
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
        <PageHeader title="编辑单品" backTo="/wardrobe" />
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
        <PageHeader title="编辑单品" backTo="/wardrobe" />
        <InlineNotice tone="critical">
          找不到这件单品，可能已从衣橱移除。
        </InlineNotice>
      </div>
    )
  }

  return <ItemEditorForm item={itemQuery.data ?? null} />
}
