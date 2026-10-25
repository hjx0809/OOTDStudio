import { ChevronRight, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/app/AuthProvider'
import { useHistory } from '@/lib/queries'
import type { RecommendationSummary } from '@/lib/types'
import { OCCASION_META, formatLookDate, pluralLooks } from '@/lib/utils'
import { Skeleton, Spinner } from 'oul-ui'

function historyStatus(look: RecommendationSummary): string {
  if (look.status === 'planning') return 'Styling…'
  if (look.status === 'failed') return 'Didn’t finish'
  if (look.status === 'wardrobe_gap' || look.look_count === 0) return 'Needs more pieces'
  return pluralLooks(look.look_count)
}

export function HistoryPage() {
  const { user } = useAuth()
  const historyQuery = useHistory(Boolean(user))
  const looks = historyQuery.data ?? []

  return (
    <div className="page page--tab">
      <header className="tab-head">
        <h1 className="tab-head__title">Look history</h1>
      </header>

      <section className="history">
        <div className="history__head">
          <h2 className="eyebrow">Your looks</h2>
          {looks.length > 0 && <span>{looks.length} saved</span>}
        </div>
        {historyQuery.isLoading ? (
          <div className="history__list">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="history-row history-row--skeleton" />
            ))}
          </div>
        ) : looks.length === 0 ? (
          <p className="muted">Looks you generate are saved here.</p>
        ) : (
          <div className="history__list">
            {looks.map((look) => (
              <Link
                key={look.id}
                to={`/looks/${look.id}`}
                state={{ from: '/history' }}
                className="history-row"
              >
                <span className="history-row__thumb">
                  {look.cover_image_url ? (
                    <img src={look.cover_image_url} alt="" loading="lazy" />
                  ) : look.status === 'planning' ? (
                    <Spinner size="sm" />
                  ) : (
                    <Sparkles size={20} strokeWidth={1.6} />
                  )}
                </span>
                <span className="history-row__copy">
                  <strong>{look.occasion}</strong>
                  <span>
                    {OCCASION_META[look.occasion_type]?.label ?? 'Look'} · {historyStatus(look)} ·{' '}
                    {formatLookDate(look.created_at)}
                  </span>
                </span>
                <ChevronRight size={18} className="history-row__chevron" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
