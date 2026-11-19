/**
 * Service request schemas: create, edit (tags, priority, assignee, callback), status change with
 * resolution notes and CSAT, quality review, comments, board and list queries.
 */
import { z } from 'zod'
import { SR_CHANNELS, SR_PRIORITIES, SR_STATUS } from '../enums.ts'
import { richTextTextLength } from '../richText.ts'
import { cursorQuery, offsetQuery } from './common.ts'
import { staffIdSchema } from './password.ts'

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v)

// ── Tags ─────────────────────────────────────────────────────────────────────

export const SR_STANDARD_TAGS = ['VIP', 'Escalated', 'Branch visit', 'Regulatory'] as const
export const MAX_TAGS = 10

const tag = z
  .string()
  .trim()
  .min(2, 'tagLength')
  .max(20, 'tagLength')
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} -]*$/u, 'tagFormat')

export const tagsSchema = z
  .array(tag)
  .max(MAX_TAGS, 'tagsMax')
  .refine((t) => new Set(t.map((x) => x.toLowerCase())).size === t.length, 'tagsDuplicate')

// ── Callbacks (Monday–Saturday, 09:00–18:00 IST, up to 30 days ahead) ─────────

export const CALLBACK_MAX_DAYS = 30
const IST_OFFSET_MIN = 330
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'invalid')

/**
 * Why a callback time isn't allowed, or null when it is.
 * @param at The callback instant.
 * @param now Reference time (tests pass a fixed one).
 */
export function callbackProblem(
  at: Date,
  now = new Date(),
): 'callbackFuture' | 'callbackRange' | 'callbackHours' | null {
  if (at.getTime() <= now.getTime()) return 'callbackFuture'
  if (at.getTime() > now.getTime() + CALLBACK_MAX_DAYS * 86_400_000) return 'callbackRange'
  const ist = new Date(at.getTime() + IST_OFFSET_MIN * 60_000)
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  if (ist.getUTCDay() === 0 || minutes < 9 * 60 || minutes > 18 * 60) return 'callbackHours'
  return null
}

/** Adds the callback rules to a schema with callbackAt / windowStart / windowEnd. */
function checkCallback(
  d: { callbackAt?: string | null; windowStart?: string | null; windowEnd?: string | null },
  ctx: z.RefinementCtx,
) {
  if (d.callbackAt) {
    const problem = callbackProblem(new Date(d.callbackAt))
    if (problem) ctx.addIssue({ code: 'custom', message: problem, path: ['callbackAt'] })
  }
  if (!!d.windowStart !== !!d.windowEnd) {
    ctx.addIssue({ code: 'custom', message: 'required', path: [d.windowStart ? 'windowEnd' : 'windowStart'] })
  } else if (d.windowStart && d.windowEnd && d.windowEnd <= d.windowStart) {
    ctx.addIssue({ code: 'custom', message: 'windowOrder', path: ['windowEnd'] })
  }
}

const isoDateTime = z.iso.datetime({ offset: true, error: 'invalid' })

/** The create fields without cross-field rules, for forms that reshape them (date + time inputs). */
export const createServiceRequestBase = z.strictObject({
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
  tags: tagsSchema.default([]),
  callbackAt: z.preprocess(emptyToUndefined, isoDateTime.optional()),
  windowStart: z.preprocess(emptyToUndefined, hhmm.optional()),
  windowEnd: z.preprocess(emptyToUndefined, hhmm.optional()),
})
export const createServiceRequestSchema = createServiceRequestBase.superRefine(checkCallback)
export type CreateServiceRequestInput = z.infer<typeof createServiceRequestSchema>

/** In-place edits from the list view and the request panel. null clears a callback. */
export const updateServiceRequestSchema = z
  .strictObject({
    version: z.number().int().min(0),
    priority: z.enum(SR_PRIORITIES).optional(),
    assignedTo: staffIdSchema.optional(),
    tags: tagsSchema.optional(),
    callbackAt: isoDateTime.nullable().optional(),
    windowStart: hhmm.nullable().optional(),
    windowEnd: hhmm.nullable().optional(),
  })
  .superRefine(checkCallback)

// ── Resolution, CSAT, quality ────────────────────────────────────────────────

export const csatSchema = z
  .strictObject({
    rating: z.number().int().min(1, 'invalid').max(5, 'invalid').optional(),
    declined: z.boolean().default(false),
    comment: z.preprocess(emptyToUndefined, z.string().trim().max(500, 'remarksLength').optional()),
  })
  .refine((c) => c.declined || c.rating !== undefined, { error: 'csatRequired', path: ['rating'] })

export const csatUpdateSchema = z.strictObject({ version: z.number().int().min(0), csat: csatSchema })

export const qualitySchema = z
  .strictObject({
    version: z.number().int().min(0),
    score: z
      .number()
      .min(0.5, 'qualityStep')
      .max(5, 'qualityStep')
      .refine((n) => Number.isInteger(n * 2), 'qualityStep'),
    note: z.preprocess(emptyToUndefined, z.string().trim().max(500, 'remarksLength').optional()),
  })
  .refine((q) => q.score >= 3 || (q.note?.length ?? 0) >= 10, {
    error: 'qualityNoteRequired',
    path: ['note'],
  })

export const statusChangeSchema = z
  .strictObject({
    status: z.enum(SR_STATUS),
    /** Rich text (HTML); the server cleans it before saving. */
    resolutionNotes: z.preprocess(emptyToUndefined, z.string().max(20_000, 'resolutionLength').optional()),
    csat: csatSchema.optional(),
    version: z.number().int().min(0),
  })
  .superRefine((d, ctx) => {
    if (d.status !== 'resolved') return
    const len = richTextTextLength(d.resolutionNotes ?? '')
    if (len < 10) ctx.addIssue({ code: 'custom', message: 'resolutionRequired', path: ['resolutionNotes'] })
    else if (len > 2000)
      ctx.addIssue({ code: 'custom', message: 'resolutionLength', path: ['resolutionNotes'] })
    // Mandatory on resolve, with "Customer declined" a valid answer (FRS open question 7).
    if (!d.csat) ctx.addIssue({ code: 'custom', message: 'csatRequired', path: ['csat', 'rating'] })
  })

export const commentSchema = z.strictObject({
  text: z.string().trim().min(1, 'commentLength').max(1000, 'commentLength'),
})

export const SR_QUEUES = ['mine', 'branch', 'all'] as const

/** "a,b,c" in a query string → ['a','b','c']. */
const csvList = <T extends z.ZodType>(item: T) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v ? v.split(',') : undefined),
    z.array(item).max(20).optional(),
  )

const filters = {
  queue: z.enum(SR_QUEUES).default('mine'),
  categories: csvList(z.string().regex(/^[a-z_]{2,40}$/, 'invalid')),
  tags: csvList(tag),
  priority: z.preprocess(emptyToUndefined, z.enum(SR_PRIORITIES).optional()),
  q: z.preprocess(emptyToUndefined, z.string().trim().min(2, 'invalid').max(40).optional()),
}

/** One board column: cursor-paginated, newest first. */
export const boardQuery = cursorQuery.extend({ status: z.enum(SR_STATUS), ...filters })

export const SR_SORTS = ['createdAt', 'slaDueAt', 'priority', 'srNo', 'status'] as const

/** List view: page-number pagination with filters. */
export const srListQuery = offsetQuery.extend({
  /** One status or several: status=open,in_progress */
  status: csvList(z.enum(SR_STATUS)),
  ...filters,
})
