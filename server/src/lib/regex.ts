/** Escapes user text for use inside a RegExp, so search input can't inject patterns (ReDoS). */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
