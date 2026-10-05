import { z } from 'zod'

// NIST SP 800-63B style: length over composition rules. The breached-password check runs on
// the server against a bundled list (added with the auth module in phase 2).
export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 128

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters`)

export const staffIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{2,5}[0-9]{3}$/, 'Staff IDs look like csr001')
