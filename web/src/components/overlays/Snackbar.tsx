// One message at a time at the bottom centre, with an optional action (usually Undo). Unlike a
// toast, a new snackbar replaces the current one, and the action is the point of it.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import './overlays.css'

interface SnackOptions {
  message: ReactNode
  actionLabel?: ReactNode
  onAction?: () => void
  /** ms before it hides by itself; 0 keeps it until dismissed. */
  duration?: number
}

interface Snack extends SnackOptions {
  id: number
}

const SnackContext = createContext<(o: SnackOptions) => void>(() => undefined)

/** Provides `useSnackbar()` and renders the bar. */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation('ui')
  const [snack, setSnack] = useState<Snack | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const show = useCallback((o: SnackOptions) => setSnack({ ...o, id: Date.now() }), [])
  useEffect(() => {
    clearTimeout(timer.current)
    const ms = snack?.duration ?? 6000
    if (snack && ms > 0) timer.current = setTimeout(() => setSnack(null), ms)
    return () => clearTimeout(timer.current)
  }, [snack])
  return (
    <SnackContext.Provider value={show}>
      {children}
      <div className="snackbar-region" aria-live="polite">
        {snack ? (
          <div className="snackbar" role="status" key={snack.id}>
            <span>{snack.message}</span>
            {snack.actionLabel ? (
              <button
                type="button"
                className="snackbar-action"
                onClick={() => {
                  setSnack(null)
                  snack.onAction?.()
                }}
              >
                {snack.actionLabel}
              </button>
            ) : null}
            <button
              type="button"
              className="snackbar-close"
              aria-label={t('dismiss')}
              onClick={() => setSnack(null)}
            >
              ✕
            </button>
          </div>
        ) : null}
      </div>
    </SnackContext.Provider>
  )
}

/** Shows a snackbar: `snack({ message: 'Archived', actionLabel: 'Undo', onAction })`. */
export function useSnackbar() {
  return useContext(SnackContext)
}
