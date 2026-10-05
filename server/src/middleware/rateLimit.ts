import { ipKeyGenerator, rateLimit } from 'express-rate-limit'
import { tooManyRequests } from '../lib/errors.ts'

// Rate limits per route class (OWASP A06/A07). Responses carry the standard RateLimit
// headers so testers can assert on them. Factories, so each app instance has its own counters.

const handler = () => {
  throw tooManyRequests()
}

/** Every API call: generous, stops scripted flooding. */
export const createApiLimiter = (limit = 600) =>
  rateLimit({ windowMs: 60_000, limit, standardHeaders: 'draft-8', legacyHeaders: false, handler })

/** Sign-in and password endpoints, keyed by IP and staff ID together. */
export const createAuthLimiter = (limit = 20) =>
  rateLimit({
    windowMs: 15 * 60_000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const body = req.body as { staffId?: unknown } | undefined
      const staffId = typeof body?.staffId === 'string' ? body.staffId.toLowerCase().slice(0, 20) : ''
      return `${ipKeyGenerator(req.ip ?? '')}|${staffId}`
    },
    handler,
  })
