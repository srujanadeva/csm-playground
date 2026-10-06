/** Toast notifications: role="status", auto-dismiss after 6 seconds, dismissible by hand. */
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from './Icon.tsx'

interface ToastItem {
  id: number
  kind: 'success' | 'error'
  message: ReactNode
}

const ToastContext = createContext<(message: ReactNode, kind?: ToastItem['kind']) => void>(() => undefined)

/** Provides `useToast()` and renders the toast stack. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [items, setItems] = useState<ToastItem[]>([])
  const dismiss = useCallback((id: number) => setItems((all) => all.filter((i) => i.id !== id)), [])
  const show = useCallback(
    (message: ReactNode, kind: ToastItem['kind'] = 'success') => {
      const id = Date.now() + Math.random()
      setItems((all) => [...all, { id, kind, message }])
      setTimeout(() => dismiss(id), 6000)
    },
    [dismiss],
  )
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className={`toast ${i.kind}`} role="status" data-testid="toast" data-kind={i.kind}>
            <span className="dot">
              <Icon name={i.kind === 'success' ? 'check' : 'warn'} size={13} />
            </span>
            <span data-testid="toast-message">{i.message}</span>
            <button
              type="button"
              aria-label={t('dismiss')}
              data-testid="toast-dismiss"
              onClick={() => dismiss(i.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** Shows a toast: `toast('Saved')` or `toast('Failed', 'error')`. */
export function useToast() {
  return useContext(ToastContext)
}
