// Timing overrides from the URL (?delay=0, ?feedInterval=2000, …) so tests can pin timers.
// Ignored in production builds: there the defaults always apply.
import { useSearchParams } from 'react-router'

/**
 * Reads a whole-number URL parameter outside production.
 * @param name Parameter name, e.g. "delay".
 * @param fallback Used when the parameter is missing, invalid, or the build is production.
 * @param max Upper bound, so a typo can't freeze a page for hours.
 */
export function useUrlNumber(name: string, fallback: number, max = 600_000): number {
  const [params] = useSearchParams()
  if (import.meta.env.PROD) return fallback
  const raw = params.get(name)
  if (raw === null || !/^\d+$/.test(raw)) return fallback
  return Math.min(Number(raw), max)
}

/** True when `?hints=1` is in the URL: shows the locator badge on practice sections. */
export function useLocatorHints(): boolean {
  const [params] = useSearchParams()
  return params.get('hints') === '1'
}
