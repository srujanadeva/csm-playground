// Star ratings in three forms: radio stars (1–5, real radio inputs), a half-star slider
// (0.5–5 in halves, a range input), and a read-only display (role="img" with the score in its name).
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import './selection.css'

/** Five stars filled to `value` (halves allowed), purely visual. */
function Stars({ value }: { value: number }) {
  return (
    <span className="stars" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`star ${value >= n ? 'full' : value >= n - 0.5 ? 'half' : ''}`}>
          ★
        </span>
      ))}
    </span>
  )
}

/** Read-only rating, e.g. "4.5 out of 5". */
export function StarDisplay({ value, className }: { value: number; className?: string }) {
  const { t } = useTranslation('ui')
  return (
    <span
      className={`rating-ro ${className ?? ''}`}
      role="img"
      aria-label={t('stars.outOf', { value })}
      data-rating={value}
    >
      <Stars value={value} />
    </span>
  )
}

interface RadioProps {
  value: number
  onChange: (n: number) => void
  /** Radio group name: the only stable hook on these inputs. */
  name: string
  label: string
}

/** 1–5 radio stars. Hovering previews via CSS; arrow keys work as with any radio group. */
export function StarRadio({ value, onChange, name, label }: RadioProps) {
  const { t } = useTranslation('ui')
  return (
    <fieldset className="rating-radio">
      <legend className="sr-only">{label}</legend>
      {/* Rendered 5→1 with row-reverse so the CSS sibling selector can light up lower stars on hover. */}
      {[5, 4, 3, 2, 1].map((n) => (
        <label key={n} className={value >= n ? 'on' : undefined}>
          <input
            type="radio"
            name={name}
            value={n}
            checked={value === n}
            onChange={() => onChange(n)}
            className="sr-only"
          />
          <span aria-hidden>★</span>
          <span className="sr-only">{t('stars.n', { count: n })}</span>
        </label>
      ))}
    </fieldset>
  )
}

interface HalfProps {
  value: number
  onChange: (n: number) => void
  label: string
}

/** 0.5–5 slider in half steps, with stars drawn under it. */
export function StarSlider({ value, onChange, label }: HalfProps) {
  const { t } = useTranslation('ui')
  const id = useId()
  return (
    <div className="rating-half">
      <Stars value={value} />
      <input
        id={id}
        type="range"
        min={0.5}
        max={5}
        step={0.5}
        value={value}
        aria-label={label}
        aria-valuetext={t('stars.outOf', { value })}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output htmlFor={id} className="mono">
        {value.toFixed(1)}
      </output>
    </div>
  )
}
