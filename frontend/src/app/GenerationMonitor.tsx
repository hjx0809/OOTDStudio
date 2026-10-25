import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/AuthProvider'
import { useToast } from '@/app/ToastProvider'
import { ApiError } from '@/lib/api'
import { clearGeneration, useActiveGeneration } from '@/lib/generation'
import { queryKeys, useRecommendation } from '@/lib/queries'

/**
 * Keeps a generation's status polled from anywhere in the app.
 *
 * The server renders in the background, so leaving the looks page must not
 * stop updates or hide the result. This component owns that polling and tells
 * the user when the work finishes, wherever they are.
 */
export function GenerationMonitor() {
  const active = useActiveGeneration()
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const location = useLocation()
  const handled = useRef<string | null>(null)
  const query = useRecommendation(user ? active?.id : undefined)
  const data = query.data
  const error = query.error

  useEffect(() => {
    if (!active) {
      handled.current = null
      return
    }
    if (error) {
      if (error instanceof ApiError && error.status === 404) {
        clearGeneration(active.id)
      }
      return
    }
    if (!data || data.id !== active.id || !data.is_complete) return
    if (handled.current === active.id) return
    handled.current = active.id

    const onLooksPage = location.pathname === `/looks/${active.id}`
    const ready = data.outfits.filter((outfit) => outfit.image_status === 'ready').length
    if (!onLooksPage) {
      if (data.status === 'failed') {
        toast.error('That look didn’t come together', 'Head back to your looks and give it another go.')
      } else if (data.status === 'wardrobe_gap' || data.outfits.length === 0) {
        toast.toast({
          title: 'Your wardrobe needs a few more pieces',
          description: 'See what’s missing — a fuller wardrobe makes for fuller looks.',
        })
      } else if (active.kind === 'render') {
        toast.success('Your try-on is ready', 'Head back to see the new look.')
      } else {
        toast.success(
          'Tomorrow’s looks are ready',
          `${data.outfits.length} ${data.outfits.length === 1 ? 'look' : 'looks'}${ready ? `, ${ready} ${ready === 1 ? 'try-on' : 'try-ons'}` : ''}.`,
        )
      }
    }

    queryClient.invalidateQueries({ queryKey: queryKeys.history })
    clearGeneration(active.id)
  }, [active, data, error, location.pathname, toast, queryClient])

  return null
}
