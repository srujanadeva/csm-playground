// The sidebar: the user's menu from /auth/me, in collapsible groups with optional sub-groups
// (NAV_SUBGROUPS), plus a "Pages" group of utility pages. Group toggles have no test ids: find
// them by role and name, e.g. getByRole('button', { name: 'Administration' }). Collapsed groups
// are remembered in this browser; their links are hidden until expanded.
import { useId, useState } from 'react'
import { NavLink } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BRANCHES, NAV_GROUPS, NAV_SUBGROUPS, type DashboardSummary, type NavItem } from '@csm/shared'
import { api } from '../../api/client.ts'
import { Icon } from '../../components/Icon.tsx'
import { label } from '../../lib/format.ts'
import { readStored, writeStored } from '../../lib/storage.ts'
import { useCan, useMe } from '../auth.tsx'
import './shell.css'

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

const COLLAPSED_KEY = 'csm.nav.collapsed'

/** Utility pages outside the screen permissions (more arrive with the Help centre). */
export function utilityPages(t: (k: string) => string) {
  return [...(import.meta.env.PROD ? [] : [{ to: '/dev/inbox', label: t('pages.devInbox'), icon: 'bell' }])]
}

/** A group heading that expands/collapses the list below it. */
function GroupToggle({
  text,
  open,
  controls,
  onToggle,
  sub,
}: {
  text: string
  open: boolean
  controls: string
  onToggle: () => void
  sub?: boolean
}) {
  return (
    <button
      type="button"
      className={sub ? 'navsub-toggle' : 'navg'}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      <span>{text}</span>
      <span className="chev" aria-hidden>
        ▾
      </span>
    </button>
  )
}

/** The sidebar. */
export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const me = useMe()
  const { t, i18n } = useTranslation()
  const uid = useId()
  const canDashboard = useCan('dashboard', 'view')
  const [collapsed, setCollapsed] = useState<string[]>(() => readStored<string[]>(COLLAPSED_KEY, []))
  const toggle = (key: string) =>
    setCollapsed((c) => {
      const next = c.includes(key) ? c.filter((k) => k !== key) : [...c, key]
      writeStored(COLLAPSED_KEY, next)
      return next
    })
  const { data: summary } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api<DashboardSummary>('/dashboard/summary'),
    enabled: canDashboard,
    staleTime: 60_000,
  })
  const branch = BRANCHES.find((b) => b.code === me.user.branchCode)

  const link = (n: NavItem) => (
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

  /** Items of a group: loose ones first, then each sub-group as its own collapsible list. */
  const groupBody = (group: string, items: NavItem[]) => {
    const loose = items.filter((n) => !NAV_SUBGROUPS[n.key])
    const subs = [...new Set(items.map((n) => NAV_SUBGROUPS[n.key]).filter(Boolean))] as string[]
    return (
      <>
        {loose.map(link)}
        {subs.map((sub) => {
          const key = `${group}/${sub}`
          const id = `${uid}-${key}`
          const isOpen = !collapsed.includes(key)
          return (
            <div key={key} className="navsub">
              <GroupToggle
                sub
                text={t(`navSubGroup.${sub}`)}
                open={isOpen}
                controls={id}
                onToggle={() => toggle(key)}
              />
              <div id={id} hidden={!isOpen}>
                {items.filter((n) => NAV_SUBGROUPS[n.key] === sub).map(link)}
              </div>
            </div>
          )
        })}
      </>
    )
  }

  const pages = utilityPages(t)
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
        {[null, ...NAV_GROUPS].map((g) => {
          const items = me.nav.filter((n) => n.navGroup === g)
          if (!items.length) return null
          if (!g) {
            return (
              <div key="root" data-testid="nav-group-root">
                {items.map(link)}
              </div>
            )
          }
          const id = `${uid}-${g}`
          const isOpen = !collapsed.includes(g)
          return (
            <div key={g} data-testid={`nav-group-${g}`} className="navgroup">
              <GroupToggle text={t(`navGroup.${g}`)} open={isOpen} controls={id} onToggle={() => toggle(g)} />
              <div id={id} hidden={!isOpen}>
                {groupBody(g, items)}
              </div>
            </div>
          )
        })}
        {pages.length ? (
          <div className="navgroup">
            <GroupToggle
              text={t('navGroup.pages')}
              open={!collapsed.includes('pages')}
              controls={`${uid}-pages`}
              onToggle={() => toggle('pages')}
            />
            <div id={`${uid}-pages`} hidden={collapsed.includes('pages')}>
              {pages.map((p) => (
                <NavLink key={p.to} to={p.to} onClick={onNavigate}>
                  <Icon name={p.icon} />
                  {p.label}
                </NavLink>
              ))}
            </div>
          </div>
        ) : null}
      </nav>
      <div className="side-foot">
        <b>{me.user.name}</b>
        {me.user.staffId} · {branch ? label(branch.name, i18n.language) : me.user.branchCode}
      </div>
    </aside>
  )
}
