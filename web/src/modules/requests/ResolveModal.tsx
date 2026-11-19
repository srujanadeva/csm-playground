/**
 * Resolving a request: formatted resolution notes (10–2,000 characters, rich text editor with
 * id="resolution-notes"; its toolbar buttons only have aria-pressed and a label) and the customer's
 * rating, which is required ("Customer declined" counts as an answer).
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { richTextTextLength } from '@csm/shared'
import { useErrorText } from '../../components/Field.tsx'
import { LocatorBadge } from '../../components/LocatorBadge.tsx'
import { Modal } from '../../components/Overlay.tsx'
import { RichTextEditor } from '../../components/inputs/RichTextEditor.tsx'
import type { CsatInput } from './api.ts'
import { CsatFields, csatComplete } from './CsatFields.tsx'

/** Resolution dialog. */
export function ResolveModal({
  srNo,
  busy,
  onCancel,
  onConfirm,
}: {
  srNo: string
  busy: boolean
  onCancel: () => void
  onConfirm: (notes: string, csat: CsatInput) => void
}) {
  const { t } = useTranslation('requests')
  const errorText = useErrorText()
  const [notes, setNotes] = useState('')
  const [csat, setCsat] = useState<CsatInput>({ declined: false })
  const [errors, setErrors] = useState<{ notes?: string; csat?: string }>({})
  const length = richTextTextLength(notes)

  const confirm = () => {
    const next = {
      notes: length < 10 ? 'resolutionRequired' : length > 2000 ? 'resolutionLength' : undefined,
      csat: csatComplete(csat) ? undefined : 'csatRequired',
    }
    setErrors(next)
    if (!next.notes && !next.csat) onConfirm(notes, csat)
  }

  return (
    <Modal
      testId="sr-resolve"
      title={t('resolve.title', { srNo })}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn" data-testid="sr-resolve-cancel" onClick={onCancel}>
            {t('common:cancel')}
          </button>
          <button
            type="button"
            className="btn pri"
            data-testid="sr-resolve-confirm"
            disabled={busy}
            onClick={confirm}
          >
            {busy ? <span className="spin" /> : null}
            {t('resolve.confirm')}
          </button>
        </>
      }
    >
      <span>{t('resolve.message')}</span>
      <div className="f">
        <span className="lbl req" id="resolution-notes-label">
          {t('resolve.notes')} <LocatorBadge style="ID" />
        </span>
        <RichTextEditor
          id="resolution-notes"
          label={t('resolve.notes')}
          maxLength={2000}
          invalid={!!errors.notes}
          onChange={(html) => {
            setNotes(html)
            setErrors((e) => ({ ...e, notes: undefined }))
          }}
        />
        {errors.notes ? (
          <span className="errmsg" role="alert">
            {errorText(errors.notes)}
          </span>
        ) : null}
      </div>
      <CsatFields
        value={csat}
        onChange={(v) => {
          setCsat(v)
          setErrors((e) => ({ ...e, csat: undefined }))
        }}
        error={errors.csat}
      />
    </Modal>
  )
}
