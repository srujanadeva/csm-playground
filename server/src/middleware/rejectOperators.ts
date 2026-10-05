import type { RequestHandler } from 'express'
import { badRequest } from '../lib/errors.ts'

// NoSQL injection guard (OWASP A05). MongoDB treats keys starting with "$" as operators and
// dotted keys as paths, so a body like {"cif": {"$ne": null}} could widen a query. Requests
// carrying such keys are rejected outright rather than silently cleaned, so the caller sees
// why. Mongoose's sanitizeFilter and strict zod schemas are further layers behind this one.

const MAX_DEPTH = 20

function findBadKey(value: unknown, path: string, depth = 0): string | null {
  if (depth > MAX_DEPTH) return path
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findBadKey(value[i], `${path}[${i}]`, depth + 1)
      if (hit) return hit
    }
    return null
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const here = path ? `${path}.${key}` : key
      if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor') {
        return here
      }
      const hit = findBadKey(child, here, depth + 1)
      if (hit) return hit
    }
  }
  return null
}

export const rejectOperators: RequestHandler = (req, _res, next) => {
  for (const [part, value] of [
    ['query', req.query],
    ['body', req.body],
    ['params', req.params],
  ] as const) {
    // Query keys come from the raw string, e.g. "cif[$ne]" with the simple query parser.
    if (part === 'query') {
      const raw = Object.keys(value ?? {}).find((k) => k.includes('$') || k.includes('['))
      if (raw)
        throw badRequest('The request contains a field name that is not allowed.', [
          { path: raw, message: 'Not allowed' },
        ])
    }
    const bad = findBadKey(value, '')
    if (bad) {
      throw badRequest('The request contains a field name that is not allowed.', [
        { path: `${part}.${bad}`, message: 'Field names cannot start with $ or contain dots' },
      ])
    }
  }
  next()
}
