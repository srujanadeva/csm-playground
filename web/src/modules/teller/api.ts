// API calls for the Phase 5 counter features: token queue, cut-off, customer withdrawal codes and
// the branch activity feed.
import type {
  CutoffInfo,
  LobbyDTO,
  QueueStateDTO,
  TellerEventDTO,
  TokenDTO,
  WithdrawalOtpDTO,
} from '@csm/shared'
import { api } from '../../api/client.ts'

export const getQueue = () => api<QueueStateDTO>('/teller/queue')
export const queueAction = (action: 'call-next' | 'recall' | 'skip' | 'serve') =>
  api<QueueStateDTO>(`/teller/queue/${action}`, { method: 'POST' })
export const issueToken = () => api<TokenDTO>('/teller/queue/tokens', { method: 'POST' })
export const getLobby = () => api<LobbyDTO>('/teller/queue/lobby')

export const getCutoff = () => api<CutoffInfo>('/teller/cutoff')

/** Sends the customer a code for a withdrawal above ₹25,000 (amount in paise). */
export const startWithdrawalOtp = (accountNo: string, amount: number) =>
  api<WithdrawalOtpDTO>('/teller/withdrawal-otp', { method: 'POST', body: { accountNo, amount } })
export const resendWithdrawalOtp = (challengeId: string) =>
  api<WithdrawalOtpDTO>('/teller/withdrawal-otp/resend', { method: 'POST', body: { challengeId } })
export const verifyWithdrawalOtp = (challengeId: string, code: string) =>
  api<{ otpToken: string }>('/teller/withdrawal-otp/verify', { method: 'POST', body: { challengeId, code } })

export const getFeed = () => api<{ items: TellerEventDTO[] }>('/teller/feed').then((r) => r.items)
