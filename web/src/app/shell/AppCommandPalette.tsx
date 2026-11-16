// The app's Ctrl/⌘+K palette: every screen the user may open, the utility pages, sign-out and the
// language switch. Typing a CIF (CIF-000123 or just 123) opens that customer when the user may.
import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { Language } from '@csm/shared'
import { CommandPalette, useCommandHotkey, type Command } from '../../components/overlays/CommandPalette.tsx'
import { label } from '../../lib/format.ts'
import { useAuth, useCan, useMe } from '../auth.tsx'
import { utilityPages } from './Sidebar.tsx'

/** "cif-12" / "000123" / "123" → "CIF-000123"; null when it isn't a CIF. */
export function asCif(q: string): string | null {
  const m = /^(?:cif-?)?(\d{1,6})$/i.exec(q.trim())
  return m ? `CIF-${m[1]!.padStart(6, '0')}` : null
}

/** Mount once in the shell; `open` is shared with the top-bar button. */
export function AppCommandPalette({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const { t, i18n } = useTranslation()
  const me = useMe()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const canOpenCustomer = useCan('customers.360', 'view')
  const toggle = useCallback(() => setOpen(!open), [open, setOpen])
  useCommandHotkey(toggle)

  const commands = useMemo<Command[]>(() => {
    const go = t('palette.goTo')
    const screens = me.nav.map((n) => ({
      id: `screen:${n.key}`,
      label: label(n.labels, i18n.language),
      group: n.navGroup ? t(`navGroup.${n.navGroup}`) : go,
      keywords: n.route,
      run: () => navigate(n.route),
    }))
    const pages = utilityPages(t).map((p) => ({
      id: `page:${p.to}`,
      label: p.label,
      group: t('navGroup.pages'),
      run: () => navigate(p.to),
    }))
    const other: Language = i18n.language === 'en' ? 'kn' : 'en'
    const actions = [
      {
        id: 'action:language',
        label: t('palette.language', { lang: other === 'kn' ? 'ಕನ್ನಡ' : 'English' }),
        group: t('palette.actions'),
        keywords: 'language kannada english',
        run: () => void i18n.changeLanguage(other),
      },
      {
        id: 'action:signout',
        label: t('signOut'),
        group: t('palette.actions'),
        keywords: 'logout log out',
        run: () => void signOut().then(() => navigate('/login', { replace: true })),
      },
    ]
    return [...screens, ...pages, ...actions]
  }, [me.nav, i18n, t, navigate, signOut])

  return (
    <CommandPalette
      open={open}
      onClose={() => setOpen(false)}
      commands={commands}
      onFallback={(q) => {
        const cif = asCif(q)
        if (cif && canOpenCustomer) navigate(`/customers/${cif}`)
      }}
      fallbackLabel={(q) => {
        const cif = asCif(q)
        return cif && canOpenCustomer ? t('palette.openCif', { cif }) : t('palette.none')
      }}
    />
  )
}
