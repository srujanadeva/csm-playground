// Access requests from the public form, decided here. Rows and buttons are found by data
// attributes (data-request-no, data-action), not test ids. Approving creates the staff user and
// shows their one-time password once.
import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BRANCHES, REQUESTABLE_ROLES, type AccessRequestDTO, type OffsetPage } from '@csm/shared'
import { ApiError, api, newIdempotencyKey } from '../../api/client.ts'
import { Modal } from '../../components/Overlay.tsx'
import { useToast } from '../../components/Toast.tsx'
import { EmptyState, Pagination } from '../../components/Widgets.tsx'
import { formatDateTime, label } from '../../lib/format.ts'
import { PasswordModal } from './PasswordModal.tsx'

type Status = 'pending' | 'approved' | 'rejected'

/** The panel under the users table. */
export function AccessRequestsPanel() {
  const { t, i18n } = useTranslation('admin')
  const [status, setStatus] = useState<Status>('pending')
  const [page, setPage] = useState(1)
  const [deciding, setDeciding] = useState<{ req: AccessRequestDTO; decision: 'approve' | 'reject' } | null>(
    null,
  )
  const [otp, setOtp] = useState<{ staffId: string; password: string } | null>(null)
  const { data } = useQuery({
    queryKey: ['admin', 'access-requests', status, page],
    queryFn: () =>
      api<OffsetPage<AccessRequestDTO>>(`/admin/access-requests?status=${status}&page=${page}&pageSize=10`),
    placeholderData: keepPreviousData,
  })
  return (
    <section className="panel" data-section="access-requests" data-total={data?.total ?? ''}>
      <header>
        <h2>{t('requests.title')}</h2>
        <div className="grow" />
        <label className="help" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {t('requests.show')}
          <select
            className="in"
            style={{ width: 'auto' }}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as Status)
              setPage(1)
            }}
          >
            {(['pending', 'approved', 'rejected'] as const).map((s) => (
              <option key={s} value={s}>
                {t(`common:status.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </header>
      {data && data.items.length === 0 ? (
        <EmptyState testId="admin-requests-empty" title={t('requests.empty')} />
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>{t('requests.no')}</th>
                <th>{t('users.fields.name')}</th>
                <th>{t('requests.role')}</th>
                <th>{t('users.fields.branch')}</th>
                <th>{t('requests.reason')}</th>
                <th>{t('requests.received')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((r) => (
                <tr key={r.id} data-request-no={r.requestNo} data-status={r.status}>
                  <td className="mono">{r.requestNo}</td>
                  <td>
                    {r.fullName}
                    <div className="help">
                      {r.email} · {r.employeeNo}
                    </div>
                  </td>
                  <td>{t(`common:role.${r.roleRequested}`)}</td>
                  <td>{r.branchCode}</td>
                  <td style={{ maxWidth: 280 }}>{r.reason}</td>
                  <td>{formatDateTime(r.createdAt, i18n.language)}</td>
                  <td>
                    {r.status === 'pending' ? (
                      <div className="actions">
                        <button
                          type="button"
                          className="btn sm"
                          data-action="reject"
                          onClick={() => setDeciding({ req: r, decision: 'reject' })}
                        >
                          {t('requests.reject')}
                        </button>
                        <button
                          type="button"
                          className="btn sm pri"
                          data-action="approve"
                          onClick={() => setDeciding({ req: r, decision: 'approve' })}
                        >
                          {t('requests.approve')}
                        </button>
                      </div>
                    ) : (
                      <span className="help">
                        {r.staffId ? `${r.staffId} · ` : ''}
                        {r.decidedBy}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.total > 10 ? (
        <Pagination
          testId="admin-requests-pages"
          page={page}
          pageSize={10}
          total={data.total}
          onPage={setPage}
        />
      ) : null}
      {deciding ? (
        <DecisionModal
          req={deciding.req}
          decision={deciding.decision}
          branchLabel={(code) => label(BRANCHES.find((b) => b.code === code)?.name, i18n.language)}
          onClose={() => setDeciding(null)}
          onApproved={(staffId, password) => setOtp({ staffId, password })}
        />
      ) : null}
      {otp ? (
        <PasswordModal staffId={otp.staffId} password={otp.password} onClose={() => setOtp(null)} />
      ) : null}
    </section>
  )
}

/** Suggests a free-looking staff ID from the role: csr, tel or sup + a number. */
function suggestStaffId(role: string, requestNo: string) {
  const prefix = role === 'teller' ? 'tel' : role === 'supervisor' ? 'sup' : 'csr'
  return `${prefix}${requestNo.slice(-3).replace(/^0+/, '').padStart(3, '1')}`
}

/** Approve (staff ID, role, branch) or reject (note). */
function DecisionModal({
  req,
  decision,
  branchLabel,
  onClose,
  onApproved,
}: {
  req: AccessRequestDTO
  decision: 'approve' | 'reject'
  branchLabel: (code: string) => string
  onClose: () => void
  onApproved: (staffId: string, password: string) => void
}) {
  const { t } = useTranslation('admin')
  const toast = useToast()
  const qc = useQueryClient()
  const [staffId, setStaffId] = useState(() => suggestStaffId(req.roleRequested, req.requestNo))
  const [role, setRole] = useState(req.roleRequested)
  const [branch, setBranch] = useState<string>(req.branchCode)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [key] = useState(newIdempotencyKey)
  const mutation = useMutation({
    mutationFn: () =>
      api<{ request: AccessRequestDTO; oneTimePassword?: string }>(
        `/admin/access-requests/${req.id}/decision`,
        {
          method: 'POST',
          idempotencyKey: key,
          body:
            decision === 'approve'
              ? { decision, staffId, roleKey: role, branchCode: branch }
              : { decision, note },
        },
      ),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['admin'] })
      onClose()
      if (res.oneTimePassword) onApproved(staffId, res.oneTimePassword)
      else toast(t('requests.rejected', { no: req.requestNo }))
    },
    onError: (err) =>
      setError(
        err instanceof ApiError
          ? (err.problem.errors?.[0]?.message ?? err.message)
          : t('common:error.generic'),
      ),
  })
  return (
    <Modal
      testId="admin-request-decision"
      title={t(decision === 'approve' ? 'requests.approveTitle' : 'requests.rejectTitle', {
        no: req.requestNo,
      })}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('common:cancel')}
          </button>
          <button
            type="button"
            className={`btn ${decision === 'approve' ? 'pri' : 'danger-solid'}`}
            data-action={`confirm-${decision}`}
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <span className="spin" /> : null}
            {t(decision === 'approve' ? 'requests.approve' : 'requests.reject')}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>
        <b>{req.fullName}</b> · {req.email}
      </p>
      {error ? (
        <div className="note bad" role="alert">
          {error}
        </div>
      ) : null}
      {decision === 'approve' ? (
        <div className="grid g2">
          <label className="f">
            <span className="lbl req">{t('users.fields.staffId')}</span>
            <input
              className="in mono"
              data-field="staffId"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              data-autofocus
            />
          </label>
          <label className="f">
            <span className="lbl req">{t('users.fields.role')}</span>
            <select className="in" data-field="role" value={role} onChange={(e) => setRole(e.target.value)}>
              {REQUESTABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`common:role.${r}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="f span2">
            <span className="lbl req">{t('users.fields.branch')}</span>
            <select
              className="in"
              data-field="branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            >
              {BRANCHES.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.code} · {branchLabel(b.code)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <label className="f">
          <span className="lbl req">{t('requests.note')}</span>
          <textarea
            className="in"
            data-field="note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            data-autofocus
          />
        </label>
      )}
    </Modal>
  )
}
