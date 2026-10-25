import { ChevronRight } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/app/AuthProvider'
import { useActiveGeneration } from '@/lib/generation'
import { useRecommendation } from '@/lib/queries'
import { Spinner } from 'oul-ui'

/**
 * Floating progress pill shown on every page while a generation runs, so
 * leaving the looks screen reads as "still working" instead of "cancelled".
 */
export function GenerationIndicator() {
  const active = useActiveGeneration()
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const query = useRecommendation(user ? active?.id : undefined)

  if (!active || !user) return null
  if (location.pathname === `/looks/${active.id}`) return null

  const data = query.data
  if (data?.is_complete) return null

  const planning = !data || data.status === 'planning'
  const total = data?.outfits.length ?? 0
  const ready =
    data?.outfits.filter((outfit) => outfit.image_status === 'ready').length ?? 0
  const label = planning
    ? "Picking tomorrow's look"
    : active.kind === 'render'
      ? 'Refreshing your try-on'
      : 'Creating your try-on'
  const detail = planning
    ? 'Feel free to browse — this keeps running in the background'
    : total > 0
      ? `${ready} of ${total} ready`
      : 'Almost there'

  return (
    <button
      type="button"
      className="generation-indicator"
      onClick={() => navigate(`/looks/${active.id}`)}
      aria-label={`${label}, ${detail}. Tap to view.`}
    >
      <span className="generation-indicator__spinner">
        <Spinner size="sm" />
      </span>
      <span className="generation-indicator__copy">
        <strong>{label}</strong>
        <em>{detail}</em>
      </span>
      <ChevronRight size={16} />
    </button>
  )
}
