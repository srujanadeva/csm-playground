/**
 * The customer's rating (FR-SR-024): 1–5 radio stars, or "Customer declined", plus an optional comment.
 * Used in the Resolve dialog and on resolved requests without a rating. The stars' only hooks are
 * the radio name ("csat") and the group's legend: //fieldset[legend='Customer rating']//input[@value='4'].
 */
import { useTranslation } from 'react-i18next'
import { useErrorText } from '../../components/Field.tsx'
import { StarRadio } from '../../components/selection/StarRating.tsx'
import type { CsatInput } from './api.ts'

/** Rating, declined tick and comment. */
export function CsatFields({
  value,
  onChange,
  error,
}: {
  value: CsatInput
  onChange: (v: CsatInput) => void
  error?: string
}) {
  const { t } = useTranslation('requests')
  const errorText = useErrorText()
  return (
    <fieldset className="csat">
      <legend>{t('csat.legend')}</legend>
      {!value.declined ? (
        <StarRadio
          name="csat"
          label={t('csat.legend')}
          value={value.rating ?? 0}
          onChange={(n) => onChange({ ...value, rating: n })}
        />
      ) : null}
      <label className="choice">
        <input
          type="checkbox"
          checked={value.declined}
          onChange={(e) => onChange({ ...value, declined: e.target.checked, rating: undefined })}
        />
        <span>{t('csat.declined')}</span>
      </label>
      <label className="f">
        <span className="lbl">{t('csat.comment')}</span>
        <textarea
          className="in"
          maxLength={500}
          value={value.comment ?? ''}
          onChange={(e) => onChange({ ...value, comment: e.target.value })}
        />
      </label>
      {error ? (
        <span className="errmsg" role="alert">
          {errorText(error)}
        </span>
      ) : null}
    </fieldset>
  )
}

/** Whether a CSAT answer is complete enough to send. */
export const csatComplete = (v: CsatInput) => v.declined || !!v.rating
