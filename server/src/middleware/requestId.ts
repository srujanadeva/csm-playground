import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'

// Accepts a caller's X-Request-Id only if it looks like an id (so it can't inject into logs),
// otherwise makes a new one. Echoed back so testers can match a response to a log line.
const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id')
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID()
  res.setHeader('X-Request-Id', req.id)
  next()
}
