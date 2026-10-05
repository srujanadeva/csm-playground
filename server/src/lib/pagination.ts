import { Types } from 'mongoose'
import { badRequest } from './errors.ts'

// Shared pagination helpers so no list endpoint can return an unbounded result.

/** Clamps a requested page size to the screen's configured maximum. */
export function clampPageSize(requested: number, max: number): number {
  return Math.max(1, Math.min(requested, max))
}

/** Turns "-createdAt" into { createdAt: -1 }, allowing only whitelisted fields. */
export function parseSort(
  sort: string | undefined,
  allowed: readonly string[],
  fallback: Record<string, 1 | -1>,
): Record<string, 1 | -1> {
  if (!sort) return fallback
  const desc = sort.startsWith('-')
  const field = desc ? sort.slice(1) : sort
  if (!allowed.includes(field)) {
    throw badRequest(`You can't sort by "${field}".`, [
      { path: 'sort', message: `Use one of: ${allowed.join(', ')}` },
    ])
  }
  // _id as a tie-breaker keeps page boundaries stable when values repeat.
  return { [field]: desc ? -1 : 1, _id: desc ? -1 : 1 }
}

/** Cursors are opaque to clients: base64url of the last ObjectId returned. */
export function encodeCursor(id: Types.ObjectId): string {
  return Buffer.from(id.toHexString(), 'hex').toString('base64url')
}

export function decodeCursor(cursor: string): Types.ObjectId {
  const hex = Buffer.from(cursor, 'base64url').toString('hex')
  if (!/^[a-f0-9]{24}$/.test(hex)) throw badRequest('That cursor is not valid.')
  return new Types.ObjectId(hex)
}

/**
 * Newest-first cursor page: fetches one extra row to know whether another page exists.
 * Callers pass a query already filtered by `_id < cursor` via `cursorFilter`.
 */
export function cursorFilter(cursor: string | undefined): Record<string, unknown> {
  return cursor ? { _id: { $lt: decodeCursor(cursor) } } : {}
}

export function toCursorPage<T extends { _id: Types.ObjectId }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const last = items.at(-1)
  return { items, nextCursor: hasMore && last ? encodeCursor(last._id) : null }
}
