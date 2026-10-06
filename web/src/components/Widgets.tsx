/**
 * Small shared widgets: tooltip, kebab menu, tabs, stepper, pagination, sortable header,
 * infinite-scroll sentinel and empty state.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formatNumber } from '../lib/format.ts'
import { Icon } from './Icon.tsx'

/** Shows `text` on hover or keyboard focus of the child. */
export function Tooltip({
  text,
  testId,
  children,
}: {
  text: ReactNode
  testId: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span
      className="tipwrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? id : undefined}
      data-testid={`${testId}-trigger`}
    >
      {children}
      {open ? (
        <span className="tip" role="tooltip" id={id} data-testid={testId}>
          {text}
        </span>
      ) : null}
    </span>
  )
}

export interface MenuItem {
  key: string
  label: ReactNode
  icon?: string
  onSelect?: () => void
  disabled?: boolean
  disabledReason?: string
  separatorBefore?: boolean
}

/** A ⋮ button with a dropdown menu. Disabled items stay visible with their reason. */
export function KebabMenu({ testId, label, items }: { testId: string; label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuId = useId()
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div className="menuwrap" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="kebab"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-testid={testId}
        onClick={() => setOpen((o) => !o)}
      >
        ⋮
      </button>
      {open ? (
        <ul className="menu" role="menu" id={menuId} data-testid={`${testId}-menu`}>
          {items.map((item) => (
            <li key={item.key} role="none">
              {item.separatorBefore ? <hr /> : null}
              <button
                type="button"
                role="menuitem"
                data-testid={`${testId}-${item.key}`}
                aria-disabled={item.disabled || undefined}
                title={item.disabled ? item.disabledReason : undefined}
                onClick={() => {
                  if (item.disabled) return
                  setOpen(false)
                  item.onSelect?.()
                }}
              >
                {item.icon ? <Icon name={item.icon} /> : null}
                <span>{item.label}</span>
                {item.disabled && item.disabledReason ? (
                  <span className="help">· {item.disabledReason}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export interface TabDef {
  key: string
  label: ReactNode
  count?: number
}

/** ARIA tabs; arrow keys move between tabs. Panels are rendered by the caller. */
export function Tabs({
  testId,
  tabs,
  active,
  onChange,
}: {
  testId: string
  tabs: TabDef[]
  active: string
  onChange: (k: string) => void
}) {
  return (
    <div
      className="tabs"
      role="tablist"
      data-testid={testId}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
        const i = tabs.findIndex((t) => t.key === active)
        const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!
        onChange(next.key)
        document.getElementById(`${testId}-${next.key}`)?.focus()
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          id={`${testId}-${tab.key}`}
          data-testid={`${testId}-${tab.key}`}
          aria-selected={tab.key === active}
          aria-controls={`${testId}-panel-${tab.key}`}
          tabIndex={tab.key === active ? 0 : -1}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          {tab.count !== undefined ? <span className="c">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  )
}

/** Wizard progress: done steps get a tick, the current one aria-current="step". */
export function Stepper({
  steps,
  current,
  testId,
}: {
  steps: { title: ReactNode; hint: ReactNode }[]
  current: number
  testId: string
}) {
  return (
    <ol className="steps" data-testid={testId}>
      {steps.map((s, i) => (
        <li
          key={i}
          className={`step ${i < current ? 'done' : ''}`}
          aria-current={i === current ? 'step' : undefined}
          data-testid={`${testId}-${i + 1}`}
          data-state={i < current ? 'done' : i === current ? 'current' : 'todo'}
        >
          <span className="n">{i < current ? <Icon name="check" size={13} /> : i + 1}</span>
          <div>
            {s.title}
            <small>{s.hint}</small>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Page numbers with first/previous/next/last and "go to page". */
export function Pagination({
  testId,
  page,
  pageSize,
  total,
  onPage,
}: {
  testId: string
  page: number
  pageSize: number
  total: number
  onPage: (p: number) => void
}) {
  const { t, i18n } = useTranslation()
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const [goto, setGoto] = useState('')
  const windowed = Array.from(new Set([1, page - 1, page, page + 1, pages]))
    .filter((p) => p >= 1 && p <= pages)
    .sort((a, b) => a - b)
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <div className="tfoot" data-testid={testId}>
      <span data-testid={`${testId}-summary`}>
        {t('pagination.showing', {
          from: formatNumber(from, i18n.language),
          to: formatNumber(to, i18n.language),
          total: formatNumber(total, i18n.language),
        })}
      </span>
      <nav className="pager" aria-label={t('pagination.label')}>
        <button
          type="button"
          data-testid={`${testId}-first`}
          aria-label={t('pagination.first')}
          disabled={page <= 1}
          onClick={() => onPage(1)}
        >
          «
        </button>
        <button
          type="button"
          data-testid={`${testId}-prev`}
          aria-label={t('pagination.previous')}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          ‹
        </button>
        {windowed.map((p, i) => (
          <span key={p} style={{ display: 'contents' }}>
            {i > 0 && p - windowed[i - 1]! > 1 ? <span className="gap">…</span> : null}
            <button
              type="button"
              data-testid={`${testId}-page-${p}`}
              data-page={p}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onPage(p)}
            >
              {p}
            </button>
          </span>
        ))}
        <button
          type="button"
          data-testid={`${testId}-next`}
          aria-label={t('pagination.next')}
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          ›
        </button>
        <button
          type="button"
          data-testid={`${testId}-last`}
          aria-label={t('pagination.last')}
          disabled={page >= pages}
          onClick={() => onPage(pages)}
        >
          »
        </button>
      </nav>
      <form
        className="actions"
        onSubmit={(e) => {
          e.preventDefault()
          const n = Number(goto)
          if (Number.isInteger(n) && n >= 1 && n <= pages) onPage(n)
          setGoto('')
        }}
      >
        <label htmlFor={`${testId}-goto`}>{t('pagination.goTo')}</label>
        <input
          id={`${testId}-goto`}
          data-testid={`${testId}-goto`}
          className="in"
          style={{ width: 64, height: 30 }}
          inputMode="numeric"
          value={goto}
          onChange={(e) => setGoto(e.target.value.replace(/\D/g, ''))}
        />
      </form>
    </div>
  )
}

/** A column header that toggles ascending/descending sort. */
export function SortHeader({
  field,
  sort,
  onSort,
  children,
  testId,
}: {
  field: string
  sort: string | undefined
  onSort: (s: string) => void
  children: ReactNode
  testId: string
}) {
  const active = sort === field || sort === `-${field}`
  const desc = sort === `-${field}`
  return (
    <th aria-sort={active ? (desc ? 'descending' : 'ascending') : undefined}>
      <button
        type="button"
        className="sort"
        data-testid={testId}
        onClick={() => onSort(active && !desc ? `-${field}` : field)}
      >
        {children}
        <span className="arrow" aria-hidden>
          {active ? (desc ? '▼' : '▲') : ''}
        </span>
      </button>
    </th>
  )
}

/** Calls `onVisible` when scrolled into view; renders a "Load more" fallback button. */
export function InfiniteSentinel({
  testId,
  hasMore,
  loading,
  onVisible,
}: {
  testId: string
  hasMore: boolean
  loading: boolean
  onVisible: () => void
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !hasMore) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !loading) onVisible()
    })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, loading, onVisible])
  if (!hasMore) {
    return <div className="more" data-testid={testId} data-state="end" ref={ref} />
  }
  return (
    <div className="more" data-testid={testId} data-state={loading ? 'loading' : 'idle'} ref={ref}>
      {loading ? (
        <>
          <span className="spin" /> {t('loadingMore')}
        </>
      ) : (
        <button type="button" className="btn ghost sm" data-testid={`${testId}-button`} onClick={onVisible}>
          {t('loadMore')}
        </button>
      )}
    </div>
  )
}

/** Centred message for "nothing here yet" and "no results". */
export function EmptyState({
  testId,
  title,
  children,
}: {
  testId: string
  title: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="empty" data-testid={testId}>
      <b>{title}</b>
      {children}
    </div>
  )
}

/** Inline spinner + label, with data-state for wait strategies. */
export function Loading({ testId, label }: { testId: string; label?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="more" data-testid={testId} data-state="loading" role="status">
      <span className="spin" /> {label ?? t('loading')}
    </div>
  )
}

export { Icon }
