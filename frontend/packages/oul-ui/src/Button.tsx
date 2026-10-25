import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './utils'

type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  full?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  full = false,
  leftIcon,
  rightIcon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'o-button',
        `o-button--${variant}`,
        `o-button--${size}`,
        full && 'o-button--full',
        loading && 'is-loading',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className="o-spinner o-spinner--button" aria-hidden="true" />
      ) : (
        leftIcon && <span className="o-button__icon">{leftIcon}</span>
      )}
      <span className="o-button__label">{children}</span>
      {!loading && rightIcon && <span className="o-button__icon">{rightIcon}</span>}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  variant?: 'plain' | 'surface' | 'dark'
  size?: 'sm' | 'md'
}

export function IconButton({
  label,
  variant = 'plain',
  size = 'md',
  className,
  children,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'o-icon-button',
        `o-icon-button--${variant}`,
        `o-icon-button--${size}`,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
