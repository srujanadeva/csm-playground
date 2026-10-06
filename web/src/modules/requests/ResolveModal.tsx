/** Asks for resolution notes (at least 10 characters) before a request moves to Resolved. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Field, controlProps } from '../../components/Field.tsx'
import { Modal } from '../../components/Overlay.tsx'

/** Resolution-notes dialog. */
export function ResolveModal({
  srNo,
  busy,
  onCancel,
  onConfirm,
}: {
  srNo: string
  busy: boolean
  onCancel: () => void
  onConfirm: (notes: string) => void
}) {
  const { t } = useTranslation('requests')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | undefined>()
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
            onClick={() => {
              if (notes.trim().length < 10) setError('resolutionRequired')
              else onConfirm(notes.trim())
            }}
          >
            {busy ? <span className="spin" /> : null}
            {t('resolve.confirm')}
          </button>
        </>
      }
    >
      <span>{t('resolve.message')}</span>
      <Field
        id="sr-resolve-notes"
        label={t('resolve.notes')}
        required
        error={error}
        help={`${notes.length} / 1000`}
      >
        <textarea
          {...controlProps('sr-resolve-notes', error)}
          className="in"
          maxLength={1000}
          value={notes}
          data-autofocus
          onChange={(e) => {
            setNotes(e.target.value)
            setError(undefined)
          }}
        />
      </Field>
    </Modal>
  )
}
