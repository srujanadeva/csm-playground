/**
 * Authentication and authorisation middleware (OWASP A01, A07).
 *
 * - `loadSession` runs on every API request: if a valid session cookie is present it loads
 *   the user and their permissions onto `req.auth` and slides the idle timeout. It never
 *   rejects, so public routes keep working, and it runs before CSRF so the CSRF token can
 *   be bound to the session.
 * - `requireAuth` rejects requests without a session (401), and while a password change is
 *   pending, everything except the routes that let the user change it (403).
 * - `requireCapability` checks one capability on one screen; denials are audited.
 * - `requireAdmin` answers 404, so the admin API's existence isn't revealed to others.
 */
import type { Request, RequestHandler } from 'express'
import { can, type BranchCode, type Capability, type Language } from '@csm/shared'
import type { Config } from '../config.ts'
import { audit } from '../lib/audit.ts'
import { forbidden, notFound, unauthorized } from '../lib/errors.ts'
import {
  SESSION_COOKIE,
  clearSession,
  refreshSession,
  shouldRefresh,
  verifySession,
  type SessionClaims,
} from '../lib/session.ts'
import { accessFor } from '../modules/admin/access.ts'
import { StaffUserModel, type StaffUser } from '../modules/auth/staffUser.model.ts'
import { RevokedSessionModel } from '../modules/auth/revokedSession.model.ts'

/** Loads the session, if any, onto `req.auth`. Invalid or revoked sessions are cleared. */
export function loadSession(config: Config): RequestHandler {
  return async (req, res, next) => {
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE]
    const claims = verifySession(token, config)
    if (!claims) {
      if (token) clearSession(res)
      return next()
    }
    const [user, revoked] = await Promise.all([
      StaffUserModel.findOne({ staffId: claims.sub }).lean(),
      RevokedSessionModel.exists({ sid: claims.sid }),
    ])
    if (!user || revoked || user.status !== 'active' || user.tokenVersion !== claims.tv) {
      clearSession(res)
      return next()
    }
    const fresh = shouldRefresh(claims) ? refreshSession(res, config, claims) : claims
    req.sessionId = claims.sid
    req.auth = await authContextFor(user, fresh)
    next()
  }
}

type StaffUserLike = Pick<
  StaffUser,
  | 'staffId'
  | 'name'
  | 'roleKey'
  | 'branchCode'
  | 'preferredLanguage'
  | 'mustChangePassword'
  | 'lastLoginAt'
  | 'permVersion'
  | 'overrides'
> & { _id: unknown }

/** Builds `req.auth` for a user and session: who they are, what they can do, their menu. */
export async function authContextFor(
  user: StaffUserLike,
  session: SessionClaims,
): Promise<NonNullable<Request['auth']>> {
  const access = await accessFor(user)
  return {
    user: {
      id: String(user._id),
      staffId: user.staffId,
      name: user.name,
      roleKey: user.roleKey,
      branchCode: user.branchCode as BranchCode,
      preferredLanguage: user.preferredLanguage as Language,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt ?? null,
      permVersion: user.permVersion,
    },
    session,
    ...access,
  }
}

/**
 * Rejects requests without a signed-in user. Pass `{ allowPendingPasswordChange: true }` for
 * the few routes a user with a one-time password may still call.
 */
export function requireAuth(options: { allowPendingPasswordChange?: boolean } = {}): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw unauthorized('Your session has ended. Sign in again.', { code: 'session_expired' })
    if (req.auth.user.mustChangePassword && !options.allowPendingPasswordChange) {
      throw forbidden('Choose a new password before continuing.', { code: 'password_change_required' })
    }
    next()
  }
}

/** Requires one capability on one screen. Also implies requireAuth. */
export function requireCapability(screenKey: string, capability: Capability): RequestHandler {
  const authed = requireAuth()
  return (req, res, next) => {
    authed(req, res, () => {
      if (!can(req.auth!.permissions, screenKey, capability)) {
        void audit(
          {
            category: 'security',
            action: 'access.denied',
            outcome: 'denied',
            actor: req.auth!.user.staffId,
            entityType: 'screen',
            entityId: `${screenKey}:${capability}`,
          },
          req,
        )
        throw forbidden()
      }
      next()
    })
  }
}

/** Admin API guard: anyone without the admin role gets a plain 404. */
export const requireAdmin: RequestHandler = (req, res, next) => {
  requireAuth()(req, res, () => {
    if (req.auth!.user.roleKey !== 'admin')
      throw notFound(`No route for ${req.method} ${req.originalUrl.split('?')[0]}.`)
    next()
  })
}

/** Data scope: admins see every branch, everyone else only their own. */
export function branchScope(req: Request): Record<string, string> {
  const user = req.auth!.user
  return user.roleKey === 'admin' ? {} : { branchCode: user.branchCode }
}
