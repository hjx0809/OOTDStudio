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
      <PageHeader title="造型档案" eyebrow="THE EDIT ARCHIVE" backTo="/" />

      <section className="history-heading">
        <p className="o-eyebrow">EVERY TOMORROW, REMEMBERED</p>
        <h1>
          你穿过的
          <br />
          <span className="serif">每一个明天。</span>
        </h1>
        <p>造型档案保留当时选择的场景、天气与单品，方便你回看。</p>
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
          title="第一组造型还在等你"
          description="从明天要去的地方开始，OUL 会替你从衣橱里找出三种可能。"
          action={
            <Button onClick={() => navigate('/style')} rightIcon={<ArrowUpRight size={15} />}>
              开始第一次造型
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
                  {OCCASION_META[look.occasion_type]?.label ?? '造型'} ·{' '}
                  {look.status === 'planning'
                    ? '正在挑选'
                    : look.status === 'failed'
                      ? '未完成'
                      : `${look.look_count} 套`}
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
