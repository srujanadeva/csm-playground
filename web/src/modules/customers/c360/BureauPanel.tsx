/**
 * Credit standing on Customer 360 (FR-CUS-025): the bureau score loads after the rest of the page,
 * inside <csm-bureau-score> (open shadow root, with a nested <csm-gauge>). Retry is slotted in from
 * the light DOM. Users with View PII then get the full report in an iframe below the panel.
 * URL (outside production): ?bureauDelay=ms before each step (default 2000), ?bureauFail=n makes
 * the first n requests fail as if the bureau were down.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BureauScoreDTO, CustomerDetail } from '@csm/shared'
import { api } from '../../../api/client.ts'
import { useCan } from '../../../app/auth.tsx'
import { LocatorBadge } from '../../../components/LocatorBadge.tsx'
import '../../../components/webcomponents/index.ts'
import { useUrlNumber } from '../../../hooks/useUrlNumber.ts'
import { formatDate } from '../../../lib/format.ts'

type PanelState = 'waiting' | 'loading' | 'ready' | 'none' | 'error'

/** The Credit standing panel. */
export function BureauPanel({ c }: { c: CustomerDetail }) {
  const { t, i18n } = useTranslation('customers')
  const canPII = useCan('customers.360', 'viewPII')
  const delay = useUrlNumber('bureauDelay', 2000)
  const failFirst = useUrlNumber('bureauFail', 0, 10)
  const attempts = useRef(0)
  const [state, setState] = useState<PanelState>('waiting')
  const [score, setScore] = useState<BureauScoreDTO | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [showReport, setShowReport] = useState(false)

  // The score request starts `delay` ms after the page, so the panel is visibly late (practice for waits).
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      setState('loading')
      const simulate = attempts.current++ < failFirst ? '?simulate=unavailable' : ''
      api<BureauScoreDTO>(`/customers/${c.ref}/bureau${simulate}`)
        .then((s) => {
          if (cancelled) return
          setScore(s)
          setState(s.status === 'ready' ? 'ready' : 'none')
        })
        .catch(() => {
          if (cancelled) return
          setState('error')
        })
    }, delay)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [c.ref, delay, failFirst, attempt])

  // The report frame is added a further `delay` ms after the score arrives.
  useEffect(() => {
    if (state !== 'ready' || !canPII) return
    const timer = setTimeout(() => setShowReport(true), delay)
    return () => clearTimeout(timer)
  }, [state, canPII, delay])

  const ready = score?.status === 'ready' ? score : null
  return (
    <section className="panel bureau" data-qa="bureau-panel" data-state={state}>
      <header>
        <h2>{t('bureau.title')}</h2>
        <LocatorBadge style="CTX" />
        <LocatorBadge style="DATA" />
      </header>
      <div className="body">
        <csm-bureau-score
          state={state === 'waiting' ? 'loading' : state}
          heading={t('bureau.heading')}
          score={ready?.score}
          band={ready?.band}
          band-text={ready ? t(`bureau.bands.${ready.band}`) : undefined}
          updated={ready ? formatDate(ready.asOf, i18n.language) : undefined}
          loading-text={t('bureau.loading')}
          error-text={t('bureau.unavailable')}
          none-text={t('bureau.none')}
          updated-text={t('bureau.updated')}
        >
          {state === 'error' ? (
            <button
              type="button"
              className="btn sm"
              slot="footer"
              data-qa="bureau-retry"
              onClick={() => {
                setShowReport(false)
                setAttempt((n) => n + 1)
              }}
            >
              {t('bureau.retry')}
            </button>
          ) : null}
          {ready ? <span slot="footer">{t('bureau.source')}</span> : null}
        </csm-bureau-score>
        {canPII && state === 'ready' && !showReport ? (
          <p className="help" data-qa="bureau-report-pending">
            {t('bureau.reportLoading')}
          </p>
        ) : null}
        {showReport ? (
          <iframe
            className="bureau-report"
            title={t('bureau.reportTitle')}
            src={`/api/v1/customers/${c.ref}/bureau/report`}
            // The report is static HTML: no scripts, forms or navigation needed.
            sandbox=""
          />
        ) : null}
      </div>
    </section>
  )
}
