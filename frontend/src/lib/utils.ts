import type { Category, OccasionType, Season } from './types'

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export function greeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 5) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

export function tomorrowISO(): string {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDateLabel(date = new Date()): string {
  return date.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
}

export function formatCompactDate(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export function formatRelative(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  return formatCompactDate(date)
}

export const CATEGORY_META: Record<
  Category,
  { label: string; short: string; role: string }
> = {
  top: { label: '上装', short: '上装', role: 'TOP' },
  bottom: { label: '下装', short: '下装', role: 'BOTTOM' },
  dress: { label: '连衣裙', short: '连身', role: 'DRESS' },
  outerwear: { label: '外套', short: '外套', role: 'OUTER' },
  shoes: { label: '鞋履', short: '鞋履', role: 'SHOES' },
  bag: { label: '包袋', short: '包袋', role: 'BAG' },
  accessory: { label: '配饰', short: '配饰', role: 'ACCESSORY' },
}

export const CATEGORY_OPTIONS = Object.entries(CATEGORY_META).map(([value, meta]) => ({
  value: value as Category,
  ...meta,
}))

export const OCCASION_META: Record<
  OccasionType,
  { label: string; short: string; hint: string }
> = {
  everyday: { label: '日常', short: '日常', hint: '不费力的完整感' },
  work: { label: '通勤', short: '通勤', hint: '利落、耐看、好活动' },
  interview: { label: '面试', short: '面试', hint: '可信、克制、有结构' },
  date: { label: '约会', short: '约会', hint: '松弛的精致感' },
  dinner: { label: '晚餐', short: '晚餐', hint: '灯光下的材质层次' },
  party: { label: '派对', short: '派对', hint: '一个明确记忆点' },
  formal: { label: '正式典礼', short: '典礼', hint: '庄重与剪裁' },
  travel: { label: '旅行', short: '旅行', hint: '移动中的舒适和体面' },
  outdoor: { label: '户外', short: '户外', hint: '防护优先，轻量活动' },
  sport: { label: '运动', short: '运动', hint: '透气、支撑、自由' },
  study: { label: '校园', short: '校园', hint: '自在、耐穿、轻便' },
  lounge: { label: '居家', short: '居家', hint: '柔软与呼吸感' },
}

export const OCCASION_OPTIONS = Object.entries(OCCASION_META).map(([value, meta]) => ({
  value: value as OccasionType,
  ...meta,
}))

export const SEASON_LABELS: Record<Season, string> = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬',
}

export const SEASON_OPTIONS = Object.entries(SEASON_LABELS).map(([value, label]) => ({
  value: value as Season,
  label,
}))

export const STYLE_OPTIONS = [
  '极简',
  '通勤',
  '法式',
  '优雅',
  '街头',
  '复古',
  '中性',
  '学院',
  '机能',
  '运动',
  '浪漫',
  '度假',
  '经典',
  '前卫',
] as const

export const BODY_SHAPES = ['梨形', '苹果形', '沙漏形', '直筒形', '倒三角', '不确定'] as const

export const SKIN_TONES = ['冷白', '自然', '暖黄', '小麦', '深肤色', '不确定'] as const

const OCCASION_KEYWORDS: Array<[string[], OccasionType]> = [
  [['面试', '面谈', '求职', '复试'], 'interview'],
  [['婚礼', '典礼', '颁奖', '葬礼', '晚宴', '正式', '年会'], 'formal'],
  [['上班', '通勤', '会议', '汇报', '商务', '办公', '见客户'], 'work'],
  [['约会', 'date', '咖啡', '看展', '见面'], 'date'],
  [['晚餐', 'dinner', '餐厅', '小酒馆', '聚餐'], 'dinner'],
  [['派对', 'party', '生日', '酒吧', 'livehouse', '音乐节'], 'party'],
  [['徒步', '露营', '爬山', '户外', '郊游', '公园', '海边'], 'outdoor'],
  [['跑步', '健身', '运动', '瑜伽', '球', '骑行'], 'sport'],
  [['出差', '旅行', '旅游', '度假', '飞机', '高铁', '机场'], 'travel'],
  [['上课', '校园', '图书馆', '自习', '学校'], 'study'],
  [['居家', '在家', '宅', '楼下'], 'lounge'],
]

export function inferOccasionType(text: string): OccasionType {
  const lower = text.toLowerCase()
  for (const [keywords, type] of OCCASION_KEYWORDS) {
    if (keywords.some((keyword) => lower.includes(keyword))) return type
  }
  return 'everyday'
}

export function weatherTone(temp: number): 'cold' | 'cool' | 'mild' | 'warm' | 'hot' {
  if (temp <= 5) return 'cold'
  if (temp <= 14) return 'cool'
  if (temp <= 22) return 'mild'
  if (temp <= 29) return 'warm'
  return 'hot'
}

export function currentSeason(): Season {
  const month = new Date().getMonth() + 1
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}

export function fitLabel(value: string | null): string {
  if (value === 'tailored') return '利落合身'
  if (value === 'relaxed') return '松弛廓形'
  return '自然合身'
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export async function compressImage(
  file: File,
  maxEdge = 2000,
  quality = 0.9,
): Promise<{ blob: Blob; filename: string; previewUrl: string }> {
  const fallbackName = file.name || `photo-${Date.now()}.jpg`
  if (file.type === 'image/heic' || file.type === 'image/heif') {
    return { blob: file, filename: fallbackName, previewUrl: URL.createObjectURL(file) }
  }
  let bitmap: ImageBitmap | HTMLImageElement
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      const objectUrl = URL.createObjectURL(file)
      image.onload = () => {
        URL.revokeObjectURL(objectUrl)
        resolve(image)
      }
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('无法读取这张照片'))
      }
      image.src = objectUrl
    })
  }
  const width = bitmap.width
  const height = bitmap.height
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  if (scale === 1 && file.size <= 2.8 * 1024 * 1024) {
    return { blob: file, filename: fallbackName, previewUrl: URL.createObjectURL(file) }
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d')
  if (!context) return { blob: file, filename: fallbackName, previewUrl: URL.createObjectURL(file) }
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  if ('close' in bitmap) bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('照片处理失败'))),
      'image/jpeg',
      quality,
    )
  })
  const filename = fallbackName.replace(/\.[^.]+$/, '') + '.jpg'
  return { blob, filename, previewUrl: URL.createObjectURL(blob) }
}

export function validateEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function pluralLooks(count: number): string {
  return `${count} 套`
}

export function getGreetingName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}
