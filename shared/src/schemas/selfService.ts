/**
 * Public, signed-out flows: forgot password (staff ID → one-time code → new password) and
 * requesting staff access. Both answer the same way whether or not a staff ID exists (OWASP A07).
 */
import { z } from 'zod'
import { BRANCH_CODES } from '../enums.ts'
import { passwordSchema, staffIdSchema } from './password.ts'

export const OTP_LENGTH = 6

const otpCode = z.string().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), 'otpFormat')
const challengeId = z.string().regex(/^[a-f0-9]{24}$/, 'invalid')

export const resetStartSchema = z.strictObject({ staffId: staffIdSchema })
export const resetResendSchema = z.strictObject({ challengeId })
export const resetVerifySchema = z.strictObject({ challengeId, code: otpCode })
export const resetCompleteSchema = z
  .strictObject({
    resetToken: z.string().min(20).max(100),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'required'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    error: 'passwordMismatch',
    path: ['confirmPassword'],
  })
export type ResetCompleteInput = z.infer<typeof resetCompleteSchema>

/** What starting or resending a reset returns: enough to drive the code screen and its timers. */
export interface ResetChallenge {
  challengeId: string
  expiresAt: string
  resendAt: string
  /** Masked destinations, e.g. "+91 9•••• ••45". Shown even for unknown IDs (decoys). */
  sentTo: { sms: string; email: string }
}

/** Roles a new joiner may ask for; admin access is only ever granted by an admin. */
export const REQUESTABLE_ROLES = ['csr', 'teller', 'supervisor'] as const

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v)

export const accessRequestSchema = z.strictObject({
  fullName: z
    .string()
    .trim()
    .min(2, 'required')
    .max(80, 'tooLong')
    .regex(/^[\p{L}][\p{L} .'-]*$/u, 'nameFormat'),
  email: z.email('emailFormat').max(120),
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'mobileFormat'),
  employeeNo: z
    .string()
    .trim()
    .regex(/^E\d{5}$/, 'employeeNoFormat'),
  branchCode: z.enum(BRANCH_CODES),
  roleRequested: z.enum(REQUESTABLE_ROLES),
  managerEmail: z.preprocess(emptyToUndefined, z.email('emailFormat').max(120).optional()),
  reason: z.string().trim().min(10, 'reasonShort').max(500, 'tooLong'),
  acceptTerms: z.literal(true, { error: 'mustAccept' }),
  acceptPrivacy: z.literal(true, { error: 'mustAccept' }),
  /** Optional: newsletter-style opt-in, to give the form a checkbox that isn't required. */
  subscribeUpdates: z.boolean().default(false),
})
export type AccessRequestInput = z.input<typeof accessRequestSchema>

export const accessDecisionSchema = z.discriminatedUnion('decision', [
  z.strictObject({
    decision: z.literal('approve'),
    staffId: staffIdSchema,
    roleKey: z.enum(REQUESTABLE_ROLES),
    branchCode: z.enum(BRANCH_CODES),
  }),
  z.strictObject({
    decision: z.literal('reject'),
    note: z.string().trim().min(5, 'reasonShort').max(300, 'tooLong'),
  }),
])
