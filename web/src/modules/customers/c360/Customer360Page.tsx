/**
 * Customer 360 (/customers/:cif). Header with status, risk and actions; a banner when a
 * request is waiting for approval (supervisors can decide it here, except their own); tabs
 * that load on first open (?tab=…). Actions follow the screen's hide/disable setting.
 * Phase 3: the Actions menu (Create request ▸ category), an offer banner, and on Overview the
 * customer's accounts and the late-loading credit bureau panel (see BureauPanel for ?bureauDelay=).
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { CustomerDetail } from '@csm/shared'
import { ApiError, api } from '../../../api/client.ts'
import { useAction, useCan, useMe } from '../../../app/auth.tsx'
import { useCrumb } from '../../../app/AppShell.tsx'
import { StatusPill } from '../../../components/Badges.tsx'
import { Icon } from '../../../components/Icon.tsx'
import { ConfirmDialog } from '../../../components/Overlay.tsx'
import { useToast } from '../../../components/Toast.tsx'
import { Skeleton } from '../../../components/data/Skeleton.tsx'
import { Tabs, Tooltip } from '../../../components/Widgets.tsx'
import { formatDate, initials } from '../../../lib/format.ts'
import { SafeImage } from '../../../components/media/SafeImage.tsx'
import { LocatorBadge } from '../../../components/LocatorBadge.tsx'
import { MenuWithSubmenu, type NestedMenuItem } from '../../../components/overlays/MenuWithSubmenu.tsx'
import { useClipboard } from '../../../hooks/useClipboard.ts'
import { useLookups } from '../../../hooks/useLookups.ts'
import { label } from '../../../lib/format.ts'
import { AccountsPanel } from './AccountsPanel.tsx'
import { BureauPanel } from './BureauPanel.tsx'
import { EditCustomerDrawer } from './EditCustomerDrawer.tsx'
import { OfferBanner } from './OfferBanner.tsx'
import { StatusRequestModal } from './StatusRequestModal.tsx'
import { AuditTab, ContactTab, KycTab, OverviewTab, RequestsTab } from './tabs.tsx'
import '../customers.css'

const TABS = ['overview', 'contact', 'kyc', 'requests', 'audit'] as const

/** An action button that respects hide/disable for missing permissions. */
function ActionButton({
  action,
  testId,
  className,
  onClick,
  icon,
  children,
  extraDisabledReason,
}: {
  action: { visible: boolean; enabled: boolean; reason?: string }
  testId: string
  className?: string
  onClick: () => void
  icon: string
  children: React.ReactNode
  extraDisabledReason?: string
}) {
  if (!action.visible) return null
  const reason = !action.enabled ? action.reason : extraDisabledReason
  const button = (
    <button
      type="button"
      className={`btn ${className ?? ''}`}
      data-testid={testId}
      disabled={!!reason}
      onClick={onClick}
    >
      <Icon name={icon} />
      {children}
    </button>
  )
  return reason ? (
    <Tooltip testId={`${testId}-reason`} text={reason}>
      <span tabIndex={0}>{button}</span>
    </Tooltip>
  ) : (
    button
  )
}

/** /customers/:ref */
export default function Customer360Page() {
  const { t, i18n } = useTranslation('customers')
  const { ref = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const me = useMe()
  const toast = useToast()
  const qc = useQueryClient()
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as (typeof TABS)[number])
    : 'overview'
  const [visited, setVisited] = useState<Set<string>>(new Set([tab]))
  const [statusModal, setStatusModal] = useState<'block' | 'unblock' | null>(
    params.get('action') === 'block' ? 'block' : null,
  )
  const [editing, setEditing] = useState(false)
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null)
  const editAction = useAction('customers.360', 'edit')
  const canApprove = useCan('customers.360', 'approve')
  const canRequest = useCan('serviceRequests.new', 'create')
  const categories = useLookups('srCategories')
  const clipboard = useClipboard()

  const {
    data: c,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['customer', ref],
    queryFn: () => api<CustomerDetail>(`/customers/${ref}`),
  })
  const name = c ? [c.personal.firstName, c.personal.lastName].filter(Boolean).join(' ') : ''
  useCrumb([t('nav.customers'), { label: t('search.title'), to: '/customers' }, ref])

  // Tabs load on first open and stay mounted afterwards (also when changed via the URL).
  if (!visited.has(tab)) setVisited(new Set(visited).add(tab))
  useEffect(() => {
    if (params.get('action')) {
      const next = new URLSearchParams(params)
      next.delete('action')
      setParams(next, { replace: true })
    }
  }, [params, setParams])

  const decide = useMutation({
    mutationFn: (d: 'approve' | 'reject') =>
      api(`/approvals/${c!.pendingApproval!.id}/${d}`, { method: 'POST', body: {} }),
    onSuccess: (_r, d) => {
      toast(t(d === 'approve' ? 'c360.approved' : 'c360.rejected'))
      setDecision(null)
      void refetch()
      void qc.invalidateQueries({ queryKey: ['approvals'] })
      void qc.invalidateQueries({ queryKey: ['customer', ref, 'audit'] })
    },
    onError: (err) => {
      setDecision(null)
      toast(err instanceof ApiError ? err.message : t('common:error.generic'), 'error')
    },
  })

  if (isLoading)
    return (
      <div className="panel" style={{ padding: 18 }} data-testid="c360-loading">
        <Skeleton kind="header" />
        <Skeleton kind="lines" rows={5} className="sk-gap" />
      </div>
    )
  if (error || !c) {
    return (
      <div className="empty" data-testid="c360-not-found">
        <b>{t('c360.notFound')}</b>
        <Link to="/customers" className="btn">
          {t('c360.back')}
        </Link>
      </div>
    )
  }

  const pending = c.pendingApproval
  const ownRequest = pending?.requestedBy === me.user.staffId
  const refreshAll = () => {
    void refetch()
    void qc.invalidateQueries({ queryKey: ['customer', ref, 'audit'] })
    void qc.invalidateQueries({ queryKey: ['customers'] })
  }

  /** The Actions menu (FR-CUS-022): Create request ▸ one entry per category, Copy CIF, Edit. */
  const actionItems = (cif: string): NestedMenuItem[] => [
    {
      key: 'create',
      label: t('c360.actions.createRequest'),
      icon: 'plus',
      disabled: !canRequest,
      disabledReason: canRequest ? undefined : t('c360.actions.noRequestRight'),
      children: (categories.data ?? []).map((cat) => ({
        key: cat.code,
        label: label(cat.labels, i18n.language),
        onSelect: () => navigate(`/service-requests/new?cif=${cif}&category=${cat.code}`),
      })),
    },
    {
      key: 'copy',
      label: t('search.menu.copyCif'),
      icon: 'file',
      onSelect: () =>
        void clipboard
          .copy(cif)
          .then((ok) =>
            toast(ok ? t('search.copied', { cif }) : t('search.copyBlocked'), ok ? 'success' : 'error'),
          ),
    },
    ...(editAction.visible
      ? [
          {
            key: 'edit',
            label: t('common:edit'),
            icon: 'edit',
            disabled: !editAction.enabled,
            disabledReason: editAction.reason,
            onSelect: () => setEditing(true),
          },
        ]
      : []),
  ]

  return (
    <>
      <div>
        <button
          type="button"
          className="btn ghost sm"
          style={{ paddingInline: 0 }}
          data-testid="c360-back"
          onClick={() => navigate(-1)}
        >
          <Icon name="back" />
          {t('c360.back')}
        </button>
      </div>

      {pending ? (
        <div className="note warn" role="status" data-testid="c360-pending" data-type={pending.type}>
          <Icon name="clock" />
          <div style={{ flex: 1 }}>
            {t(`c360.pending.${pending.type}`, {
              by: pending.requestedBy,
              date: formatDate(pending.createdAt, i18n.language),
            })}
          </div>
          {canApprove ? (
            ownRequest ? (
              <span className="help" data-testid="c360-pending-own">
                {t('c360.ownRequest')}
              </span>
            ) : (
              <div className="actions">
                <button
                  type="button"
                  className="btn sm"
                  data-testid="c360-pending-reject"
                  onClick={() => setDecision('reject')}
                >
                  {t('dashboard:approvals.rejectAction')}
                </button>
                <button
                  type="button"
                  className="btn sm pri"
                  data-testid="c360-pending-approve"
                  onClick={() => setDecision('approve')}
                >
                  {t('dashboard:approvals.approveAction')}
                </button>
              </div>
            )
          ) : null}
        </div>
      ) : null}

      {c.cif ? <OfferBanner customerRef={c.cif} /> : null}

      <section className="panel" data-testid="c360">
        <div className="body" style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* FR-CUS-010: the photo, or initials when there is none or it fails to load (CLS locator). */}
          {c.photoDocId ? (
            <SafeImage
              className="avatar c360-photo"
              src={`/api/v1/customers/${c.ref}/documents/${c.photoDocId}/content?inline=1`}
              alt={t('c360.photoOf', { name })}
              width={56}
              height={56}
              fallback={initials(name)}
            />
          ) : (
            <span className="avatar c360-photo" style={{ width: 56, height: 56, fontSize: 18 }} aria-hidden>
              {initials(name)}
            </span>
          )}
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600 }} data-testid="c360-name">
                {name}
              </h1>
              <StatusPill value={c.status} testId="c360-status" />
              {c.kyc.riskRating ? (
                <StatusPill
                  value={c.kyc.riskRating}
                  testId="c360-risk-pill"
                  prefix={`${t('fields.riskRating')}: `}
                />
              ) : null}
              {c.kyc.ekyc ? (
                <span className="pill ok" title={c.kyc.ekyc.reference}>
                  {t('c360.ekycVerified')}
                </span>
              ) : null}
              {c.kyc.pep ? (
                <span className="pill info" data-testid="c360-pep-pill">
                  PEP
                </span>
              ) : null}
            </div>
            <div className="help" style={{ marginTop: 3 }}>
              <span className="mono" data-testid="c360-cif">
                {c.cif}
              </span>{' '}
              · {t(`values.segment.${c.segment}`)} · {c.branchCode} · {t('c360.since')}{' '}
              {formatDate(c.createdAt, i18n.language)}
            </div>
          </div>
          <div className="actions">
            <ActionButton
              action={editAction}
              testId="c360-edit-button"
              onClick={() => setEditing(true)}
              icon="edit"
            >
              {t('common:edit')}
            </ActionButton>
            {c.status === 'blocked' ? (
              <ActionButton
                action={editAction}
                testId="c360-unblock-button"
                onClick={() => setStatusModal('unblock')}
                icon="refresh"
                extraDisabledReason={pending ? t('c360.alreadyPending') : undefined}
              >
                {t('c360.unblock.button')}
              </ActionButton>
            ) : (
              <ActionButton
                action={editAction}
                testId="c360-block-button"
                className="danger"
                onClick={() => setStatusModal('block')}
                icon="ban"
                extraDisabledReason={
                  pending
                    ? t('c360.alreadyPending')
                    : c.status !== 'active'
                      ? t('search.menu.onlyActive')
                      : undefined
                }
              >
                {t('c360.block.button')}
              </ActionButton>
            )}
            {c.cif ? (
              <>
                <MenuWithSubmenu
                  label={t('c360.actions.label')}
                  className="c360-actions"
                  items={actionItems(c.cif)}
                />
                <LocatorBadge style="ARIA" />
              </>
            ) : null}
            {canRequest && c.cif ? (
              <button
                type="button"
                className="btn pri"
                data-testid="c360-new-request"
                onClick={() => navigate(`/service-requests/new?cif=${c.cif}`)}
              >
                <Icon name="plus" />
                {t('c360.newRequest')}
              </button>
            ) : null}
          </div>
        </div>
        <Tabs
          testId="c360-tabs"
          active={tab}
          onChange={(k) => {
            const next = new URLSearchParams(params)
            next.set('tab', k)
            setParams(next, { replace: true })
          }}
          tabs={TABS.map((k) => ({
            key: k,
            label: t(`c360.tabs.${k}`),
            ...(k === 'kyc' ? { count: c.documents.length } : {}),
          }))}
        />
        {TABS.map((k) =>
          visited.has(k) ? (
            <div
              key={k}
              className="body"
              role="tabpanel"
              id={`c360-tabs-panel-${k}`}
              aria-labelledby={`c360-tabs-${k}`}
              data-testid={`c360-panel-${k}`}
              hidden={tab !== k}
            >
              {k === 'overview' ? (
                <>
                  <OverviewTab c={c} />
                  {c.cif ? (
                    <div className="c360-extras">
                      <AccountsPanel c={c} />
                      <BureauPanel c={c} />
                    </div>
                  ) : null}
                </>
              ) : null}
              {k === 'contact' ? <ContactTab c={c} /> : null}
              {k === 'kyc' ? <KycTab c={c} onChanged={refreshAll} /> : null}
              {k === 'requests' ? <RequestsTab c={c} /> : null}
              {k === 'audit' ? <AuditTab c={c} /> : null}
            </div>
          ) : null,
        )}
      </section>

      {statusModal && c.cif ? (
        <StatusRequestModal
          cif={c.cif}
          kind={statusModal}
          onClose={() => setStatusModal(null)}
          onDone={() => {
            setStatusModal(null)
            toast(t('c360.sentForApproval'))
            refreshAll()
          }}
        />
      ) : null}
      {editing && c.cif ? (
        <EditCustomerDrawer
          cif={c.cif}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            toast(t('c360.edit.saved'))
            refreshAll()
          }}
        />
      ) : null}
      {decision && pending ? (
        <ConfirmDialog
          testId="c360-decision"
          title={t(
            decision === 'approve'
              ? 'dashboard:approvals.confirmApproveTitle'
              : 'dashboard:approvals.confirmRejectTitle',
          )}
          message={t(`dashboard:approvals.confirmMessage.${pending.type}`, { cif: c.cif, name })}
          confirmLabel={t(
            decision === 'approve' ? 'dashboard:approvals.approveAction' : 'dashboard:approvals.rejectAction',
          )}
          danger={decision === 'reject'}
          busy={decide.isPending}
          onCancel={() => setDecision(null)}
          onConfirm={() => decide.mutate(decision)}
        />
      ) : null}
    </>
  )
}
