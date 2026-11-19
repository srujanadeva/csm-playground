/**
 * Lobby token display (/teller/lobby, any signed-in branch user): which token each counter is serving
 * and the next three waiting, refreshed every ?lobbyInterval= ms (default 1500, so a call shows within
 * 2 seconds). Shown without the app's menus, for a screen in the waiting area; "Full screen" fills it.
 * Ids: #lobby-display, #lobby-fullscreen, #lobby-issue (plan §3, ID).
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LocatorBadge } from '../../components/LocatorBadge.tsx'
import { useToast } from '../../components/Toast.tsx'
import { useUrlNumber } from '../../hooks/useUrlNumber.ts'
import { getLobby, issueToken } from './api.ts'
import './teller.css'

/** /teller/lobby */
export default function LobbyDisplayPage() {
  const { t } = useTranslation('teller')
  const toast = useToast()
  const interval = useUrlNumber('lobbyInterval', 1500)
  const box = useRef<HTMLDivElement>(null)
  const [full, setFull] = useState(false)
  const { data, isError } = useQuery({
    queryKey: ['lobby'],
    queryFn: getLobby,
    refetchInterval: interval || false,
  })
  const issue = useMutation({
    mutationFn: issueToken,
    onSuccess: (tk) => toast(t('queue.issued', { token: tk.label })),
  })
  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === box.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  return (
    <div className="lobby-page">
      <div className="lobby-bar">
        <h1>{t('lobby.title')}</h1>
        <LocatorBadge style="ID" />
        <div className="grow" />
        <button
          id="lobby-issue"
          type="button"
          className="btn"
          disabled={issue.isPending}
          onClick={() => issue.mutate()}
        >
          {t('queue.issue')}
        </button>
        <button
          id="lobby-fullscreen"
          type="button"
          className="btn pri"
          onClick={() => (full ? void document.exitFullscreen() : void box.current?.requestFullscreen?.())}
        >
          {full ? t('lobby.exitFull') : t('lobby.full')}
        </button>
      </div>
      <div id="lobby-display" ref={box} className="lobby" data-fullscreen={full}>
        {isError ? <p className="note bad">{t('common:error.generic')}</p> : null}
        <section>
          <h2>{t('lobby.nowServing')}</h2>
          {data?.counters.length ? (
            <ul className="lobby-counters">
              {data.counters.map((c) => (
                <li key={c.tellerId} data-teller={c.tellerId} className={c.recalls ? 'recalled' : undefined}>
                  <b className="token-label">{c.token}</b>
                  <span>{t('lobby.counter', { name: c.tellerName })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="help">{t('lobby.nobody')}</p>
          )}
        </section>
        <section>
          <h2>{t('lobby.next')}</h2>
          <ol className="lobby-next">
            {(data?.next ?? []).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ol>
          <p className="help">{t('queue.waiting', { count: data?.waiting ?? 0 })}</p>
        </section>
      </div>
    </div>
  )
}
