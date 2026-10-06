/**
 * Session tokens (OWASP A07).
 *
 * A signed JWT in the `__Host-sid` cookie: httpOnly (scripts can't read it), Secure,
 * SameSite=Strict (not sent on cross-site requests). The token expires after the idle
 * timeout and is re-issued as the user works (sliding), but never past the absolute limit.
 * Revocation: a per-user `tokenVersion` (password change, deactivation) and a per-session
 * denylist for sign-out.
 */
import jwt from 'jsonwebtoken'
import type { Response } from 'express'
import type { Config } from '../config.ts'
import { randomToken } from './crypto.ts'

export const SESSION_COOKIE = '__Host-sid'
const ISSUER = 'csm-playground'
const AUDIENCE = 'csm-web'
/** Re-issue the sliding token at most once a minute. */
const REFRESH_AFTER_SECONDS = 60

export interface SessionClaims {
  /** Staff ID. */
  sub: string
  /** Session id: binds the CSRF token and is what sign-out revokes. */
  sid: string
  /** The user's tokenVersion when the session was issued. */
  tv: number
  /** Absolute expiry, epoch seconds. */
  abs: number
  /** "Remember this device": persistent cookie instead of a browser-session cookie. */
  rem: boolean
  iat: number
  exp: number
}

const now = () => Math.floor(Date.now() / 1000)

/** Starts a new session for a user and sets its cookie. Returns the claims. */
export function startSession(
  res: Response,
  config: Config,
  user: { staffId: string; tokenVersion: number },
  remember: boolean,
): SessionClaims {
  const abs = now() + config.SESSION_ABSOLUTE_HOURS * 3600
  return writeSession(res, config, {
    sub: user.staffId,
    sid: randomToken(18),
    tv: user.tokenVersion,
    abs,
    rem: remember,
  })
}

/** Re-signs an existing session with a fresh idle expiry (capped at the absolute expiry). */
export function refreshSession(res: Response, config: Config, claims: SessionClaims): SessionClaims {
  return writeSession(res, config, {
    sub: claims.sub,
    sid: claims.sid,
    tv: claims.tv,
    abs: claims.abs,
    rem: claims.rem,
  })
}

/** True when the token is old enough that it should be re-issued on this request. */
export const shouldRefresh = (claims: SessionClaims) => now() - claims.iat >= REFRESH_AFTER_SECONDS

function writeSession(
  res: Response,
  config: Config,
  claims: Pick<SessionClaims, 'sub' | 'sid' | 'tv' | 'abs' | 'rem'>,
): SessionClaims {
  const exp = Math.min(now() + config.SESSION_IDLE_MINUTES * 60, claims.abs)
  const token = jwt.sign({ ...claims, exp }, config.JWT_SECRET, {
    algorithm: 'HS256',
    issuer: ISSUER,
    audience: AUDIENCE,
  })
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    ...(claims.rem ? { maxAge: (claims.abs - now()) * 1000 } : {}),
  })
  return { ...claims, iat: now(), exp }
}

/** Verifies a session token. Returns null for anything invalid or expired. */
export function verifySession(token: string | undefined, config: Config): SessionClaims | null {
  if (!token) return null
  try {
    const claims = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    }) as SessionClaims
    if (typeof claims.sub !== 'string' || typeof claims.sid !== 'string' || claims.abs < now()) return null
    return claims
  } catch {
    return null
  }
}

/** Removes the session cookie. */
export function clearSession(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: true, sameSite: 'strict', path: '/' })
}
