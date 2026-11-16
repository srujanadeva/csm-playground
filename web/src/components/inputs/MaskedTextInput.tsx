// Inputs that reformat while typing: Indian mobile (98450 12345), card (by brand, Luhn-checked)
// and rupee amount (₹1,23,456.00, filled from the right). The value is raw digits, also in data-raw.
import {
  cardBrand,
  cardLength,
  digitsOnly,
  formatAmountFromPaise,
  formatCard,
  formatIndianMobile,
  luhnValid,
} from '@csm/shared'
import type { InputAttrs } from './types.ts'
import './inputs.css'

export type MaskKind = 'mobile' | 'card' | 'amount'

interface Props {
  kind: MaskKind
  /** Raw digits (paise for amounts). */
  value: string
  onChange: (digits: string) => void
  invalid?: boolean
  inputProps?: InputAttrs
}

const MAX_DIGITS: Record<MaskKind, number> = { mobile: 10, card: 16, amount: 11 } // amount: up to ₹99,99,99,999.99

/** Card digits are valid once complete and Luhn-correct; '' while incomplete. */
export function cardState(digits: string): '' | 'valid' | 'invalid' {
  if (digits.length < cardLength(cardBrand(digits))) return ''
  return luhnValid(digits) ? 'valid' : 'invalid'
}

/** A text input showing `value` through the chosen mask. */
export function MaskedTextInput({ kind, value, onChange, invalid, inputProps }: Props) {
  const shown =
    kind === 'mobile'
      ? formatIndianMobile(value)
      : kind === 'card'
        ? formatCard(value)
        : formatAmountFromPaise(value)
  const brand = kind === 'card' ? cardBrand(value) : undefined
  const max = kind === 'card' ? cardLength(cardBrand(value)) : MAX_DIGITS[kind]
  return (
    <input
      {...inputProps}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={`in mask-${kind} ${inputProps?.className ?? ''}`}
      dir="ltr"
      value={shown}
      data-raw={value}
      data-brand={brand || undefined}
      data-valid={kind === 'card' ? cardState(value) || undefined : undefined}
      aria-invalid={invalid || (kind === 'card' && cardState(value) === 'invalid') || undefined}
      onChange={(e) => {
        let d = digitsOnly(e.target.value)
        if (kind === 'amount') d = d.replace(/^0+/, '')
        onChange(d.slice(0, kind === 'card' ? cardLength(cardBrand(d)) : max))
      }}
    />
  )
}
