/**
 * Note count grid: one row per note (count × value = subtotal), a coins row in rupees, and a
 * live total. Locators: <id>-n500 … <id>-n10, <id>-coins, <id>-total (data-paise = total).
 * Each row also has − / + buttons (FR-TEL-021, 0–10,000 notes). Their visible text is the same in
 * every row, so a test must scope by the row: //tr[td[1]='₹500']//button[.='+'].
 */
import { useTranslation } from 'react-i18next'
import { NOTES, denominationTotal, type Denominations } from '@csm/shared'
import { formatPaise } from '../../lib/format.ts'

interface Props {
  id: string
  value: Denominations
  onChange: (next: Denominations) => void
  disabled?: boolean
  error?: string
}

const toCount = (raw: string) => {
  const n = Number(raw.replace(/\D/g, ''))
  return Number.isFinite(n) ? Math.min(n, 10_000) : 0
}

export function DenominationGrid({ id, value, onChange, disabled, error }: Props) {
  const { t, i18n } = useTranslation('teller')
  const lang = i18n.language
  const total = denominationTotal(value)
  // Coins are a rupee total capped at ₹9,999; notes go up to 10,000 each.
  const cap = (key: keyof Denominations) => (key === 'coins' ? 9_999 : 10_000)
  const step = (key: keyof Denominations, by: number) =>
    onChange({ ...value, [key]: Math.min(cap(key), Math.max(0, (value[key] ?? 0) + by)) })
  const input = (key: keyof Denominations, label: string) => (
    <span className="denom-step">
      <button
        type="button"
        className="stepper-dec"
        aria-label={t('ui:stepper.dec', { label })}
        disabled={disabled || !value[key]}
        onClick={() => step(key, -1)}
      >
        −
      </button>
      <input
        id={`${id}-${key}`}
        data-testid={`${id}-${key}`}
        className="in num"
        inputMode="numeric"
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        disabled={disabled}
        value={value[key] ? String(value[key]) : ''}
        placeholder="0"
        onChange={(e) => onChange({ ...value, [key]: toCount(e.target.value) })}
        style={{ width: 80, textAlign: 'end' }}
      />
      <button
        type="button"
        className="stepper-inc"
        aria-label={t('ui:stepper.inc', { label })}
        disabled={disabled || value[key] >= cap(key)}
        onClick={() => step(key, 1)}
      >
        +
      </button>
    </span>
  )
  return (
    <div className="tw" data-testid={id}>
      <table className="denoms">
        <thead>
          <tr>
            <th>{t('notes.note')}</th>
            <th style={{ textAlign: 'end' }}>{t('notes.count')}</th>
            <th style={{ textAlign: 'end' }}>{t('notes.value')}</th>
          </tr>
        </thead>
        <tbody>
          {NOTES.map((n) => (
            <tr key={n}>
              <td className="mono">₹{n}</td>
              <td style={{ textAlign: 'end' }}>{input(`n${n}`, `₹${n} × ${t('notes.count')}`)}</td>
              <td className="mono" style={{ textAlign: 'end' }} data-testid={`${id}-n${n}-value`}>
                {formatPaise(n * 100 * value[`n${n}`], lang)}
              </td>
            </tr>
          ))}
          <tr>
            <td>{t('notes.coins')}</td>
            <td style={{ textAlign: 'end' }}>{input('coins', t('notes.coins'))}</td>
            <td className="mono" style={{ textAlign: 'end' }}>
              {formatPaise(value.coins * 100, lang)}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={2}>{t('notes.total')}</th>
            <th className="mono" style={{ textAlign: 'end' }} data-testid={`${id}-total`} data-paise={total}>
              {formatPaise(total, lang)}
            </th>
          </tr>
        </tfoot>
      </table>
      {error ? (
        <span className="errmsg" id={`${id}-error`} data-testid={`${id}-error`} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}
