import type { Category, OccasionType, Season } from './types'

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export function greeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 5) return 'Still up late'
  if (hour < 11) return 'Good morning'
  if (hour < 14) return 'Good afternoon'
  if (hour < 18) return 'Good evening'
  return 'Good night'
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
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
}

export function formatCompactDate(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
}

export function formatRelative(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} d ago`
  return formatCompactDate(date)
}

export const CATEGORY_META: Record<
  Category,
  { label: string; short: string; role: string }
> = {
  top: { label: 'Top', short: 'Top', role: 'TOP' },
  bottom: { label: 'Bottom', short: 'Bottom', role: 'BOTTOM' },
  dress: { label: 'Dress', short: 'Dress', role: 'DRESS' },
  outerwear: { label: 'Outerwear', short: 'Outer', role: 'OUTER' },
  shoes: { label: 'Shoes', short: 'Shoes', role: 'SHOES' },
  bag: { label: 'Bag', short: 'Bag', role: 'BAG' },
  accessory: { label: 'Accessory', short: 'Accessory', role: 'ACCESSORY' },
}

export const CATEGORY_OPTIONS = Object.entries(CATEGORY_META).map(([value, meta]) => ({
  value: value as Category,
  ...meta,
}))

export const OCCASION_META: Record<
  OccasionType,
  { label: string; short: string; hint: string }
> = {
  everyday: { label: 'Everyday', short: 'Everyday', hint: 'Effortless polish, head to toe' },
  work: { label: 'Work', short: 'Work', hint: 'Sharp, easy to move in' },
  interview: { label: 'Interview', short: 'Interview', hint: 'Credible, composed, structured' },
  date: { label: 'Date', short: 'Date', hint: 'Relaxed refinement' },
  dinner: { label: 'Dinner', short: 'Dinner', hint: 'Texture that reads in low light' },
  party: { label: 'Party', short: 'Party', hint: 'One clear statement' },
  formal: { label: 'Formal', short: 'Formal', hint: 'Occasion weight and fine tailoring' },
  travel: { label: 'Travel', short: 'Travel', hint: 'Comfort and poise on the move' },
  outdoor: { label: 'Outdoor', short: 'Outdoor', hint: 'Weather-ready, light on movement' },
  sport: { label: 'Sport', short: 'Sport', hint: 'Breathable, supported, free' },
  study: { label: 'Campus', short: 'Campus', hint: 'Easy, hard-wearing, light' },
  lounge: { label: 'At home', short: 'At home', hint: 'Soft and breathable' },
}

export const OCCASION_OPTIONS = Object.entries(OCCASION_META).map(([value, meta]) => ({
  value: value as OccasionType,
  ...meta,
}))

export const SEASON_LABELS: Record<Season, string> = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
}

export const SEASON_OPTIONS = Object.entries(SEASON_LABELS).map(([value, label]) => ({
  value: value as Season,
  label,
}))

export const STYLE_OPTIONS = [
  'minimal',
  'work',
  'french',
  'elegant',
  'street',
  'vintage',
  'neutral',
  'preppy',
  'technical',
  'sport',
  'romantic',
  'resort',
  'classic',
  'avant-garde',
] as const

export const BODY_SHAPES = ['Pear', 'Apple', 'Hourglass', 'Rectangle', 'Inverted triangle', 'Not sure'] as const

export const SKIN_TONES = ['Cool', 'Natural', 'Warm', 'Tan', 'Deep', 'Not sure'] as const

const OCCASION_KEYWORDS: Array<[string[], OccasionType]> = [
  [['interview', 'job interview', 'recruiter'], 'interview'],
  [['wedding', 'ceremony', 'gala', 'funeral', 'awards', 'formal', 'dinner party'], 'formal'],
  [['workout', 'gym', 'run', 'running', 'yoga', 'cycling', 'tennis', 'training', 'sport'], 'sport'],
  [['work', 'office', 'meeting', 'presentation', 'business', 'client', 'commute'], 'work'],
  [['date', 'coffee', 'gallery', 'catch up'], 'date'],
  [['dinner', 'restaurant', 'bistro', 'supper'], 'dinner'],
  [['party', 'birthday', 'bar', 'livehouse', 'club', 'concert', 'festival'], 'party'],
  [['hike', 'hiking', 'camping', 'trail', 'outdoor', 'park', 'beach', 'picnic'], 'outdoor'],
  [['travel', 'trip', 'flight', 'airport', 'train', 'vacation', 'getaway', 'hotel'], 'travel'],
  [['class', 'campus', 'library', 'study', 'school', 'lecture'], 'study'],
  [['home', 'at home', 'lounge', 'indoors', 'relax'], 'lounge'],
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
  if (value === 'tailored') return 'Tailored'
  if (value === 'relaxed') return 'Relaxed'
  return 'Regular'
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
        reject(new Error('Could not read this photo'))
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
      (result) => (result ? resolve(result) : reject(new Error('Photo processing failed'))),
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
  return `${count} ${count === 1 ? 'look' : 'looks'}`
}

export function getGreetingName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}
