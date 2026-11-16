// Copy to clipboard with a fallback state, plus detection of whether a field was pasted into.
import { useCallback, useState } from 'react'

export type CopyState = 'idle' | 'copied' | 'unavailable'

/**
 * Copies text with the async Clipboard API. Insecure contexts and denied permissions report
 * 'unavailable' instead of throwing, so the caller can show a fallback.
 */
export function useClipboard(resetAfterMs = 2000) {
  const [state, setState] = useState<CopyState>('idle')
  const copy = useCallback(
    async (text: string) => {
      try {
        if (!navigator.clipboard) throw new Error('no clipboard')
        await navigator.clipboard.writeText(text)
        setState('copied')
      } catch {
        setState('unavailable')
      }
      setTimeout(() => setState('idle'), resetAfterMs)
    },
    [resetAfterMs],
  )
  return { state, copy }
}

/**
 * Tracks how a field's value got there: 'pasted', 'typed', or '' before any input.
 * Spread `handlers` on the input.
 */
export function usePasteCheck() {
  const [source, setSource] = useState<'' | 'pasted' | 'typed'>('')
  const handlers = {
    onPaste: () => setSource('pasted'),
    onKeyDown: (e: React.KeyboardEvent) => {
      // Ctrl/⌘+V fires a paste event too; only count real typing as typed.
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) setSource('typed')
    },
  }
  return { source, handlers, reset: () => setSource('') }
}
