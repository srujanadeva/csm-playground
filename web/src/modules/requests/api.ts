// API calls for the Request board's Phase 4 edits: in-place changes, CSAT and quality scores.
import type { ServiceRequestDetail, SrPriority } from '@csm/shared'
import { api } from '../../api/client.ts'

export interface RequestPatch {
  priority?: SrPriority
  assignedTo?: string
  tags?: string[]
  callbackAt?: string | null
  windowStart?: string | null
  windowEnd?: string | null
}

/** PATCH /service-requests/:srNo with the version the caller last saw. */
export const updateRequest = (srNo: string, version: number, patch: RequestPatch) =>
  api<ServiceRequestDetail>(`/service-requests/${srNo}`, { method: 'PATCH', body: { version, ...patch } })

export interface CsatInput {
  rating?: number
  declined: boolean
  comment?: string
}

/** Records the customer's rating on a resolved request. */
export const saveCsat = (srNo: string, version: number, csat: CsatInput) =>
  api<ServiceRequestDetail>(`/service-requests/${srNo}/csat`, { method: 'POST', body: { version, csat } })

/** A supervisor's quality score (half stars). */
export const saveQuality = (srNo: string, version: number, score: number, note: string) =>
  api<ServiceRequestDetail>(`/service-requests/${srNo}/quality`, {
    method: 'POST',
    body: { version, score, ...(note.trim() ? { note: note.trim() } : {}) },
  })
