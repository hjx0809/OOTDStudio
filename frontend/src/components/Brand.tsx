import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export function Brand({
  to = '/',
  light = false,
  compact = false,
  className,
}: {
  to?: string
  light?: boolean
  compact?: boolean
  className?: string
}) {
  return (
    <Link
      to={to}
      className={cn('brand', light && 'brand--light', compact && 'brand--compact', className)}
      aria-label="OUL Studio home"
    >
      <span className="brand__word">OUL</span>
      <span className="brand__dot" aria-hidden="true" />
      {!compact && <span className="brand__descriptor">STUDIO</span>}
    </Link>
  )
}
