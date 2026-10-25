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
          aria-label="打开我的主页"
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
          <span>{user.city || '当前位置'}</span>
        </div>
        <h1>
          {greeting()}，{firstName}
          <span className="home-greeting__accent">.</span>
        </h1>
        <p>今晚想好明天的造型，早上就能从容出门。</p>
      </section>

      <section className="weather-panel" aria-label="明天天气">
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
              <strong>设定城市，查看明日天气</strong>
              <span>天气会影响面料、层次和鞋履选择</span>
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
                {weather.city || user.city || '当前位置'}
              </span>
              <span>{weather.precipitation_probability}% 降水</span>
              {weather.wind_speed >= 25 && <span>{Math.round(weather.wind_speed)} km/h 风</span>}
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
            说说明天的场景，OUL 会从你的衣橱里组合 3 套造型，
            并把你本人放进试穿画面。
          </p>
          <div className="home-hero__actions">
            <Button
              variant="accent"
              rightIcon={<ArrowUpRight size={17} />}
              onClick={() => navigate('/style')}
            >
              开始明天的造型
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
          title="衣橱速览"
          action={
            <Link to="/wardrobe" className="text-link">
              全部 {items.length > 0 ? items.length : ''}
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
            title="先放进几件常穿的衣服"
            description="至少一件上装、一件下装和一双鞋，OUL 就能开始为你组合造型。"
            action={
              <Button
                size="sm"
                leftIcon={<Plus size={15} />}
                onClick={() => navigate('/wardrobe/new')}
              >
                添加第一件单品
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
              <span>添加单品</span>
            </button>
          </div>
        )}
      </section>

      <section className="home-section home-section--last">
        <SectionHeader
          eyebrow="RECENT EDITS"
          title="最近的造型"
          action={
            looks.length > 0 ? (
              <Link to="/history" className="text-link">
                全部
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
              <strong>还没有造型记录</strong>
              <em>生成第一组「明日编辑」，看看衣橱能走多远。</em>
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
                      ? '生成中'
                      : look.status === 'failed'
                        ? '未完成'
                        : `${look.look_count} 套`}
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
