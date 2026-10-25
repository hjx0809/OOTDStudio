import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from './utils'

interface FieldShellProps {
  label?: string
  hint?: string
  error?: string | null
  htmlFor?: string
  optional?: boolean
  action?: ReactNode
  children: ReactNode
  className?: string
}

function FieldShell({
  label,
  hint,
  error,
  htmlFor,
  optional,
  action,
  children,
  className,
}: FieldShellProps) {
  return (
    <div className={cn('o-field', error && 'o-field--error', className)}>
      {(label || action) && (
        <div className="o-field__header">
          {label && (
            <label className="o-field__label" htmlFor={htmlFor}>
              {label}
              {optional && <span className="o-field__optional">Optional</span>}
            </label>
          )}
          {action}
        </div>
      )}
      {children}
      {error ? (
        <p className="o-field__error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="o-field__hint">{hint}</p>
      ) : null}
    </div>
  )
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string | null
  optional?: boolean
  trailing?: ReactNode
  action?: ReactNode
  wrapperClassName?: string
}

export function TextField({
  label,
  hint,
  error,
  optional,
  trailing,
  action,
  wrapperClassName,
  className,
  id,
  ...rest
}: TextFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      htmlFor={fieldId}
      optional={optional}
      action={action}
      className={wrapperClassName}
    >
      <div className={cn('o-input-wrap', Boolean(trailing) && 'has-trailing')}>
        <input
          id={fieldId}
          className={cn('o-input', className)}
          aria-invalid={Boolean(error) || undefined}
          {...rest}
        />
        {trailing && <div className="o-input__trailing">{trailing}</div>}
      </div>
    </FieldShell>
  )
}

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string | null
  optional?: boolean
  action?: ReactNode
  wrapperClassName?: string
}

export function TextAreaField({
  label,
  hint,
  error,
  optional,
  action,
  wrapperClassName,
  className,
  id,
  ...rest
}: TextAreaFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      htmlFor={fieldId}
      optional={optional}
      action={action}
      className={wrapperClassName}
    >
      <textarea
        id={fieldId}
        className={cn('o-input o-textarea', className)}
        aria-invalid={Boolean(error) || undefined}
        {...rest}
      />
    </FieldShell>
  )
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  error?: string | null
  optional?: boolean
  children: ReactNode
  wrapperClassName?: string
}

export function SelectField({
  label,
  hint,
  error,
  optional,
  children,
  wrapperClassName,
  className,
  id,
  ...rest
}: SelectFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      htmlFor={fieldId}
      optional={optional}
      className={wrapperClassName}
    >
      <select id={fieldId} className={cn('o-input o-select', className)} {...rest}>
        {children}
      </select>
    </FieldShell>
  )
}
