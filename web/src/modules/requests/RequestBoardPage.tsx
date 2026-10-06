/**
 * Request board (/service-requests). Board view: four status columns, each loading more as
 * you scroll (cursor pagination), with drag and drop between columns. The board enforces the
 * state machine: invalid moves are refused, Resolved asks for notes, Closed needs Approve.
 * List view (?view=list): a sortable, paginated table with filters and CSV export.
 * Filters (queue, priority, search) and the open request (?sr=) live in the URL.
 */
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  SR_PRIORITIES,
  SR_STATUS,
  canTransition,
  type OffsetPage,
  type ServiceRequestCard,
  type SrStatus,
} from '@csm/shared'
import { api } from '../../api/client.ts'
import { useCan, useMe } from '../../app/auth.tsx'
import { useCrumb } from '../../app/AppShell.tsx'
import { PriorityBadge, SlaTimer, StatusPill } from '../../components/Badges.tsx'
import { Icon } from '../../components/Icon.tsx'
import { useToast } from '../../components/Toast.tsx'
import { EmptyState, InfiniteSentinel, Loading, Pagination, SortHeader } from '../../components/Widgets.tsx'
import { useDebounce } from '../../hooks/useDebounce.ts'
import { formatNumber } from '../../lib/format.ts'
import { RequestDrawer, useStatusChange } from './RequestDrawer.tsx'
import { ResolveModal } from './ResolveModal.tsx'

interface Filters {
  queue: string
  priority: string
  q: string
}

function Card({
  sr,
  onOpen,
  onDragStart,
  dragging,
}: {
  sr: ServiceRequestCard
  onOpen: () => void
  onDragStart: () => void
  dragging: boolean
}) {
  return (
    <button
      type="button"
      className={`card ${dragging ? 'dragging' : ''}`}
      draggable
      data-testid="board-card"
      data-sr-no={sr.srNo}
      data-status={sr.status}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', sr.srNo)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onClick={onOpen}
    >
      <span className="r">
        <span className="mono" style={{ color: 'var(--ink)' }}>
          {sr.srNo}
        </span>
        <span className="grow" />
        <PriorityBadge value={sr.priority} />
      </span>
      <span className="t">{sr.subject}</span>
      <span className="r">
        {sr.customerName}
        <span className="grow" />
        <SlaTimer slaDueAt={sr.slaDueAt} status={sr.status} />
      </span>
    </button>
  )
}

function Column({
  status,
  filters,
  dragged,
  onDragStart,
  onDrop,
  onOpen,
}: {
  status: SrStatus
  filters: Filters
  dragged: ServiceRequestCard | null
  onDragStart: (sr: ServiceRequestCard) => void
  onDrop: (status: SrStatus) => void
  onOpen: (srNo: string) => void
}) {
  const { t, i18n } = useTranslation('requests')
  const canApprove = useCan('serviceRequests.board', 'approve')
  const [over, setOver] = useState(false)
  const qs = new URLSearchParams({
    status,
    queue: filters.queue,
    limit: '10',
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.q ? { q: filters.q } : {}),
  })
  const q = useInfiniteQuery({
    queryKey: ['board', status, filters],
    queryFn: ({ pageParam, signal }) =>
      api<{ items: ServiceRequestCard[]; nextCursor: string | null; total: number }>(
        `/service-requests/board?${qs}${pageParam ? `&cursor=${pageParam}` : ''}`,
        { signal },
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  const items = q.data?.pages.flatMap((p) => p.items) ?? []
  const total = q.data?.pages[0]?.total ?? 0
  const locked = status === 'closed' && !canApprove
  const allowed = dragged ? canTransition(dragged.status, status) && !locked : false
  return (
    <section
      className={`col ${over ? 'over' : ''} ${locked || (dragged && !allowed) ? 'locked' : ''}`}
      data-testid={`board-column-${status}`}
      data-state={q.isLoading ? 'loading' : 'loaded'}
      data-drop={dragged ? (allowed ? 'allowed' : 'blocked') : undefined}
      aria-label={t(`common:status.${status}`)}
      onDragOver={(e) => {
        if (!dragged || dragged.status === status) return
        // Accept the drop even when the move isn't allowed, so the user is told why (toast).
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        onDrop(status)
      }}
    >
      <h3>
        {t(`common:status.${status}`)}
        <span className="c" data-testid={`board-column-${status}-count`}>
          {formatNumber(total, i18n.language)}
        </span>
      </h3>
      {locked ? (
        <div
          className="help"
          style={{ display: 'flex', gap: 6, padding: 4, alignItems: 'center' }}
          data-testid="board-closed-locked"
        >
          <Icon name="lock" />
          {t('board.closeNeedsApprove')}
        </div>
      ) : null}
      {q.isLoading ? <Loading testId={`board-column-${status}-loading`} /> : null}
      {items.map((sr) => (
        <Card
          key={sr.srNo}
          sr={sr}
          dragging={dragged?.srNo === sr.srNo}
          onDragStart={() => onDragStart(sr)}
          onOpen={() => onOpen(sr.srNo)}
        />
      ))}
      {!q.isLoading && !items.length ? (
        <span className="help" style={{ padding: 4 }}>
          {t('board.emptyColumn')}
        </span>
      ) : null}
      <InfiniteSentinel
        testId={`board-column-${status}-more`}
        hasMore={!!q.hasNextPage}
        loading={q.isFetchingNextPage}
        onVisible={() => void q.fetchNextPage()}
      />
    </section>
  )
}

function ListView({ filters, onOpen }: { filters: Filters; onOpen: (srNo: string) => void }) {
  const { t } = useTranslation('requests')
  const me = useMe()
  const [params, setParams] = useSearchParams()
  const canExport = useCan('serviceRequests.board', 'export')
  const page = Number(params.get('page')) || 1
  const sort = params.get('sort') ?? '-createdAt'
  const status = params.get('status') ?? ''
  const pageSize = me.screens['serviceRequests.board']?.defaultPageSize ?? 25
  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sort,
    queue: filters.queue,
    ...(status ? { status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.q ? { q: filters.q } : {}),
  })
  const { data, isFetching, isPlaceholderData } = useQuery({
    queryKey: ['service-requests', 'list', qs.toString()],
    queryFn: ({ signal }) => api<OffsetPage<ServiceRequestCard>>(`/service-requests?${qs}`, { signal }),
    placeholderData: keepPreviousData,
  })
  const set = (k: string, v: string | number) => {
    const next = new URLSearchParams(params)
    if (v === '') next.delete(k)
    else next.set(k, String(v))
    if (k !== 'page') next.set('page', '1')
    setParams(next)
  }
  const exportQs = new URLSearchParams(qs)
  exportQs.delete('page')
  exportQs.delete('pageSize')
  return (
    <section
      className="panel tw"
      data-testid="sr-list"
      data-page={data?.page}
      data-state={isFetching || isPlaceholderData ? 'loading' : 'loaded'}
    >
      <div className="tfoot top">
        <label htmlFor="sr-list-status">{t('fields.status')}</label>
        <select
          id="sr-list-status"
          data-testid="sr-list-status"
          className="in"
          style={{ width: 160, height: 30 }}
          value={status}
          onChange={(e) => set('status', e.target.value)}
        >
          <option value="">{t('common:all')}</option>
          {SR_STATUS.map((s) => (
            <option key={s} value={s}>
              {t(`common:status.${s}`)}
            </option>
          ))}
        </select>
        {isFetching ? <span className="spin" /> : null}
        <div className="grow" />
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
        <table data-testid="sr-list-table">
          <thead>
            <tr>
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
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((r) => (
              <tr
                key={r.srNo}
                className="clickable"
                data-row-id={r.srNo}
                data-testid="sr-list-row"
                onClick={() => onOpen(r.srNo)}
              >
                <td className="mono">{r.srNo}</td>
                <td style={{ whiteSpace: 'normal', minWidth: 220 }}>{r.subject}</td>
                <td>{r.customerName}</td>
                <td>
                  <PriorityBadge value={r.priority} />
                </td>
                <td>
                  <StatusPill value={r.status} />
                </td>
                <td>
                  <SlaTimer slaDueAt={r.slaDueAt} status={r.status} />
                </td>
                <td className="mono">{r.assignedTo}</td>
              </tr>
            ))}
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
}

/** /service-requests */
export default function RequestBoardPage() {
  const { t } = useTranslation('requests')
  const me = useMe()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const canApprove = useCan('serviceRequests.board', 'approve')
  const canEdit = useCan('serviceRequests.board', 'edit')
  const change = useStatusChange()
  const [dragged, setDragged] = useState<ServiceRequestCard | null>(null)
  const [resolving, setResolving] = useState<ServiceRequestCard | null>(null)
  const [search, setSearch] = useState(params.get('q') ?? '')
  const debounced = useDebounce(search.trim(), 400)
  useCrumb([t('nav.requests'), t('board.title')])

  const view = params.get('view') === 'list' ? 'list' : 'board'
  const filters: Filters = {
    queue: params.get('queue') ?? 'mine',
    priority: params.get('priority') ?? '',
    q: debounced.length >= 2 ? debounced : '',
  }
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next)
  }
  const open = (srNo: string) => set('sr', srNo)

  const drop = (target: SrStatus) => {
    const sr = dragged
    setDragged(null)
    if (!sr || sr.status === target) return
    if (!canEdit) return toast(t('board.noEdit'), 'error')
    if (!canTransition(sr.status, target)) {
      return toast(
        t('board.invalidMove', { from: t(`common:status.${sr.status}`), to: t(`common:status.${target}`) }),
        'error',
      )
    }
    if (target === 'closed' && !canApprove) return toast(t('board.closeNeedsApprove'), 'error')
    if (target === 'resolved') return setResolving(sr)
    change.mutate({ srNo: sr.srNo, status: target, version: sr.version })
  }

  return (
    <>
      <div className="ph">
        <div>
          <h1>{t('board.title')}</h1>
          <p>{view === 'board' ? t('board.subtitle') : t('board.listSubtitle')}</p>
        </div>
        <div className="grow" />
        <div
          className="steps"
          role="group"
          aria-label={t('board.view')}
          style={{ borderRadius: 6 }}
          data-testid="board-view-toggle"
        >
          {(['board', 'list'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className="step"
              aria-pressed={view === v}
              aria-current={view === v ? 'step' : undefined}
              data-testid={`board-view-${v}`}
              style={{
                padding: '7px 14px',
                flex: 'none',
                border: 0,
                background: 'none',
                cursor: 'pointer',
                font: 'inherit',
              }}
              onClick={() => set('view', v === 'list' ? 'list' : '')}
            >
              <Icon name={v === 'board' ? 'board' : 'list'} />
              {t(`board.views.${v}`)}
            </button>
          ))}
        </div>
        <label htmlFor="board-queue" className="sr-only">
          {t('board.queue')}
        </label>
        <select
          id="board-queue"
          data-testid="board-queue"
          className="in"
          style={{ width: 170 }}
          value={filters.queue}
          onChange={(e) => set('queue', e.target.value === 'mine' ? '' : e.target.value)}
        >
          <option value="mine">{t('board.queues.mine')}</option>
          <option value="branch">{t('board.queues.branch')}</option>
          {me.user.roleKey === 'admin' ? <option value="all">{t('board.queues.all')}</option> : null}
        </select>
        <label htmlFor="board-priority" className="sr-only">
          {t('fields.priority')}
        </label>
        <select
          id="board-priority"
          data-testid="board-priority"
          className="in"
          style={{ width: 150 }}
          value={filters.priority}
          onChange={(e) => set('priority', e.target.value)}
        >
          <option value="">{t('board.anyPriority')}</option>
          {SR_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {t(`common:priority.${p}`)}
            </option>
          ))}
        </select>
        <div className="affix" style={{ width: 230 }}>
          <span aria-hidden>
            <Icon name="search" />
          </span>
          <input
            id="board-search"
            data-testid="board-search"
            className="in"
            aria-label={t('board.searchLabel')}
            placeholder={t('board.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {view === 'board' ? (
        <div className="board" data-testid="board" onDragEnd={() => setDragged(null)}>
          {SR_STATUS.map((s) => (
            <Column
              key={s}
              status={s}
              filters={filters}
              dragged={dragged}
              onDragStart={setDragged}
              onDrop={drop}
              onOpen={open}
            />
          ))}
        </div>
      ) : (
        <ListView filters={filters} onOpen={open} />
      )}

      {params.get('sr') ? <RequestDrawer srNo={params.get('sr')!} onClose={() => set('sr', '')} /> : null}
      {resolving ? (
        <ResolveModal
          srNo={resolving.srNo}
          busy={change.isPending}
          onCancel={() => setResolving(null)}
          onConfirm={(notes) =>
            change.mutate(
              {
                srNo: resolving.srNo,
                status: 'resolved',
                version: resolving.version,
                resolutionNotes: notes,
              },
              { onSettled: () => setResolving(null) },
            )
          }
        />
      ) : null}
    </>
  )
}
