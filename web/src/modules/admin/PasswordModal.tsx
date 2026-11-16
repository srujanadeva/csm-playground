// The one-time password dialog, shown once after creating a user, resetting a password or
// approving an access request.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../../components/Overlay.tsx'

/** Shows a one-time password once, with a copy button. */
export function PasswordModal({
  staffId,
  password,
  onClose,
}: {
  staffId: string
  password: string
  onClose: () => void
}) {
  const { t } = useTranslation('admin')
  const [copied, setCopied] = useState(false)
  return (
    <Modal
      testId="admin-otp"
      title={t('users.otp.title', { staffId })}
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn pri"
          data-testid="admin-otp-done"
          onClick={onClose}
          data-autofocus
        >
          {t('users.otp.done')}
        </button>
      }
    >
      <span>{t('users.otp.message')}</span>
      <div className="affix">
        <input
          className="in mono"
          readOnly
          value={password}
          data-testid="admin-otp-value"
          aria-label={t('users.otp.label')}
          onFocus={(e) => e.target.select()}
        />
        <button
          type="button"
          data-testid="admin-otp-copy"
          onClick={() => {
            void navigator.clipboard?.writeText(password).then(() => setCopied(true))
          }}
        >
          {copied ? t('users.otp.copied') : t('users.otp.copy')}
        </button>
      </div>
    </Modal>
  )
}
