/**
 * Forgot password, in three steps: staff ID → 6-digit code (sent by SMS and e-mail, readable in
 * the dev inbox) → new password. Unknown or deactivated IDs get a decoy challenge that looks the
 * same and fails at the code step, so the flow never reveals which staff IDs exist (OWASP A07).
 */
import type { Request } from 'express'
import { validationMessage, type ResetChallenge, type ResetCompleteInput } from '@csm/shared'
import type { Config } from '../../config.ts'
import { audit } from '../../lib/audit.ts'
import { hmac } from '../../lib/crypto.ts'
import { AppError, validationFailed } from '../../lib/errors.ts'
import { hashPassword, verifyPassword } from '../../lib/password.ts'
import * as outbox from '../notifications/service.ts'
import * as otp from '../otp/service.ts'
import { passwordProblem } from './passwordPolicy.ts'
import { StaffUserModel } from './staffUser.model.ts'

const PURPOSE = 'password_reset'

/**
 * A stable, fake registered mobile for a staff ID (staff records don't hold one). Derived the same
 * way for unknown IDs, so the masked destination can't be used to tell real IDs apart.
 */
function registeredMobile(secret: string, staffId: string): string {
  const digits = BigInt(
    `0x${Buffer.from(hmac(secret, `mobile|${staffId}`), 'base64url')
      .toString('hex')
      .slice(0, 12)}`,
  )
  return `9${String(digits % 1_000_000_000n).padStart(9, '0')}`
}

const maskMobile = (m: string) => `+91 ${m[0]}•••• ••${m.slice(-2)}`
const maskEmail = (e: string) => {
  const [local = '', domain = ''] = e.split('@')
  return `${local.slice(0, 2)}••••@${domain}`
}

/** The destinations for a staff ID, real or not. */
function destinations(config: Config, staffId: string, email?: string | null) {
  return {
    mobile: registeredMobile(config.JWT_SECRET, staffId),
    email: email || `${staffId}@csmbank.test`,
  }
}

/** Sends the code by SMS and e-mail. */
async function sendCode(staffId: string, to: { mobile: string; email: string }, code: string) {
  await outbox.send({
    channel: 'sms',
    to: `+91 ${to.mobile}`,
    staffId,
    purpose: PURPOSE,
    subject: 'Password reset code',
    body: `CSM Bank: ${code} is your password reset code. It expires in 5 minutes. Never share it with anyone, including bank staff.`,
  })
  await outbox.send({
    channel: 'email',
    to: to.email,
    staffId,
    purpose: PURPOSE,
    subject: 'Your password reset code',
    body: `Use code ${code} to reset your CSM Playground password. The code expires in 5 minutes.\n\nIf you didn't ask for this, ignore this e-mail; your password stays the same.`,
  })
}

const view = (
  challenge: { _id: unknown; expiresAt: Date; resendAt: Date },
  to: { mobile: string; email: string },
): ResetChallenge => ({
  challengeId: String(challenge._id),
  expiresAt: challenge.expiresAt.toISOString(),
  resendAt: challenge.resendAt.toISOString(),
  sentTo: { sms: maskMobile(to.mobile), email: maskEmail(to.email) },
})

/** Step 1: issues a challenge (a decoy for unknown or deactivated IDs). */
export async function start(req: Request, config: Config, staffId: string): Promise<ResetChallenge> {
  const user = await StaffUserModel.findOne({ staffId }).lean()
  const real = !!user && user.status !== 'deactivated'
  const to = destinations(config, staffId, user?.email)
  const { challenge, code } = await otp.issue(config.JWT_SECRET, PURPOSE, real ? staffId : '')
  if (real) await sendCode(staffId, to, code)
  await audit(
    {
      category: 'security',
      action: 'auth.password.reset.requested',
      outcome: real ? 'success' : 'failure',
      actor: staffId,
      entityType: 'staffUser',
      entityId: staffId,
    },
    req,
  )
  return view(challenge, to)
}

/** Sends a new code on the same challenge (after the resend wait). */
export async function resend(config: Config, challengeId: string): Promise<ResetChallenge> {
  const { challenge, code } = await otp.resend(config.JWT_SECRET, challengeId, PURPOSE)
  // Decoys have no subject; show the destinations a real resend would have used.
  const subject = challenge.subject
  const user = subject ? await StaffUserModel.findOne({ staffId: subject }).lean() : null
  const to = destinations(config, subject || 'unknown', user?.email)
  if (subject) await sendCode(subject, to, code)
  return view(challenge, to)
}

/** Step 2: checks the code and returns a single-use reset token. */
export async function verify(config: Config, challengeId: string, code: string) {
  const { token } = await otp.verify(config.JWT_SECRET, challengeId, PURPOSE, code)
  return { resetToken: token }
}

/**
 * Step 3: sets the new password. Signs the user out everywhere (tokenVersion bump) and clears a
 * lockout, since proving control of the registered phone/e-mail is the point of the flow.
 */
export async function complete(req: Request, config: Config, input: ResetCompleteInput): Promise<void> {
  const staffId = await otp.redeem(config.JWT_SECRET, PURPOSE, input.resetToken)
  const user = await StaffUserModel.findOne({ staffId }).select('+passwordHash')
  if (!user || user.status === 'deactivated') {
    throw new AppError(400, 'Bad request', 'This reset link has expired. Start again.', undefined, {
      code: 'token_invalid',
    })
  }
  const problem = passwordProblem(input.newPassword, user.staffId, user.name)
  if (problem) {
    throw validationFailed([{ path: 'newPassword', code: problem, message: validationMessage(problem) }])
  }
  if (await verifyPassword(input.newPassword, user.passwordHash)) {
    throw validationFailed([
      { path: 'newPassword', code: 'passwordSame', message: validationMessage('passwordSame') },
    ])
  }
  const wasLocked = user.status === 'locked'
  user.set({
    passwordHash: await hashPassword(input.newPassword),
    mustChangePassword: false,
    passwordChangedAt: new Date(),
    tokenVersion: user.tokenVersion + 1,
    failedLogins: 0,
    ...(wasLocked ? { status: 'active', lockedUntil: null } : {}),
  })
  await user.save()
  await audit(
    {
      category: 'security',
      action: 'auth.password.reset',
      actor: staffId,
      entityType: 'staffUser',
      entityId: staffId,
      ...(wasLocked ? { changes: [{ field: 'status', from: 'locked', to: 'active' }] } : {}),
    },
    req,
  )
  await outbox.send({
    channel: 'email',
    to: destinations(config, staffId, user.email).email,
    staffId,
    purpose: 'password_changed',
    subject: 'Your password was changed',
    body: `The password for ${staffId} was reset just now. If this wasn't you, contact your branch administrator immediately.`,
  })
}
