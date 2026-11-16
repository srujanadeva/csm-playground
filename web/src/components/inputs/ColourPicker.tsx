// Colour chosen three ways: the native colour input, preset swatches, or a typed hex code
// ("#" optional, 3 or 6 digits). Values are always lower-case "#rrggbb".
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { normaliseHex } from '@csm/shared'
import type { InputAttrs } from './types.ts'
import './inputs.css'

export interface Swatch {
  hex: string
  name: string
}

/** The bank's palette, offered first. */
export const BANK_SWATCHES: Swatch[] = [
  { hex: '#0d7564', name: 'Spruce' },
  { hex: '#b4862c', name: 'Brass' },
  { hex: '#2560a0', name: 'Harbour' },
  { hex: '#b42318', name: 'Vermilion' },
  { hex: '#1e7f45', name: 'Paddy' },
  { hex: '#5b6967', name: 'Slate' },
]

interface Props {
  value: string
  onChange: (hex: string) => void
  label: string
  swatches?: Swatch[]
  /** Attributes for the hex text field. */
  hexProps?: InputAttrs
}

/** Swatches + native picker + hex field with an inline error. */
export function ColourPicker({ value, onChange, label, swatches = BANK_SWATCHES, hexProps }: Props) {
  const { t } = useTranslation('ui')
  const [hex, setHex] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const apply = (v: string) => {
    setHex(null)
    setError(false)
    onChange(v.toLowerCase())
  }
  const applyTyped = () => {
    if (hex === null) return
    const v = normaliseHex(hex)
    if (v) apply(v)
    else setError(true)
  }
  const named = swatches.find((s) => s.hex === value)
  return (
    <div className="colour" data-color={value}>
      <div className="colour-row">
        <input
          type="color"
          className="colour-native"
          aria-label={t('colour.native', { label })}
          value={value}
          onChange={(e) => apply(e.target.value)}
        />
        <div className="swatches" role="group" aria-label={t('colour.swatches')}>
          {swatches.map((s) => (
            <button
              key={s.hex}
              type="button"
              className="swatch"
              title={s.name}
              aria-label={s.name}
              aria-pressed={s.hex === value}
              data-color={s.hex}
              style={{ background: s.hex }}
              onClick={() => apply(s.hex)}
            />
          ))}
        </div>
      </div>
      <div className="colour-row">
        <span className="colour-preview" style={{ background: value }} aria-hidden />
        <input
          {...hexProps}
          type="text"
          className="in mono"
          style={{ width: 120 }}
          dir="ltr"
          aria-label={t('colour.hex', { label })}
          aria-invalid={error || undefined}
          value={hex ?? value}
          onChange={(e) => {
            setHex(e.target.value)
            setError(false)
          }}
          onBlur={applyTyped}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              applyTyped()
            }
          }}
        />
        <span className="help">{named?.name ?? ''}</span>
      </div>
      {error ? (
        <span className="errmsg" role="alert">
          {t('colour.invalid')}
        </span>
      ) : null}
    </div>
  )
}
