// "Leave without saving?" for forms guarded by useUnsavedGuard. Deliberately has no test ids: testers
// find it by its text (plan §3, TXT).
import { useTranslation } from 'react-i18next'
import { Modal } from '../Overlay.tsx'

/** Stay / Discard dialog. */
export function UnsavedChangesDialog({ onStay, onDiscard }: { onStay: () => void; onDiscard: () => void }) {
  const { t } = useTranslation('ui')
  return (
    <Modal
      title={t('unsaved.title')}
      onClose={onStay}
      footer={
        <>
          <button type="button" className="btn" onClick={onStay} data-autofocus>
            {t('unsaved.stay')}
          </button>
          <button type="button" className="btn danger-solid" onClick={onDiscard}>
            {t('unsaved.discard')}
          </button>
        </>
      }
    >
      <div>{t('unsaved.message')}</div>
    </Modal>
  )
}
