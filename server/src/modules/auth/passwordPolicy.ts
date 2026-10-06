/**
 * Server-side password rules beyond length (OWASP A07): reject common/breached passwords and
 * passwords built from the user's own staff ID or name.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const COMMON = new Set(
  readFileSync(fileURLToPath(new URL('./common-passwords.txt', import.meta.url)), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#')),
)

/** True if the password, or the password with trailing digits/symbols removed, is a common one. */
export function isCommonPassword(password: string): boolean {
  const lower = password.toLowerCase()
  const stem = lower.replace(/[^a-z]+$/, '')
  return COMMON.has(lower) || (stem.length >= 6 && COMMON.has(stem))
}

/** True if the password contains the staff ID or any part of the name of 4+ letters. */
export function containsIdentity(password: string, staffId: string, name: string): boolean {
  const lower = password.toLowerCase()
  const parts = [staffId, ...name.toLowerCase().split(/\s+/)].filter((p) => p.length >= 4)
  return parts.some((p) => lower.includes(p.toLowerCase()))
}

/** Returns a validation code if the password breaks a server-side rule, otherwise null. */
export function passwordProblem(password: string, staffId: string, name: string): string | null {
  if (isCommonPassword(password)) return 'passwordBreached'
  if (containsIdentity(password, staffId, name)) return 'passwordContainsId'
  return null
}
