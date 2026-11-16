// Seconds left until a timestamp, ticking once a second (0 once passed).
import { useEffect, useState } from 'react'

/** @param until ISO timestamp, or null for no countdown. */
export function useCountdown(until: string | null): number {
  const calc = () => (until ? Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 1000)) : 0)
  const [left, setLeft] = useState(calc)
  useEffect(() => {
    const tick = () =>
      setLeft(until ? Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 1000)) : 0)
    tick()
    if (!until) return
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [until])
  return left
}

/** 83 → "1:23". */
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
