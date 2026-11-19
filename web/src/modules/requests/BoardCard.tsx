/**
 * A card on the Request board. The card body opens the request; it is draggable between columns,
 * and "Move to ▸" is the keyboard alternative (FR-SR-030). Its menu button is named
 * "Move SR-2026-000012 to another status": only the start is stable, so tests match a prefix
 * ([aria-label^='Move SR-2026-000012']). Tags, the callback (phone icon, red when overdue) and the
 * customer's rating (role=img named "4 out of 5") show at the bottom.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SR_TRANSITIONS, type ServiceRequestCard, type SrStatus } from '@csm/shared'
import { useCan } from '../../app/auth.tsx'
import { PriorityBadge, SlaTimer } from '../../components/Badges.tsx'
import { Icon } from '../../components/Icon.tsx'
import { MenuWithSubmenu } from '../../components/overlays/MenuWithSubmenu.tsx'
import { StarDisplay } from '../../components/selection/StarRating.tsx'
import { formatDateTime } from '../../lib/format.ts'

/** One request card. */
export function BoardCard({
  sr,
  onOpen,
  onDragStart,
  onMove,
  dragging,
}: {
  sr: ServiceRequestCard
  onOpen: () => void
  onDragStart: () => void
  onMove: (status: SrStatus) => void
  dragging: boolean
}) {
  const { t, i18n } = useTranslation('requests')
  const canEdit = useCan('serviceRequests.board', 'edit')
  const canApprove = useCan('serviceRequests.board', 'approve')
  // Rendering time is good enough for "overdue": the board refetches often.
  const [now] = useState(() => Date.now())
  const overdueCallback =
    !!sr.callbackAt && Date.parse(sr.callbackAt) < now && !['resolved', 'closed'].includes(sr.status)
  const targets = SR_TRANSITIONS[sr.status]

  return (
    <article
      className={`card ${dragging ? 'dragging' : ''}`}
      draggable
      data-testid="board-card"
      data-sr-no={sr.srNo}
      data-status={sr.status}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', sr.srNo)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
    >
      <button type="button" className="card-open" onClick={onOpen}>
        <span className="r">
          <span className="mono" style={{ color: 'var(--ink)' }}>
            {sr.srNo}
          </span>
          <span className="grow" />
          <PriorityBadge value={sr.priority} />
        </span>
        <span className="t">{sr.subject}</span>
        <span className="r">
          {sr.customerName}
          <span className="grow" />
          <SlaTimer slaDueAt={sr.slaDueAt} status={sr.status} />
        </span>
      </button>
      <span className="r card-meta">
        {sr.tags.length ? (
          <span className="chips">
            {sr.tags.map((x) => (
              <span key={x} className="chip">
                {x}
              </span>
            ))}
          </span>
        ) : null}
        {sr.callbackAt ? (
          <span
            className={`callback ${overdueCallback ? 'overdue' : ''}`}
            title={t(overdueCallback ? 'callback.overdue' : 'callback.scheduled', {
              when: formatDateTime(sr.callbackAt, i18n.language),
            })}
          >
            <Icon name="phone" />
          </span>
        ) : null}
        {sr.csat?.rating ? <StarDisplay value={sr.csat.rating} /> : null}
        <span className="grow" />
        {canEdit && targets.length ? (
          <MenuWithSubmenu
            className="card-move"
            label={<Icon name="next" />}
            ariaLabel={t('board.moveMenu', { srNo: sr.srNo })}
            items={targets.map((s) => ({
              key: s,
              label: t(`common:status.${s}`),
              disabled: s === 'closed' && !canApprove,
              disabledReason: s === 'closed' && !canApprove ? t('board.closeNeedsApprove') : undefined,
              onSelect: () => onMove(s),
            }))}
          />
        ) : null}
      </span>
    </article>
  )
}
