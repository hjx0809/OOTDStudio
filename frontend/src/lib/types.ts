export type FitPreference = 'tailored' | 'regular' | 'relaxed'
export type Category =
  | 'top'
  | 'bottom'
  | 'dress'
  | 'outerwear'
  | 'shoes'
  | 'bag'
  | 'accessory'
export type OccasionType =
  | 'everyday'
  | 'work'
  | 'interview'
  | 'date'
  | 'dinner'
  | 'party'
  | 'formal'
  | 'travel'
  | 'outdoor'
  | 'sport'
  | 'study'
  | 'lounge'
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

export interface User {
  id: string
  email: string
  display_name: string
  onboarding_completed: boolean
  created_at: string
  base_photo_url: string | null
  base_photo_thumb_url: string | null
  height_cm: number | null
  weight_kg: number | null
  chest_cm: number | null
  waist_cm: number | null
  hip_cm: number | null
  inseam_cm: number | null
  shoe_size: number | null
  body_shape: string | null
  skin_tone: string | null
  fit_preference: FitPreference | string
  style_preferences: string[]
  avoid_colors: string[]
  city: string | null
  latitude: number | null
  longitude: number | null
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user: User
}

export interface WardrobeItem {
  id: string
  name: string
  category: Category
  category_label: string
  subcategory: string | null
  color_name: string
  color_hex: string | null
  pattern: string | null
  material: string | null
  brand: string | null
  formality: number
  warmth: number
  seasons: Season[]
  style_tags: string[]
  available: boolean
  force_include: boolean
  favorite: boolean
  notes: string | null
  last_worn_at: string | null
  created_at: string
  image_url: string
  full_image_url: string
}

export interface WardrobeSummary {
  total: number
  available: number
  forced: number
  by_category: Record<string, number>
  last_updated: string | null
}

export interface GarmentAnalysis {
  available: boolean
  reason: string | null
  name: string | null
  category: Category | null
  subcategory: string | null
  color_name: string | null
  color_hex: string | null
  pattern: string | null
  material: string | null
  formality: number | null
  warmth: number | null
  seasons: Season[]
  style_tags: string[]
}

export interface Weather {
  city: string | null
  date: string | null
  temp_min: number
  temp_max: number
  apparent_temp: number
  precipitation_probability: number
  wind_speed: number
  condition: string
  icon: string
  source?: string | null
}

export interface OutfitItem {
  id: string
  name: string
  category: Category
  category_label: string | null
  subcategory: string | null
  color_name: string
  color_hex: string | null
  image_url: string
  available: boolean
  force_include: boolean
  warmth: number
  formality: number
  role: string | null
}

export interface OutfitWarning {
  code: string
  message: string
  severity: 'info' | 'warning' | 'critical'
}

export interface ShoppingSuggestion {
  category: Category | string
  title: string
  reason: string
  priority: 'high' | 'medium' | 'low'
  search_query: string
}

export interface Outfit {
  id: string
  title: string
  rationale: string
  styling_note: string | null
  score: number
  sort_order: number
  items: OutfitItem[]
  missing_categories: string[]
  warnings: OutfitWarning[]
  image_url: string | null
  image_status: 'pending' | 'generating' | 'ready' | 'failed' | 'unavailable'
  image_kind: 'ai_tryon' | 'lookboard' | null
  image_error: string | null
}

export interface Recommendation {
  id: string
  occasion: string
  occasion_type: OccasionType
  weather: Weather
  forced_item_ids: string[]
  status: 'planning' | 'ready' | 'ready_partial' | 'wardrobe_gap' | 'failed'
  ai_source: 'gemini' | 'atelier' | string
  scenario_note: string | null
  warnings: OutfitWarning[]
  shopping_suggestions: ShoppingSuggestion[]
  outfits: Outfit[]
  created_at: string
  is_complete: boolean
}

export interface RecommendationSummary {
  id: string
  occasion: string
  occasion_type: OccasionType
  status: string
  weather: Weather
  cover_image_url: string | null
  look_count: number
  created_at: string
}

export interface CreateRecommendationPayload {
  occasion: string
  occasion_type: OccasionType
  weather: Weather
  forced_item_ids?: string[]
  outfit_count?: number
}

export interface WardrobeItemInput {
  name?: string
  category: Category
  subcategory?: string
  color_name?: string
  color_hex?: string
  pattern?: string
  material?: string
  brand?: string
  formality: number
  warmth: number
  seasons?: Season[]
  style_tags?: string[]
  notes?: string
  available?: boolean
  force_include?: boolean
  favorite?: boolean
}
