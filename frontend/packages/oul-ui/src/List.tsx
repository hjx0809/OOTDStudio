import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './utils'

interface ListRowProps {
  title: string
  description?: string
  icon?: ReactNode
  trailing?: ReactNode
  tone?: 'default' | 'danger'
  onClick?: () => void
  className?: string
}

export function ListRow({
  title,
  description,
  icon,
  trailing,
  tone = 'default',
  onClick,
  className,
}: ListRowProps) {
  return (
    <button
      type="button"
      className={cn('o-list-row', tone === 'danger' && 'o-list-row--danger', className)}
      onClick={onClick}
    >
      {icon && <span className="o-list-row__icon">{icon}</span>}
      <span className="o-list-row__copy">
        <span className="o-list-row__title">{title}</span>
        {description && <span className="o-list-row__description">{description}</span>}
      </span>
      <span className="o-list-row__trailing">{trailing ?? <ChevronRight size={18} />}</span>
    </button>
  )
}

export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('o-list', className)}>{children}</div>
}
