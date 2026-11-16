// localStorage that never throws: private windows and blocked storage return the fallback, and
// failed writes are ignored. Only for per-browser conveniences (consent, collapsed menus, dismissals).

/** Reads and JSON-parses a key. */
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

/** JSON-stringifies and writes a key. */
export function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: the choice just won't be remembered.
  }
}
