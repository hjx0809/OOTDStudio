import { Home, Shirt, Sparkles, UserRound } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

const items = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/wardrobe', label: 'Wardrobe', icon: Shirt },
  { to: '/style', label: 'Style', icon: Sparkles, featured: true },
  { to: '/me', label: 'Me', icon: UserRound },
]

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <div className="bottom-nav__inner">
        {items.map(({ to, label, icon: Icon, end, featured }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn('bottom-nav__item', isActive && 'is-active', featured && 'is-featured')
            }
          >
            {({ isActive }) => (
              <>
                <span className="bottom-nav__icon-wrap">
                  <Icon size={featured ? 21 : 20} strokeWidth={isActive ? 2.2 : 1.8} />
                </span>
                <span className="bottom-nav__label">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
