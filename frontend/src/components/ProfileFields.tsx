import type { FitPreference } from '@/lib/types'
import { Chip } from 'oul-ui'

export const FIT_OPTIONS: Array<{ value: FitPreference; label: string }> = [
  { value: 'tailored', label: 'Tailored' },
  { value: 'regular', label: 'Regular' },
  { value: 'relaxed', label: 'Relaxed' },
]

export function ChipPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly string[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="field-block">
      <span className="o-field__label">
        {label}
        <span className="o-field__optional">Optional</span>
      </span>
      <div className="chip-wrap">
        {options.map((option) => (
          <Chip
            key={option}
            selected={value === option}
            onClick={() => onChange(value === option ? '' : option)}
          >
            {option}
          </Chip>
        ))}
      </div>
    </div>
  )
}
