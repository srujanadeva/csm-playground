/**
 * The token queue at the counter (FR-TEL-020): the token being served, who is waiting, and four
 * actions, each showing how often this teller used it today. The four count badges are identical
 * spans: only their position says which is which (plan §3, NTH), e.g.
 * .token-actions > button:nth-child(3) .count for Skip. "Open lobby display" is a plain link that
 * opens a new tab (LINK: By.linkText).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { QueueStateDTO } from '@csm/shared'
import { ApiError } from '../../api/client.ts'
import { LocatorBadge } from '../../components/LocatorBadge.tsx'
import { useToast } from '../../components/Toast.tsx'
import { getQueue, issueToken, queueAction } from './api.ts'

const ACTIONS = [
  { action: 'call-next', label: 'queue.callNext', stat: 'called' },
  { action: 'recall', label: 'queue.recall', stat: 'recalled' },
  { action: 'skip', label: 'queue.skip', stat: 'skipped' },
  { action: 'serve', label: 'queue.serve', stat: 'served' },
] as const

/** Queue panel for tellers (Create on Teller counter). */
export function TokenQueuePanel() {
  const { t } = useTranslation('teller')
  const toast = useToast()
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['teller-queue'], queryFn: getQueue, refetchInterval: 5_000 })
  const act = useMutation({
    mutationFn: queueAction,
    onSuccess: (state) => qc.setQueryData(['teller-queue'], state),
    onError: (err) => toast(err instanceof ApiError ? err.message : t('common:error.generic'), 'error'),
  })
  const issue = useMutation({
    mutationFn: issueToken,
    onSuccess: (token) => {
      toast(t('queue.issued', { token: token.label }))
      void qc.invalidateQueries({ queryKey: ['teller-queue'] })
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : t('common:error.generic'), 'error'),
  })
  const s: QueueStateDTO['stats'] = data?.stats ?? { called: 0, recalled: 0, skipped: 0, served: 0 }
  const current = data?.current ?? null
  const enabled = {
    'call-next': !current && (data?.waiting ?? 0) > 0,
    recall: !!current,
    skip: !!current,
    serve: !!current,
  }

  return (
    <section className="panel token-queue">
      <header>
        <h2>{t('queue.title')}</h2>
        <LocatorBadge style="NTH" />
        <div className="grow" />
        <button type="button" className="btn sm" disabled={issue.isPending} onClick={() => issue.mutate()}>
          {t('queue.issue')}
        </button>
        <a href="/teller/lobby" target="_blank" rel="noopener">
          {t('queue.openLobby')}
        </a>
        <LocatorBadge style="LINK" />
      </header>
      <div className="body token-body">
        <div className="token-now" aria-live="polite">
          <span className="help">{t('queue.serving')}</span>
          <b className="token-label">{current?.label ?? '—'}</b>
        </div>
        <div className="token-next">
          <span className="help">{t('queue.waiting', { count: data?.waiting ?? 0 })}</span>
          <span className="mono">{data?.next.join(' · ') || '—'}</span>
        </div>
        <div className="token-actions">
          {ACTIONS.map((a) => (
            <button
              key={a.action}
              type="button"
              className="btn"
              disabled={!enabled[a.action] || act.isPending}
              onClick={() => act.mutate(a.action)}
            >
              {t(a.label)}
              <span className="count">{s[a.stat]}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
