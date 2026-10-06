/**
 * Dashboard: tiles with the user's workload, the supervisors' approval queue (maker-checker),
 * the user's onboarding drafts, and overdue requests. Every list is paginated.
 */
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type {
  ApprovalDTO,
  CustomerListItem,
  DashboardSummary,
  OffsetPage,
  ServiceRequestCard,
} from '@csm/shared'
import { ApiError, api } from '../../api/client.ts'
import { useCan, useMe } from '../../app/auth.tsx'
import { useCrumb } from '../../app/AppShell.tsx'
import { PriorityBadge, SlaTimer } from '../../components/Badges.tsx'
import { ConfirmDialog } from '../../components/Overlay.tsx'
import { useToast } from '../../components/Toast.tsx'
import { EmptyState, Loading, Pagination } from '../../components/Widgets.tsx'
import { formatDate, formatNumber } from '../../lib/format.ts'
import { useLookupLabel } from '../../hooks/useLookups.ts'

function Tile({
  id,
  value,
  label,
  to,
  alert,
}: {
  id: string
  value: number | null | undefined
  label: string
  to?: string
  alert?: boolean
}) {
  const { i18n } = useTranslation()
  const body = (
    <>
      <b data-testid={`${id}-value`}>
        {value === undefined || value === null ? '—' : formatNumber(value, i18n.language)}
      </b>
      <span>{label}</span>
    </>
  )
  return to ? (
    <Link className={`tile ${alert && value ? 'alert' : ''}`} to={to} data-testid={id}>
      {body}
    </Link>
  ) : (
    <div className={`tile ${alert && value ? 'alert' : ''}`} data-testid={id}>
      {body}
    </div>
  )
}

function ApprovalsPanel() {
  const { t, i18n } = useTranslation('dashboard')
  const me = useMe()
  const toast = useToast()
  const qc = useQueryClient()
  const reasonLabel = useLookupLabel('blockReasons')
  const [page, setPage] = useState(1)
  const [confirm, setConfirm] = useState<{ approval: ApprovalDTO; decision: 'approve' | 'reject' } | null>(
    null,
  )
  const { data, isLoading } = useQuery({
    queryKey: ['approvals', page],
    queryFn: () => api<OffsetPage<ApprovalDTO>>(`/approvals?page=${page}&pageSize=5`),
    placeholderData: keepPreviousData,
  })
  const decide = useMutation({
    mutationFn: (c: { approval: ApprovalDTO; decision: 'approve' | 'reject' }) =>
      api<ApprovalDTO>(`/approvals/${c.approval.id}/${c.decision}`, { method: 'POST', body: {} }),
    onSuccess: (_d, c) => {
      toast(
        t(c.decision === 'approve' ? 'approvals.approved' : 'approvals.rejected', {
          cif: c.approval.entityId,
        }),
      )
      setConfirm(null)
      void qc.invalidateQueries({ queryKey: ['approvals'] })
      void qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
      void qc.invalidateQueries({ queryKey: ['customer', c.approval.entityId] })
    },
    onError: (err) => {
      toast(err instanceof ApiError ? err.message : t('common:error.generic'), 'error')
      setConfirm(null)
    },
  })
  return (
    <section className="panel tw" data-testid="approvals">
      <header>
        <h2>{t('approvals.title')}</h2>
        <span className="hint">{t('approvals.hint')}</span>
      </header>
      {isLoading ? (
        <Loading testId="approvals-loading" />
      ) : !data?.items.length ? (
        <EmptyState testId="approvals-empty" title={t('approvals.empty')} />
      ) : (
        <>
          <table data-testid="approvals-table">
            <thead>
              <tr>
                <th>{t('approvals.request')}</th>
                <th>{t('approvals.customer')}</th>
                <th>{t('approvals.reason')}</th>
                <th>{t('approvals.requestedBy')}</th>
                <th>{t('approvals.date')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((a) => {
                const own = a.requestedBy === me.user.staffId
                return (
                  <tr key={a.id} data-row-id={a.id} data-testid="approvals-row">
                    <td>{t(`approvals.type.${a.type}`)}</td>
                    <td>
                      <Link to={`/customers/${a.entityId}`} className="mono" data-testid="approvals-row-cif">
                        {a.entityId}
                      </Link>{' '}
                      {a.customerName}
                    </td>
                    <td>{a.reason ? reasonLabel(a.reason) : '—'}</td>
                    <td className="mono">{a.requestedBy}</td>
                    <td className="num">{formatDate(a.createdAt, i18n.language)}</td>
                    <td>
                      <div className="actions" style={{ justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn sm"
                          data-testid="approvals-row-reject"
                          disabled={own}
                          title={own ? t('approvals.own') : undefined}
                          onClick={() => setConfirm({ approval: a, decision: 'reject' })}
                        >
                          {t('approvals.rejectAction')}
                        </button>
                        <button
                          type="button"
                          className="btn sm pri"
                          data-testid="approvals-row-approve"
                          disabled={own}
                          title={own ? t('approvals.own') : undefined}
                          onClick={() => setConfirm({ approval: a, decision: 'approve' })}
                        >
                          {t('approvals.approveAction')}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Pagination
            testId="approvals-pagination"
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPage={setPage}
          />
        </>
      )}
      {confirm ? (
        <ConfirmDialog
          testId="approvals-confirm"
          title={t(
            confirm.decision === 'approve' ? 'approvals.confirmApproveTitle' : 'approvals.confirmRejectTitle',
          )}
          message={t(`approvals.confirmMessage.${confirm.approval.type}`, {
            cif: confirm.approval.entityId,
            name: confirm.approval.customerName,
          })}
          confirmLabel={t(
            confirm.decision === 'approve' ? 'approvals.approveAction' : 'approvals.rejectAction',
          )}
          danger={confirm.decision === 'reject'}
          busy={decide.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => decide.mutate(confirm)}
        />
      ) : null}
    </section>
  )
}

function DraftsPanel() {
  const { t, i18n } = useTranslation('dashboard')
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['customers', 'drafts', page],
    queryFn: () => api<OffsetPage<CustomerListItem>>(`/customers?status=draft&pageSize=5&page=${page}`),
    placeholderData: keepPreviousData,
  })
  return (
    <section className="panel tw" data-testid="drafts">
      <header>
        <h2>{t('drafts.title')}</h2>
        <span className="hint">{t('drafts.hint')}</span>
      </header>
      {isLoading ? (
        <Loading testId="drafts-loading" />
      ) : !data?.items.length ? (
        <EmptyState testId="drafts-empty" title={t('drafts.empty')} />
      ) : (
        <>
          <table>
            <tbody>
              {data.items.map((d) => (
                <tr
                  key={d.ref}
                  className="clickable"
                  data-row-id={d.ref}
                  data-testid="drafts-row"
                  onClick={() => navigate(`/customers/new?draft=${d.ref}`)}
                >
                  <td className="mono">{d.draftNo}</td>
                  <td>{d.name}</td>
                  <td className="num help">{formatDate(d.createdAt, i18n.language)}</td>
                  <td style={{ textAlign: 'end' }}>
                    <Link
                      to={`/customers/new?draft=${d.ref}`}
                      className="btn sm"
                      data-testid="drafts-row-resume"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t('drafts.resume')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            testId="drafts-pagination"
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPage={setPage}
          />
        </>
      )}
    </section>
  )
}

function OverduePanel() {
  const { t } = useTranslation('dashboard')
  const { data, isLoading } = useQuery({
    queryKey: ['service-requests', 'overdue'],
    queryFn: () =>
      api<OffsetPage<ServiceRequestCard>>(
        '/service-requests?queue=mine&sort=slaDueAt&pageSize=5&status=open',
      ),
  })
  return (
    <section className="panel tw" data-testid="my-requests">
      <header>
        <h2>{t('requests.title')}</h2>
        <span className="hint">{t('requests.hint')}</span>
        <div className="grow" />
        <Link to="/service-requests" className="btn ghost sm" data-testid="my-requests-board">
          {t('requests.openBoard')}
        </Link>
      </header>
      {isLoading ? (
        <Loading testId="my-requests-loading" />
      ) : !data?.items.length ? (
        <EmptyState testId="my-requests-empty" title={t('requests.empty')} />
      ) : (
        <table>
          <tbody>
            {data.items.map((r) => (
              <tr key={r.srNo} data-row-id={r.srNo} data-testid="my-requests-row">
                <td>
                  <Link to={`/service-requests?sr=${r.srNo}`} className="mono">
                    {r.srNo}
                  </Link>
                </td>
                <td>{r.subject}</td>
                <td>
                  <PriorityBadge value={r.priority} />
                </td>
                <td>
                  <SlaTimer slaDueAt={r.slaDueAt} status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

/** /dashboard */
export default function DashboardPage() {
  const { t } = useTranslation('dashboard')
  const me = useMe()
  const location = useLocation()
  const canApprove = useCan('customers.360', 'approve')
  const canOnboard = useCan('customers.onboard', 'view')
  const canBoard = useCan('serviceRequests.board', 'view')
  const canSearch = useCan('customers.search', 'view')
  useCrumb([t('title')])
  const { data } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api<DashboardSummary>('/dashboard/summary'),
  })
  const passwordChanged = (location.state as { passwordChanged?: boolean } | null)?.passwordChanged

  return (
    <>
      <div className="ph">
        <div>
          <h1 data-testid="dashboard-title">{t('greeting', { name: me.user.name.split(' ')[0] })}</h1>
          <p>{t('subtitle')}</p>
        </div>
      </div>
      {passwordChanged ? (
        <div className="note ok" role="status" data-testid="dashboard-password-changed">
          {t('passwordChanged')}
        </div>
      ) : null}
      <div className="tiles" data-testid="dashboard-tiles">
        {canBoard ? (
          <Tile
            id="tile-my-open"
            value={data?.myOpenRequests}
            label={t('tiles.myOpen')}
            to="/service-requests"
          />
        ) : null}
        {canBoard ? (
          <Tile
            id="tile-overdue"
            value={data?.overdueRequests}
            label={t('tiles.overdue')}
            to="/service-requests?view=list&queue=branch&sort=slaDueAt"
            alert
          />
        ) : null}
        {canApprove ? (
          <Tile id="tile-approvals" value={data?.pendingApprovals} label={t('tiles.approvals')} alert />
        ) : null}
        {canSearch ? (
          <Tile
            id="tile-customers"
            value={data?.customersInScope}
            label={t('tiles.customers')}
            to="/customers"
          />
        ) : null}
        {canOnboard ? <Tile id="tile-drafts" value={data?.draftsByMe} label={t('tiles.drafts')} /> : null}
      </div>
      {canApprove ? <ApprovalsPanel /> : null}
      <div className="grid g2" style={{ alignItems: 'start' }}>
        {canOnboard ? <DraftsPanel /> : null}
        {canBoard ? <OverduePanel /> : null}
      </div>
    </>
  )
}
