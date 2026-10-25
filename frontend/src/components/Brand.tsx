import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export function Brand({ to = '/', className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={cn('brand', className)} aria-label="OOTD Studio home">
      OOTD<span className="brand__dot" aria-hidden="true" />
    </Link>
  )
}
