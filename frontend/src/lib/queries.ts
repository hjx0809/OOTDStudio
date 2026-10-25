import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { User } from '@/lib/types'

export const queryKeys = {
  wardrobe: ['wardrobe'] as const,
  wardrobeSummary: ['wardrobe', 'summary'] as const,
  weather: (user: User | null) =>
    ['weather', user?.id, user?.latitude, user?.longitude, user?.city] as const,
  recommendation: (id: string) => ['recommendation', id] as const,
  history: ['recommendations', 'history'] as const,
}

export function useWardrobe() {
  return useQuery({
    queryKey: queryKeys.wardrobe,
    queryFn: () => api.wardrobe.list(),
    staleTime: 20_000,
  })
}

export function useWardrobeSummary() {
  return useQuery({
    queryKey: queryKeys.wardrobeSummary,
    queryFn: () => api.wardrobe.summary(),
    staleTime: 20_000,
  })
}

export function useWeather(user: User | null) {
  return useQuery({
    queryKey: queryKeys.weather(user),
    enabled: Boolean(user && (user.city || (user.latitude !== null && user.longitude !== null))),
    staleTime: 15 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      if (!user) throw new ApiError('You’re not signed in', 401)
      if (user.latitude !== null && user.longitude !== null) {
        return api.weather.tomorrow(user.latitude, user.longitude, user.city)
      }
      if (!user.city) throw new ApiError('No city set yet', 400)
      const matches = await api.weather.geocode(user.city)
      if (!matches.length) {
        throw new ApiError(`Couldn’t find “${user.city}” — double-check the city name`, 404)
      }
      const match = matches[0]
      return api.weather.tomorrow(match.latitude, match.longitude, user.city)
    },
  })
}

export function useHistory(enabled = true) {
  return useQuery({
    queryKey: queryKeys.history,
    queryFn: () => api.recommendations.list(16),
    enabled,
    staleTime: 10_000,
  })
}

export function useRecommendation(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.recommendation(id ?? ''),
    queryFn: () => api.recommendations.get(id as string),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return 1500
      return data.is_complete ? false : 2200
    },
    // Generation keeps running on the server when the tab is hidden or the
    // user moves to another page, so keep polling in the background too.
    refetchIntervalInBackground: true,
    staleTime: 0,
  })
}
