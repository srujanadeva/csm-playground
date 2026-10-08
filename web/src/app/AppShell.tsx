/**
 * The signed-in layout: sidebar built from the user's menu (/auth/me `nav`), top bar with
 * breadcrumb, branch, language and user, and the page outlet. Screens the user can't open are
 * never rendered in the menu at all.
 */
import { createContext, Suspense, useContext, useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  BRANCHES,
  NAV_GROUPS,
  type DashboardSummary,
  type Language,
  type MeResponse,
  type NavItem,
} from '@csm/shared'
import { api } from '../api/client.ts'
import { Icon } from '../components/Icon.tsx'
import { Loading } from '../components/Widgets.tsx'
import { initials, label } from '../lib/format.ts'
import { useAuth, useCan, useMe } from './auth.tsx'
import { IdleWatcher } from './IdleWatcher.tsx'

const ICONS: Record<string, string> = {
  home: 'home',
  'user-plus': 'user-plus',
  search: 'search',
  user: 'user',
  plus: 'plus',
  board: 'board',
  users: 'users',
  sliders: 'sliders',
  wallet: 'wallet',
  card: 'card',
  cash: 'cash',
  drawer: 'drawer',
}

const CrumbContext = createContext<(crumb: ReactNode[]) => void>(() => undefined)

/** Sets the breadcrumb (and browser tab title) for the current page. */
export function useCrumb(parts: string[]) {
  const set = useContext(CrumbContext)
  const key = parts.join('›')
  useEffect(() => {
    set(parts)
    document.title = `${parts.at(-1) ?? ''} · CSM Playground`
    // `key` captures the content of `parts`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, set])
}

function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const me = useMe()
  const { t, i18n } = useTranslation()
  const canDashboard = useCan('dashboard', 'view')
  const { data: summary } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api<DashboardSummary>('/dashboard/summary'),
    enabled: canDashboard,
    staleTime: 60_000,
  })
  const groups = [null, ...NAV_GROUPS].map((g) => ({
    group: g,
    items: me.nav.filter((n) => n.navGroup === g),
  }))
  const branch = BRANCHES.find((b) => b.code === me.user.branchCode)
  const item = (n: NavItem) => (
    <NavLink
      key={n.key}
      to={n.route}
      end
      id={`nav-${n.key}`}
      data-testid={`nav-${n.key}`}
      onClick={onNavigate}
      className={({ isActive }) => (isActive ? 'active' : undefined)}
    >
      <Icon name={ICONS[n.icon] ?? 'file'} />
      {label(n.labels, i18n.language)}
      {n.key === 'serviceRequests.board' && summary ? (
        <span className="cnt" data-testid="nav-board-count" title={t('nav.myOpen')}>
          {summary.myOpenRequests}
        </span>
      ) : null}
    </NavLink>
  )
  return (
    <aside className={`side ${open ? 'open' : ''}`} data-testid="sidebar">
      <NavLink to="/dashboard" className="brand" data-testid="brand">
        <span className="mark">CSM</span>
        <span>
          <b>{t('appName')}</b>
          <span className="tagline">{t('appTagline')}</span>
        </span>
      </NavLink>
      <nav className="nav" aria-label={t('nav.label')} data-testid="nav">
        {groups.map(({ group, items }) =>
          items.length === 0 ? null : (
            <div key={group ?? 'root'} data-testid={`nav-group-${group ?? 'root'}`}>
              {group ? <div className="navg">{t(`navGroup.${group}`)}</div> : null}
              {items.map(item)}
            </div>
          ),
        )}
      </nav>
      <div className="side-foot">
        <b>{me.user.name}</b>
        {me.user.staffId} · {branch ? label(branch.name, i18n.language) : me.user.branchCode}
      </div>
    </aside>
  )
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

function TopBar({ crumb, onMenu }: { crumb: ReactNode[]; onMenu: () => void }) {
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
            {i === crumb.length - 1 ? <b aria-current="page">{c}</b> : <span>{c}</span>}
          </span>
        ))}
      </nav>
      <div className="grow" />
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
  const [crumb, setCrumb] = useState<ReactNode[]>([])
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
          <TopBar crumb={crumb} onMenu={() => setMenuOpen((o) => !o)} />
          <main className="work" id="main" data-testid="main">
            <Suspense fallback={<Loading testId="page-loading" />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
      <IdleWatcher />
    </CrumbContext.Provider>
  )
}
