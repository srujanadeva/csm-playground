/**
 * Password change. Required after signing in with a one-time password; the server rejects
 * common passwords and ones containing the staff ID or name.
 */
import { Navigate, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { changePasswordSchema, PASSWORD_MIN, type ChangePasswordInput, type MeResponse } from '@csm/shared'
import { ApiError, api } from '../../api/client.ts'
import { useAuth } from '../../app/auth.tsx'
import { Field, MaskedInput } from '../../components/Field.tsx'
import { Icon } from '../../components/Icon.tsx'
import { Loading } from '../../components/Widgets.tsx'
import { AuthAside, LangSwitch } from './LoginPage.tsx'

/** /change-password */
export default function ChangePasswordPage() {
  const { t } = useTranslation('auth')
  const { me, loading, signedIn, signOut } = useAuth()
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) })

  if (loading) return <Loading testId="session-loading" />
  if (!me) return <Navigate to="/login" replace />

  const onSubmit = handleSubmit(async (values) => {
    try {
      const data = await api<MeResponse & { csrfToken: string }>('/auth/change-password', {
        method: 'POST',
        body: values,
      })
      signedIn(data)
      navigate('/dashboard', { replace: true, state: { passwordChanged: true } })
    } catch (err) {
      if (err instanceof ApiError && err.problem.errors) {
        for (const e of err.problem.errors) {
          setError(e.path as keyof ChangePasswordInput, {
            message: e.path === 'currentPassword' ? 'currentPasswordWrong' : (e.code ?? e.message),
          })
        }
      } else if (err instanceof ApiError) {
        setError('root', { message: err.message })
      }
    }
  })

  return (
    <div className="login">
      <AuthAside />
      <div className="lform">
        <form className="lcard" onSubmit={onSubmit} noValidate data-testid="change-password-form">
          <h2>{t('change.title')}</h2>
          <p className="sub">{me.user.mustChangePassword ? t('change.required') : t('change.subtitle')}</p>
          {errors.root ? (
            <div className="note bad" role="alert" data-testid="change-password-error">
              <Icon name="warn" />
              <span>{errors.root.message}</span>
            </div>
          ) : null}
          <Field id="change-current" label={t('change.current')} error={errors.currentPassword?.message}>
            <MaskedInput
              {...register('currentPassword')}
              id="change-current"
              error={errors.currentPassword?.message}
              autoComplete="current-password"
            />
          </Field>
          <Field
            id="change-new"
            label={t('change.new')}
            error={errors.newPassword?.message}
            help={t('change.rules', { min: PASSWORD_MIN })}
          >
            <MaskedInput
              {...register('newPassword')}
              id="change-new"
              error={errors.newPassword?.message}
              autoComplete="new-password"
            />
          </Field>
          <Field id="change-confirm" label={t('change.confirm')} error={errors.confirmPassword?.message}>
            <MaskedInput
              {...register('confirmPassword')}
              id="change-confirm"
              error={errors.confirmPassword?.message}
              autoComplete="new-password"
            />
          </Field>
          <button
            type="submit"
            className="btn pri"
            style={{ height: 40 }}
            disabled={isSubmitting}
            data-testid="change-submit"
          >
            {isSubmitting ? <span className="spin" /> : null}
            {t('change.submit')}
          </button>
          <button
            type="button"
            className="btn ghost"
            data-testid="change-signout"
            onClick={() => void signOut().then(() => navigate('/login', { replace: true }))}
          >
            {t('common:signOut')}
          </button>
          <LangSwitch />
        </form>
      </div>
    </div>
  )
}
