/**
 * Route guards. Signed-out users go to sign-in; users with a one-time password go to the
 * password change page; screens a user can't view render Not Found (the UI never reveals
 * that a hidden screen exists, matching the API's 404 for admin routes).
 */
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth, useCan } from './auth.tsx'
import { Loading } from '../components/Widgets.tsx'
import { useCrumb } from './AppShell.tsx'

/** Requires a signed-in user who doesn't owe a password change. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading testId="session-loading" />
  if (!me) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (me.user.mustChangePassword) return <Navigate to="/change-password" replace />
  return <>{children}</>
}

/** Requires `view` on a screen; otherwise shows Not Found. */
export function RequireScreen({ screen, children }: { screen: string; children: ReactNode }) {
  const allowed = useCan(screen, 'view')
  return allowed ? <>{children}</> : <NotFound />
}

/** The 404 page (also used for screens the user can't open). */
export function NotFound() {
  const { t } = useTranslation()
  useCrumb([t('notFound.title')])
  return (
    <div className="empty" data-testid="not-found">
      <b>{t('notFound.title')}</b>
      <p>{t('notFound.message')}</p>
      <a href="/dashboard" className="btn" data-testid="not-found-home">
        {t('notFound.home')}
      </a>
    </div>
  )
}
