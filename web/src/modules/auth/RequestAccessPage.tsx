// /request-access: a new joiner asks for a staff account; an administrator decides it under
// Admin → Users & access. Controls are reachable by their `name` only (labels wrap them; no ids).
import { useState } from 'react'
import { Link } from 'react-router'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { BRANCHES, REQUESTABLE_ROLES, accessRequestSchema, type AccessRequestInput } from '@csm/shared'
import { ApiError } from '../../api/client.ts'
import { useErrorText } from '../../components/Field.tsx'
import { Icon } from '../../components/Icon.tsx'
import { MaskedTextInput } from '../../components/inputs/MaskedTextInput.tsx'
import { Modal } from '../../components/Overlay.tsx'
import { label as pickLabel } from '../../lib/format.ts'
import { submitAccessRequest } from './api.ts'
import { LangSwitch } from './LoginPage.tsx'
import { PublicLayout } from './PublicLayout.tsx'

const REASON_MAX = 500

/** Inline error for a field (role="alert", no id). */
function Err({ code }: { code?: string }) {
  const text = useErrorText()
  return code ? (
    <span className="errmsg" role="alert">
      {text(code)}
    </span>
  ) : null
}

/** The page: the form, then a confirmation with the request number. */
export default function RequestAccessPage() {
  const { t, i18n } = useTranslation('auth')
  const [done, setDone] = useState<string | null>(null)
  const [terms, setTerms] = useState<'terms' | 'privacy' | null>(null)
  const {
    register,
    control,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AccessRequestInput>({
    resolver: zodResolver(accessRequestSchema),
    defaultValues: {
      fullName: '',
      email: '',
      mobile: '',
      employeeNo: '',
      branchCode: undefined,
      roleRequested: undefined,
      managerEmail: '',
      reason: '',
      acceptTerms: false as unknown as true,
      acceptPrivacy: false as unknown as true,
      subscribeUpdates: false,
    },
  })
  const reasonLength = (watch('reason') ?? '').length

  const onSubmit = handleSubmit(async (values) => {
    try {
      setDone((await submitAccessRequest(values)).requestNo)
    } catch (err) {
      if (err instanceof ApiError && err.problem.errors) {
        for (const e of err.problem.errors)
          setError(e.path as keyof AccessRequestInput, { message: e.code ?? e.message })
      } else {
        setError('root', {
          message:
            err instanceof ApiError && err.code === 'duplicate_request'
              ? t('request.duplicate')
              : err instanceof ApiError
                ? err.message
                : t('common:error.network'),
        })
      }
    }
  })

  if (done) {
    return (
      <PublicLayout>
        <div className="lcard">
          <h2>{t('request.sentTitle')}</h2>
          <div className="note ok" role="status">
            <Icon name="check" />
            <span>{t('request.sent', { requestNo: done })}</span>
          </div>
          <ol className="help" style={{ margin: 0, paddingInlineStart: 18 }}>
            <li>{t('request.next1')}</li>
            <li>{t('request.next2')}</li>
            <li>{t('request.next3')}</li>
          </ol>
          <Link to="/login" className="btn">
            {t('forgot.backToSignIn')}
          </Link>
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout wide>
      <form className="lcard wide" onSubmit={onSubmit} noValidate>
        <h2>{t('request.title')}</h2>
        <p className="sub">{t('request.subtitle')}</p>
        {errors.root ? (
          <div className="note bad" role="alert">
            <Icon name="warn" />
            <span>{errors.root.message}</span>
          </div>
        ) : null}
        <div className="grid g2">
          <label className="f span2">
            <span className="lbl req">{t('request.fullName')}</span>
            <input
              {...register('fullName')}
              className="in"
              autoComplete="name"
              aria-invalid={!!errors.fullName || undefined}
            />
            <Err code={errors.fullName?.message} />
          </label>
          <label className="f">
            <span className="lbl req">{t('request.email')}</span>
            <input
              {...register('email')}
              type="email"
              className="in"
              autoComplete="email"
              aria-invalid={!!errors.email || undefined}
            />
            <Err code={errors.email?.message} />
          </label>
          <label className="f">
            <span className="lbl req">{t('request.mobile')}</span>
            <Controller
              control={control}
              name="mobile"
              render={({ field }) => (
                <div className={`affix ${errors.mobile ? 'invalid' : ''}`}>
                  <span>+91</span>
                  <MaskedTextInput
                    kind="mobile"
                    value={field.value}
                    onChange={field.onChange}
                    invalid={!!errors.mobile}
                    inputProps={{ name: field.name, onBlur: field.onBlur, autoComplete: 'tel-national' }}
                  />
                </div>
              )}
            />
            <Err code={errors.mobile?.message} />
          </label>
          <label className="f">
            <span className="lbl req">{t('request.employeeNo')}</span>
            <input
              {...register('employeeNo')}
              className="in mono"
              placeholder="E10234"
              aria-invalid={!!errors.employeeNo || undefined}
            />
            <Err code={errors.employeeNo?.message} />
          </label>
          <label className="f">
            <span className="lbl req">{t('request.branch')}</span>
            <select
              {...register('branchCode')}
              className="in"
              defaultValue=""
              aria-invalid={!!errors.branchCode || undefined}
            >
              <option value="" disabled>
                {t('common:select')}
              </option>
              {BRANCHES.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.code} · {pickLabel(b.name, i18n.language)}
                </option>
              ))}
            </select>
            <Err code={errors.branchCode?.message} />
          </label>
          <fieldset className="f span2">
            <legend className="lbl req">{t('request.role')}</legend>
            <div className="opts">
              {REQUESTABLE_ROLES.map((r) => (
                <label key={r} className="choice">
                  <input type="radio" value={r} {...register('roleRequested')} />
                  <span>{t(`common:role.${r}`)}</span>
                </label>
              ))}
            </div>
            <Err code={errors.roleRequested?.message} />
          </fieldset>
          <label className="f span2">
            <span className="lbl">{t('request.managerEmail')}</span>
            <input
              {...register('managerEmail')}
              type="email"
              className="in"
              placeholder={t('request.optional')}
            />
            <Err code={errors.managerEmail?.message} />
          </label>
          <label className="f span2">
            <span className="lbl req">{t('request.reason')}</span>
            <textarea
              {...register('reason')}
              className="in"
              rows={3}
              maxLength={REASON_MAX}
              aria-invalid={!!errors.reason || undefined}
            />
            {errors.reason ? (
              <Err code={errors.reason.message} />
            ) : (
              <span className="help">{t('request.reasonCount', { n: reasonLength, max: REASON_MAX })}</span>
            )}
          </label>
        </div>
        <div className="stack tight">
          <label className="choice">
            <input type="checkbox" {...register('acceptTerms')} />
            <span>
              {t('request.acceptTerms')}{' '}
              <a href="#terms" onClick={(e) => (e.preventDefault(), setTerms('terms'))}>
                {t('request.termsLink')}
              </a>
            </span>
          </label>
          <Err code={errors.acceptTerms?.message} />
          <label className="choice">
            <input type="checkbox" {...register('acceptPrivacy')} />
            <span>
              {t('request.acceptPrivacy')}{' '}
              <a href="#privacy" onClick={(e) => (e.preventDefault(), setTerms('privacy'))}>
                {t('request.privacyLink')}
              </a>
            </span>
          </label>
          <Err code={errors.acceptPrivacy?.message} />
          <label className="choice">
            <input type="checkbox" {...register('subscribeUpdates')} />
            <span>{t('request.subscribe')}</span>
          </label>
        </div>
        <button type="submit" className="btn pri" style={{ height: 40 }} disabled={isSubmitting}>
          {isSubmitting ? <span className="spin" /> : null}
          {t('request.submit')}
        </button>
        <p className="help" style={{ margin: 0, textAlign: 'center' }}>
          {t('request.haveAccount')} <Link to="/login">{t('forgot.signIn')}</Link>
        </p>
        <LangSwitch />
      </form>
      {terms ? (
        <Modal
          testId={`request-${terms}`}
          title={t(terms === 'terms' ? 'request.termsTitle' : 'request.privacyTitle')}
          onClose={() => setTerms(null)}
          footer={
            <button type="button" className="btn pri" onClick={() => setTerms(null)} data-autofocus>
              {t('common:close')}
            </button>
          }
        >
          <p style={{ margin: 0 }}>{t(terms === 'terms' ? 'request.termsBody' : 'request.privacyBody')}</p>
        </Modal>
      ) : null}
    </PublicLayout>
  )
}
