// /forgot-password: staff ID → 6-digit code (from the dev inbox outside production) → new password.
// Fields are found by their labels (ids are React-generated); the code boxes have random ids.
// The server answers unknown IDs exactly like real ones, so this page can't confirm an ID exists.
import { useId, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { OTP_LENGTH, PASSWORD_MIN, type ResetChallenge } from '@csm/shared'
import { ApiError } from '../../api/client.ts'
import { MaskedInput, useErrorText } from '../../components/Field.tsx'
import { Icon } from '../../components/Icon.tsx'
import { OtpInput } from '../../components/inputs/OtpInput.tsx'
import { Stepper } from '../../components/Widgets.tsx'
import { completeReset, resendReset, startReset, verifyReset } from './api.ts'
import { LangSwitch } from './LoginPage.tsx'
import { PublicLayout } from './PublicLayout.tsx'
import { mmss, useCountdown } from './useCountdown.ts'

type Step = 'id' | 'code' | 'password' | 'done'
const STEP_INDEX: Record<Step, number> = { id: 0, code: 1, password: 2, done: 3 }

/** The page; each step is its own small form. */
export default function ForgotPasswordPage() {
  const { t } = useTranslation('auth')
  const [step, setStep] = useState<Step>('id')
  const [staffId, setStaffId] = useState('')
  const [challenge, setChallenge] = useState<ResetChallenge | null>(null)
  const [resetToken, setResetToken] = useState('')
  const restart = () => {
    setChallenge(null)
    setResetToken('')
    setStep('id')
  }
  return (
    <PublicLayout>
      <div className="lcard" data-step={step}>
        <h2>{t('forgot.title')}</h2>
        <Stepper
          testId="forgot-steps"
          current={STEP_INDEX[step]}
          steps={[
            { title: t('forgot.steps.id'), hint: '' },
            { title: t('forgot.steps.code'), hint: '' },
            { title: t('forgot.steps.password'), hint: '' },
          ]}
        />
        {step === 'id' ? (
          <IdStep
            initial={staffId}
            onSent={(id, c) => {
              setStaffId(id)
              setChallenge(c)
              setStep('code')
            }}
          />
        ) : null}
        {step === 'code' && challenge ? (
          <CodeStep
            challenge={challenge}
            onChallenge={setChallenge}
            onRestart={restart}
            onVerified={(token) => {
              setResetToken(token)
              setStep('password')
            }}
          />
        ) : null}
        {step === 'password' ? (
          <PasswordStep resetToken={resetToken} onDone={() => setStep('done')} onRestart={restart} />
        ) : null}
        {step === 'done' ? (
          <div className="note ok" role="status">
            <Icon name="check" />
            <span>
              {t('forgot.done')} <Link to="/login">{t('forgot.signIn')}</Link>
            </span>
          </div>
        ) : null}
        {step !== 'done' ? (
          <p className="help" style={{ margin: 0, textAlign: 'center' }}>
            <Link to="/login">{t('forgot.backToSignIn')}</Link>
          </p>
        ) : null}
        <LangSwitch />
      </div>
    </PublicLayout>
  )
}

/** Step 1: the staff ID. */
function IdStep({
  initial,
  onSent,
}: {
  initial: string
  onSent: (staffId: string, c: ResetChallenge) => void
}) {
  const { t } = useTranslation('auth')
  const errorText = useErrorText()
  const id = useId()
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form
      noValidate
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault()
        const staffId = value.trim().toLowerCase()
        if (!/^[a-z]{2,5}[0-9]{3}$/.test(staffId)) return setError(errorText('staffIdFormat') ?? '')
        setBusy(true)
        setError(null)
        try {
          onSent(staffId, await startReset(staffId))
        } catch (err) {
          setError(
            err instanceof ApiError && err.status === 429 ? t('login.tooMany') : t('common:error.network'),
          )
        } finally {
          setBusy(false)
        }
      }}
    >
      <p className="sub">{t('forgot.idIntro')}</p>
      <div className="f">
        <label htmlFor={id}>{t('login.staffId')}</label>
        <input
          id={id}
          className="in"
          autoComplete="username"
          placeholder={t('forgot.idPlaceholder')}
          aria-invalid={error ? true : undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        {error ? (
          <span className="errmsg" role="alert">
            {error}
          </span>
        ) : null}
      </div>
      <button type="submit" className="btn pri" disabled={busy}>
        {busy ? <span className="spin" /> : null}
        {t('forgot.sendCode')}
      </button>
    </form>
  )
}

interface CodeProps {
  challenge: ResetChallenge
  onChallenge: (c: ResetChallenge) => void
  onVerified: (token: string) => void
  onRestart: () => void
}

/** Step 2: the one-time code, with expiry and resend countdowns. */
function CodeStep({ challenge, onChallenge, onVerified, onRestart }: CodeProps) {
  const { t } = useTranslation('auth')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fatal, setFatal] = useState(false)
  const [busy, setBusy] = useState(false)
  const expiresIn = useCountdown(challenge.expiresAt)
  const resendIn = useCountdown(challenge.resendAt)

  const verify = async (value: string) => {
    if (value.length !== OTP_LENGTH || busy) return
    setBusy(true)
    setError(null)
    try {
      onVerified((await verifyReset(challenge.challengeId, value)).resetToken)
    } catch (err) {
      setCode('')
      if (err instanceof ApiError && err.code === 'otpWrong') {
        setError(t('forgot.wrongCode', { count: Number(err.problem.attemptsLeft ?? 0) }))
      } else if (err instanceof ApiError && err.code === 'otpExpired') {
        setError(t('forgot.expired'))
      } else if (
        err instanceof ApiError &&
        (err.status === 429 || err.status === 404 || err.status === 409)
      ) {
        setFatal(true)
        setError(t('forgot.startAgain'))
      } else {
        setError(t('common:error.network'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      noValidate
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        void verify(code)
      }}
    >
      <p className="sub">
        {t('forgot.codeSent', { sms: challenge.sentTo.sms, email: challenge.sentTo.email })}
      </p>
      {import.meta.env.DEV ? (
        <p className="note info" style={{ margin: 0 }}>
          <Icon name="info" />
          <span>
            {t('forgot.devHint')}{' '}
            <a href="/dev/inbox" target="_blank" rel="noopener">
              {t('forgot.openInbox')}
            </a>
          </span>
        </p>
      ) : null}
      <OtpInput
        label={t('forgot.codeLabel')}
        value={code}
        onChange={setCode}
        onComplete={(c) => void verify(c)}
        invalid={!!error}
        disabled={busy || fatal || expiresIn === 0}
      />
      {error ? (
        <span className="errmsg" role="alert">
          {error}
        </span>
      ) : null}
      <p className="help" style={{ margin: 0 }} aria-live="off">
        {expiresIn > 0 ? t('forgot.expiresIn', { time: mmss(expiresIn) }) : t('forgot.expired')}
      </p>
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        {fatal ? (
          <button type="button" className="btn" onClick={onRestart}>
            {t('forgot.restart')}
          </button>
        ) : (
          <button
            type="button"
            className="btn ghost"
            disabled={resendIn > 0 || busy}
            onClick={async () => {
              setError(null)
              try {
                onChallenge(await resendReset(challenge.challengeId))
                setCode('')
              } catch (err) {
                setError(err instanceof ApiError ? err.message : t('common:error.network'))
              }
            }}
          >
            {resendIn > 0 ? t('forgot.resendIn', { time: mmss(resendIn) }) : t('forgot.resend')}
          </button>
        )}
        <button type="submit" className="btn pri" disabled={code.length !== OTP_LENGTH || busy || fatal}>
          {busy ? <span className="spin" /> : null}
          {t('forgot.verify')}
        </button>
      </div>
    </form>
  )
}

/** Step 3: the new password. */
function PasswordStep({
  resetToken,
  onDone,
  onRestart,
}: {
  resetToken: string
  onDone: () => void
  onRestart: () => void
}) {
  const { t } = useTranslation('auth')
  const errorText = useErrorText()
  const newId = useId()
  const confirmId = useId()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ newPassword?: string; confirmPassword?: string; form?: string }>({})
  const [expired, setExpired] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <form
      noValidate
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault()
        const local = {
          ...(pw.length < PASSWORD_MIN ? { newPassword: 'passwordMin' } : {}),
          ...(pw !== confirm ? { confirmPassword: 'passwordMismatch' } : {}),
        }
        setErrors(local)
        if (Object.keys(local).length) return
        setBusy(true)
        try {
          await completeReset({ resetToken, newPassword: pw, confirmPassword: confirm })
          onDone()
        } catch (err) {
          if (err instanceof ApiError && err.problem.errors?.length) {
            setErrors(Object.fromEntries(err.problem.errors.map((x) => [x.path, x.code ?? x.message])))
          } else if (err instanceof ApiError && err.code === 'token_invalid') {
            setExpired(true)
          } else {
            setErrors({ form: t('common:error.network') })
          }
        } finally {
          setBusy(false)
        }
      }}
    >
      {expired ? (
        <div className="note bad" role="alert">
          <Icon name="warn" />
          <span>
            {t('forgot.tokenExpired')}{' '}
            <button type="button" className="btn ghost sm" onClick={onRestart}>
              {t('forgot.restart')}
            </button>
          </span>
        </div>
      ) : null}
      <div className="f">
        <label htmlFor={newId}>{t('change.new')}</label>
        <MaskedInput
          id={newId}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="new-password"
          error={errors.newPassword}
        />
        {errors.newPassword ? (
          <span className="errmsg" role="alert">
            {errorText(errors.newPassword)}
          </span>
        ) : (
          <span className="help">{t('change.rules', { min: PASSWORD_MIN })}</span>
        )}
      </div>
      <div className="f">
        <label htmlFor={confirmId}>{t('change.confirm')}</label>
        <MaskedInput
          id={confirmId}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          error={errors.confirmPassword}
        />
        {errors.confirmPassword ? (
          <span className="errmsg" role="alert">
            {errorText(errors.confirmPassword)}
          </span>
        ) : null}
      </div>
      {errors.form ? (
        <span className="errmsg" role="alert">
          {errors.form}
        </span>
      ) : null}
      <button type="submit" className="btn pri" disabled={busy || expired}>
        {busy ? <span className="spin" /> : null}
        {t('forgot.save')}
      </button>
    </form>
  )
}
