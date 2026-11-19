/**
 * Live branch activity (FR-TEL-025): postings, holds, authorisations and drawer changes, newest first,
 * the last 50, arriving over server-sent events (reconnects by itself). Pause stops new rows from
 * moving the list while someone reads it; they are added on Resume.
 * Rows carry data-event and data-seq (plan §3, DATA). Every ?feedInterval= ms (default 15000) the
 * list is rebuilt with new elements, so a test holding on to an old row gets a stale-element error
 * and must find it again.
 */
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TellerEventDTO } from '@csm/shared'
import { LocatorBadge } from '../../components/LocatorBadge.tsx'
import { useEventSource } from '../../hooks/useEventSource.ts'
import { useUrlNumber } from '../../hooks/useUrlNumber.ts'
import { formatPaise, formatTime } from '../../lib/format.ts'
import { getFeed } from './api.ts'

const MAX = 50

/** Newest first, no duplicates, at most 50. */
const merge = (a: TellerEventDTO[], b: TellerEventDTO[]) => {
  const seen = new Set<number>()
  return [...a, ...b]
    .sort((x, y) => y.seq - x.seq)
    .filter((e) => (seen.has(e.seq) ? false : (seen.add(e.seq), true)))
    .slice(0, MAX)
}

/** The feed panel. */
export function LiveFeed() {
  const { t, i18n } = useTranslation('teller')
  const lang = i18n.language
  const rebuildEvery = useUrlNumber('feedInterval', 15_000)
  const initial = useQuery({ queryKey: ['teller-feed'], queryFn: getFeed })
  const [live, setLive] = useState<TellerEventDTO[]>([])
  const [held, setHeld] = useState<TellerEventDTO[]>([])
  const [paused, setPaused] = useState(false)
  const [generation, setGeneration] = useState(0)
  const stream = useEventSource<TellerEventDTO>('/api/v1/teller/feed/stream', (e) => {
    if (paused) setHeld((h) => merge([e], h))
    else setLive((l) => merge([e], l))
  })

  useEffect(() => {
    if (!rebuildEvery) return
    const id = setInterval(() => setGeneration((g) => g + 1), rebuildEvery)
    return () => clearInterval(id)
  }, [rebuildEvery])

  const items = merge(live, initial.data ?? [])
  const describe = (e: TellerEventDTO) =>
    t(`feed.events.${e.type}`, {
      txnNo: e.txnNo ?? '',
      amount: e.amount !== null ? formatPaise(e.amount, lang) : '',
      account: e.accountLast4 ? `••••${e.accountLast4}` : '',
      teller: e.tellerId,
    })

  return (
    <section className="panel live-feed" data-stream={stream}>
      <header>
        <h2>{t('feed.title')}</h2>
        <LocatorBadge style="DATA" />
        <LocatorBadge style="XP" />
        <span className={`dot ${stream === 'open' ? 'on' : ''}`} aria-hidden />
        <span className="help">{t(`feed.state.${stream}`)}</span>
        <div className="grow" />
        <button
          type="button"
          className="btn sm"
          aria-pressed={paused}
          onClick={() => {
            if (paused) {
              setLive((l) => merge(held, l))
              setHeld([])
            }
            setPaused(!paused)
          }}
        >
          {paused ? t('feed.resume', { count: held.length }) : t('feed.pause')}
        </button>
      </header>
      <div className="body">
        {items.length === 0 ? (
          <p className="help">{initial.isLoading ? t('feed.loading') : t('feed.empty')}</p>
        ) : (
          <ol className="feed-list" aria-label={t('feed.title')}>
            {items.map((e) => (
              // The generation in the key rebuilds every row on each interval (stale-element practice).
              <li key={`${generation}-${e.seq}`} data-event={e.type} data-seq={e.seq}>
                <time className="mono">{formatTime(new Date(e.at), lang)}</time>
                <span>{describe(e)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
