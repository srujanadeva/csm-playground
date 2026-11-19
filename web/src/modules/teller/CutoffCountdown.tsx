/**
 * Cash cut-off (FR-TEL-026): from an hour before (16:30 IST on weekdays) the counter shows the time
 * left; after the cut-off posting is blocked (the server enforces it too). The countdown is
 * #cutoff-countdown with data-seconds (plan §3, ID).
 * URL (outside production): ?cutoffIn=seconds pretends the cut-off is that far away (screen only;
 * the server keeps the real time unless TELLER_CUTOFF is set).
 */
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CUTOFF_WARNING_MS } from '@csm/shared'
import { Icon } from '../../components/Icon.tsx'
import { LocatorBadge } from '../../components/LocatorBadge.tsx'
import { useUrlNumber } from '../../hooks/useUrlNumber.ts'
import { formatTime } from '../../lib/format.ts'
import { getCutoff } from './api.ts'

/** Ticks every second; returns ms since the epoch. */
function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

/**
 * The cut-off for this screen.
 * @returns cutoffAt (ms), whether the countdown shows, and whether posting is closed.
 */
export function useCutoff() {
  const fake = useUrlNumber('cutoffIn', -1, 86_400)
  const [fakeBase] = useState(() => Date.now())
  const { data } = useQuery({ queryKey: ['teller-cutoff'], queryFn: getCutoff, staleTime: 60_000 })
  const now = useNow()
  const cutoffAt = fake >= 0 ? fakeBase + fake * 1000 : data ? Date.parse(data.cutoffAt) : null
  if (cutoffAt === null) return { cutoffAt: null, counting: false, passed: false, now }
  return {
    cutoffAt,
    counting: now >= cutoffAt - CUTOFF_WARNING_MS && now < cutoffAt,
    passed: now >= cutoffAt,
    now,
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The countdown or the "closed" banner, or nothing outside the last hour. */
export function CutoffCountdown({ cutoff }: { cutoff: ReturnType<typeof useCutoff> }) {
  const { t, i18n } = useTranslation('teller')
  if (cutoff.cutoffAt === null || (!cutoff.counting && !cutoff.passed)) return null
  if (cutoff.passed) {
    return (
      <div className="note bad" role="alert">
        <Icon name="lock" />
        {t('cutoff.passed', { time: formatTime(new Date(cutoff.cutoffAt), i18n.language) })}
      </div>
    )
  }
  const seconds = Math.max(0, Math.round((cutoff.cutoffAt - cutoff.now) / 1000))
  return (
    <div className="note warn cutoff" role="timer" aria-live="off">
      <Icon name="clock" />
      <span>{t('cutoff.left', { time: formatTime(new Date(cutoff.cutoffAt), i18n.language) })}</span>
      <b id="cutoff-countdown" className="mono" data-seconds={seconds}>
        {pad(Math.floor(seconds / 3600))}:{pad(Math.floor((seconds % 3600) / 60))}:{pad(seconds % 60)}
      </b>
      <LocatorBadge style="ID" />
    </div>
  )
}
