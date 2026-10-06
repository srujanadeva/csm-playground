/**
 * Password and staff ID rules.
 *
 * NIST SP 800-63B style: length over composition rules. The breached-password check and the
 * "doesn't contain your ID or name" rule run on the server (OWASP A07).
 */
import { z } from 'zod'

export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 128

export const passwordSchema = z.string().min(PASSWORD_MIN, 'passwordMin').max(PASSWORD_MAX, 'passwordMax')

export const staffIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{2,5}[0-9]{3}$/, 'staffIdFormat')
