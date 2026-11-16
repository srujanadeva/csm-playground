/**
 * KYC step: read the customer's ID card (FR-KYC-001). The simulated reader returns fixed results per
 * sample image in testresources/ocr/. Locators are data-qa / data-field / data-confidence (plan §3,
 * DATA): there are no ids or test ids in this panel.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { OcrFieldDTO, OcrFieldKey, OcrResultDTO } from '@csm/shared'
import { ApiError } from '../../../api/client.ts'
import { Icon } from '../../../components/Icon.tsx'
import { LocatorBadge } from '../../../components/LocatorBadge.tsx'
import { readCard } from './api.ts'

/** Fields that fill this step's form; the rest belong to earlier steps and are compared instead. */
export const OCR_ON_THIS_STEP: OcrFieldKey[] = ['idNumber', 'expiryDate']

export interface OcrState {
  result: OcrResultDTO | null
  /** Flagged fields the CSR has checked against the card. */
  confirmed: OcrFieldKey[]
  /** Earlier-step fields the CSR chose to take from the card. */
  useCard: OcrFieldKey[]
}

export const EMPTY_OCR: OcrState = { result: null, confirmed: [], useCard: [] }

/** Flagged fields not yet confirmed: Next stays blocked while there are any. */
export const unconfirmed = (s: OcrState) =>
  (s.result?.fields ?? []).filter((f) => f.flagged && !s.confirmed.includes(f.key)).map((f) => f.key)

interface Props {
  state: OcrState
  onChange: (next: OcrState) => void
  /** Called with a new reading, so the step can fill its own fields. */
  onRead: (result: OcrResultDTO) => void
  /** What the earlier steps hold for the compared fields. */
  entered: Partial<Record<OcrFieldKey, string>>
  /** Shown when Next was pressed with unconfirmed fields. */
  blocked: boolean
}

/** Upload a card image, then review each field's value and confidence. */
export function OcrPanel({ state, onChange, onRead, entered, blocked }: Props) {
  const { t } = useTranslation('customers')
  const [status, setStatus] = useState<'idle' | 'reading' | 'read' | 'unreadable' | 'error'>(
    state.result ? 'read' : 'idle',
  )
  const [error, setError] = useState('')

  const read = async (file: File | undefined) => {
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setStatus('error')
      setError(t('onboard.ocr.badFile'))
      return
    }
    setStatus('reading')
    try {
      const result = await readCard(file)
      // A new card resets confirmations and choices: they were about the previous card's values.
      onChange({ result, confirmed: [], useCard: [] })
      onRead(result)
      setStatus('read')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ocr_unreadable') {
        setStatus('unreadable')
      } else {
        setStatus('error')
        setError(err instanceof ApiError ? err.message : t('common:error.generic'))
      }
    }
  }

  const toggle = (list: 'confirmed' | 'useCard', key: OcrFieldKey) =>
    onChange({
      ...state,
      [list]: state[list].includes(key) ? state[list].filter((k) => k !== key) : [...state[list], key],
    })

  const pending = unconfirmed(state)
  const row = (f: OcrFieldDTO) => {
    const here = OCR_ON_THIS_STEP.includes(f.key)
    const other = entered[f.key]
    const differs = !here && !!f.value && (other ?? '').toLowerCase() !== f.value.toLowerCase()
    return (
      <tr
        key={f.key}
        data-qa="ocr-row"
        data-field={f.key}
        data-confidence={f.confidence.toFixed(2)}
        data-flagged={f.flagged}
        className={f.flagged ? 'flagged' : undefined}
      >
        <th scope="row">{t(`onboard.ocr.fields.${f.key}`)}</th>
        <td className="mono" data-qa="ocr-value">
          {f.value || <span className="help">{t('onboard.ocr.notOnCard')}</span>}
        </td>
        <td>
          <span className="ocr-conf" data-qa="ocr-confidence">
            <b style={{ width: `${Math.round(f.confidence * 100)}%` }} />
          </span>
          <span className="num">{Math.round(f.confidence * 100)}%</span>
        </td>
        <td className="help">
          {here ? (
            t('onboard.ocr.filledHere')
          ) : differs ? (
            <label className="choice">
              <input
                type="checkbox"
                data-qa="ocr-use-card"
                checked={state.useCard.includes(f.key)}
                onChange={() => toggle('useCard', f.key)}
              />
              <span>{t('onboard.ocr.useCard', { entered: other || '—' })}</span>
            </label>
          ) : (
            t('onboard.ocr.matches')
          )}
        </td>
        <td>
          {f.flagged ? (
            <label className="choice">
              <input
                type="checkbox"
                data-qa="ocr-confirm"
                checked={state.confirmed.includes(f.key)}
                onChange={() => toggle('confirmed', f.key)}
              />
              <span>{t('onboard.ocr.confirm')}</span>
            </label>
          ) : (
            <span className="pill ok">{t('onboard.ocr.confident')}</span>
          )}
        </td>
      </tr>
    )
  }

  return (
    <section className="panel ocr" data-qa="ocr-panel" data-state={status}>
      <header>
        <h2>{t('onboard.ocr.title')}</h2>
        <LocatorBadge style="DATA" />
        <span className="hint">{t('onboard.ocr.hint')}</span>
      </header>
      <div className="body">
        <div className="actions">
          <label className="btn">
            <Icon name="upload" />
            {status === 'read' ? t('onboard.ocr.readAnother') : t('onboard.ocr.choose')}
            <input
              type="file"
              accept="image/jpeg,image/png"
              className="sr-only"
              data-qa="ocr-file"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                void read(f)
              }}
            />
          </label>
          {status === 'reading' ? (
            <span className="help" role="status">
              <span className="spin" /> {t('onboard.ocr.reading')}
            </span>
          ) : null}
        </div>
        {status === 'unreadable' ? (
          <div className="note warn" role="alert" data-qa="ocr-unreadable">
            <Icon name="warn" />
            {t('onboard.ocr.unreadable')}
          </div>
        ) : null}
        {status === 'error' ? (
          <div className="note bad" role="alert" data-qa="ocr-error">
            {error}
          </div>
        ) : null}
        {state.result ? (
          <>
            <table className="ocr-table" data-qa="ocr-results">
              <caption className="sr-only">{t('onboard.ocr.caption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('onboard.ocr.field')}</th>
                  <th scope="col">{t('onboard.ocr.value')}</th>
                  <th scope="col">{t('onboard.ocr.confidence')}</th>
                  <th scope="col">{t('onboard.ocr.inForm')}</th>
                  <th scope="col">{t('onboard.ocr.check')}</th>
                </tr>
              </thead>
              <tbody>{state.result.fields.map(row)}</tbody>
            </table>
            {pending.length ? (
              <p
                className={blocked ? 'errmsg' : 'help'}
                role={blocked ? 'alert' : undefined}
                data-qa="ocr-pending"
              >
                {t('onboard.ocr.pending', { count: pending.length })}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  )
}
