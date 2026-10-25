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
    ? 'Styling your looks'
    : active.kind === 'render'
      ? 'Refreshing try-on'
      : 'Creating try-on'
  const detail = planning ? null : total > 0 ? `${ready}/${total}` : null

  return (
    <button
      type="button"
      className="generation-indicator"
      onClick={() => navigate(`/looks/${active.id}`)}
      aria-label={`${label}${detail ? `, ${detail} ready` : ''}. Tap to view.`}
    >
      <Spinner size="sm" />
      <span>{label}</span>
      {detail && <em>{detail}</em>}
      <ChevronRight size={16} />
    </button>
  )
}
