// /dev/inbox: every SMS and e-mail the app "sent" (reset codes, access-request notices), newest
// first. Development only. The table is deliberately bare: rows and cells have no ids, classes or
// test ids, so tests read it by structure, e.g. //tr[td[2]='sms'][1]/td[5]. ?inboxInterval= sets the
// auto-refresh in ms (default 5000).
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api/client.ts'
import { ConfirmDialog } from '../../components/Overlay.tsx'
import { useUrlNumber } from '../../hooks/useUrlNumber.ts'
import { useDebounce } from '../../hooks/useDebounce.ts'
import { formatDateTime } from '../../lib/format.ts'
import { clearInbox, fetchInbox } from './api.ts'
import './devInbox.css'

/** The inbox page (outside the signed-in shell, so visitors can read their reset code). */
export default function DevInboxPage() {
  const { t, i18n } = useTranslation('devInbox')
  const qc = useQueryClient()
  const interval = useUrlNumber('inboxInterval', 5000)
  const [staffId, setStaffId] = useState('')
  const [channel, setChannel] = useState('')
  const [auto, setAuto] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const who = useDebounce(staffId.trim().toLowerCase(), 300)
  const valid = who === '' || /^[a-z]{2,5}[0-9]{3}$/.test(who)
  const { data, error, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['dev-inbox', who, channel],
    queryFn: () => fetchInbox({ staffId: who, channel }),
    enabled: valid && !import.meta.env.PROD,
    refetchInterval: auto ? interval : false,
  })
  useEffect(() => {
    document.title = `${t('title')} · CSM Playground`
  }, [t])

  if (import.meta.env.PROD || (error instanceof ApiError && error.status === 404)) {
    return (
      <main className="devinbox">
        <h1>{t('title')}</h1>
        <p>{t('unavailable')}</p>
      </main>
    )
  }

  return (
    <main className="devinbox" aria-busy={isFetching}>
      <header>
        <div>
          <h1>{t('title')}</h1>
          <p>{t('subtitle')}</p>
        </div>
        <div className="grow" />
        <Link to="/login">{t('toSignIn')}</Link>
      </header>
      <section className="panel">
        <div className="body devinbox-filters">
          <label>
            {t('staffId')}
            <input
              className="in"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              placeholder="csr001"
            />
          </label>
          <label>
            {t('channel')}
            <select className="in" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">{t('all')}</option>
              <option value="sms">SMS</option>
              <option value="email">{t('email')}</option>
            </select>
          </label>
          <label className="choice">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            <span>{t('autoRefresh', { seconds: Math.round(interval / 1000) })}</span>
          </label>
          <div className="grow" />
          <button
            type="button"
            className="btn sm"
            onClick={() => void qc.invalidateQueries({ queryKey: ['dev-inbox'] })}
          >
            {t('refresh')}
          </button>
          <button type="button" className="btn sm danger" onClick={() => setConfirming(true)}>
            {t('clear')}
          </button>
        </div>
        {!valid ? (
          <p className="errmsg" style={{ padding: '0 16px' }}>
            {t('badStaffId')}
          </p>
        ) : null}
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>{t('when')}</th>
                <th>{t('channel')}</th>
                <th>{t('to')}</th>
                <th>{t('subject')}</th>
                <th>{t('message')}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((m) => (
                <tr key={m.id}>
                  <td>{formatDateTime(m.createdAt, i18n.language)}</td>
                  <td>{m.channel}</td>
                  <td>
                    {m.to}
                    {m.staffId ? <div>{m.staffId}</div> : null}
                  </td>
                  <td>{m.subject}</td>
                  <td style={{ whiteSpace: 'pre-line' }}>{m.body}</td>
                </tr>
              ))}
              {data && data.items.length === 0 ? (
                <tr>
                  <td colSpan={5}>{t('empty')}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="help" style={{ padding: '8px 16px', margin: 0 }}>
          {dataUpdatedAt
            ? t('updated', { time: formatDateTime(new Date(dataUpdatedAt).toISOString(), i18n.language) })
            : ''}
        </p>
      </section>
      {confirming ? (
        <ConfirmDialog
          testId="dev-inbox-clear"
          title={t('clearTitle')}
          message={t('clearMessage')}
          confirmLabel={t('clear')}
          danger
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            await clearInbox()
            setConfirming(false)
            void qc.invalidateQueries({ queryKey: ['dev-inbox'] })
          }}
        />
      ) : null}
    </main>
  )
}
