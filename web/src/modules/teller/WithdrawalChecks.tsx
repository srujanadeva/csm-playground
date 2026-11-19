/**
 * Checks before paying out a withdrawal. Signature (FR-TEL-022): the specimen captured at onboarding is
 * shown beside the form, an image found by its alt text ("Specimen signature of …", plan §3, ALT),
 * and the teller ticks "Signature matches the withdrawal slip"; without a specimen the teller records
 * the ID document checked instead. Customer code (FR-TEL-024): above ₹25,000 the customer reads out a
 * code sent to their registered mobile (see the dev inbox); the six boxes have random ids (DYN).
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ID_TYPES, needsCustomerOtp, type AccountDTO, type WithdrawalOtpDTO } from '@csm/shared'
import { ApiError } from '../../api/client.ts'
import { useErrorText } from '../../components/Field.tsx'
import { Icon } from '../../components/Icon.tsx'
import { LocatorBadge } from '../../components/LocatorBadge.tsx'
import { OtpInput } from '../../components/inputs/OtpInput.tsx'
import { resendWithdrawalOtp, startWithdrawalOtp, verifyWithdrawalOtp } from './api.ts'

export interface WithdrawalCheckState {
  signatureMatched: boolean
  idChecked: string
  otpToken: string
}

export const EMPTY_CHECKS: WithdrawalCheckState = { signatureMatched: false, idChecked: '', otpToken: '' }

/** Whether the checks allow posting this withdrawal. */
export const checksDone = (account: AccountDTO, amount: number, c: WithdrawalCheckState) =>
  (account.hasSpecimen ? c.signatureMatched : !!c.idChecked) &&
  (!needsCustomerOtp('cash_withdrawal', amount) || !!c.otpToken)

/** Seconds until `iso`, ticking. */
function useSecondsUntil(iso: string | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!iso) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [iso])
  return iso ? Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000)) : 0
}

/** Signature and code checks for one withdrawal. */
export function WithdrawalChecks({
  account,
  amount,
  value,
  onChange,
  errors,
}: {
  account: AccountDTO
  /** Paise. */
  amount: number
  value: WithdrawalCheckState
  onChange: (v: WithdrawalCheckState) => void
  errors: Partial<Record<'signatureMatched' | 'idChecked' | 'otpToken', string>>
}) {
  const { t } = useTranslation('teller')
  const errorText = useErrorText()
  const [challenge, setChallenge] = useState<WithdrawalOtpDTO | null>(null)
  const [codeFor, setCodeFor] = useState<number | null>(null)
  const [code, setCode] = useState('')
  const [otpError, setOtpError] = useState('')
  const [busy, setBusy] = useState(false)
  const resendIn = useSecondsUntil(challenge?.resendAt ?? null)
  const needsOtp = needsCustomerOtp('cash_withdrawal', amount)
  // The code is for one amount; changing it means a new code (the server checks this too).
  const stale = codeFor !== null && codeFor !== amount

  const send = async (resend: boolean) => {
    setBusy(true)
    setOtpError('')
    setCode('')
    try {
      const c =
        resend && challenge
          ? await resendWithdrawalOtp(challenge.challengeId)
          : await startWithdrawalOtp(account.accountNo, amount)
      setChallenge(c)
      setCodeFor(amount)
      onChange({ ...value, otpToken: '' })
    } catch (err) {
      setOtpError(err instanceof ApiError ? err.message : t('common:error.generic'))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (entered: string) => {
    if (!challenge) return
    setBusy(true)
    try {
      const { otpToken } = await verifyWithdrawalOtp(challenge.challengeId, entered)
      onChange({ ...value, otpToken })
      setOtpError('')
    } catch (err) {
      setCode('')
      if (err instanceof ApiError && err.status === 429) {
        setChallenge(null)
        setOtpError(t('otp.cancelled'))
      } else if (err instanceof ApiError && typeof err.problem.attemptsLeft === 'number') {
        setOtpError(t('otp.wrong', { count: err.problem.attemptsLeft as number }))
      } else setOtpError(err instanceof ApiError ? err.message : t('common:error.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="withdrawal-checks span-all">
      <section className="check-box">
        <h3>
          {t('withdraw.signatureTitle')} <LocatorBadge style="ALT" />
        </h3>
        {account.hasSpecimen ? (
          <>
            <img
              className="specimen"
              src={`/api/v1/teller/accounts/${account.accountNo}/specimen`}
              alt={t('withdraw.specimenAlt', { name: account.customerName })}
            />
            <label className="choice">
              <input
                type="checkbox"
                checked={value.signatureMatched}
                onChange={(e) => onChange({ ...value, signatureMatched: e.target.checked })}
              />
              <span>{t('withdraw.matches')}</span>
            </label>
            {errors.signatureMatched ? (
              <span className="errmsg" role="alert">
                {errorText(errors.signatureMatched)}
              </span>
            ) : null}
          </>
        ) : (
          <label className="f">
            <span className="lbl req">{t('withdraw.noSpecimen')}</span>
            <select
              className="in"
              value={value.idChecked}
              onChange={(e) => onChange({ ...value, idChecked: e.target.value })}
            >
              <option value="">{t('common:select')}</option>
              {ID_TYPES.map((v) => (
                <option key={v} value={v}>
                  {t(`customers:values.idType.${v}`)}
                </option>
              ))}
            </select>
            {errors.idChecked ? (
              <span className="errmsg" role="alert">
                {errorText(errors.idChecked)}
              </span>
            ) : null}
          </label>
        )}
      </section>

      {needsOtp ? (
        <section
          className="check-box"
          data-state={value.otpToken && !stale ? 'verified' : challenge ? 'sent' : 'idle'}
        >
          <h3>
            {t('otp.title')} <LocatorBadge style="DYN" />
          </h3>
          {value.otpToken && !stale ? (
            <p className="note ok" role="status">
              <Icon name="check" />
              {t('otp.verified')}
            </p>
          ) : challenge && !stale ? (
            <>
              <p className="help">{t('otp.sentTo', { to: challenge.sentTo })}</p>
              <OtpInput
                label={t('otp.label')}
                value={code}
                onChange={setCode}
                onComplete={(c) => void verify(c)}
                disabled={busy}
                invalid={!!otpError}
              />
              <button
                type="button"
                className="btn sm ghost"
                disabled={busy || resendIn > 0}
                onClick={() => void send(true)}
              >
                {resendIn > 0 ? t('otp.resendIn', { s: resendIn }) : t('otp.resend')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn sm"
              disabled={busy || amount <= 0}
              onClick={() => void send(false)}
            >
              {t('otp.send')}
            </button>
          )}
          {otpError ? (
            <span className="errmsg" role="alert">
              {otpError}
            </span>
          ) : errors.otpToken ? (
            <span className="errmsg" role="alert">
              {errorText(errors.otpToken)}
            </span>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
