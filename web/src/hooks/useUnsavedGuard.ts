// Warns before unsaved changes are lost: the browser's own "Leave site?" dialog on reload or
// close, and a blocker for in-app navigation that the caller shows as its own dialog.
import { useEffect } from 'react'
import { useBlocker, type Blocker } from 'react-router'

/**
 * Guards a dirty form.
 * @param dirty Whether there are unsaved changes.
 * @returns The router blocker: when `state === 'blocked'`, show a dialog and call
 *   `proceed()` (discard and leave) or `reset()` (stay).
 */
export function useUnsavedGuard(dirty: boolean): Blocker {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname,
  )
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Older Chromium only shows the dialog when returnValue is set.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])
  return blocker
}
