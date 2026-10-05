// PII masking used by the API when the caller lacks `viewPII` (OWASP A04: data exposure).

const BULLETS = '••••'

/** "+91 98450 12345" → "+91 98450 •••• 45" (keeps the country code, first 5 and last 2 digits). */
export function maskMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, '')
  if (digits.length < 7) return BULLETS
  const local = digits.length > 10 ? digits.slice(-10) : digits
  const cc = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)} ` : ''
  return `${cc}${local.slice(0, 5)} ${BULLETS} ${local.slice(-2)}`
}

/** "ananya.rao@mail.com" → "an••••@mail.com" */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 1) return BULLETS
  return `${email.slice(0, Math.min(2, at))}${BULLETS}${email.slice(at)}`
}

/** Shows only the last 2 characters of an ID number. */
export function maskId(lastChars: string): string {
  return `${BULLETS}${lastChars.slice(-2)}`
}
