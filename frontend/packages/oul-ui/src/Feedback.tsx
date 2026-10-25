import type { ReactNode } from 'react'
import { cn } from './utils'

export function Spinner({ size = 'md', label }: { size?: 'sm' | 'md' | 'lg'; label?: string }) {
  return (
    <span className={cn('o-spinner', `o-spinner--${size}`)} role="status">
      <span className="o-sr-only">{label ?? 'Loading'}</span>
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('o-skeleton', className)} aria-hidden="true" />
}

interface EmptyStateProps {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
  className?: string
}

export function EmptyState({
  eyebrow,
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('o-empty', className)}>
      {icon && <div className="o-empty__icon">{icon}</div>}
      {eyebrow && <p className="o-eyebrow">{eyebrow}</p>}
      <h3 className="o-empty__title">{title}</h3>
      {description && <p className="o-empty__description">{description}</p>}
      {action && <div className="o-empty__action">{action}</div>}
    </div>
  )
}

interface AvatarProps {
  src?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const initials = name.trim().slice(0, 1).toUpperCase() || 'O'
  return (
    <span className={cn('o-avatar', `o-avatar--${size}`, className)}>
      {src ? (
        <img src={src} alt={`Photo of ${name}`} loading="lazy" />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  )
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'dark' | 'accent' | 'warn' | 'success'
  className?: string
}) {
  return <span className={cn('o-badge', `o-badge--${tone}`, className)}>{children}</span>
}

export function InlineNotice({
  tone = 'info',
  title,
  children,
  icon,
  className,
}: {
  tone?: 'info' | 'warning' | 'critical' | 'success'
  title?: string
  children: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('o-notice', `o-notice--${tone}`, className)} role={tone === 'critical' ? 'alert' : undefined}>
      {icon && <span className="o-notice__icon">{icon}</span>}
      <div className="o-notice__content">
        {title && <p className="o-notice__title">{title}</p>}
        <div className="o-notice__body">{children}</div>
      </div>
    </div>
  )
}

export function SectionHeader({
  eyebrow,
  title,
  action,
  className,
}: {
  eyebrow?: string
  title: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('o-section-header', className)}>
      <div>
        {eyebrow && <p className="o-eyebrow">{eyebrow}</p>}
        <h2 className="o-section-header__title">{title}</h2>
      </div>
      {action && <div className="o-section-header__action">{action}</div>}
    </div>
  )
}
