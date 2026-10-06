import { z } from 'zod'

export const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'Must be a 24-character id')

/** Page-number pagination for tables. `pageSize` is capped again per screen by the server. */
export const offsetQuery = z.strictObject({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z
    .string()
    .regex(/^-?[a-zA-Z.]{1,40}$/, 'Use a field name, optionally prefixed with - for descending')
    .optional(),
})
export type OffsetQuery = z.infer<typeof offsetQuery>

/** Cursor pagination for feeds that only grow (audit log, comments, board columns). */
export const cursorQuery = z.strictObject({
  cursor: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,200}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
export type CursorQuery = z.infer<typeof cursorQuery>

export interface OffsetPage<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export interface CursorPage<T> {
  items: T[]
  nextCursor: string | null
}

/** RFC 9457 (formerly 7807) problem details, the body of every error response. */
export interface Problem {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
  requestId?: string
  errors?: { path: string; code?: string; message: string }[]
  /** Machine-readable reason, e.g. "account_locked", "password_change_required", "stale_version". */
  code?: string
  attemptsLeft?: number
}

/** Search text: trimmed, length-capped, so it can't be used for expensive regex scans. */
export const searchText = z.string().trim().min(1).max(60)
