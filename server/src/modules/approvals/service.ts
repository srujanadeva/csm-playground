/**
 * Maker-checker approvals (OWASP A06). A request takes effect only when someone other than
 * the requester, with `approve` on Customer 360 and in the same branch, approves it.
 */
import type { Request } from 'express'
import type { ApprovalDTO, OffsetPage } from '@csm/shared'
import { audit } from '../../lib/audit.ts'
import { conflict, forbidden, notFound } from '../../lib/errors.ts'
import { clampPageSize } from '../../lib/pagination.ts'
import { branchScope } from '../../middleware/auth.ts'
import { CustomerModel } from '../customers/customer.model.ts'
import { namesByCif } from '../customers/service.ts'
import { ApprovalModel } from './approval.model.ts'

type ApprovalRow = Awaited<ReturnType<typeof ApprovalModel.findOne>> & object

function toDTO(a: NonNullable<ApprovalRow> | Record<string, never>, names: Map<string, string>): ApprovalDTO {
  const r = a as unknown as {
    _id: unknown
    type: string
    entityId: string
    branchCode: ApprovalDTO['branchCode']
    reason?: string
    remarks?: string
    status: string
    requestedBy: string
    decidedBy?: string
    createdAt: Date
  }
  return {
    id: String(r._id),
    type: r.type,
    entityId: r.entityId,
    customerName: names.get(r.entityId) ?? r.entityId,
    branchCode: r.branchCode,
    ...(r.reason ? { reason: r.reason } : {}),
    ...(r.remarks ? { remarks: r.remarks } : {}),
    status: r.status,
    requestedBy: r.requestedBy,
    ...(r.decidedBy ? { decidedBy: r.decidedBy } : {}),
    createdAt: new Date(r.createdAt).toISOString(),
  }
}

/** Pending (or decided) approvals in the caller's branch, oldest first so nothing waits forever. */
export async function list(
  req: Request,
  q: { page: number; pageSize: number; status: 'pending' | 'approved' | 'rejected' },
): Promise<OffsetPage<ApprovalDTO>> {
  const filter = { ...branchScope(req), status: q.status }
  const pageSize = clampPageSize(q.pageSize, 50)
  const [rows, total] = await Promise.all([
    ApprovalModel.find(filter)
      .sort({ _id: q.status === 'pending' ? 1 : -1 })
      .skip((q.page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    ApprovalModel.countDocuments(filter),
  ])
  const names = await namesByCif(rows.map((r) => r.entityId))
  return { items: rows.map((r) => toDTO(r as never, names)), page: q.page, pageSize, total }
}

const EFFECT: Record<string, { from: string[]; to: string; action: string }> = {
  'customer.activate': { from: ['pending_approval'], to: 'active', action: 'customer.activated' },
  'customer.block': { from: ['active'], to: 'blocked', action: 'customer.blocked' },
  'customer.unblock': { from: ['blocked'], to: 'active', action: 'customer.unblocked' },
}

/** Approves or rejects a pending request; approving applies the change to the customer. */
export async function decide(
  req: Request,
  id: string,
  decision: 'approve' | 'reject',
  note: string | undefined,
) {
  if (!/^[a-f0-9]{24}$/.test(id)) throw notFound('Approval not found.')
  const approval = await ApprovalModel.findOne({ _id: id, ...branchScope(req) })
  if (!approval) throw notFound('Approval not found.')
  if (approval.status !== 'pending') throw conflict('This request has already been decided.')
  const me = req.auth!.user.staffId
  if (approval.requestedBy === me)
    throw forbidden("You can't approve or reject your own request.", { code: 'own_request' })

  if (decision === 'approve') {
    const effect = EFFECT[approval.type]!
    const customer = await CustomerModel.findOne({ cif: approval.entityId })
    if (!customer) throw notFound('Customer not found.')
    if (!effect.from.includes(customer.status)) {
      throw conflict(
        `The customer is now ${customer.status.replace('_', ' ')}, so this request can't be applied.`,
      )
    }
    const from = customer.status
    customer.set('status', effect.to)
    if (approval.type === 'customer.activate')
      customer.set({ 'kyc.status': 'verified', 'kyc.verifiedAt': new Date() })
    customer.set('updatedBy', me)
    await customer.save()
    await audit(
      {
        category: 'data',
        action: effect.action,
        actor: me,
        entityType: 'customer',
        entityId: approval.entityId,
        changes: [{ field: 'status', from, to: effect.to }],
      },
      req,
    )
  }

  approval.set({
    status: decision === 'approve' ? 'approved' : 'rejected',
    decidedBy: me,
    decidedAt: new Date(),
    decisionNote: note,
  })
  await approval.save()
  await audit(
    {
      category: 'data',
      action: `approval.${decision === 'approve' ? 'approved' : 'rejected'}`,
      actor: me,
      entityType: 'approval',
      entityId: String(approval._id),
    },
    req,
  )
  const names = await namesByCif([approval.entityId])
  return toDTO(approval.toObject() as never, names)
}
