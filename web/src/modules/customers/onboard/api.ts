// API calls for the onboarding KYC helpers: OCR, e-KYC sessions, and photo/signature documents.
import type { DocumentDTO, EkycResultDTO, EkycSessionDTO, OcrResultDTO } from '@csm/shared'
import { api } from '../../../api/client.ts'
import { uploadFile } from '../../../api/upload.ts'

/** Sends an ID card image to the (simulated) reader. Throws ApiError code ocr_unreadable on 422. */
export const readCard = (file: File) => uploadFile<OcrResultDTO>('/kyc/ocr', file, {}, () => undefined)

/** Opens an e-KYC session for a draft; the result says where to point the iframe. */
export const startEkyc = (customerRef: string) =>
  api<EkycSessionDTO>('/kyc/ekyc/sessions', { method: 'POST', body: { customerRef } })

/** The stored outcome of a session (never taken from the provider's message itself). */
export const ekycResult = (sessionId: string) => api<EkycResultDTO>(`/kyc/ekyc/sessions/${sessionId}`)

/**
 * Uploads a captured photo or signature to a draft; it replaces the previous one of that kind.
 * @param image The JPEG/PNG blob from the camera or signature pad (or an uploaded file).
 */
export function uploadCapture(customerRef: string, kind: 'photo' | 'signature', image: Blob) {
  const type = image.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
  const file =
    image instanceof File
      ? image
      : new File([image], `${kind}.${type === 'image/jpeg' ? 'jpg' : 'png'}`, { type })
  return uploadFile<DocumentDTO>(`/customers/${customerRef}/documents`, file, { kind }, () => undefined)
}
