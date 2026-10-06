/** Admin schemas: staff users, per-user access, screens and roles (OWASP A01). */
import { z } from 'zod'
import { BRANCH_CODES, STAFF_STATUS } from '../enums.ts'
import { CAPABILITIES, NAV_GROUPS } from '../permissions.ts'
import { offsetQuery } from './common.ts'
import { staffIdSchema } from './password.ts'

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v)
export const ROLE_KEYS = ['admin', 'supervisor', 'csr'] as const

const personName = z
  .string()
  .trim()
  .min(2, 'required')
  .max(80, 'tooLong')
  .regex(/^[\p{L}][\p{L} .'-]*$/u, 'nameFormat')

export const overrideSchema = z.strictObject({
  screenKey: z.string().min(1).max(40),
  grant: z.array(z.enum(CAPABILITIES)).max(CAPABILITIES.length),
  revoke: z.array(z.enum(CAPABILITIES)).max(CAPABILITIES.length),
})

export const createUserSchema = z.strictObject({
  staffId: staffIdSchema,
  name: personName,
  email: z.preprocess(emptyToUndefined, z.email('emailFormat').max(120).optional()),
  roleKey: z.enum(ROLE_KEYS),
  branchCode: z.enum(BRANCH_CODES),
})

export const updateUserSchema = z.strictObject({
  name: personName.optional(),
  email: z.preprocess(emptyToUndefined, z.email('emailFormat').max(120).optional()),
  roleKey: z.enum(ROLE_KEYS).optional(),
  branchCode: z.enum(BRANCH_CODES).optional(),
  overrides: z.array(overrideSchema).max(50).optional(),
})

export const userListQuery = offsetQuery.extend({
  q: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(40).optional()),
  role: z.preprocess(emptyToUndefined, z.enum(ROLE_KEYS).optional()),
  status: z.preprocess(emptyToUndefined, z.enum(STAFF_STATUS).optional()),
})

const label = z.string().trim().min(2, 'labelLength').max(40, 'labelLength')

export const updateScreenSchema = z
  .strictObject({
    version: z.number().int().min(0),
    labels: z.strictObject({ en: label, kn: label }).optional(),
    navGroup: z.enum(NAV_GROUPS).nullable().optional(),
    icon: z
      .string()
      .regex(/^[a-z-]{2,20}$/)
      .optional(),
    enabled: z.boolean().optional(),
    capabilities: z
      .array(z.enum(CAPABILITIES))
      .min(1, 'viewRequired')
      .refine((c) => c.includes('view'), 'viewRequired')
      .optional(),
    unauthorisedMode: z.enum(['hide', 'disable']).optional(),
    defaultPageSize: z.coerce.number().int().min(5).max(100).optional(),
    maxPageSize: z.coerce.number().int().min(5).max(100).optional(),
  })
  .refine((d) => !d.defaultPageSize || !d.maxPageSize || d.defaultPageSize <= d.maxPageSize, {
    error: 'pageSizeOrder',
    path: ['defaultPageSize'],
  })

export const screenOrderSchema = z.strictObject({ keys: z.array(z.string().min(1).max(40)).min(1).max(100) })

/** Which roles can open a screen (the "Roles with access" chips). */
export const screenRolesSchema = z.strictObject({ roles: z.array(z.enum(ROLE_KEYS)).max(ROLE_KEYS.length) })
