/**
 * Desktop notifications (FR-SR-029): once turned on, the board checks the user's open requests and
 * notifies about newly assigned ones and ones that just breached their SLA. Clicking a notification
 * opens the request. The control is found by its text ("Turn on desktop alerts"). The setting is kept
 * in this browser. ?alertInterval=ms changes the check interval (default 60000) outside production.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { OffsetPage, ServiceRequestCard } from '@csm/shared'
import { api } from '../../api/client.ts'
import { LocatorBadge } from '../../components/LocatorBadge.tsx'
import { useUrlNumber } from '../../hooks/useUrlNumber.ts'

const KEY = 'csm.desktopAlerts'
const supported = () => typeof window !== 'undefined' && 'Notification' in window

function readSetting(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}

/** The on/off control and the background check. */
export function DesktopAlerts() {
  const { t } = useTranslation('requests')
  const navigate = useNavigate()
  const interval = useUrlNumber('alertInterval', 60_000)
  const [enabled, setEnabled] = useState(readSetting)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    supported() ? Notification.permission : 'unsupported',
  )
  const seen = useRef<{ assigned: Set<string>; breached: Set<string> } | null>(null)
  const active = enabled && permission === 'granted'

  const { data } = useQuery({
    queryKey: ['desktop-alerts'],
    queryFn: () =>
      api<OffsetPage<ServiceRequestCard>>(
        '/service-requests?queue=mine&status=open,in_progress&pageSize=100',
      ),
    enabled: active,
    refetchInterval: active ? interval : false,
  })

  useEffect(() => {
    if (!data || !active) return
    const now = Date.now()
    const assigned = new Set(data.items.map((r) => r.srNo))
    const breached = new Set(data.items.filter((r) => Date.parse(r.slaDueAt) < now).map((r) => r.srNo))
    const before = seen.current
    seen.current = { assigned, breached }
    // The first check only records what is already there, so turning alerts on isn't a burst of noise.
    if (!before) return
    const notify = (title: string, srNo: string) => {
      const n = new Notification(title, { body: srNo, tag: `${srNo}-${title}` })
      n.onclick = () => {
        window.focus()
        navigate(`/service-requests?sr=${srNo}`)
        n.close()
      }
    }
    for (const r of data.items) {
      if (!before.assigned.has(r.srNo)) notify(t('alerts.assigned', { subject: r.subject }), r.srNo)
      else if (breached.has(r.srNo) && !before.breached.has(r.srNo))
        notify(t('alerts.breached', { subject: r.subject }), r.srNo)
    }
  }, [data, active, navigate, t])

  const save = (on: boolean) => {
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off')
    } catch {
      // Storage blocked: the choice lasts for this visit.
    }
    seen.current = null
    setEnabled(on)
  }

  const turnOn = async () => {
    if (!supported()) return
    const result =
      Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
    setPermission(result)
    save(result === 'granted')
  }

  if (permission === 'unsupported') return null
  return (
    <span className="desktop-alerts" data-state={active ? 'on' : permission === 'denied' ? 'blocked' : 'off'}>
      <LocatorBadge style="TXT" />
      {active ? (
        <button type="button" className="btn sm ghost" onClick={() => save(false)}>
          {t('alerts.turnOff')}
        </button>
      ) : permission === 'denied' ? (
        <span className="help" role="note">
          {t('alerts.blocked')}
        </span>
      ) : (
        <button type="button" className="btn sm" onClick={() => void turnOn()}>
          {t('alerts.turnOn')}
        </button>
      )}
    </span>
  )
}
