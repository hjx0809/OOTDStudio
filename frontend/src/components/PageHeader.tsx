import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { IconButton } from 'oul-ui'

interface PageHeaderProps {
  title?: string
  eyebrow?: string
  backTo?: string
  onBack?: () => void
  action?: ReactNode
  center?: boolean
  className?: string
  transparent?: boolean
}

export function PageHeader({
  title,
  eyebrow,
  backTo,
  onBack,
  action,
  center = false,
  className,
  transparent = false,
}: PageHeaderProps) {
  const navigate = useNavigate()
  return (
    <header
      className={cn(
        'page-header',
        center && 'page-header--center',
        transparent && 'page-header--transparent',
        className,
      )}
    >
      <div className="page-header__side">
        <IconButton
          label="Back"
          variant={transparent ? 'dark' : 'surface'}
          onClick={() => {
            if (onBack) onBack()
            else if (backTo) navigate(backTo)
            else navigate(-1)
          }}
        >
          <ArrowLeft size={19} />
        </IconButton>
      </div>
      <div className="page-header__titles">
        {eyebrow && <span className="page-header__eyebrow">{eyebrow}</span>}
        {title && <h1 className="page-header__title">{title}</h1>}
      </div>
      <div className="page-header__side page-header__side--end">{action}</div>
    </header>
  )
}
