/**
 * Query helpers. Mongoose `sanitizeFilter` (see db.ts) neutralises every `$` operator in a
 * filter, including ones the server writes itself. `op()` marks an operator object as
 * built by the server, so it is kept; user input never goes through `op()`.
 */
import mongoose from 'mongoose'

/**
 * Marks a server-built operator object (e.g. { $regex }, { $in }) as trusted. Typed `any`
 * because Mongoose's strict filter types can't express a trusted operator object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function op(operators: Record<`$${string}`, unknown>): any {
  return mongoose.trusted(operators)
}

/** "2026-10-05" → start of that day (UTC). */
export const startOfDay = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`)
/** "2026-10-05" → end of that day (UTC). */
export const endOfDay = (isoDate: string) => new Date(`${isoDate}T23:59:59.999Z`)

/** Date → "YYYY-MM-DD", or undefined. */
export const isoDay = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : undefined)
