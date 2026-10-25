import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from './utils'
import { IconButton } from './Button'

interface ChipProps {
  selected?: boolean
  children: ReactNode
  onClick?: () => void
  className?: string
  disabled?: boolean
  tone?: 'default' | 'accent'
}

export function Chip({ selected, children, onClick, className, disabled, tone = 'default' }: ChipProps) {
  return (
    <button
      type="button"
      className={cn(
        'o-chip',
        selected && 'is-selected',
        tone === 'accent' && 'o-chip--accent',
        className,
      )}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
    >
      {children}
    </button>
  )
}

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
  hideLabel?: boolean
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  hideLabel = false,
}: SwitchProps) {
  return (
    <label className={cn('o-switch-row', disabled && 'is-disabled')}>
      {!hideLabel && (
        <span className="o-switch-row__copy">
          <span className="o-switch-row__label">{label}</span>
          {description && (
            <span className="o-switch-row__description">{description}</span>
          )}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={cn('o-switch', checked && 'is-on')}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
      >
        <span className="o-switch__thumb" />
      </button>
    </label>
  )
}

interface SegmentedOption<T extends string> {
  value: T
  label: string
  sublabel?: string
}

interface SegmentedProps<T extends string> {
  options: Array<SegmentedOption<T>>
  value: T | null
 onChange: (value: T) => void
  ariaLabel: string
  className?: string
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentedProps<T>) {
  return (
    <div className={cn('o-segmented', className)} role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={cn('o-segmented__item', value === option.value && 'is-active')}
          onClick={() => onChange(option.value)}
        >
          <span>{option.label}</span>
          {option.sublabel && (
            <span className="o-segmented__sublabel">{option.sublabel}</span>
          )}
        </button>
      ))}
    </div>
  )
}

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: SheetProps) {
  const panelRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    const frame = window.requestAnimationFrame(() => panelRef.current?.focus())
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      window.cancelAnimationFrame(frame)
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="o-sheet-root" role="presentation">
      <button
        type="button"
        className="o-sheet__backdrop"
        aria-label="关闭"
        onClick={onClose}
      />
      <section
        ref={panelRef}
        className={cn('o-sheet', className)}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? '面板'}
        tabIndex={-1}
      >
        <div className="o-sheet__grabber" aria-hidden="true" />
        <div className="o-sheet__head">
          <div>
            {title && <h2 className="o-sheet__title">{title}</h2>}
            {description && <p className="o-sheet__description">{description}</p>}
          </div>
          <IconButton label="关闭" variant="surface" size="sm" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="o-sheet__body">{children}</div>
        {footer && <div className="o-sheet__footer">{footer}</div>}
      </section>
    </div>,
    document.body,
  )
}
