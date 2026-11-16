// Access requests: submitted by signed-out visitors, decided by administrators. Approving creates
// the staff user through the normal admin path, so the same checks and audit entries apply.
import type { Request } from 'express'
import type { z } from 'zod'
import type { AccessRequestDTO, OffsetPage, accessDecisionSchema, accessRequestSchema } from '@csm/shared'
import { conflict, notFound } from '../../lib/errors.ts'
import { audit } from '../../lib/audit.ts'
import { clampPageSize } from '../../lib/pagination.ts'
import { createUser } from '../admin/service.ts'
import * as outbox from '../notifications/service.ts'
import { nextSeq } from '../system/counter.model.ts'
import { AccessRequestModel } from './accessRequest.model.ts'

/* eslint-disable @typescript-eslint/no-explicit-any -- lean documents from Mongoose. */
type Rec = Record<string, any>

const iso = (d: unknown) => (d ? new Date(d as Date).toISOString() : null)

function toDTO(r: Rec): AccessRequestDTO {
  return {
    id: String(r._id),
    requestNo: r.requestNo,
    fullName: r.fullName,
    email: r.email,
    mobile: r.mobile,
    employeeNo: r.employeeNo,
    branchCode: r.branchCode,
    roleRequested: r.roleRequested,
    managerEmail: r.managerEmail ?? null,
    reason: r.reason,
    subscribeUpdates: !!r.subscribeUpdates,
    status: r.status,
    createdAt: iso(r.createdAt)!,
    decidedBy: r.decidedBy ?? null,
    decidedAt: iso(r.decidedAt),
    decisionNote: r.decisionNote ?? null,
    staffId: r.staffId ?? null,
  }
}

/** Stores a new request. One pending request per e-mail address at a time. */
export async function submit(req: Request, input: z.infer<typeof accessRequestSchema>) {
  if (await AccessRequestModel.exists({ email: input.email.toLowerCase(), status: 'pending' })) {
    throw conflict('A request from this e-mail address is already waiting for a decision.', {
      code: 'duplicate_request',
    })
  }
  const year = new Date().getFullYear()
  const requestNo = `AR-${year}-${String(await nextSeq(`accessRequest:${year}`)).padStart(6, '0')}`
  const { acceptTerms: _t, acceptPrivacy: _p, ...fields } = input
  const doc = await AccessRequestModel.create({ ...fields, requestNo, acceptedTermsAt: new Date() })
  await audit(
    {
      category: 'admin',
      action: 'access.requested',
      actor: 'anonymous',
      entityType: 'accessRequest',
      entityId: requestNo,
    },
    req,
  )
  await outbox.send({
    channel: 'email',
    to: doc.email,
    purpose: 'access_request',
    subject: `We received your access request ${requestNo}`,
    body: `Hello ${doc.fullName},\n\nYour request for ${doc.roleRequested.toUpperCase()} access at branch ${doc.branchCode} is with the administrators. You'll get another e-mail when it's decided.`,
  })
  return { requestNo }
}

/** Requests by status, newest first. */
export async function list(q: {
  status: 'pending' | 'approved' | 'rejected'
  page: number
  pageSize: number
}) {
  const pageSize = clampPageSize(q.pageSize, 50)
  const filter = { status: q.status }
  const [rows, total] = await Promise.all([
    AccessRequestModel.find(filter)
      .sort({ _id: -1 })
      .skip((q.page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    AccessRequestModel.countDocuments(filter),
  ])
  return { items: rows.map(toDTO), page: q.page, pageSize, total } satisfies OffsetPage<AccessRequestDTO>
}

/**
 * Approves (creating the staff user; the admin may change the role and branch) or rejects.
 * @returns The updated request and, on approval, the new user's one-time password.
 */
export async function decide(req: Request, id: string, input: z.infer<typeof accessDecisionSchema>) {
  if (!/^[a-f0-9]{24}$/.test(id)) throw notFound('Access request not found.')
  const doc = await AccessRequestModel.findById(id)
  if (!doc) throw notFound('Access request not found.')
  if (doc.status !== 'pending') throw conflict('This request has already been decided.')
  const me = req.auth!.user.staffId
  const status = input.decision === 'approve' ? 'approved' : 'rejected'
  let oneTimePassword: string | undefined
  if (input.decision === 'approve') {
    const created = await createUser(req, {
      staffId: input.staffId,
      name: doc.fullName,
      email: doc.email,
      roleKey: input.roleKey,
      branchCode: input.branchCode,
    })
    oneTimePassword = created.oneTimePassword
    doc.set({ status: 'approved', staffId: input.staffId })
  } else {
    doc.set({ status: 'rejected', decisionNote: input.note })
  }
  doc.set({ decidedBy: me, decidedAt: new Date() })
  await doc.save()
  await audit(
    {
      category: 'admin',
      action: `access.${status}`,
      actor: me,
      entityType: 'accessRequest',
      entityId: doc.requestNo,
    },
    req,
  )
  await outbox.send({
    channel: 'email',
    to: doc.email,
    staffId: doc.staffId,
    purpose: 'access_decision',
    subject: `Access request ${doc.requestNo}: ${status}`,
    body:
      status === 'approved'
        ? `Your staff ID is ${doc.staffId}. Your administrator will give you a one-time password; you'll choose your own at first sign-in.`
        : `Your request was not approved: ${doc.decisionNote}`,
  })
  return { request: toDTO(doc.toObject()), ...(oneTimePassword ? { oneTimePassword } : {}) }
}
