/**
 * KYC helpers for onboarding: the simulated ID-card reader (results fixed per sample image, see
 * fixtures/ocr.ts) and e-KYC sessions, which the mock provider (../../mockProvider) completes.
 */
import { createHash, randomBytes } from 'node:crypto'
import type { Request } from 'express'
import {
  OCR_LOW_CONFIDENCE,
  type EkycResultDTO,
  type EkycSessionDTO,
  type EkycSimulation,
  type OcrResultDTO,
} from '@csm/shared'
import type { Config } from '../../config.ts'
import { audit } from '../../lib/audit.ts'
import { randomToken } from '../../lib/crypto.ts'
import { AppError, badRequest, conflict, notFound } from '../../lib/errors.ts'
import { isoDay } from '../../lib/query.ts'
import { sniffMime } from '../../lib/uploads.ts'
import { branchScope } from '../../middleware/auth.ts'
import { OCR_FIXTURES } from '../../fixtures/ocr.ts'
import { CustomerModel } from '../customers/customer.model.ts'
import { EkycSessionModel } from './ekycSession.model.ts'

const SESSION_MINUTES = 15

// ── OCR ──────────────────────────────────────────────────────────────────────

/**
 * Reads an ID card image.
 * @param file The uploaded JPEG or PNG.
 * @returns Each recognised field with its confidence; low-confidence or empty fields are flagged.
 */
export function readCard(file: Express.Multer.File | undefined): OcrResultDTO {
  if (!file) {
    throw badRequest('Choose a file to upload.', [
      { path: 'file', code: 'required', message: 'Choose a file.' },
    ])
  }
  const mime = sniffMime(file.buffer)
  if (mime !== 'image/jpeg' && mime !== 'image/png') {
    throw badRequest('Upload a JPG or PNG photo of the card.', [
      { path: 'file', code: 'invalid', message: 'Use JPG or PNG.' },
    ])
  }
  const hit = OCR_FIXTURES[createHash('sha256').update(file.buffer).digest('hex')]
  if (!hit) {
    throw new AppError(
      422,
      'Unreadable',
      "We couldn't read this card. Enter the details by hand.",
      undefined,
      {
        code: 'ocr_unreadable',
      },
    )
  }
  return {
    documentType: hit.documentType,
    fields: hit.fields.map((f) => ({ ...f, flagged: !f.value || f.confidence < OCR_LOW_CONFIDENCE })),
  }
}

// ── e-KYC ────────────────────────────────────────────────────────────────────

/** The app origin the provider may post its result to: the caller's, if it is a known app origin. */
function parentOrigin(req: Request, config: Config): string {
  const origin = req.get('origin')
  return origin && config.CORS_ORIGINS.includes(origin) ? origin : config.CORS_ORIGINS[0]!
}

/**
 * Starts an e-KYC check for an onboarding draft.
 * @returns Where to point the iframe, and the only origin whose messages count.
 */
export async function startEkyc(req: Request, customerRef: string, config: Config): Promise<EkycSessionDTO> {
  const customer = await CustomerModel.findOne({ draftNo: customerRef, ...branchScope(req) }).lean()
  if (!customer) throw notFound('Customer not found.')
  if (customer.status !== 'draft')
    throw conflict('e-KYC runs during onboarding, before the customer is submitted.')
  const p = customer.personal ?? ({} as NonNullable<typeof customer.personal>)
  const sessionId = randomToken(24)
  await EkycSessionModel.create({
    sessionId,
    customerRef,
    branchCode: customer.branchCode,
    createdBy: req.auth!.user.staffId,
    expectedName: [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' '),
    expectedDob: isoDay(p.dob) ?? '',
    expiresAt: new Date(Date.now() + SESSION_MINUTES * 60_000),
  })
  const url = new URL('/ekyc', config.MOCK_PROVIDER_ORIGIN)
  url.searchParams.set('session', sessionId)
  url.searchParams.set('parent', parentOrigin(req, config))
  return {
    sessionId,
    providerUrl: url.toString(),
    providerOrigin: new URL(config.MOCK_PROVIDER_ORIGIN).origin,
  }
}

function toResult(s: Record<string, unknown>): EkycResultDTO {
  return {
    sessionId: s.sessionId as string,
    status: s.status as EkycResultDTO['status'],
    reference: (s.reference as string) ?? null,
    verifiedName: (s.verifiedName as string) ?? null,
    verifiedDob: (s.verifiedDob as string) ?? null,
    reason: (s.reason as string) ?? null,
    completedAt: s.completedAt ? (s.completedAt as Date).toISOString() : null,
  }
}

/** The outcome of a session, read from the server rather than trusted from the page's message. */
export async function ekycResult(req: Request, sessionId: string): Promise<EkycResultDTO> {
  const s = await EkycSessionModel.findOne({ sessionId, ...branchScope(req) }).lean()
  if (!s) throw notFound('e-KYC session not found.')
  return toResult(s)
}

/** A pending, unexpired session for the provider page, or null. */
export async function openSession(sessionId: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(sessionId)) return null
  const s = await EkycSessionModel.findOne({ sessionId, status: 'pending' }).lean()
  return s && s.expiresAt > new Date() ? s : null
}

/** "Kavya Hegde" → "Kavya R Hegde": what the registry "holds" in the name-mismatch simulation. */
function misspell(name: string): string {
  const parts = name.split(' ')
  return parts.length > 1 ? [parts[0], 'R', ...parts.slice(1)].join(' ') : `${name} R`
}

/** "1994-03-12" → "1995-03-12". */
const shiftYear = (dob: string) => (dob ? `${Number(dob.slice(0, 4)) + 1}${dob.slice(4)}` : '')

/**
 * Finishes a session from the provider page.
 * @param outcome A simulated result, or 'cancel' when the customer backed out.
 * @returns The stored result, or null if the session is no longer open.
 */
export async function completeSession(
  sessionId: string,
  outcome: EkycSimulation | 'cancel',
): Promise<EkycResultDTO | null> {
  const s = await openSession(sessionId)
  if (!s) return null
  const update: Record<string, unknown> = { completedAt: new Date() }
  if (outcome === 'cancel') {
    update.status = 'cancelled'
  } else if (outcome === 'not_found') {
    Object.assign(update, {
      status: 'not_verified',
      simulation: outcome,
      reason: 'No identity record matches these details.',
    })
  } else {
    Object.assign(update, {
      status: 'verified',
      simulation: outcome,
      reference: `EKYC-${randomBytes(4).toString('hex').toUpperCase()}`,
      verifiedName: outcome === 'name_mismatch' ? misspell(s.expectedName) : s.expectedName,
      verifiedDob: outcome === 'dob_mismatch' ? shiftYear(s.expectedDob) : s.expectedDob,
    })
  }
  // Only a still-pending session is completed, so a replayed form post changes nothing.
  const done = await EkycSessionModel.findOneAndUpdate({ sessionId, status: 'pending' }, update, {
    returnDocument: 'after',
  }).lean()
  if (!done) return null
  if (done.status === 'verified') {
    await CustomerModel.updateOne(
      { draftNo: done.customerRef },
      {
        'kyc.ekyc': {
          reference: done.reference,
          verifiedName: done.verifiedName,
          verifiedDob: done.verifiedDob ? new Date(`${done.verifiedDob}T00:00:00Z`) : undefined,
          verifiedAt: done.completedAt,
        },
      },
    )
  }
  await audit({
    category: 'data',
    action: `customer.ekyc.${done.status}`,
    actor: done.createdBy,
    entityType: 'customer',
    entityId: done.customerRef,
  })
  return toResult(done)
}
