// Six single-digit boxes for a one-time code. Typing moves forward, Backspace moves back, and
// pasting a code anywhere fills every box. Box ids get a random suffix per mount (otp-3fa9c1-0),
// so tests must match them with starts-with/contains rather than an exact id.
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './inputs.css'

interface Props {
  value: string
  onChange: (code: string) => void
  /** Called once all boxes are filled. */
  onComplete?: (code: string) => void
  length?: number
  disabled?: boolean
  invalid?: boolean
  /** Group label read by screen readers ("Verification code"). */
  label: string
}

/** The OTP boxes; `value` is the digits entered so far. */
export function OtpInput({ value, onChange, onComplete, length = 6, disabled, invalid, label }: Props) {
  const { t } = useTranslation('ui')
  const [nonce] = useState(() => Math.random().toString(16).slice(2, 8))
  const boxes = useRef<(HTMLInputElement | null)[]>([])
  const focus = (i: number) => boxes.current[Math.max(0, Math.min(length - 1, i))]?.focus()
  const set = (code: string) => {
    const c = code.replace(/\D/g, '').slice(0, length)
    onChange(c)
    if (c.length === length) onComplete?.(c)
    return c
  }
  return (
    <div className={`otp ${invalid ? 'invalid' : ''}`} role="group" aria-label={label}>
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            boxes.current[i] = el
          }}
          id={`otp-${nonce}-${i}`}
          className="otp-box"
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={t('otp.digit', { n: i + 1, total: length })}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          value={value[i] ?? ''}
          onFocus={(e) => e.target.select()}
          onPaste={(e) => {
            e.preventDefault()
            focus(set(e.clipboardData.getData('text')).length)
          }}
          onChange={(e) => {
            const digit = e.target.value.replace(/\D/g, '').slice(-1)
            if (!digit) return
            // Writing into box i keeps earlier digits and drops anything after, like a real code field.
            set(value.slice(0, i) + digit)
            focus(i + 1)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              e.preventDefault()
              const at = value[i] ? i : i - 1
              set(value.slice(0, Math.max(0, at)))
              focus(at)
            } else if (e.key === 'ArrowLeft') focus(i - 1)
            else if (e.key === 'ArrowRight') focus(i + 1)
          }}
        />
      ))}
    </div>
  )
}
