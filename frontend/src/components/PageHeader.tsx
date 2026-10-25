import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { IconButton } from 'oul-ui'

interface PageHeaderProps {
  title?: string
  backTo?: string
  onBack?: () => void
  action?: ReactNode
  className?: string
}

/** Sub-page header: back · centered title · optional action. */
export function PageHeader({ title, backTo, onBack, action, className }: PageHeaderProps) {
  const navigate = useNavigate()
  return (
    <header className={cn('page-header', className)}>
      <IconButton
        label="Back"
        onClick={() => {
          if (onBack) onBack()
          else if (backTo) navigate(backTo)
          else navigate(-1)
        }}
      >
        <ArrowLeft size={20} />
      </IconButton>
      {title && <h1 className="page-header__title">{title}</h1>}
      <div className="page-header__action">{action}</div>
    </header>
  )
}

