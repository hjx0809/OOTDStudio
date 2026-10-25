import { Columns2, History, Sparkles, UserRound } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

const items = [
  { to: '/', label: 'For you', icon: Sparkles, end: true },
  { to: '/wardrobe', label: 'Closet', icon: Columns2 },
  { to: '/history', label: 'History', icon: History },
  { to: '/me', label: 'Profile', icon: UserRound },
]

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <div className="bottom-nav__inner">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => cn('bottom-nav__item', isActive && 'is-active')}
          >
            {({ isActive }) => (
              <>
                <Icon size={22} strokeWidth={isActive ? 2 : 1.6} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
