// Issues and checks one-time codes. Rules: 6 digits, valid 5 minutes, resend after 30 s (at most
// 3 times), 5 wrong tries lock the challenge. Decoys (unknown users) behave the same but never pass.
import { randomInt } from 'node:crypto'
import { OTP_LENGTH } from '@csm/shared'
import { hmac, randomToken, safeEqual } from '../../lib/crypto.ts'
import { AppError, notFound, tooManyRequests } from '../../lib/errors.ts'
import { op } from '../../lib/query.ts'
import { ChallengeModel } from './challenge.model.ts'

export const OTP_TTL_MS = 5 * 60_000
export const RESEND_AFTER_MS = 30_000
export const MAX_RESENDS = 3
export const MAX_ATTEMPTS = 5
const TOKEN_TTL_MS = 10 * 60_000
const PURGE_AFTER_MS = 60 * 60_000

const newCode = () => String(randomInt(10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0')
const hashCode = (secret: string, id: string, code: string) => hmac(secret, `otp|${id}|${code}`)

/** A 400 with a validation-style code for the code field, so the form shows it inline. */
const codeProblem = (code: 'otpWrong' | 'otpExpired', extras: Record<string, unknown> = {}) =>
  new AppError(
    400,
    'Validation failed',
    code === 'otpWrong' ? 'That code is incorrect.' : 'This code has expired.',
    [
      {
        path: 'code',
        code,
        message: code === 'otpWrong' ? 'That code is incorrect.' : 'This code has expired.',
      },
    ],
    { code, ...extras },
  )

/**
 * Starts a challenge.
 * @param subject Who the code is for; '' makes a decoy that can never be verified.
 * @returns The challenge and the plain code to send (never stored).
 */
export async function issue(secret: string, purpose: string, subject: string) {
  const now = Date.now()
  const doc = new ChallengeModel({
    purpose,
    subject,
    codeHash: 'pending',
    expiresAt: new Date(now + OTP_TTL_MS),
    resendAt: new Date(now + RESEND_AFTER_MS),
    purgeAt: new Date(now + PURGE_AFTER_MS),
  })
  const code = newCode()
  doc.codeHash = hashCode(secret, String(doc._id), code)
  await doc.save()
  return { challenge: doc, code }
}

/** Loads a challenge for a purpose, or 404 (also for wrong-purpose ids). */
export async function load(id: string, purpose: string) {
  const doc = await ChallengeModel.findOne({ _id: id, purpose })
  if (!doc) throw notFound('This code request was not found. Start again.')
  return doc
}

/** Issues a fresh code on an existing challenge once the resend wait is over. */
export async function resend(secret: string, id: string, purpose: string) {
  const doc = await load(id, purpose)
  const now = Date.now()
  if (doc.verifiedAt) throw new AppError(409, 'Conflict', 'This code was already used.')
  if (doc.resends >= MAX_RESENDS)
    throw tooManyRequests('No more codes can be sent for this request. Start again.')
  if (doc.resendAt.getTime() > now) {
    throw new AppError(429, 'Too many requests', 'Wait before asking for another code.', undefined, {
      code: 'resend_too_soon',
      resendAt: doc.resendAt.toISOString(),
    })
  }
  const code = newCode()
  doc.set({
    codeHash: hashCode(secret, String(doc._id), code),
    expiresAt: new Date(now + OTP_TTL_MS),
    resendAt: new Date(now + RESEND_AFTER_MS),
    resends: doc.resends + 1,
    attempts: 0,
  })
  await doc.save()
  return { challenge: doc, code }
}

/**
 * Checks a code. On success marks the challenge verified and returns a single-use token for the
 * next step; failures count towards MAX_ATTEMPTS.
 */
export async function verify(secret: string, id: string, purpose: string, code: string) {
  const doc = await load(id, purpose)
  if (doc.verifiedAt) throw new AppError(409, 'Conflict', 'This code was already used.')
  if (doc.attempts >= MAX_ATTEMPTS) throw tooManyRequests('Too many wrong codes. Start again.')
  if (doc.expiresAt.getTime() <= Date.now()) throw codeProblem('otpExpired')
  const ok = !!doc.subject && safeEqual(doc.codeHash, hashCode(secret, String(doc._id), code))
  if (!ok) {
    doc.attempts += 1
    await doc.save()
    throw codeProblem('otpWrong', { attemptsLeft: MAX_ATTEMPTS - doc.attempts })
  }
  const token = randomToken(32)
  doc.set({
    verifiedAt: new Date(),
    tokenHash: hmac(secret, `token|${token}`),
    tokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  })
  await doc.save()
  return { challenge: doc, token }
}

/** Redeems a token from `verify` (once). Returns the challenge's subject. */
export async function redeem(secret: string, purpose: string, token: string): Promise<string> {
  const doc = await ChallengeModel.findOneAndUpdate(
    {
      purpose,
      tokenHash: hmac(secret, `token|${token}`),
      usedAt: null,
      tokenExpiresAt: op({ $gt: new Date() }),
    },
    { $set: { usedAt: new Date() } },
  )
  if (!doc)
    throw new AppError(400, 'Bad request', 'This reset link has expired. Start again.', undefined, {
      code: 'token_invalid',
    })
  return doc.subject
}
