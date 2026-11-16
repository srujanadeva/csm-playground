// A − / + number stepper. Typed text is applied on Enter or blur, then rounded to the step and
// clamped; anything that isn't a number reverts. ↑/↓ step by one.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { InputAttrs } from './types.ts'
import './inputs.css'

interface Props {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
  /** Accessible name of the number field (also used in the button labels). */
  label: string
  disabled?: boolean
  inputProps?: InputAttrs
  className?: string
}

/** Number field with decrement and increment buttons (class `stepper-dec` / `stepper-inc`). */
export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  label,
  disabled,
  inputProps,
  className,
}: Props) {
  const { t } = useTranslation('ui')
  // What is typed is kept apart from the applied value, so a half-typed entry isn't clamped mid-edit.
  const [draft, setDraft] = useState<string | null>(null)
  const apply = (n: number) => {
    setDraft(null)
    if (!Number.isFinite(n)) return
    onChange(Math.min(max, Math.max(min, Math.round(n / step) * step)))
  }
  const commit = () => draft !== null && apply(draft.trim() === '' ? NaN : Number(draft))
  return (
    <div className={`stepper ${className ?? ''}`} data-value={value}>
      <button
        type="button"
        className="stepper-dec"
        aria-label={t('stepper.dec', { label })}
        disabled={disabled || value <= min}
        onClick={() => apply(value - step)}
      >
        −
      </button>
      <input
        {...inputProps}
        type="text"
        inputMode="numeric"
        className="in num"
        aria-label={label}
        disabled={disabled}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            apply(value + (e.key === 'ArrowUp' ? step : -step))
          }
        }}
      />
      <button
        type="button"
        className="stepper-inc"
        aria-label={t('stepper.inc', { label })}
        disabled={disabled || value >= max}
        onClick={() => apply(value + step)}
      >
        +
      </button>
    </div>
  )
}
