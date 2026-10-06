/**
 * Modal, drawer and confirmation dialogs. Each is role="dialog" with aria-modal, closes on
 * Escape or the scrim, keeps keyboard focus inside, and returns focus where it came from.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

function useDialogFocus(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const el = ref.current
    const focusables = () =>
      el
        ? Array.from(
            el.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          )
        : []
    ;(el?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0])?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
      if (e.key === 'Tab') {
        const items = focusables()
        if (!items.length) return
        const first = items[0]!
        const last = items.at(-1)!
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [onClose])
  return ref
}

interface ModalProps {
  testId: string
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer: ReactNode
}

/** A centred dialog. */
export function Modal({ testId, title, onClose, children, footer }: ModalProps) {
  const ref = useDialogFocus(onClose)
  const titleId = useId()
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} data-testid={`${testId}-scrim`} />
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        ref={ref}
      >
        <header id={titleId}>{title}</header>
        <div className="mb">{children}</div>
        <footer>{footer}</footer>
      </div>
    </>,
    document.body,
  )
}

interface DrawerProps {
  testId: string
  /** Wider panel for content like the permission matrix. */
  wide?: boolean
  title: ReactNode
  subtitle?: ReactNode
  leading?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

/** A panel that slides in from the right. */
export function Drawer({ testId, title, subtitle, leading, onClose, children, footer, wide }: DrawerProps) {
  const { t } = useTranslation()
  const ref = useDialogFocus(onClose)
  const titleId = useId()
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} data-testid={`${testId}-scrim`} />
      <aside
        className={`drawer ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        ref={ref}
      >
        <header>
          {leading}
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <div className="help">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            className="x"
            aria-label={t('close')}
            data-testid={`${testId}-close`}
            onClick={onClose}
          >
            ✕
          </button>
        </header>
        <div className="db">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </aside>
    </>,
    document.body,
  )
}

interface ConfirmProps {
  testId: string
  title: ReactNode
  message: ReactNode
  confirmLabel: ReactNode
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** "Are you sure?" with explicit Cancel / confirm buttons. */
export function ConfirmDialog({
  testId,
  title,
  message,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  const { t } = useTranslation()
  return (
    <Modal
      testId={testId}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn" data-testid={`${testId}-cancel`} onClick={onCancel}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'danger-solid' : 'pri'}`}
            data-testid={`${testId}-confirm`}
            disabled={busy}
            onClick={onConfirm}
            data-autofocus
          >
            {busy ? <span className="spin" /> : null}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div>{message}</div>
    </Modal>
  )
}
