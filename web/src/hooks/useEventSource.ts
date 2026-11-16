// Subscribes to a server-sent events stream (same origin, cookies sent) while mounted.
import { useEffect, useRef, useState } from 'react'

export type StreamState = 'connecting' | 'open' | 'closed'

/**
 * Opens an EventSource and calls `onMessage` with each parsed JSON message.
 * The browser reconnects by itself after a drop; `state` reflects that for the UI.
 * @param url Stream URL, or null to stay disconnected.
 */
export function useEventSource<T>(url: string | null, onMessage: (data: T) => void): StreamState {
  const [state, setState] = useState<StreamState>('connecting')
  // Kept in a ref so a new callback each render doesn't reopen the stream.
  const handler = useRef(onMessage)
  useEffect(() => {
    handler.current = onMessage
  })
  useEffect(() => {
    if (!url) return
    const es = new EventSource(url, { withCredentials: true })
    es.onopen = () => setState('open')
    es.onerror = () => setState(es.readyState === EventSource.CLOSED ? 'closed' : 'connecting')
    es.onmessage = (e) => {
      try {
        handler.current(JSON.parse(e.data) as T)
      } catch {
        // A malformed message is skipped rather than breaking the stream.
      }
    }
    return () => es.close()
  }, [url])
  return url ? state : 'closed'
}
