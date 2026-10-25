import type {
  AuthResponse,
  Category,
  CreateRecommendationPayload,
  GarmentAnalysis,
  Recommendation,
  RecommendationSummary,
  User,
  WardrobeItem,
  WardrobeItemInput,
  WardrobeSummary,
  Weather,
} from './types'
import { tokenStore, UNAUTHORIZED_EVENT } from './token'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''
const API = `${API_BASE}/api`

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface RequestOptions extends RequestInit {
  timeoutMs?: number
  skipAuthEvent?: boolean
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { timeoutMs = 30_000, skipAuthEvent = false, headers, ...rest } = options
  const token = tokenStore.get()
  const finalHeaders = new Headers(headers)
  if (token) finalHeaders.set('Authorization', `Bearer ${token}`)
  if (rest.body && !(rest.body instanceof FormData) && !finalHeaders.has('Content-Type')) {
    finalHeaders.set('Content-Type', 'application/json')
  }
  finalHeaders.set('Accept', 'application/json')

  let response: Response
  try {
    response = await fetch(`${API}${path}`, {
      ...rest,
      headers: finalHeaders,
      signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiError('The request timed out. Check your connection and try again.', 0)
    }
    throw new ApiError('Couldn’t reach the server. Check your connection.', 0)
  }

  if (response.status === 204) return undefined as T

  const contentType = response.headers.get('content-type') ?? ''
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '')

  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? String((body as { detail: unknown }).detail)
        : typeof body === 'string' && body
          ? body
          : 'That request didn’t go through. Please try again.'
    if (response.status === 401 && !skipAuthEvent && token) {
      tokenStore.clear()
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT))
    }
    throw new ApiError(detail, response.status)
  }

  return body as T
}

function listParam(values: string[] | undefined): string {
  return (values ?? []).join(',')
}

export const api = {
  auth: {
    register(payload: {
      email: string
      password: string
      display_name: string
      accept_terms: boolean
    }) {
      return request<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
        skipAuthEvent: true,
      })
    },
    login(payload: { email: string; password: string }) {
      return request<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
        skipAuthEvent: true,
      })
    },
    me() {
      return request<AuthResponse>('/auth/me', { skipAuthEvent: true })
    },
  },

  users: {
    me() {
      return request<User>('/users/me')
    },
    update(payload: Partial<User>) {
      const allowed = [
        'display_name',
        'height_cm',
        'weight_kg',
        'chest_cm',
        'waist_cm',
        'hip_cm',
        'inseam_cm',
        'shoe_size',
        'body_shape',
        'skin_tone',
        'fit_preference',
        'style_preferences',
        'avoid_colors',
        'city',
        'latitude',
        'longitude',
      ]
      const clean: Record<string, unknown> = {}
      for (const key of allowed) {
        if (key in payload) clean[key] = payload[key as keyof User]
      }
      return request<User>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(clean),
      })
    },
    uploadBasePhoto(file: Blob, filename = 'base-photo.jpg') {
      const form = new FormData()
      form.append('photo', file, filename)
      return request<User>('/users/me/base-photo', {
        method: 'POST',
        body: form,
        timeoutMs: 60_000,
      })
    },
    completeOnboarding() {
      return request<User>('/users/me/complete-onboarding', { method: 'POST' })
    },
    changePassword(current_password: string, new_password: string) {
      return request<{ message: string }>('/users/me/password', {
        method: 'POST',
        body: JSON.stringify({ current_password, new_password }),
      })
    },
    deleteAccount(password: string) {
      return request<void>('/users/me', {
        method: 'DELETE',
        body: JSON.stringify({ password }),
      })
    },
  },

  wardrobe: {
    list(params?: { category?: Category; available?: boolean }) {
      const query = new URLSearchParams()
      if (params?.category) query.set('category', params.category)
      if (params?.available !== undefined) query.set('available', String(params.available))
      return request<WardrobeItem[]>(`/wardrobe${query.size ? `?${query}` : ''}`)
    },
    summary() {
      return request<WardrobeSummary>('/wardrobe/summary')
    },
    get(id: string) {
      return request<WardrobeItem>(`/wardrobe/${id}`)
    },
    create(input: WardrobeItemInput, image: Blob, filename = 'garment.jpg') {
      const form = new FormData()
      form.append('image', image, filename)
      form.append('category', input.category)
      if (input.name) form.append('name', input.name)
      if (input.subcategory) form.append('subcategory', input.subcategory)
      if (input.color_name) form.append('color_name', input.color_name)
      if (input.color_hex) form.append('color_hex', input.color_hex)
      if (input.pattern) form.append('pattern', input.pattern)
      if (input.material) form.append('material', input.material)
      if (input.brand) form.append('brand', input.brand)
      form.append('formality', String(input.formality))
      form.append('warmth', String(input.warmth))
      if (input.seasons?.length) form.append('seasons', listParam(input.seasons))
      if (input.style_tags?.length) form.append('style_tags', listParam(input.style_tags))
      if (input.notes) form.append('notes', input.notes)
      form.append('available', String(input.available ?? true))
      form.append('force_include', String(input.force_include ?? false))
      form.append('favorite', String(input.favorite ?? false))
      return request<WardrobeItem>('/wardrobe', {
        method: 'POST',
        body: form,
        timeoutMs: 90_000,
      })
    },
    analyze(image: Blob, filename = 'garment.jpg') {
      const form = new FormData()
      form.append('image', image, filename)
      return request<GarmentAnalysis>('/wardrobe/analyze', {
        method: 'POST',
        body: form,
        timeoutMs: 90_000,
      })
    },
    update(id: string, payload: Partial<WardrobeItemInput>) {
      return request<WardrobeItem>(`/wardrobe/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
    },
    replaceImage(id: string, image: Blob, filename = 'garment.jpg') {
      const form = new FormData()
      form.append('image', image, filename)
      return request<WardrobeItem>(`/wardrobe/${id}/image`, {
        method: 'POST',
        body: form,
        timeoutMs: 60_000,
      })
    },
    setAvailability(id: string, available: boolean) {
      return request<WardrobeItem>(`/wardrobe/${id}/availability`, {
        method: 'PATCH',
        body: JSON.stringify({ available }),
      })
    },
    setForce(id: string, force_include: boolean) {
      return request<WardrobeItem>(`/wardrobe/${id}/force`, {
        method: 'PATCH',
        body: JSON.stringify({ force_include }),
      })
    },
    setFavorite(id: string, favorite: boolean) {
      return request<WardrobeItem>(`/wardrobe/${id}/favorite`, {
        method: 'PATCH',
        body: JSON.stringify({ favorite }),
      })
    },
    remove(id: string) {
      return request<void>(`/wardrobe/${id}`, { method: 'DELETE' })
    },
  },

  weather: {
    tomorrow(latitude: number, longitude: number, city?: string | null) {
      const query = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
      })
      if (city) query.set('city', city)
      return request<Weather>(`/weather/tomorrow?${query}`, { timeoutMs: 15_000 })
    },
    /** Tomorrow's forecast for the caller's approximate (IP-based) location. */
    auto() {
      return request<Weather>('/weather/auto', { timeoutMs: 20_000 })
    },
    geocode(q: string) {
      return request<
        Array<{
          name: string
          admin1: string | null
          country: string | null
          latitude: number
          longitude: number
          timezone: string | null
        }>
      >(`/weather/geocode?q=${encodeURIComponent(q)}`, { timeoutMs: 15_000 })
    },
  },

  recommendations: {
    create(payload: CreateRecommendationPayload) {
      return request<Recommendation>('/recommendations', {
        method: 'POST',
        body: JSON.stringify(payload),
        timeoutMs: 120_000,
      })
    },
    get(id: string) {
      return request<Recommendation>(`/recommendations/${id}`)
    },
    list(limit = 12) {
      return request<RecommendationSummary[]>(`/recommendations?limit=${limit}`)
    },
    reroll(id: string) {
      return request<Recommendation>(`/recommendations/${id}/reroll`, {
        method: 'POST',
        timeoutMs: 120_000,
      })
    },
    remove(id: string) {
      return request<void>(`/recommendations/${id}`, { method: 'DELETE' })
    },
  },
}

export { API }
