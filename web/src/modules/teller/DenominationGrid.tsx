/**
 * Note count grid: one row per note (count × value = subtotal), a coins row in rupees, and a
 * live total. Locators: <id>-n500 … <id>-n10, <id>-coins, <id>-total (data-paise = total).
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
  const input = (key: keyof Denominations, label: string) => (
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
      style={{ width: 96, textAlign: 'end' }}
    />
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
