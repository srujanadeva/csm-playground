/**
 * The signed-in layout: sidebar built from the user's menu (/auth/me `nav`), announcement bar, top
 * bar with breadcrumb, command palette button, branch, language and user, and the page outlet.
 * Screens the user can't open are never rendered in the menu at all.
 */
import { createContext, Suspense, useContext, useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BRANCHES, type Language, type MeResponse } from '@csm/shared'
import { api } from '../api/client.ts'
import { Icon } from '../components/Icon.tsx'
import { Loading } from '../components/Widgets.tsx'
import { initials, label } from '../lib/format.ts'
import { useAuth, useMe } from './auth.tsx'
import { IdleWatcher } from './IdleWatcher.tsx'
import { AnnouncementBar } from './shell/AnnouncementBar.tsx'
import { AppCommandPalette } from './shell/AppCommandPalette.tsx'
import { Sidebar } from './shell/Sidebar.tsx'

/** A breadcrumb part: plain text, or a link to an earlier page. */
export type Crumb = string | { label: string; to: string }

const crumbLabel = (c: Crumb) => (typeof c === 'string' ? c : c.label)

const CrumbContext = createContext<(crumb: Crumb[]) => void>(() => undefined)

/** Sets the breadcrumb (and browser tab title) for the current page. */
export function useCrumb(parts: Crumb[]) {
  const set = useContext(CrumbContext)
  const key = parts.map((p) => (typeof p === 'string' ? p : `${p.label}@${p.to}`)).join('›')
  useEffect(() => {
    set(parts)
    document.title = `${crumbLabel(parts.at(-1) ?? '')} · CSM Playground`
    // `key` captures the content of `parts`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, set])
}

function LanguageSelect() {
  const { i18n, t } = useTranslation()
  const qc = useQueryClient()
  return (
    <select
      className="chip"
      id="topbar-language"
      data-testid="topbar-language"
      aria-label={t('language')}
      value={i18n.language}
      onChange={(e) => {
        const lang = e.target.value as Language
        void i18n.changeLanguage(lang)
        // Update the cached user too, so a reload before the save lands doesn't switch back.
        qc.setQueryData<MeResponse | null>(['me'], (me) =>
          me ? { ...me, user: { ...me.user, preferredLanguage: lang } } : me,
        )
        void api('/auth/me/language', { method: 'PUT', body: { language: lang }, keepalive: true })
      }}
    >
      <option value="en">English</option>
      <option value="kn">ಕನ್ನಡ</option>
    </select>
  )
}

function TopBar({ crumb, onMenu, onPalette }: { crumb: Crumb[]; onMenu: () => void; onPalette: () => void }) {
  const me = useMe()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const branch = BRANCHES.find((b) => b.code === me.user.branchCode)
  return (
    <header className="top">
      <button
        type="button"
        className="btn icon ghost menu-toggle"
        aria-label={t('nav.open')}
        data-testid="topbar-menu"
        onClick={onMenu}
      >
        <Icon name="menu" />
      </button>
      <nav className="crumb" aria-label={t('breadcrumb')} data-testid="breadcrumb">
        {crumb.map((c, i) => (
          <span key={i} style={{ display: 'contents' }}>
            {i > 0 ? (
              <span aria-hidden style={{ color: 'var(--faint)' }}>
                /
              </span>
            ) : null}
            {/* Earlier parts with a target are bare links (no class or id): find them by position. */}
            {i === crumb.length - 1 ? (
              <b aria-current="page">{crumbLabel(c)}</b>
            ) : typeof c === 'string' ? (
              <span>{c}</span>
            ) : (
              <Link to={c.to}>{c.label}</Link>
            )}
          </span>
        ))}
      </nav>
      <div className="grow" />
      <button
        type="button"
        className="chip palette-trigger"
        aria-label={t('palette.open')}
        aria-keyshortcuts="Control+K Meta+K"
        onClick={onPalette}
      >
        <Icon name="search" />
        <span>{t('palette.trigger')}</span>
        <kbd>Ctrl K</kbd>
      </button>
      <span className="chip branch" data-testid="topbar-branch">
        <Icon name="home" />
        {branch ? label(branch.name, i18n.language) : ''} · {me.user.branchCode}
      </span>
      <LanguageSelect />
      <span className="avatar" aria-hidden>
        {initials(me.user.name)}
      </span>
      <div className="who" data-testid="topbar-user">
        <b>{me.user.name}</b>
        <span>{t(`role.${me.user.roleKey}`)}</span>
      </div>
      <button
        type="button"
        className="btn ghost sm"
        data-testid="topbar-signout"
        onClick={() => void signOut().then(() => navigate('/login', { replace: true }))}
      >
        <Icon name="logout" />
        {t('signOut')}
      </button>
    </header>
  )
}

/** Layout for every signed-in page. */
export function AppShell() {
  const [crumb, setCrumb] = useState<Crumb[]>([])
  const [palette, setPalette] = useState(false)
  const location = useLocation()
  // The mobile menu closes whenever the page changes: it's only open for the path it was opened on.
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const menuOpen = menuFor === location.pathname
  const setMenuOpen = (open: boolean | ((o: boolean) => boolean)) =>
    setMenuFor((typeof open === 'function' ? open(menuOpen) : open) ? location.pathname : null)
  return (
    <CrumbContext.Provider value={setCrumb}>
      <div className="app">
        <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
        <div className="main">
          <AnnouncementBar />
          <TopBar crumb={crumb} onMenu={() => setMenuOpen((o) => !o)} onPalette={() => setPalette(true)} />
          <main className="work" id="main" data-testid="main">
            <Suspense fallback={<Loading testId="page-loading" />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
      <IdleWatcher />
      <AppCommandPalette open={palette} setOpen={setPalette} />
    </CrumbContext.Provider>
  )
}
