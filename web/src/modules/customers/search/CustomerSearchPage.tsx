/**
 * Customer search (/customers). Filters, sort, page and page size live in the URL, so any
 * result can be linked to or opened directly by a test. Paging and sorting happen on the
 * server; the table shows a "Searching…" state (data-state) while a page loads.
 */
import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CUSTOMER_STATUS, KYC_STATUS, type CustomerListItem, type OffsetPage } from '@csm/shared'
import { ApiError, api } from '../../../api/client.ts'
import { useAction, useCan, useMe } from '../../../app/auth.tsx'
import { useCrumb } from '../../../app/AppShell.tsx'
import { StatusPill } from '../../../components/Badges.tsx'
import { Icon } from '../../../components/Icon.tsx'
import {
  EmptyState,
  KebabMenu,
  Pagination,
  SortHeader,
  Tooltip,
  type MenuItem,
} from '../../../components/Widgets.tsx'
import { formatDate, formatNumber } from '../../../lib/format.ts'

const FILTERS = ['cif', 'name', 'mobile', 'idNumber', 'status', 'kyc', 'from', 'to'] as const
type Filters = Record<(typeof FILTERS)[number], string>
const EMPTY: Filters = { cif: '', name: '', mobile: '', idNumber: '', status: '', kyc: '', from: '', to: '' }

/** /customers */
export default function CustomerSearchPage() {
  const { t, i18n } = useTranslation('customers')
  const lang = i18n.language
  const navigate = useNavigate()
  const me = useMe()
  const [params, setParams] = useSearchParams()
  const [collapsed, setCollapsed] = useState(false)
  const canExport = useCan('customers.search', 'export')
  const canOnboard = useCan('customers.onboard', 'create')
  const canRequest = useCan('serviceRequests.new', 'create')
  const blockAction = useAction('customers.360', 'edit')
  useCrumb([t('nav.customers'), t('search.title')])

  const settings = me.screens['customers.search']
  const pageSize = Number(params.get('pageSize')) || settings?.defaultPageSize || 25
  const page = Number(params.get('page')) || 1
  const sort = params.get('sort') ?? '-createdAt'
  const applied: Filters = Object.fromEntries(FILTERS.map((f) => [f, params.get(f) ?? ''])) as Filters
  // The form shows what's in the URL; reset it when the URL changes (back button, Reset, links).
  const [draft, setDraft] = useState<Filters>(applied)
  const [draftFor, setDraftFor] = useState(params.toString())
  if (draftFor !== params.toString()) {
    setDraftFor(params.toString())
    setDraft(applied)
  }

  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort })
  FILTERS.forEach((f) => applied[f] && query.set(f, applied[f]))
  const { data, isFetching, isPlaceholderData, error } = useQuery({
    queryKey: ['customers', 'search', query.toString()],
    queryFn: ({ signal }) => api<OffsetPage<CustomerListItem>>(`/customers?${query}`, { signal }),
    placeholderData: keepPreviousData,
  })

  const update = (changes: Record<string, string | number | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k)
      else next.set(k, String(v))
    }
    setParams(next)
  }
  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    update({ ...draft, page: 1 })
  }
  const exportHref = (() => {
    const q = new URLSearchParams(query)
    q.delete('page')
    q.delete('pageSize')
    return `/api/v1/customers/export.csv?${q}`
  })()

  const menuFor = (c: CustomerListItem): MenuItem[] => {
    if (c.status === 'draft') {
      return [
        {
          key: 'resume',
          label: t('search.menu.resume'),
          icon: 'edit',
          onSelect: () => navigate(`/customers/new?draft=${c.ref}`),
        },
      ]
    }
    const items: MenuItem[] = [
      {
        key: 'view',
        label: t('search.menu.view'),
        icon: 'eye',
        onSelect: () => navigate(`/customers/${c.ref}`),
      },
    ]
    if (canRequest)
      items.push({
        key: 'request',
        label: t('search.menu.request'),
        icon: 'plus',
        onSelect: () => navigate(`/service-requests/new?cif=${c.cif}`),
      })
    if (blockAction.visible) {
      const notActive = c.status !== 'active'
      items.push({
        key: 'block',
        label: t('search.menu.block'),
        icon: 'ban',
        separatorBefore: true,
        disabled: !blockAction.enabled || notActive,
        disabledReason: !blockAction.enabled
          ? blockAction.reason
          : notActive
            ? t('search.menu.onlyActive')
            : undefined,
        onSelect: () => navigate(`/customers/${c.ref}?action=block`),
      })
    }
    return items
  }

  const id = (f: string) => `search-${f}`
  return (
    <>
      <div className="ph">
        <div>
          <h1>{t('search.title')}</h1>
          <p>{t('search.subtitle')}</p>
        </div>
        <div className="grow" />
        {canOnboard ? (
          <button
            type="button"
            className="btn pri"
            data-testid="search-onboard"
            onClick={() => navigate('/customers/new')}
          >
            <Icon name="plus" />
            {t('search.onboard')}
          </button>
        ) : null}
      </div>

      <section className="panel" data-testid="search-criteria">
        <header>
          <h2>{t('search.criteria')}</h2>
          <div className="grow" />
          <button
            type="button"
            className="btn ghost sm"
            aria-expanded={!collapsed}
            aria-controls="search-form"
            data-testid="search-toggle"
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? t('common:show') : t('common:hide')}
          </button>
        </header>
        {!collapsed ? (
          <form id="search-form" className="body grid g4" onSubmit={onSearch} data-testid="search-form">
            {(['cif', 'name', 'mobile', 'idNumber'] as const).map((f) => (
              <div className="f" key={f}>
                <label htmlFor={id(f)}>{t(`search.fields.${f}`)}</label>
                <input
                  id={id(f)}
                  data-testid={id(f)}
                  className={`in ${f === 'cif' || f === 'mobile' || f === 'idNumber' ? 'mono' : ''}`}
                  value={draft[f]}
                  placeholder={t(`search.placeholders.${f}`)}
                  inputMode={f === 'mobile' ? 'numeric' : undefined}
                  onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                />
              </div>
            ))}
            <div className="f">
              <label htmlFor={id('status')}>{t('search.fields.status')}</label>
              <select
                id={id('status')}
                data-testid={id('status')}
                className="in"
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
              >
                <option value="">{t('common:all')}</option>
                {CUSTOMER_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {t(`common:status.${s}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="f">
              <label htmlFor={id('kyc')}>{t('search.fields.kyc')}</label>
              <select
                id={id('kyc')}
                data-testid={id('kyc')}
                className="in"
                value={draft.kyc}
                onChange={(e) => setDraft({ ...draft, kyc: e.target.value })}
              >
                <option value="">{t('common:all')}</option>
                {KYC_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {t(`common:status.${s}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="f">
              <label htmlFor={id('from')}>{t('search.fields.from')}</label>
              <input
                type="date"
                id={id('from')}
                data-testid={id('from')}
                className="in"
                value={draft.from}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
              />
            </div>
            <div className="f">
              <label htmlFor={id('to')}>{t('search.fields.to')}</label>
              <input
                type="date"
                id={id('to')}
                data-testid={id('to')}
                className="in"
                value={draft.to}
                min={draft.from || undefined}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              />
            </div>
            <div className="span-all actions">
              <div className="grow" />
              <button
                type="button"
                className="btn"
                data-testid="search-reset"
                onClick={() => {
                  setDraft(EMPTY)
                  setParams(new URLSearchParams())
                }}
              >
                {t('search.reset')}
              </button>
              <button type="submit" className="btn pri" data-testid="search-submit">
                <Icon name="search" />
                {t('search.submit')}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      {/* data-state stays "loading" while the previous page is still on screen; data-page is the page shown. */}
      <section
        className="panel tw"
        data-testid="search-results"
        data-page={data?.page}
        data-state={
          isFetching || isPlaceholderData
            ? 'loading'
            : error
              ? 'error'
              : data?.items.length
                ? 'loaded'
                : 'empty'
        }
      >
        <div className="tfoot top">
          <b style={{ color: 'var(--ink)' }} data-testid="search-total">
            {data ? t('search.total', { count: data.total, formatted: formatNumber(data.total, lang) }) : '…'}
          </b>
          {isFetching ? (
            <span className="saved" data-testid="search-loading">
              <span className="spin" /> {t('search.searching')}
            </span>
          ) : null}
          <div className="grow" />
          <label htmlFor="search-page-size">{t('search.rowsPerPage')}</label>
          <select
            id="search-page-size"
            data-testid="search-page-size"
            className="in"
            style={{ width: 76, height: 30 }}
            value={pageSize}
            onChange={(e) => update({ pageSize: e.target.value, page: 1 })}
          >
            {[10, 25, 50, 100]
              .filter((n) => n <= (settings?.maxPageSize ?? 100))
              .map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
          </select>
          {canExport ? (
            <a className="btn sm" href={exportHref} data-testid="search-export" download>
              <Icon name="download" />
              {t('search.export')}
            </a>
          ) : null}
        </div>
        {error ? (
          <div className="note bad" role="alert" data-testid="search-error" style={{ margin: 14 }}>
            {error instanceof ApiError ? error.message : t('common:error.generic')}
          </div>
        ) : data && data.items.length === 0 ? (
          <EmptyState testId="search-empty" title={t('search.empty')}>
            <p>{t('search.emptyHint')}</p>
          </EmptyState>
        ) : (
          <table data-testid="search-table">
            <thead>
              <tr>
                <SortHeader
                  field="cif"
                  sort={sort}
                  onSort={(s) => update({ sort: s, page: 1 })}
                  testId="search-sort-cif"
                >
                  {t('search.columns.cif')}
                </SortHeader>
                <SortHeader
                  field="nameSearch"
                  sort={sort}
                  onSort={(s) => update({ sort: s, page: 1 })}
                  testId="search-sort-name"
                >
                  {t('search.columns.name')}
                </SortHeader>
                <th>{t('search.columns.mobile')}</th>
                <SortHeader
                  field="status"
                  sort={sort}
                  onSort={(s) => update({ sort: s, page: 1 })}
                  testId="search-sort-status"
                >
                  {t('search.columns.status')}
                </SortHeader>
                <th>{t('search.columns.kyc')}</th>
                <SortHeader
                  field="createdAt"
                  sort={sort}
                  onSort={(s) => update({ sort: s, page: 1 })}
                  testId="search-sort-onboarded"
                >
                  {t('search.columns.onboarded')}
                </SortHeader>
                <th>
                  <span className="sr-only">{t('search.columns.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((c) => (
                <tr
                  key={c.ref}
                  className="clickable"
                  data-row-id={c.ref}
                  data-testid="search-row"
                  onClick={() =>
                    navigate(c.status === 'draft' ? `/customers/new?draft=${c.ref}` : `/customers/${c.ref}`)
                  }
                >
                  <td className="mono" data-testid="search-row-ref">
                    {c.cif ?? c.draftNo}
                  </td>
                  <td data-testid="search-row-name">{c.name}</td>
                  <td className="mono" data-testid="search-row-mobile">
                    {c.mobile}
                  </td>
                  <td>
                    <StatusPill value={c.status} testId="search-row-status" />
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <StatusPill value={c.kycStatus} testId="search-row-kyc" />
                      {c.kycExpiryDate ? (
                        <Tooltip
                          testId={`search-row-kyc-tip-${c.ref}`}
                          text={t(c.kycStatus === 'expired' ? 'search.kycExpired' : 'search.kycExpires', {
                            date: formatDate(c.kycExpiryDate, lang),
                          })}
                        >
                          <button
                            type="button"
                            className="kebab"
                            style={{ padding: 0 }}
                            aria-label={t('search.kycInfo')}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Icon name="info" />
                          </button>
                        </Tooltip>
                      ) : null}
                    </span>
                  </td>
                  <td className="num">{formatDate(c.createdAt, lang)}</td>
                  <td style={{ textAlign: 'end' }}>
                    <KebabMenu
                      testId={`search-row-menu-${c.ref}`}
                      label={t('search.columns.actions')}
                      items={menuFor(c)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && data.total > 0 ? (
          <Pagination
            testId="search-pagination"
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPage={(p) => update({ page: p })}
          />
        ) : null}
      </section>
    </>
  )
}
