import { ArrowUpRight, CalendarDays, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { useHistory } from '@/lib/queries'
import { OCCASION_META, formatCompactDate, formatRelative } from '@/lib/utils'
import { Button, EmptyState, Skeleton } from 'oul-ui'

export function HistoryPage() {
  const navigate = useNavigate()
  const historyQuery = useHistory()
  const looks = historyQuery.data ?? []

  return (
    <div className="page history-page">
      <PageHeader title="Look archive" eyebrow="THE EDIT ARCHIVE" backTo="/" />

      <section className="history-heading">
        <p className="o-eyebrow">EVERY TOMORROW, REMEMBERED</p>
        <h1>
          Every tomorrow
          <br />
          <span className="serif">you've worn.</span>
        </h1>
        <p>The archive keeps each occasion, weather, and item list so you can look back.</p>
      </section>

      {historyQuery.isLoading ? (
        <div className="history-list">
          {[0, 1, 2].map((index) => (
            <div className="history-skeleton" key={index}>
              <Skeleton className="history-skeleton__image" />
              <div>
                <Skeleton className="history-skeleton__line" />
                <Skeleton className="history-skeleton__line history-skeleton__line--short" />
              </div>
            </div>
          ))}
        </div>
      ) : looks.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={21} />}
          eyebrow="NO EDITS YET"
          title="Your first look is waiting"
          description="Start with where you're going tomorrow — OUL will find three possibilities in your wardrobe."
          action={
            <Button onClick={() => navigate('/style')} rightIcon={<ArrowUpRight size={15} />}>
              Create your first look
            </Button>
          }
        />
      ) : (
        <div className="history-list">
          {looks.map((look, index) => (
            <button
              type="button"
              className="history-card"
              key={look.id}
              onClick={() => navigate(`/looks/${look.id}`)}
            >
              <span className="history-card__image">
                {look.cover_image_url ? (
                  <img src={look.cover_image_url} alt={look.occasion} loading="lazy" />
                ) : (
                  <span className="history-card__placeholder">
                    <Sparkles size={19} />
                  </span>
                )}
                <span className="history-card__index">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </span>
              <span className="history-card__body">
                <span className="history-card__eyebrow">
                  {OCCASION_META[look.occasion_type]?.label ?? 'Look'} ·{' '}
                  {look.status === 'planning'
                    ? 'Styling'
                    : look.status === 'failed'
                      ? 'Unfinished'
                      : `${look.look_count} looks`}
                </span>
                <strong>{look.occasion}</strong>
                <span className="history-card__meta">
                  <CalendarDays size={12} />
                  {formatCompactDate(look.created_at)} · {formatRelative(look.created_at)}
                </span>
                <span className="history-card__weather">
                  {look.weather.icon} {look.weather.condition} ·{' '}
                  {Math.round(look.weather.temp_min)}°–{Math.round(look.weather.temp_max)}°
                </span>
              </span>
              <span className="history-card__arrow">
                <ArrowUpRight size={16} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
