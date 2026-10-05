import type { RequestHandler, Response } from 'express'
import { forbidden } from '../lib/errors.ts'
import { hmac, randomToken, safeEqual } from '../lib/crypto.ts'

// CSRF protection (OWASP A01/A08), signed double-submit pattern:
//   1. GET /api/v1/auth/csrf sets a readable __Host-csrf cookie and returns the same token.
//   2. The SPA sends it back in the X-CSRF-Token header on every state-changing request.
//   3. The server checks header == cookie and that the token's signature is valid for the
//      current session, so a token planted by another site or session is useless.
// SameSite=Strict session cookies (phase 2) and the Origin check below are extra layers.

export const CSRF_COOKIE = '__Host-csrf'
export const CSRF_HEADER = 'x-csrf-token'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const binding = (sessionId: string | undefined) => sessionId ?? 'anonymous'

export function issueCsrfToken(res: Response, secret: string, sessionId?: string): string {
  const nonce = randomToken(24)
  const token = `${nonce}.${hmac(secret, `${nonce}|${binding(sessionId)}`)}`
  res.cookie(CSRF_COOKIE, token, { httpOnly: false, secure: true, sameSite: 'strict', path: '/' })
  return token
}

export function csrfProtection(secret: string, allowedOrigins: string[]): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next()

    const origin = req.get('origin')
    if (origin && !allowedOrigins.includes(origin)) {
      throw forbidden('This request came from a site that is not allowed.')
    }

    const header = req.get(CSRF_HEADER) ?? ''
    const cookie = (req.cookies as Record<string, string> | undefined)?.[CSRF_COOKIE] ?? ''
    const [nonce, signature] = header.split('.')
    const valid =
      !!nonce &&
      !!signature &&
      safeEqual(header, cookie) &&
      safeEqual(signature, hmac(secret, `${nonce}|${binding(req.sessionId)}`))
    if (!valid) {
      throw forbidden(
        'Missing or invalid CSRF token. Fetch one from /api/v1/auth/csrf and send it in X-CSRF-Token.',
      )
    }
    next()
  }
}
