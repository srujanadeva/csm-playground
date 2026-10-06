/**
 * Request details drawer (/service-requests?sr=SR-2026-000031): details, a "Move to" status
 * control (the keyboard alternative to drag and drop), attachments, and a comment thread
 * that loads more as you scroll.
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  SR_TRANSITIONS,
  type CommentDTO,
  type CursorPage,
  type ServiceRequestDetail,
  type SrStatus,
} from '@csm/shared'
import { ApiError, api } from '../../api/client.ts'
import { useCan } from '../../app/auth.tsx'
import { PriorityBadge, SlaTimer, StatusPill } from '../../components/Badges.tsx'
import { Icon } from '../../components/Icon.tsx'
import { Drawer } from '../../components/Overlay.tsx'
import { useToast } from '../../components/Toast.tsx'
import { InfiniteSentinel, Loading } from '../../components/Widgets.tsx'
import { useLookupLabel } from '../../hooks/useLookups.ts'
import { formatDateTime, initials } from '../../lib/format.ts'
import { ResolveModal } from './ResolveModal.tsx'

/** Changes a request's status, asking for notes when resolving. */
export function useStatusChange() {
  const { t } = useTranslation('requests')
  const toast = useToast()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { srNo: string; status: SrStatus; version: number; resolutionNotes?: string }) =>
      api<ServiceRequestDetail>(`/service-requests/${v.srNo}/status`, {
        method: 'PATCH',
        body: {
          status: v.status,
          version: v.version,
          ...(v.resolutionNotes ? { resolutionNotes: v.resolutionNotes } : {}),
        },
      }),
    onSuccess: (sr) => {
      toast(t('board.moved', { srNo: sr.srNo, status: t(`common:status.${sr.status}`) }))
      void qc.invalidateQueries({ queryKey: ['board'] })
      void qc.invalidateQueries({ queryKey: ['service-requests'] })
      void qc.invalidateQueries({ queryKey: ['sr', sr.srNo] })
      void qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
    onError: (err) => {
      toast(err instanceof ApiError ? err.message : t('common:error.generic'), 'error')
      void qc.invalidateQueries({ queryKey: ['board'] })
    },
  })
}

function Comments({ srNo, closed }: { srNo: string; closed: boolean }) {
  const { t, i18n } = useTranslation('requests')
  const toast = useToast()
  const qc = useQueryClient()
  const canEdit = useCan('serviceRequests.board', 'edit')
  const [text, setText] = useState('')
  const q = useInfiniteQuery({
    queryKey: ['sr', srNo, 'comments'],
    queryFn: ({ pageParam }) =>
      api<CursorPage<CommentDTO>>(
        `/service-requests/${srNo}/comments?limit=5${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  const add = useMutation({
    mutationFn: () =>
      api<CommentDTO>(`/service-requests/${srNo}/comments`, { method: 'POST', body: { text } }),
    onSuccess: () => {
      setText('')
      void qc.invalidateQueries({ queryKey: ['sr', srNo, 'comments'] })
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : t('common:error.generic'), 'error'),
  })
  const items = q.data?.pages.flatMap((p) => p.items) ?? []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="sr-drawer-comments">
      <h3 style={{ margin: 0, fontSize: 13 }}>{t('drawer.comments')}</h3>
      {canEdit && !closed ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) add.mutate()
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <label htmlFor="sr-drawer-comment" className="sr-only">
            {t('drawer.addComment')}
          </label>
          <textarea
            id="sr-drawer-comment"
            data-testid="sr-drawer-comment"
            className="in"
            maxLength={1000}
            placeholder={t('drawer.commentPlaceholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="actions">
            <span className="help">{text.length} / 1000</span>
            <div className="grow" />
            <button
              type="submit"
              className="btn sm pri"
              data-testid="sr-drawer-comment-add"
              disabled={!text.trim() || add.isPending}
            >
              {t('drawer.addComment')}
            </button>
          </div>
        </form>
      ) : null}
      {q.isLoading ? <Loading testId="sr-drawer-comments-loading" /> : null}
      {!q.isLoading && !items.length ? (
        <span className="help" data-testid="sr-drawer-no-comments">
          {t('drawer.noComments')}
        </span>
      ) : null}
      {items.map((c) => (
        <div className="comment" key={c.id} data-testid="sr-drawer-comment-item">
          <span className="avatar" aria-hidden>
            {initials(c.byName)}
          </span>
          <div>
            <b>{c.byName}</b> <small>{formatDateTime(c.createdAt, i18n.language)}</small>
            <p>{c.text}</p>
          </div>
        </div>
      ))}
      <InfiniteSentinel
        testId="sr-drawer-comments-more"
        hasMore={!!q.hasNextPage}
        loading={q.isFetchingNextPage}
        onVisible={() => void q.fetchNextPage()}
      />
    </div>
  )
}

/** The drawer itself. */
export function RequestDrawer({ srNo, onClose }: { srNo: string; onClose: () => void }) {
  const { t, i18n } = useTranslation('requests')
  const canEdit = useCan('serviceRequests.board', 'edit')
  const canApprove = useCan('serviceRequests.board', 'approve')
  const category = useLookupLabel('srCategories')
  const sub = useLookupLabel('srSubCategories')
  const change = useStatusChange()
  const [resolving, setResolving] = useState(false)
  const {
    data: sr,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['sr', srNo],
    queryFn: () => api<ServiceRequestDetail>(`/service-requests/${srNo}`),
  })

  if (isLoading || !sr) {
    return (
      <Drawer testId="sr-drawer" title={srNo} onClose={onClose}>
        {error ? (
          <div className="note bad" role="alert">
            {error instanceof ApiError ? error.message : t('common:error.generic')}
          </div>
        ) : (
          <Loading testId="sr-drawer-loading" />
        )}
      </Drawer>
    )
  }

  const targets = SR_TRANSITIONS[sr.status]
  const move = (status: SrStatus) => {
    if (status === 'resolved') setResolving(true)
    else change.mutate({ srNo: sr.srNo, status, version: sr.version })
  }

  return (
    <Drawer
      testId="sr-drawer"
      title={<span className="mono">{sr.srNo}</span>}
      subtitle={sr.subject}
      onClose={onClose}
      footer={
        canEdit && targets.length ? (
          <>
            <label htmlFor="sr-drawer-move">{t('drawer.moveTo')}</label>
            <select
              id="sr-drawer-move"
              data-testid="sr-drawer-move"
              className="in"
              style={{ width: 200 }}
              value=""
              disabled={change.isPending}
              onChange={(e) => e.target.value && move(e.target.value as SrStatus)}
            >
              <option value="">{t('common:select')}</option>
              {targets.map((s) => (
                <option key={s} value={s} disabled={s === 'closed' && !canApprove}>
                  {t(`common:status.${s}`)}
                  {s === 'closed' && !canApprove ? ` (${t('board.closeNeedsApprove')})` : ''}
                </option>
              ))}
            </select>
          </>
        ) : null
      }
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <StatusPill value={sr.status} testId="sr-drawer-status" />
        <PriorityBadge value={sr.priority} testId="sr-drawer-priority" />
        <SlaTimer slaDueAt={sr.slaDueAt} status={sr.status} testId="sr-drawer-sla" />
      </div>
      <dl className="kv" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
        <div>
          <dt>{t('fields.customer')}</dt>
          <dd data-testid="sr-drawer-customer">
            <Link to={`/customers/${sr.customerCif}`} className="mono">
              {sr.customerCif}
            </Link>{' '}
            {sr.customerName}
          </dd>
        </div>
        <div>
          <dt>{t('fields.category')}</dt>
          <dd data-testid="sr-drawer-category">
            {category(sr.category)} › {sub(sr.subCategory)}
          </dd>
        </div>
        <div>
          <dt>{t('fields.channel')}</dt>
          <dd>{t(`channel.${sr.channel}`)}</dd>
        </div>
        <div>
          <dt>{t('fields.assignee')}</dt>
          <dd className="mono" data-testid="sr-drawer-assignee">
            {sr.assignedTo ?? '—'}
          </dd>
        </div>
        <div>
          <dt>{t('fields.slaDue')}</dt>
          <dd>{formatDateTime(sr.slaDueAt, i18n.language)}</dd>
        </div>
        <div>
          <dt>{t('drawer.created')}</dt>
          <dd>
            {formatDateTime(sr.createdAt, i18n.language)} · <span className="mono">{sr.createdBy}</span>
          </dd>
        </div>
        <div className="span-all">
          <dt>{t('fields.description')}</dt>
          <dd style={{ whiteSpace: 'pre-wrap', fontWeight: 400 }} data-testid="sr-drawer-description">
            {sr.description}
          </dd>
        </div>
        {sr.resolutionNotes ? (
          <div className="span-all">
            <dt>{t('drawer.resolution')}</dt>
            <dd style={{ fontWeight: 400 }} data-testid="sr-drawer-resolution">
              {sr.resolutionNotes}
            </dd>
          </div>
        ) : null}
      </dl>
      {sr.attachments.length ? (
        <div className="files" data-testid="sr-drawer-attachments">
          {sr.attachments.map((a) => (
            <a
              key={a.id}
              className="file"
              href={`/api/v1/service-requests/${sr.srNo}/attachments/${a.id}/content`}
              data-testid="sr-drawer-attachment"
            >
              <Icon name="file" />
              {a.fileName}
            </a>
          ))}
        </div>
      ) : null}
      <Comments srNo={sr.srNo} closed={sr.status === 'closed'} />
      {resolving ? (
        <ResolveModal
          srNo={sr.srNo}
          busy={change.isPending}
          onCancel={() => setResolving(false)}
          onConfirm={(notes) =>
            change.mutate(
              { srNo: sr.srNo, status: 'resolved', version: sr.version, resolutionNotes: notes },
              { onSettled: () => setResolving(false) },
            )
          }
        />
      ) : null}
    </Drawer>
  )
}
