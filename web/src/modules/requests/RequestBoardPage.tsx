/**
 * Request board (/service-requests). Board view: status columns, each loading more as you scroll
 * (cursor pagination), with drag and drop between columns or each card's "Move to ▸" menu. The board
 * enforces the state machine: invalid moves are refused, Resolved asks for notes and the customer's
 * rating, Closed needs Approve. List view (?view=list): see RequestList.
 * Filters live in the URL: queue, priority, q, statuses=open,in_progress, categories=cards,loans,
 * tags=VIP. The open request is ?sr=. "Present" shows the board full screen.
 */
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  SR_PRIORITIES,
  SR_STANDARD_TAGS,
  SR_STATUS,
  canTransition,
  type ServiceRequestCard,
  type SrStatus,
} from '@csm/shared'
import { api } from '../../api/client.ts'
import { useCan, useMe } from '../../app/auth.tsx'
import { useCrumb } from '../../app/AppShell.tsx'
import { Icon } from '../../components/Icon.tsx'
import { LocatorBadge } from '../../components/LocatorBadge.tsx'
import { useToast } from '../../components/Toast.tsx'
import { InfiniteSentinel, Loading } from '../../components/Widgets.tsx'
import { ChipSelect } from '../../components/selection/ChipSelect.tsx'
import { MultiSelect } from '../../components/selection/MultiSelect.tsx'
import { useDebounce } from '../../hooks/useDebounce.ts'
import { useLookups } from '../../hooks/useLookups.ts'
import { formatNumber, label } from '../../lib/format.ts'
import { BoardCard } from './BoardCard.tsx'
import { DesktopAlerts } from './DesktopAlerts.tsx'
import { RequestDrawer, useStatusChange } from './RequestDrawer.tsx'
import { RequestList, useSplit, type ListFilters } from './RequestList.tsx'
import { ResolveModal } from './ResolveModal.tsx'
import './requests.css'

type Filters = ListFilters

/** "a,b" → ['a','b']; missing → []. */
const listParam = (v: string | null) => (v ? v.split(',').filter(Boolean) : [])

function Column({
  status,
  filters,
  dragged,
  onDragStart,
  onDrop,
  onOpen,
  onMove,
}: {
  status: SrStatus
  filters: Filters
  dragged: ServiceRequestCard | null
  onDragStart: (sr: ServiceRequestCard) => void
  onDrop: (status: SrStatus) => void
  onOpen: (srNo: string) => void
  onMove: (sr: ServiceRequestCard, status: SrStatus) => void
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
    ...(filters.categories.length ? { categories: filters.categories.join(',') } : {}),
    ...(filters.tags.length ? { tags: filters.tags.join(',') } : {}),
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
        <BoardCard
          key={sr.srNo}
          sr={sr}
          dragging={dragged?.srNo === sr.srNo}
          onDragStart={() => onDragStart(sr)}
          onOpen={() => onOpen(sr.srNo)}
          onMove={(target) => onMove(sr, target)}
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

/** /service-requests */
export default function RequestBoardPage() {
  const { t, i18n } = useTranslation('requests')
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

  const categories = useLookups('srCategories')
  const [split, setSplit] = useSplit()
  const boardRef = useRef<HTMLDivElement>(null)
  const [presenting, setPresenting] = useState(false)
  useEffect(() => {
    const onChange = () =>
      setPresenting(document.fullscreenElement === boardRef.current && !!boardRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const view = params.get('view') === 'list' ? 'list' : 'board'
  const filters: Filters = {
    queue: params.get('queue') ?? 'mine',
    priority: params.get('priority') ?? '',
    q: debounced.length >= 2 ? debounced : '',
    statuses: listParam(params.get('statuses')),
    categories: listParam(params.get('categories')),
    tags: listParam(params.get('tags')),
  }
  const columns = filters.statuses.length ? SR_STATUS.filter((s) => filters.statuses.includes(s)) : SR_STATUS
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
    if (sr) move(sr, target)
  }

  /** Drag and drop and "Move to ▸" both end here, so both follow the same rules. */
  const move = (sr: ServiceRequestCard, target: SrStatus) => {
    if (sr.status === target) return
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

      <div className="sr-filters">
        <MultiSelect
          label={t('filters.statuses')}
          placeholder={t('filters.allStatuses')}
          options={SR_STATUS.map((v) => ({ value: v, label: t(`common:status.${v}`) }))}
          value={filters.statuses}
          onChange={(v) => set('statuses', v.join(','))}
        />
        <MultiSelect
          label={t('filters.categories')}
          placeholder={t('filters.allCategories')}
          options={(categories.data ?? []).map((c) => ({
            value: c.code,
            label: label(c.labels, i18n.language),
          }))}
          value={filters.categories}
          onChange={(v) => set('categories', v.join(','))}
        />
        <LocatorBadge style="ARIA" />
        <div className="sr-tag-filter" aria-label={t('filters.tags')} role="group">
          <ChipSelect
            label={t('filters.tags')}
            options={SR_STANDARD_TAGS.map((v) => ({ value: v, label: v }))}
            value={filters.tags}
            allowCreate
            onChange={(v) => set('tags', v.join(','))}
          />
        </div>
        <div className="grow" />
        <DesktopAlerts />
        {view === 'board' ? (
          <button
            type="button"
            className="btn icon"
            title={t('board.present')}
            onClick={() => void boardRef.current?.requestFullscreen?.()}
          >
            <Icon name="expand" />
          </button>
        ) : null}
        {view === 'board' ? <LocatorBadge style="TTL" /> : null}
      </div>

      {view === 'board' ? (
        <div
          ref={boardRef}
          className={`board ${presenting ? 'presenting' : ''}`}
          data-testid="board"
          data-presenting={presenting}
          onDragEnd={() => setDragged(null)}
        >
          {columns.map((s) => (
            <Column
              key={s}
              status={s}
              filters={filters}
              dragged={dragged}
              onDragStart={setDragged}
              onDrop={drop}
              onOpen={open}
              onMove={move}
            />
          ))}
        </div>
      ) : (
        <RequestList
          filters={filters}
          selected={params.get('sr')}
          onOpen={open}
          split={split}
          setSplit={setSplit}
        />
      )}

      {params.get('sr') && !(view === 'list' && split.on) ? (
        <RequestDrawer srNo={params.get('sr')!} onClose={() => set('sr', '')} />
      ) : null}
      {resolving ? (
        <ResolveModal
          srNo={resolving.srNo}
          busy={change.isPending}
          onCancel={() => setResolving(null)}
          onConfirm={(notes, csat) =>
            change.mutate(
              {
                srNo: resolving.srNo,
                status: 'resolved',
                version: resolving.version,
                resolutionNotes: notes,
                csat,
              },
              { onSettled: () => setResolving(null) },
            )
          }
        />
      ) : null}
    </>
  )
}
