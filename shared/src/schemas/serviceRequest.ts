/** Service request schemas: create, status change, comments, board and list queries. */
import { z } from 'zod'
import { SR_CHANNELS, SR_PRIORITIES, SR_STATUS } from '../enums.ts'
import { cursorQuery, offsetQuery } from './common.ts'
import { staffIdSchema } from './password.ts'

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v)

export const createServiceRequestSchema = z.strictObject({
  customerCif: z.string().regex(/^CIF-[0-9]{6}$/, 'required'),
  channel: z.enum(SR_CHANNELS),
  category: z.string().min(1, 'required').max(40),
  subCategory: z.string().min(1, 'required').max(40),
  priority: z.enum(SR_PRIORITIES),
  slaDueAt: z.iso
    .datetime({ offset: true, error: 'invalid' })
    .refine((v) => Date.parse(v) > Date.now(), 'slaFuture'),
  subject: z.string().trim().min(5, 'subjectLength').max(120, 'subjectLength'),
  description: z.string().trim().min(10, 'descriptionLength').max(1000, 'descriptionLength'),
  assignedTo: z.preprocess(emptyToUndefined, staffIdSchema.optional()),
  notifyBySms: z.boolean().default(true),
  notifyByEmail: z.boolean().default(false),
})
export type CreateServiceRequestInput = z.infer<typeof createServiceRequestSchema>

export const statusChangeSchema = z
  .strictObject({
    status: z.enum(SR_STATUS),
    resolutionNotes: z.preprocess(
      emptyToUndefined,
      z.string().trim().max(1000, 'descriptionLength').optional(),
    ),
    version: z.number().int().min(0),
  })
  .refine((d) => d.status !== 'resolved' || (d.resolutionNotes?.length ?? 0) >= 10, {
    error: 'resolutionRequired',
    path: ['resolutionNotes'],
  })

export const commentSchema = z.strictObject({
  text: z.string().trim().min(1, 'commentLength').max(1000, 'commentLength'),
})

export const SR_QUEUES = ['mine', 'branch', 'all'] as const

const filters = {
  queue: z.enum(SR_QUEUES).default('mine'),
  priority: z.preprocess(emptyToUndefined, z.enum(SR_PRIORITIES).optional()),
  q: z.preprocess(emptyToUndefined, z.string().trim().min(2, 'invalid').max(40).optional()),
}

/** One board column: cursor-paginated, newest first. */
export const boardQuery = cursorQuery.extend({ status: z.enum(SR_STATUS), ...filters })

export const SR_SORTS = ['createdAt', 'slaDueAt', 'priority', 'srNo', 'status'] as const

/** List view: page-number pagination with filters. */
export const srListQuery = offsetQuery.extend({
  status: z.preprocess(emptyToUndefined, z.enum(SR_STATUS).optional()),
  ...filters,
})
