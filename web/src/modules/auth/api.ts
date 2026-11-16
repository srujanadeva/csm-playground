// API calls for the signed-out flows: password reset and access requests.
import type { AccessRequestInput, ResetChallenge } from '@csm/shared'
import { api } from '../../api/client.ts'

export const startReset = (staffId: string) =>
  api<ResetChallenge>('/auth/password-reset', { method: 'POST', body: { staffId } })

export const resendReset = (challengeId: string) =>
  api<ResetChallenge>('/auth/password-reset/resend', { method: 'POST', body: { challengeId } })

export const verifyReset = (challengeId: string, code: string) =>
  api<{ resetToken: string }>('/auth/password-reset/verify', { method: 'POST', body: { challengeId, code } })

export const completeReset = (body: { resetToken: string; newPassword: string; confirmPassword: string }) =>
  api<void>('/auth/password-reset/complete', { method: 'POST', body })

export const submitAccessRequest = (body: AccessRequestInput) =>
  api<{ requestNo: string }>('/access-requests', { method: 'POST', body })
