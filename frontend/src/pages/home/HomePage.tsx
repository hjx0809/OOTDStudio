import {
  ArrowUpRight,
  Lock,
  MapPin,
  Plus,
  Shirt,
  Sparkles,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/app/AuthProvider'
import { Brand } from '@/components/Brand'
import { WeatherIcon, weatherHeadline } from '@/components/WeatherIcon'
import { useHistory, useWardrobe, useWeather } from '@/lib/queries'
import {
  CATEGORY_META,
  formatDateLabel,
  formatRelative,
  getGreetingName,
  greeting,
  tomorrowISO,
} from '@/lib/utils'
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  SectionHeader,
  Skeleton,
} from 'oul-ui'

export function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const weatherQuery = useWeather(user)
  const wardrobeQuery = useWardrobe()
  const historyQuery = useHistory(Boolean(user))
  const weather = weatherQuery.data

  const items = wardrobeQuery.data ?? []
  const recentItems = items.slice(0, 5)
  const looks = historyQuery.data ?? []
  const firstName = user ? getGreetingName(user.display_name) : ''
  const tomorrow = new Date(`${tomorrowISO()}T12:00:00`)

  if (!user) return null

  return (
    <div className="page home-page">
      <header className="home-top">
        <Brand />
        <button
          type="button"
          className="home-top__avatar"
          onClick={() => navigate('/me')}
          aria-label="Open my profile"
        >
          <Avatar
            src={user.base_photo_thumb_url || user.base_photo_url}
            name={user.display_name}
            size="md"
          />
          <span className="home-top__status" />
        </button>
      </header>

      <section className="home-greeting">
        <div className="home-greeting__date">
          <span>{formatDateLabel()}</span>
          <span className="home-greeting__dot" />
          <span>{user.city || 'Current location'}</span>
        </div>
        <h1>
          {greeting()}, {firstName}
          <span className="home-greeting__accent">.</span>
        </h1>
        <p>Plan tomorrow's look tonight, and walk out easy in the morning.</p>
      </section>

      <section className="weather-panel" aria-label="Tomorrow's weather">
        {weatherQuery.isLoading ? (
          <div className="weather-panel__loading">
            <Skeleton className="weather-panel__skeleton-icon" />
            <div>
              <Skeleton className="weather-panel__skeleton-line" />
              <Skeleton className="weather-panel__skeleton-line weather-panel__skeleton-line--short" />
            </div>
          </div>
        ) : weatherQuery.isError || !weather ? (
          <button
            type="button"
            className="weather-panel__empty"
            onClick={() => navigate('/me/edit')}
          >
            <span className="weather-panel__icon">
              <MapPin size={21} />
            </span>
            <span className="weather-panel__empty-copy">
              <strong>Set your city to see tomorrow's weather</strong>
              <span>Weather shapes fabric, layers, and shoes</span>
            </span>
            <ArrowUpRight size={17} />
          </button>
        ) : (
          <>
            <div className="weather-panel__main">
              <span className="weather-panel__icon">
                <WeatherIcon condition={weather.condition} size={25} />
              </span>
              <div className="weather-panel__temp">
                <span className="o-eyebrow">TOMORROW · {formatDateLabel(tomorrow)}</span>
                <strong>
                  {Math.round(weather.temp_min)}°
                  <span>/ {Math.round(weather.temp_max)}°</span>
                </strong>
                <em>
                  {weatherHeadline(weather)} · {weather.condition}
                </em>
              </div>
            </div>
            <div className="weather-panel__meta">
              <span>
                <MapPin size={12} />
                {weather.city || user.city || 'Current location'}
              </span>
              <span>{weather.precipitation_probability}% rain</span>
              {weather.wind_speed >= 25 && <span>{Math.round(weather.wind_speed)} km/h wind</span>}
            </div>
          </>
        )}
      </section>

      <section className="home-hero">
        <div className="home-hero__art" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="home-hero__content">
          <div className="home-hero__meta">
            <span className="o-eyebrow home-hero__eyebrow">THE TOMORROW EDIT</span>
            <Badge tone="accent">AI STYLING</Badge>
          </div>
          <h2 className="serif">
            Tomorrow,
            <br />
            already <em>considered.</em>
          </h2>
          <p>
            Tell OUL the occasion. It composes three looks from your wardrobe and puts you in the
            try-on.
          </p>
          <div className="home-hero__actions">
            <Button
              variant="accent"
              rightIcon={<ArrowUpRight size={17} />}
              onClick={() => navigate('/style')}
            >
              Start tomorrow's look
            </Button>
            <span className="home-hero__looks">03 LOOKS · SWIPE TO CHOOSE</span>
          </div>
        </div>
        <div className="home-hero__seal">
          <Sparkles size={14} />
          <span>{weather ? `${Math.round(weather.apparent_temp)}°C` : 'OUL'}</span>
        </div>
      </section>

      <section className="home-section">
        <SectionHeader
          eyebrow="YOUR WARDROBE"
          title="Wardrobe at a glance"
          action={
            <Link to="/wardrobe" className="text-link">
              All {items.length > 0 ? items.length : ''}
              <ArrowUpRight size={14} />
            </Link>
          }
        />
        {wardrobeQuery.isLoading ? (
          <div className="wardrobe-rail">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton className="wardrobe-rail__skeleton" key={index} />
            ))}
          </div>
        ) : recentItems.length === 0 ? (
          <EmptyState
            icon={<Shirt size={21} />}
            title="Start with a few favorites"
            description="One top, one bottom, and a pair of shoes is enough for OUL to start styling."
            action={
              <Button
                size="sm"
                leftIcon={<Plus size={15} />}
                onClick={() => navigate('/wardrobe/new')}
              >
                Add your first item
              </Button>
            }
          />
        ) : (
          <div className="wardrobe-rail">
            {recentItems.map((item) => (
              <button
                type="button"
                className="wardrobe-rail__item"
                key={item.id}
                onClick={() => navigate(`/wardrobe/${item.id}`)}
              >
                <span className="wardrobe-rail__image">
                  <img src={item.image_url} alt={item.name} loading="lazy" />
                  {item.force_include && (
                    <span className="wardrobe-rail__lock">
                      <Lock size={10} />
                    </span>
                  )}
                </span>
                <span className="wardrobe-rail__name">{item.name}</span>
                <span className="wardrobe-rail__meta">
                  {CATEGORY_META[item.category].label}
                </span>
              </button>
            ))}
            <button
              type="button"
              className="wardrobe-rail__add"
              onClick={() => navigate('/wardrobe/new')}
            >
              <Plus size={19} />
              <span>Add item</span>
            </button>
          </div>
        )}
      </section>

      <section className="home-section home-section--last">
        <SectionHeader
          eyebrow="RECENT EDITS"
          title="Recent looks"
          action={
            looks.length > 0 ? (
              <Link to="/history" className="text-link">
                All
                <ArrowUpRight size={14} />
              </Link>
            ) : undefined
          }
        />
        {historyQuery.isLoading ? (
          <div className="look-rail">
            <Skeleton className="look-rail__skeleton" />
            <Skeleton className="look-rail__skeleton" />
          </div>
        ) : looks.length === 0 ? (
          <button type="button" className="recent-empty" onClick={() => navigate('/style')}>
            <span className="recent-empty__icon">
              <Sparkles size={18} />
            </span>
            <span>
              <strong>No looks yet</strong>
              <em>Create your first tomorrow edit and see how far your wardrobe can go.</em>
            </span>
            <ArrowUpRight size={17} />
          </button>
        ) : (
          <div className="look-rail">
            {looks.slice(0, 4).map((look) => (
              <button
                type="button"
                className="look-rail__item"
                key={look.id}
                onClick={() => navigate(`/looks/${look.id}`)}
              >
                <span className="look-rail__image">
                  {look.cover_image_url ? (
                    <img src={look.cover_image_url} alt={look.occasion} loading="lazy" />
                  ) : (
                    <span className="look-rail__pending">
                      <Sparkles size={18} />
                    </span>
                  )}
                  <span className="look-rail__shade" />
                  <span className="look-rail__badge">
                    {look.status === 'planning'
                      ? 'Styling'
                      : look.status === 'failed'
                        ? 'Unfinished'
                        : `${look.look_count} looks`}
                  </span>
                </span>
                <span className="look-rail__title">{look.occasion}</span>
                <span className="look-rail__meta">
                  {formatRelative(look.created_at)} · {look.weather.condition}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <footer className="home-footer">
        <span className="serif">Good style is a quiet decision.</span>
        <span>OUL STUDIO · {new Date().getFullYear()}</span>
      </footer>
    </div>
  )
}
