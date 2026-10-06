/** Sign-in and password-change request bodies (OWASP A07). */
import { z } from 'zod'
import { passwordSchema, staffIdSchema } from './password.ts'

export const loginSchema = z.strictObject({
  staffId: staffIdSchema,
  // Only length-checked here: the policy applies when passwords are set, not when typed.
  password: z.string().min(1, 'required').max(128, 'passwordMax'),
  remember: z.boolean().default(false),
})
export type LoginInput = z.infer<typeof loginSchema>

export const changePasswordSchema = z
  .strictObject({
    currentPassword: z.string().min(1, 'required').max(128, 'passwordMax'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'required'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    error: 'passwordMismatch',
    path: ['confirmPassword'],
  })
  .refine((d) => d.newPassword !== d.currentPassword, { error: 'passwordSame', path: ['newPassword'] })
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
