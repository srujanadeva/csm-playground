/**
 * KYC step: "Verify with e-KYC" (FR-KYC-003). The provider page runs in an iframe on another origin
 * (https://localhost:4002); it reports back by postMessage, and only messages from that origin for
 * this session are used. The outcome itself is then read from our API, never from the message.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  EKYC_RESULT_MESSAGE,
  type CustomerDraftForm,
  type EkycResultDTO,
  type EkycSessionDTO,
} from '@csm/shared'
import { ApiError } from '../../../api/client.ts'
import { Icon } from '../../../components/Icon.tsx'
import { LocatorBadge } from '../../../components/LocatorBadge.tsx'
import { formatDate } from '../../../lib/format.ts'
import { ekycResult, startEkyc } from './api.ts'

/** Lower-case, single-spaced, for comparing names. */
const norm = (v: string | null | undefined) => (v ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/** The e-KYC section of the KYC step. */
export function EkycPanel({ draft, onVerified }: { draft: CustomerDraftForm; onVerified: () => void }) {
  const { t, i18n } = useTranslation('customers')
  const [session, setSession] = useState<EkycSessionDTO | null>(null)
  const [result, setResult] = useState<EkycResultDTO | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session) return
    const onMessage = (e: MessageEvent) => {
      // Anyone can postMessage to this window: trust only the provider, and only for this session.
      if (e.origin !== session.providerOrigin) return
      const data = e.data as { type?: string; sessionId?: string } | null
      if (data?.type !== EKYC_RESULT_MESSAGE || data.sessionId !== session.sessionId) return
      ekycResult(session.sessionId)
        .then((r) => {
          setResult(r)
          setSession(null)
          if (r.status === 'verified') onVerified()
        })
        .catch(() => setError(t('common:error.generic')))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [session, onVerified, t])

  const start = async () => {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      setSession(await startEkyc(draft.ref))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common:error.generic'))
    } finally {
      setBusy(false)
    }
  }

  const p = draft.personal as { firstName?: string; middleName?: string; lastName?: string; dob?: string }
  const formName = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ')
  const nameDiffers = !!result?.verifiedName && norm(result.verifiedName) !== norm(formName)
  const dobDiffers = !!result?.verifiedDob && result.verifiedDob !== p.dob
  const stored = draft.ekyc

  return (
    <section
      className="panel ekyc"
      data-state={session ? 'open' : (result?.status ?? (stored ? 'verified' : 'idle'))}
    >
      <header>
        <h2>{t('onboard.ekyc.title')}</h2>
        <LocatorBadge style="CTX" />
        <div className="grow" />
        {!session ? (
          <button type="button" className="btn" disabled={busy} onClick={() => void start()}>
            {busy ? <span className="spin" /> : <Icon name="shield" />}
            {stored || result ? t('onboard.ekyc.again') : t('onboard.ekyc.start')}
          </button>
        ) : (
          <button type="button" className="btn ghost" onClick={() => setSession(null)}>
            {t('onboard.ekyc.close')}
          </button>
        )}
      </header>
      <div className="body">
        {error ? (
          <div className="note bad" role="alert">
            {error}
          </div>
        ) : null}
        {session ? (
          <iframe
            className="ekyc-frame"
            src={session.providerUrl}
            title={t('onboard.ekyc.frameTitle')}
            // The provider needs its own scripts and form; nothing else (no top navigation, no popups).
            sandbox="allow-scripts allow-forms allow-same-origin"
          />
        ) : null}
        {result ? (
          <div
            className={`note ${result.status === 'verified' ? (nameDiffers || dobDiffers ? 'warn' : 'ok') : result.status === 'cancelled' ? 'info' : 'bad'}`}
            role="status"
          >
            <Icon name={result.status === 'verified' ? 'check' : 'info'} />
            <div>
              <b>{t(`onboard.ekyc.status.${result.status}`)}</b>
              {result.status === 'verified' ? (
                <ul className="ekyc-facts">
                  <li>{t('onboard.ekyc.reference', { ref: result.reference })}</li>
                  <li className={nameDiffers ? 'bad' : undefined}>
                    {t('onboard.ekyc.name', { name: result.verifiedName })}
                    {nameDiffers ? ` — ${t('onboard.ekyc.differs', { value: formName })}` : null}
                  </li>
                  <li className={dobDiffers ? 'bad' : undefined}>
                    {t('onboard.ekyc.dob', { dob: formatDate(result.verifiedDob ?? '', i18n.language) })}
                    {dobDiffers
                      ? ` — ${t('onboard.ekyc.differs', { value: formatDate(p.dob ?? '', i18n.language) })}`
                      : null}
                  </li>
                </ul>
              ) : result.reason ? (
                <div>{result.reason}</div>
              ) : null}
              {nameDiffers || dobDiffers ? <div>{t('onboard.ekyc.resolve')}</div> : null}
            </div>
          </div>
        ) : stored && !session ? (
          <div className="note ok" role="status">
            <Icon name="check" />
            <span>{t('onboard.ekyc.stored', { ref: stored.reference })}</span>
          </div>
        ) : !session ? (
          <p className="help">{t('onboard.ekyc.intro')}</p>
        ) : null}
      </div>
    </section>
  )
}
