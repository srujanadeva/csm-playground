/**
 * Sign-in, sign-out and password changes (OWASP A07).
 *
 * Account enumeration: unknown staff IDs go through the same bcrypt work and the same
 * attempt counting as real ones, so responses and timing don't reveal which IDs exist.
 */
import type { Request, Response } from 'express'
import type { MeResponse } from '@csm/shared'
import type { Config } from '../../config.ts'
import { audit } from '../../lib/audit.ts'
import { unauthorized, validationFailed } from '../../lib/errors.ts'
import { hashPassword, verifyPassword } from '../../lib/password.ts'
import { clearSession, startSession } from '../../lib/session.ts'
import { authContextFor } from '../../middleware/auth.ts'
import { passwordProblem } from './passwordPolicy.ts'
import { RevokedSessionModel } from './revokedSession.model.ts'
import { StaffUserModel } from './staffUser.model.ts'

// A real bcrypt hash of a random string, compared against for unknown users.
const DUMMY_HASH = await hashPassword(`dummy-${Math.random()}`)

/** Failure counts for staff IDs that don't exist, so they behave like real accounts. */
const unknownFailures = new Map<string, { count: number; until: number }>()
const UNKNOWN_TTL_MS = 30 * 60_000

const invalidCredentials = (attemptsLeft: number) =>
  unauthorized(
    attemptsLeft === 1
      ? 'Staff ID or password is incorrect. 1 attempt left before the account is locked.'
      : `Staff ID or password is incorrect. ${attemptsLeft} attempts left before the account is locked.`,
    { code: 'invalid_credentials', attemptsLeft },
  )
const accountLocked = () =>
  unauthorized('This account is locked after too many failed sign-ins. Ask an administrator to unlock it.', {
    code: 'account_locked',
    attemptsLeft: 0,
  })

/** Checks credentials, applies lockout, and on success starts a session and sets `req.auth`. */
export async function login(
  req: Request,
  res: Response,
  config: Config,
  input: { staffId: string; password: string; remember: boolean },
): Promise<void> {
  const user = await StaffUserModel.findOne({ staffId: input.staffId }).select('+passwordHash')
  const threshold = config.LOCKOUT_THRESHOLD
  const fail = (outcome: 'failure' | 'denied', action: string) =>
    audit(
      {
        category: 'security',
        action,
        outcome,
        actor: input.staffId,
        entityType: 'staffUser',
        entityId: input.staffId,
      },
      req,
    )

  if (!user || user.status === 'deactivated') {
    await verifyPassword(input.password, DUMMY_HASH)
    const now = Date.now()
    const entry = unknownFailures.get(input.staffId)
    const count = (entry && entry.until > now ? entry.count : 0) + 1
    unknownFailures.set(input.staffId, { count, until: now + UNKNOWN_TTL_MS })
    await fail('failure', 'auth.login.failed')
    throw count >= threshold ? accountLocked() : invalidCredentials(threshold - count)
  }

  if (user.status === 'locked') {
    await verifyPassword(input.password, DUMMY_HASH)
    await fail('denied', 'auth.login.locked')
    throw accountLocked()
  }

  if (!(await verifyPassword(input.password, user.passwordHash))) {
    user.failedLogins += 1
    if (user.failedLogins >= threshold) {
      user.status = 'locked'
      user.lockedUntil = null
      await user.save()
      await fail('denied', 'auth.account.locked')
      throw accountLocked()
    }
    await user.save()
    await fail('failure', 'auth.login.failed')
    throw invalidCredentials(threshold - user.failedLogins)
  }

  user.failedLogins = 0
  user.lastLoginAt = new Date()
  await user.save()
  const claims = startSession(res, config, user, input.remember)
  req.sessionId = claims.sid
  req.auth = await authContextFor(user, claims)
  await audit(
    {
      category: 'security',
      action: 'auth.login',
      actor: user.staffId,
      entityType: 'staffUser',
      entityId: user.staffId,
    },
    req,
  )
}

/** Ends this session: denylists its id until it would have expired, and clears the cookie. */
export async function logout(req: Request, res: Response): Promise<void> {
  if (req.auth) {
    const { sid, abs } = req.auth.session
    await RevokedSessionModel.updateOne(
      { sid },
      { $setOnInsert: { sid, expiresAt: new Date(abs * 1000) } },
      { upsert: true },
    )
    await audit({ category: 'security', action: 'auth.logout', actor: req.auth.user.staffId }, req)
  }
  clearSession(res)
}

/** Builds the /auth/me response for the signed-in user. */
export async function me(req: Request, config: Config): Promise<MeResponse> {
  const { user, session, permissions, nav, screens } = req.auth!
  return {
    user: {
      staffId: user.staffId,
      name: user.name,
      roleKey: user.roleKey,
      branchCode: user.branchCode,
      preferredLanguage: user.preferredLanguage,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : null,
    },
    permissions,
    nav,
    screens,
    session: {
      idleTimeoutSeconds: config.SESSION_IDLE_MINUTES * 60,
      expiresAt: new Date(session.exp * 1000).toISOString(),
      permVersion: user.permVersion,
    },
  }
}

/**
 * Changes the signed-in user's password. Other sessions are signed out (tokenVersion bump);
 * this one continues with a new session, and `req.auth` is updated to match.
 */
export async function changePassword(
  req: Request,
  res: Response,
  config: Config,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  const user = await StaffUserModel.findOne({ staffId: req.auth!.user.staffId }).select('+passwordHash')
  if (!user) throw unauthorized()
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    await audit(
      { category: 'security', action: 'auth.password.change', outcome: 'failure', actor: user.staffId },
      req,
    )
    throw validationFailed([
      { path: 'currentPassword', code: 'invalid', message: 'Your current password is incorrect.' },
    ])
  }
  const problem = passwordProblem(input.newPassword, user.staffId, user.name)
  if (problem) {
    throw validationFailed([
      {
        path: 'newPassword',
        code: problem,
        message:
          problem === 'passwordBreached'
            ? 'This password is too common. Choose another.'
            : "Don't include your staff ID or name in the password.",
      },
    ])
  }
  user.passwordHash = await hashPassword(input.newPassword)
  user.mustChangePassword = false
  user.passwordChangedAt = new Date()
  user.tokenVersion += 1
  await user.save()
  await RevokedSessionModel.updateOne(
    { sid: req.auth!.session.sid },
    { $setOnInsert: { sid: req.auth!.session.sid, expiresAt: new Date(req.auth!.session.abs * 1000) } },
    { upsert: true },
  )
  const claims = startSession(res, config, user, req.auth!.session.rem)
  req.sessionId = claims.sid
  req.auth = await authContextFor(user, claims)
  await audit({ category: 'security', action: 'auth.password.change', actor: user.staffId }, req)
}

/** Saves the user's interface language. */
export async function setLanguage(req: Request, language: 'en' | 'kn'): Promise<void> {
  await StaffUserModel.updateOne(
    { staffId: req.auth!.user.staffId },
    { $set: { preferredLanguage: language } },
  )
}
