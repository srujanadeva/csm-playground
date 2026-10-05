import type { RequestHandler } from 'express'
import type { z } from 'zod'

// Validates one part of the request against a zod schema and stores the parsed result on
// `req.valid`. Express 5 recomputes req.query on every read, so handlers must read the
// validated copy rather than the raw one. A ZodError reaches the error handler as a 400.

type Part = 'body' | 'query' | 'params'

export function validate<S extends z.ZodType>(part: Part, schema: S): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.parse(req[part])
    req.valid = { ...req.valid, [part]: parsed }
    next()
  }
}
