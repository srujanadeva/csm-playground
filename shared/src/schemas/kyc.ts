/**
 * KYC helpers used during onboarding: reading an ID card (OCR) and verifying identity with the
 * external e-KYC provider, which runs in an iframe on its own origin and reports back by postMessage.
 */
import { z } from 'zod'

// ── OCR ──────────────────────────────────────────────────────────────────────

export const OCR_FIELDS = ['fullName', 'idNumber', 'dateOfBirth', 'city', 'expiryDate'] as const
export type OcrFieldKey = (typeof OCR_FIELDS)[number]

/** Fields read with less confidence than this must be confirmed by the user. */
export const OCR_LOW_CONFIDENCE = 0.8

export interface OcrFieldDTO {
  key: OcrFieldKey
  /** "" when the card doesn't show the field. */
  value: string
  /** 0–1. */
  confidence: number
  flagged: boolean
}

export interface OcrResultDTO {
  documentType: string
  fields: OcrFieldDTO[]
}

// ── e-KYC ────────────────────────────────────────────────────────────────────

export const EKYC_STATUS = ['pending', 'verified', 'not_verified', 'cancelled'] as const
export type EkycStatus = (typeof EKYC_STATUS)[number]

/** What the provider's simulator lets the customer "do" (practice only). */
export const EKYC_SIMULATIONS = ['match', 'name_mismatch', 'dob_mismatch', 'not_found'] as const
export type EkycSimulation = (typeof EKYC_SIMULATIONS)[number]

/** The postMessage type the provider sends to the app when it finishes. */
export const EKYC_RESULT_MESSAGE = 'csm-ekyc-result'

export const ekycStartSchema = z.strictObject({
  customerRef: z.string().regex(/^D-[0-9]{4}-[0-9]{5}$/, 'invalid'),
})

export interface EkycSessionDTO {
  sessionId: string
  /** The provider page to show in the iframe. */
  providerUrl: string
  /** Messages from any other origin are ignored. */
  providerOrigin: string
}

export interface EkycResultDTO {
  sessionId: string
  status: EkycStatus
  reference: string | null
  verifiedName: string | null
  verifiedDob: string | null
  reason: string | null
  completedAt: string | null
}

/** The e-KYC result stored on a customer once verified. */
export interface EkycOnCustomer {
  reference: string
  verifiedName: string
  verifiedDob: string
  verifiedAt: string
}
