/**
 * The signed-in user, from GET /auth/me. Refreshed every 30 seconds and on window focus, so
 * access changes made by an admin reach open sessions quickly. Also provides `useCan` and
 * `useAction`, which decide whether an action is shown, shown disabled, or hidden, based on
 * the user's permissions and the screen's "when a user lacks a capability" setting.
 */
import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { can, type Capability, type MeResponse } from '@csm/shared'
import { ApiError, api, onSessionEnded, setCsrfToken } from '../api/client.ts'
import { hasStoredLanguage } from '../i18n.ts'

interface AuthValue {
  me: MeResponse | null
  loading: boolean
  refresh: () => Promise<unknown>
  signedIn: (me: MeResponse & { csrfToken?: string }) => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

/** Loads /auth/me and keeps the language in sync with the user's preference. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const { i18n } = useTranslation()
  const query = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<MeResponse>('/auth/me')
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null
        throw err
      }
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  })

  useEffect(
    () =>
      onSessionEnded(() => {
        setCsrfToken(null)
        qc.setQueryData(['me'], null)
      }),
    [qc],
  )

  const me = query.data ?? null
  // The user's saved language applies when this browser has no choice of its own yet;
  // after that, the latest explicit choice on this device wins (sign-in re-applies it).
  useEffect(() => {
    if (me && !hasStoredLanguage() && me.user.preferredLanguage !== i18n.language) {
      void i18n.changeLanguage(me.user.preferredLanguage)
    }
    // Only when the signed-in user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.user.staffId])

  const value: AuthValue = {
    me,
    loading: query.isLoading,
    refresh: () => query.refetch(),
    signedIn: (data) => {
      if (data.csrfToken) setCsrfToken(data.csrfToken)
      const { csrfToken: _token, ...rest } = data
      qc.setQueryData(['me'], rest)
      if (data.user.preferredLanguage !== i18n.language) void i18n.changeLanguage(data.user.preferredLanguage)
    },
    signOut: async () => {
      try {
        await api('/auth/logout', { method: 'POST' })
      } finally {
        setCsrfToken(null)
        qc.clear()
        qc.setQueryData(['me'], null)
      }
    },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** The auth context; throws if used outside AuthProvider. */
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

/** The signed-in user (only call inside protected routes). */
export function useMe(): MeResponse {
  const { me } = useAuth()
  if (!me) throw new Error('useMe called without a signed-in user')
  return me
}

/** True if the user has `capability` on `screenKey`. */
export function useCan(screenKey: string, capability: Capability): boolean {
  const { me } = useAuth()
  return !!me && can(me.permissions, screenKey, capability)
}

/**
 * How to render an action: hidden, visible-but-disabled (with a reason), or available.
 * The screen setting chooses between hiding and disabling when the user lacks permission.
 */
export function useAction(
  screenKey: string,
  capability: Capability,
): { visible: boolean; enabled: boolean; reason?: string } {
  const { me } = useAuth()
  const { t } = useTranslation()
  if (me && can(me.permissions, screenKey, capability)) return { visible: true, enabled: true }
  const mode = me?.screens[screenKey]?.unauthorisedMode ?? 'hide'
  return mode === 'disable'
    ? {
        visible: true,
        enabled: false,
        reason: t('noPermission', { capability: t(`capability.${capability}`) }),
      }
    : { visible: false, enabled: false }
}
