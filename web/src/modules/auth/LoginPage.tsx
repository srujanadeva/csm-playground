/**
 * Sign-in. Shows the server's lockout countdown ("2 attempts left"), a locked-account
 * message, and why the user was signed out (idle timeout, expired session).
 */
import { useState } from 'react'
import { Navigate, matchRoutes, useNavigate, useSearchParams } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { SCREENS, can, loginSchema, type MeResponse } from '@csm/shared'
import type { z } from 'zod'
import { ApiError, api } from '../../api/client.ts'
import { useAuth } from '../../app/auth.tsx'
import { Field, MaskedInput, controlProps } from '../../components/Field.tsx'
import { Icon } from '../../components/Icon.tsx'
import { Loading } from '../../components/Widgets.tsx'

type Form = z.input<typeof loginSchema>

const LEDGER = `CIF-000124  ACTIVE   KYC OK
CIF-000123  ACTIVE   KYC OK
CIF-000122  ACTIVE   KYC OK
CIF-000121  BLOCKED  KYC EXP
SR-2026-000299  CARD  HIGH
SR-2026-000298  ADDR  MED
SR-2026-000297  STMT  LOW
CIF-000120  ACTIVE   KYC OK`

const SCREEN_ROUTES = SCREENS.map((s) => ({ id: s.key, path: s.route }))

/**
 * Where to go after sign-in. `next` (the page a previous session was on) is honoured only when
 * it's a same-origin path to a screen this user can open: it may have been left by a different
 * user, e.g. an admin's /admin/users followed by a supervisor signing in.
 */
function landingPath(me: MeResponse, next: string | null): string {
  if (me.user.mustChangePassword) return '/change-password'
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/dashboard'
  const key = matchRoutes(SCREEN_ROUTES, new URL(next, location.origin).pathname)?.at(-1)?.route.id
  return key && can(me.permissions, key, 'view') ? next : '/dashboard'
}

/** Language toggle used on the public pages. */
export function LangSwitch() {
  const { i18n } = useTranslation()
  return (
    <div className="langswitch" data-testid="login-language">
      <button
        type="button"
        data-testid="login-language-en"
        aria-pressed={i18n.language === 'en'}
        onClick={() => void i18n.changeLanguage('en')}
      >
        English
      </button>
      <span aria-hidden>·</span>
      <button
        type="button"
        data-testid="login-language-kn"
        aria-pressed={i18n.language === 'kn'}
        onClick={() => void i18n.changeLanguage('kn')}
      >
        ಕನ್ನಡ
      </button>
    </div>
  )
}

/** The left-hand brand panel shared by sign-in and password change. */
export function AuthAside() {
  const { t } = useTranslation('auth')
  return (
    <div className="lside" aria-hidden={false}>
      <div className="brand" style={{ border: 0, padding: 0 }}>
        <span className="mark">CSM</span>
        <span>
          <b>{t('common:appName')}</b>
          <span className="tagline">{t('common:appTagline')}</span>
        </span>
      </div>
      <div className="ledger" aria-hidden>
        {LEDGER}
      </div>
      <h1>{t('login.headline')}</h1>
      <p>{t('login.intro')}</p>
      <div className="lfoot">
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Icon name="shield" /> {t('login.logged')}
        </span>
        <span>{t('login.practice')}</span>
      </div>
    </div>
  )
}

/** /login */
export default function LoginPage() {
  const { t } = useTranslation('auth')
  const { me, loading, signedIn } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [problem, setProblem] = useState<{ code?: string; message: string } | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(loginSchema),
    defaultValues: { staffId: '', password: '', remember: false },
  })

  if (loading) return <Loading testId="session-loading" />
  if (me) return <Navigate to={landingPath(me, params.get('next'))} replace />

  const reason = params.get('reason')
  const onSubmit = handleSubmit(async (values) => {
    setProblem(null)
    try {
      const data = await api<MeResponse & { csrfToken: string }>('/auth/login', {
        method: 'POST',
        body: values,
      })
      signedIn(data)
      navigate(landingPath(data, params.get('next')), { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        const code = err.code
        setProblem({
          code,
          message:
            code === 'account_locked'
              ? t('login.locked')
              : code === 'invalid_credentials'
                ? t('login.invalid', { count: err.problem.attemptsLeft ?? 0 })
                : err.status === 429
                  ? t('login.tooMany')
                  : err.message,
        })
      } else {
        setProblem({ message: t('common:error.network') })
      }
    }
  })

  return (
    <div className="login">
      <AuthAside />
      <div className="lform">
        <form className="lcard" onSubmit={onSubmit} noValidate data-testid="login-form">
          <h2>{t('login.title')}</h2>
          <p className="sub">{t('login.subtitle')}</p>
          {reason === 'idle' || reason === 'expired' ? (
            <div className="note info" role="status" data-testid="login-reason">
              <Icon name="info" />
              <span>{t(reason === 'idle' ? 'login.signedOutIdle' : 'login.signedOutExpired')}</span>
            </div>
          ) : null}
          {problem ? (
            <div className="note bad" role="alert" data-testid="login-error" data-code={problem.code}>
              <Icon name="warn" />
              <span>{problem.message}</span>
            </div>
          ) : null}
          <Field id="login-staff-id" label={t('login.staffId')} error={errors.staffId?.message}>
            <input
              {...register('staffId')}
              {...controlProps('login-staff-id', errors.staffId?.message)}
              className="in"
              autoComplete="username"
              placeholder="csr001"
              autoFocus
            />
          </Field>
          <Field id="login-password" label={t('login.password')} error={errors.password?.message}>
            <MaskedInput
              {...register('password')}
              id="login-password"
              error={errors.password?.message}
              autoComplete="current-password"
            />
          </Field>
          <label className="choice">
            <input
              type="checkbox"
              {...register('remember')}
              id="login-remember"
              data-testid="login-remember"
            />
            <span>{t('login.remember')}</span>
          </label>
          <button
            type="submit"
            className="btn pri"
            style={{ height: 40 }}
            disabled={isSubmitting}
            data-testid="login-submit"
          >
            {isSubmitting ? <span className="spin" /> : null}
            {t('login.submit')}
          </button>
          <p className="help" style={{ margin: 0, textAlign: 'center' }} data-testid="login-forgot">
            {t('login.forgot')}
          </p>
          <LangSwitch />
        </form>
      </div>
    </div>
  )
}
