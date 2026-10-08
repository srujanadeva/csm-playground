/** Status pills, priority badges and SLA timers, with colours that encode state. */
import { useTranslation } from 'react-i18next'
import { slaParts } from '../lib/format.ts'
import { Icon } from './Icon.tsx'

const TONE: Record<string, string> = {
  active: 'ok',
  verified: 'ok',
  approved: 'ok',
  posted: 'ok',
  signed_off: 'ok',
  resolved: 'ok',
  low: 'ok',
  draft: 'warn',
  pending: 'warn',
  due: 'warn',
  medium: 'warn',
  in_progress: 'info',
  pending_approval: 'info',
  pending_authorisation: 'warn',
  dormant: 'warn',
  open: 'info',
  blocked: 'bad',
  expired: 'bad',
  locked: 'bad',
  rejected: 'bad',
  frozen: 'bad',
  high: 'bad',
  closed: 'mute',
  deactivated: 'mute',
}

/** A coloured pill for any status value; the text comes from common:status.<value>. */
export function StatusPill({ value, testId, prefix }: { value: string; testId?: string; prefix?: string }) {
  const { t } = useTranslation()
  return (
    <span className={`pill ${TONE[value] ?? 'mute'}`} data-testid={testId} data-status={value}>
      {prefix}
      {t(`status.${value}`, { defaultValue: value })}
    </span>
  )
}

/** LOW / MEDIUM / HIGH / CRITICAL. */
export function PriorityBadge({ value, testId }: { value: string; testId?: string }) {
  const { t } = useTranslation()
  return (
    <span className={`prio ${value}`} data-testid={testId} data-priority={value}>
      {t(`priority.${value}`)}
    </span>
  )
}

/** "6 h", "2 d", "2 h overdue", or "met" once resolved. */
export function SlaTimer({
  slaDueAt,
  status,
  testId,
}: {
  slaDueAt: string
  status: string
  testId?: string
}) {
  const { t } = useTranslation()
  if (status === 'resolved' || status === 'closed') {
    return (
      <span className="sla" data-testid={testId} data-state="met">
        <Icon name="clock" size={13} />
        {t('sla.met')}
      </span>
    )
  }
  const { late, hours, days } = slaParts(slaDueAt)
  const amount = hours >= 48 ? t('sla.days', { count: days }) : t('sla.hours', { count: hours })
  return (
    <span className={`sla ${late ? 'late' : ''}`} data-testid={testId} data-state={late ? 'overdue' : 'due'}>
      <Icon name="clock" size={13} />
      {late ? t('sla.overdue', { amount }) : amount}
    </span>
  )
}
