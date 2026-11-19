/**
 * Request list view (?view=list): sortable, paginated table. A row expands to show the description,
 * tags and latest comment; priority and assignee can be changed in the row (Enter saves, Escape
 * cancels); with Split view on, the selected request shows beside the list in resizable panels.
 * The new parts carry no ids or test ids (plan §3, XP): reach cells by column header, e.g.
 * //tr[td[2]='SR-2026-000012']/td[count(//th[.='Priority']/preceding-sibling::th)+1]
 */
import { Fragment, useState } from 'react'
import { useSearchParams } from 'react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  SR_PRIORITIES,
  type CommentDTO,
  type CursorPage,
  type OffsetPage,
  type ServiceRequestCard,
  type ServiceRequestDetail,
  type SrPriority,
} from '@csm/shared'
import { ApiError, api } from '../../api/client.ts'
import { useCan, useMe } from '../../app/auth.tsx'
import { PriorityBadge, SlaTimer, StatusPill } from '../../components/Badges.tsx'
import { Icon } from '../../components/Icon.tsx'
import { LocatorBadge } from '../../components/LocatorBadge.tsx'
import { useToast } from '../../components/Toast.tsx'
import { EmptyState, Pagination, SortHeader } from '../../components/Widgets.tsx'
import { ResizablePanels } from '../../components/data/ResizablePanels.tsx'
import { StarDisplay } from '../../components/selection/StarRating.tsx'
import { formatDateTime } from '../../lib/format.ts'
import { CustomerHoverCard, StaffHoverCard } from '../customers/HoverCards.tsx'
import { updateRequest } from './api.ts'
import { RequestDetails } from './RequestDrawer.tsx'

export interface ListFilters {
  queue: string
  priority: string
  q: string
  statuses: string[]
  categories: string[]
  tags: string[]
}

const SPLIT_KEY = 'csm.srSplit'

export type Split = { on: boolean; size: number }

/** Split view on/off and its width, remembered in this browser. */
export function useSplit() {
  const read = () => {
    try {
      const v = JSON.parse(localStorage.getItem(SPLIT_KEY) ?? 'null') as { on: boolean; size: number } | null
      return v && typeof v.size === 'number' ? v : { on: false, size: 55 }
    } catch {
      return { on: false, size: 55 }
    }
  }
  const [split, setSplitState] = useState(read)
  const setSplit = (next: { on: boolean; size: number }) => {
    setSplitState(next)
    try {
      localStorage.setItem(SPLIT_KEY, JSON.stringify(next))
    } catch {
      // Storage blocked: remembered for this visit only.
    }
  }
  return [split, setSplit] as const
}

/** The expanded part of a row: description, tags, latest comment. */
function RowDetail({ sr }: { sr: ServiceRequestCard }) {
  const { t, i18n } = useTranslation('requests')
  const detail = useQuery({
    queryKey: ['sr', sr.srNo],
    queryFn: () => api<ServiceRequestDetail>(`/service-requests/${sr.srNo}`),
  })
  const latest = useQuery({
    queryKey: ['sr', sr.srNo, 'latest-comment'],
    queryFn: () =>
      api<CursorPage<CommentDTO>>(`/service-requests/${sr.srNo}/comments?limit=1`).then(
        (p) => p.items[0] ?? null,
      ),
  })
  return (
    <div className="row-detail">
      <div>
        <b>{t('fields.description')}</b>
        <p>{detail.data?.description ?? '…'}</p>
      </div>
      <div>
        <b>{t('tags.title')}</b>
        <p>{sr.tags.length ? sr.tags.join(', ') : t('tags.none')}</p>
      </div>
      <div>
        <b>{t('list.latestComment')}</b>
        <p>
          {latest.isLoading
            ? '…'
            : latest.data
              ? `${latest.data.text} — ${latest.data.byName}, ${formatDateTime(latest.data.createdAt, i18n.language)}`
              : t('drawer.noComments')}
        </p>
      </div>
    </div>
  )
}

/** A cell value with an edit button; editing shows a select. Enter saves, Escape (or leaving) cancels. */
function InlineSelect({
  display,
  value,
  options,
  label,
  editable,
  onSave,
}: {
  display: React.ReactNode
  value: string
  options: { value: string; label: string }[]
  label: string
  editable: boolean
  onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  if (!editing) {
    return (
      <span className="inline-edit">
        {display}
        {editable ? (
          <button
            type="button"
            className="btn icon ghost sm"
            onClick={(e) => {
              e.stopPropagation()
              setDraft(value)
              setEditing(true)
            }}
          >
            <Icon name="edit" />
            <span className="sr-only">{label}</span>
          </button>
        ) : null}
      </span>
    )
  }
  return (
    <select
      className="in inline-select"
      aria-label={label}
      autoFocus
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          setEditing(false)
          if (draft !== value) onSave(draft)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setEditing(false)
        }
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

/** The list (and, in split view, the selected request beside it). */
export function RequestList({
  filters,
  selected,
  onOpen,
  split,
  setSplit,
}: {
  filters: ListFilters
  selected: string | null
  onOpen: (srNo: string) => void
  split: Split
  setSplit: (s: Split) => void
}) {
  const { t } = useTranslation('requests')
  const me = useMe()
  const toast = useToast()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const canExport = useCan('serviceRequests.board', 'export')
  const canEdit = useCan('serviceRequests.board', 'edit')
  const canAssign = useCan('serviceRequests.new', 'create')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const page = Number(params.get('page')) || 1
  const sort = params.get('sort') ?? '-createdAt'
  const pageSize = me.screens['serviceRequests.board']?.defaultPageSize ?? 25
  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sort,
    queue: filters.queue,
    ...(filters.statuses.length ? { status: filters.statuses.join(',') } : {}),
    ...(filters.categories.length ? { categories: filters.categories.join(',') } : {}),
    ...(filters.tags.length ? { tags: filters.tags.join(',') } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.q ? { q: filters.q } : {}),
  })
  const { data, isFetching, isPlaceholderData } = useQuery({
    queryKey: ['service-requests', 'list', qs.toString()],
    queryFn: ({ signal }) => api<OffsetPage<ServiceRequestCard>>(`/service-requests?${qs}`, { signal }),
    placeholderData: keepPreviousData,
  })
  const assignees = useQuery({
    queryKey: ['assignees'],
    queryFn: () =>
      api<{ items: { staffId: string; name: string }[] }>('/service-requests/assignees').then((r) => r.items),
    enabled: canEdit && canAssign,
  })
  const edit = useMutation({
    mutationFn: (v: { sr: ServiceRequestCard; patch: { priority?: SrPriority; assignedTo?: string } }) =>
      updateRequest(v.sr.srNo, v.sr.version, v.patch),
    onSuccess: (sr) => {
      toast(t('list.saved', { srNo: sr.srNo }))
      void qc.invalidateQueries({ queryKey: ['service-requests'] })
      void qc.invalidateQueries({ queryKey: ['board'] })
      qc.setQueryData(['sr', sr.srNo], sr)
    },
    onError: (err) => {
      toast(err instanceof ApiError ? err.message : t('common:error.generic'), 'error')
      void qc.invalidateQueries({ queryKey: ['service-requests'] })
    },
  })
  const set = (k: string, v: string | number) => {
    const next = new URLSearchParams(params)
    if (v === '') next.delete(k)
    else next.set(k, String(v))
    if (k !== 'page') next.set('page', '1')
    setParams(next)
  }
  const toggle = (srNo: string) =>
    setExpanded((s) => {
      const n = new Set(s)
      if (n.has(srNo)) n.delete(srNo)
      else n.add(srNo)
      return n
    })
  const exportQs = new URLSearchParams(qs)
  exportQs.delete('page')
  exportQs.delete('pageSize')

  const table = (
    <section
      className="panel tw"
      data-testid="sr-list"
      data-page={data?.page}
      data-state={isFetching || isPlaceholderData ? 'loading' : 'loaded'}
    >
      <div className="tfoot top">
        <LocatorBadge style="XP" />
        {isFetching ? <span className="spin" /> : null}
        <div className="grow" />
        <button
          type="button"
          className="btn sm ghost"
          aria-pressed={split.on}
          onClick={() => setSplit({ ...split, on: !split.on })}
        >
          <Icon name="list" />
          {t('list.split')}
        </button>
        {canExport ? (
          <a
            className="btn sm"
            href={`/api/v1/service-requests/export.csv?${exportQs}`}
            download
            data-testid="sr-list-export"
          >
            <Icon name="download" />
            {t('board.export')}
          </a>
        ) : null}
      </div>
      {data && !data.items.length ? (
        <EmptyState testId="sr-list-empty" title={t('board.noResults')} />
      ) : (
        <table data-testid="sr-list-table" aria-label={t('list.caption')}>
          <thead>
            <tr>
              <th>
                <span className="sr-only">{t('list.expandColumn')}</span>
              </th>
              <SortHeader field="srNo" sort={sort} onSort={(s) => set('sort', s)} testId="sr-list-sort-srno">
                {t('fields.srNo')}
              </SortHeader>
              <th>{t('fields.subject')}</th>
              <th>{t('fields.customer')}</th>
              <SortHeader
                field="priority"
                sort={sort}
                onSort={(s) => set('sort', s)}
                testId="sr-list-sort-priority"
              >
                {t('fields.priority')}
              </SortHeader>
              <SortHeader
                field="status"
                sort={sort}
                onSort={(s) => set('sort', s)}
                testId="sr-list-sort-status"
              >
                {t('fields.status')}
              </SortHeader>
              <SortHeader
                field="slaDueAt"
                sort={sort}
                onSort={(s) => set('sort', s)}
                testId="sr-list-sort-sla"
              >
                {t('fields.slaDue')}
              </SortHeader>
              <th>{t('fields.assignee')}</th>
              <th>{t('csat.short')}</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((r) => {
              const open = expanded.has(r.srNo)
              const rowEditable = canEdit && r.status !== 'closed'
              return (
                <Fragment key={r.srNo}>
                  <tr
                    className={`clickable ${selected === r.srNo ? 'selected' : ''}`}
                    data-row-id={r.srNo}
                    data-testid="sr-list-row"
                    aria-expanded={open}
                    onClick={() => onOpen(r.srNo)}
                  >
                    <td>
                      <button
                        type="button"
                        className="btn icon ghost sm"
                        aria-expanded={open}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggle(r.srNo)
                        }}
                      >
                        <Icon name={open ? 'back' : 'next'} />
                        <span className="sr-only">{t('list.showDetails')}</span>
                      </button>
                    </td>
                    <td className="mono">{r.srNo}</td>
                    <td style={{ whiteSpace: 'normal', minWidth: 200 }}>{r.subject}</td>
                    <td>
                      <CustomerHoverCard customerRef={r.customerCif}>{r.customerName}</CustomerHoverCard>
                    </td>
                    <td>
                      <InlineSelect
                        display={<PriorityBadge value={r.priority} />}
                        value={r.priority}
                        label={t('list.changePriority')}
                        editable={rowEditable}
                        options={SR_PRIORITIES.map((p) => ({ value: p, label: t(`common:priority.${p}`) }))}
                        onSave={(v) => edit.mutate({ sr: r, patch: { priority: v as SrPriority } })}
                      />
                    </td>
                    <td>
                      <StatusPill value={r.status} />
                    </td>
                    <td>
                      <SlaTimer slaDueAt={r.slaDueAt} status={r.status} />
                    </td>
                    <td className="mono">
                      <InlineSelect
                        display={
                          r.assignedTo ? (
                            <StaffHoverCard staffId={r.assignedTo}>{r.assignedTo}</StaffHoverCard>
                          ) : (
                            '—'
                          )
                        }
                        value={r.assignedTo ?? ''}
                        label={t('list.changeAssignee')}
                        editable={rowEditable && canAssign}
                        options={(assignees.data ?? []).map((a) => ({
                          value: a.staffId,
                          label: `${a.name} (${a.staffId})`,
                        }))}
                        onSave={(v) => edit.mutate({ sr: r, patch: { assignedTo: v } })}
                      />
                    </td>
                    <td>
                      {r.csat?.rating ? <StarDisplay value={r.csat.rating} /> : r.csat?.declined ? '—' : ''}
                    </td>
                  </tr>
                  {open ? (
                    <tr className="detail-row">
                      <td colSpan={9}>
                        <RowDetail sr={r} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
      {data && data.total ? (
        <Pagination
          testId="sr-list-pagination"
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPage={(p) => set('page', p)}
        />
      ) : null}
    </section>
  )

  if (!split.on) return table
  return (
    <div className="sr-split">
      <ResizablePanels
        label={t('list.splitLabel')}
        size={split.size}
        onSize={(size) => setSplit({ on: true, size })}
        min={20}
        max={80}
        height="calc(100vh - 200px)"
        start={table}
        end={
          <div className="panel sr-split-detail">
            <div className="body">
              {selected ? <RequestDetails srNo={selected} /> : <p className="help">{t('list.pickOne')}</p>}
            </div>
          </div>
        }
      />
      <LocatorBadge style="CLS" />
    </div>
  )
}
