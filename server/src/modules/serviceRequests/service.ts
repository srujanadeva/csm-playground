/**
 * Service request rules: creation, the board (cursor-paginated per column), the list
 * (page-number pagination), status changes through the state machine, comments and
 * attachments. Closing a request needs `approve` on the Request board.
 */
import { resolve } from 'node:path'
import type { Request, Response } from 'express'
import type { z } from 'zod'
import {
  can,
  canTransition,
  type boardQuery,
  type CommentDTO,
  type commentSchema,
  type CreateServiceRequestInput,
  type OffsetPage,
  type ServiceRequestCard,
  type ServiceRequestDetail,
  type srListQuery,
  type statusChangeSchema,
} from '@csm/shared'
import type { Config } from '../../config.ts'
import { SERVER_DIR } from '../../env.ts'
import { audit } from '../../lib/audit.ts'
import { toCsv } from '../../lib/csv.ts'
import { conflict, forbidden, notFound, staleVersion, validationFailed } from '../../lib/errors.ts'
import { clampPageSize, cursorFilter, parseSort, toCursorPage } from '../../lib/pagination.ts'
import { op } from '../../lib/query.ts'
import { escapeRegex } from '../../lib/regex.ts'
import { sendUpload, storeUpload } from '../../lib/uploads.ts'
import { branchScope } from '../../middleware/auth.ts'
import { maxPageSizeFor } from '../admin/access.ts'
import { StaffUserModel } from '../auth/staffUser.model.ts'
import { CustomerModel } from '../customers/customer.model.ts'
import { fullName, toDocumentDTO } from '../customers/dto.ts'
import { LookupModel } from '../lookups/lookup.model.ts'
import { formatSrNo, nextSeq } from '../system/counter.model.ts'
import { ServiceRequestModel, SrCommentModel } from './serviceRequest.model.ts'

/* eslint-disable @typescript-eslint/no-explicit-any -- lean documents from Mongoose. */
type SrRecord = Record<string, any>

const actor = (req: Request) => req.auth!.user.staffId
const uploadDir = (config: Config) => resolve(SERVER_DIR, config.UPLOAD_DIR)
const MAX_ATTACHMENTS = 5

export function toCard(r: SrRecord): ServiceRequestCard {
  return {
    srNo: r.srNo,
    subject: r.subject,
    customerCif: r.customerCif,
    customerName: r.customerName,
    priority: r.priority,
    status: r.status,
    slaDueAt: new Date(r.slaDueAt).toISOString(),
    assignedTo: r.assignedTo ?? null,
    createdAt: new Date(r.createdAt).toISOString(),
    version: r.__v ?? 0,
  }
}

function toDetail(r: SrRecord): ServiceRequestDetail {
  return {
    ...toCard(r),
    branchCode: r.branchCode,
    channel: r.channel,
    category: r.category,
    subCategory: r.subCategory,
    description: r.description,
    resolutionNotes: r.resolutionNotes ?? null,
    createdBy: r.createdBy,
    resolvedAt: r.resolvedAt ? new Date(r.resolvedAt).toISOString() : null,
    closedAt: r.closedAt ? new Date(r.closedAt).toISOString() : null,
    notifyBySms: r.notifyBySms ?? false,
    attachments: (r.attachments ?? []).map((a: SrRecord) => toDocumentDTO({ ...a, kind: 'other' })),
  }
}

async function findScoped(req: Request, srNo: string) {
  if (!/^SR-[0-9]{4}-[0-9]{6}$/.test(srNo)) throw notFound('Service request not found.')
  const doc = await ServiceRequestModel.findOne({ srNo, ...branchScope(req) })
  if (!doc) throw notFound('Service request not found.')
  return doc
}

/** Active staff in the caller's branch who can be assigned requests. */
export async function assignees(req: Request) {
  const rows = await StaffUserModel.find({
    branchCode: req.auth!.user.branchCode,
    status: 'active',
    roleKey: op({ $in: ['csr', 'supervisor'] }),
  })
    .select('staffId name roleKey')
    .sort({ name: 1 })
    .lean()
  return rows.map((r) => ({ staffId: r.staffId, name: r.name, roleKey: r.roleKey }))
}

/** Creates a request for a customer in the caller's branch. */
export async function create(req: Request, input: CreateServiceRequestInput): Promise<ServiceRequestDetail> {
  const customer = await CustomerModel.findOne({
    cif: input.customerCif,
    ...branchScope(req),
    status: op({ $in: ['active', 'blocked'] }),
  }).lean()
  if (!customer) {
    throw validationFailed([
      { path: 'customerCif', code: 'required', message: 'Choose an active customer from your branch.' },
    ])
  }
  const sub = await LookupModel.exists({
    type: 'srSubCategories',
    code: input.subCategory,
    parent: input.category,
    active: true,
  })
  if (!sub) {
    throw validationFailed([
      {
        path: 'subCategory',
        code: 'required',
        message: 'Choose a sub-category that belongs to the category.',
      },
    ])
  }
  const assignedTo = input.assignedTo ?? actor(req)
  const assignee = await StaffUserModel.exists({
    staffId: assignedTo,
    branchCode: customer.branchCode,
    status: 'active',
  })
  if (!assignee) {
    throw validationFailed([
      {
        path: 'assignedTo',
        code: 'invalid',
        message: 'Assign the request to active staff in the same branch.',
      },
    ])
  }
  const year = new Date().getFullYear()
  const srNo = formatSrNo(year, await nextSeq(`sr-${year}`))
  const doc = await ServiceRequestModel.create({
    srNo,
    customerCif: customer.cif!,
    customerName: fullName(customer),
    branchCode: customer.branchCode,
    channel: input.channel,
    category: input.category,
    subCategory: input.subCategory,
    priority: input.priority,
    slaDueAt: new Date(input.slaDueAt),
    subject: input.subject,
    description: input.description,
    status: 'open',
    assignedTo,
    createdBy: actor(req),
    notifyBySms: input.notifyBySms,
  })
  await audit(
    {
      category: 'data',
      action: 'serviceRequest.created',
      actor: actor(req),
      entityType: 'serviceRequest',
      entityId: srNo,
    },
    req,
  )
  return toDetail(doc.toObject())
}

function queueFilter(req: Request, q: { queue: 'mine' | 'branch' | 'all'; priority?: string; q?: string }) {
  const filter: Record<string, unknown> = { ...branchScope(req) }
  if (q.queue === 'mine') filter.assignedTo = actor(req)
  if (q.priority) filter.priority = q.priority
  if (q.q) {
    const text = escapeRegex(q.q)
    filter.$or = [
      { srNo: op({ $regex: text.toUpperCase() }) },
      { customerCif: op({ $regex: `^${text.toUpperCase()}` }) },
      { customerName: op({ $regex: `(^| )${text}`, $options: 'i' }) },
      { subject: op({ $regex: text, $options: 'i' }) },
    ]
  }
  return filter
}

/** One board column, newest first, with its total for the column header. */
export async function boardColumn(req: Request, q: z.infer<typeof boardQuery>) {
  const base = { ...queueFilter(req, q), status: q.status }
  const [rows, total] = await Promise.all([
    ServiceRequestModel.find({ ...base, ...cursorFilter(q.cursor) })
      .sort({ _id: -1 })
      .limit(q.limit + 1)
      .lean(),
    ServiceRequestModel.countDocuments(base),
  ])
  const page = toCursorPage(rows, q.limit)
  return { items: page.items.map(toCard), nextCursor: page.nextCursor, total }
}

const SORTS = ['createdAt', 'slaDueAt', 'priority', 'srNo', 'status']

/** The list view: filters, sorting and page-number pagination. */
export async function list(
  req: Request,
  q: z.infer<typeof srListQuery>,
): Promise<OffsetPage<ServiceRequestCard>> {
  const filter = { ...queueFilter(req, q), ...(q.status ? { status: q.status } : {}) }
  const pageSize = clampPageSize(q.pageSize, await maxPageSizeFor('serviceRequests.board'))
  const sort = parseSort(q.sort, SORTS, { _id: -1 })
  const [rows, total] = await Promise.all([
    ServiceRequestModel.find(filter)
      .sort(sort)
      .skip((q.page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    ServiceRequestModel.countDocuments(filter),
  ])
  return { items: rows.map(toCard), page: q.page, pageSize, total }
}

/** CSV of the list view's current filters (first 5,000 rows). */
export async function exportCsv(req: Request, q: z.infer<typeof srListQuery>): Promise<string> {
  const filter = { ...queueFilter(req, q), ...(q.status ? { status: q.status } : {}) }
  const rows = await ServiceRequestModel.find(filter)
    .sort(parseSort(q.sort, SORTS, { _id: -1 }))
    .limit(5000)
    .lean()
  await audit(
    {
      category: 'data',
      action: 'serviceRequest.exported',
      actor: actor(req),
      entityType: 'serviceRequest',
      entityId: `${rows.length} rows`,
    },
    req,
  )
  return toCsv(
    ['SR number', 'Subject', 'CIF', 'Customer', 'Priority', 'Status', 'SLA due', 'Assigned to', 'Created'],
    rows.map((r) => [
      r.srNo,
      r.subject,
      r.customerCif,
      r.customerName,
      r.priority,
      r.status,
      r.slaDueAt.toISOString(),
      r.assignedTo,
      r.createdAt.toISOString(),
    ]),
  )
}

/** One request with everything the drawer shows. */
export async function get(req: Request, srNo: string): Promise<ServiceRequestDetail> {
  return toDetail((await findScoped(req, srNo)).toObject())
}

/** Moves a request through the state machine. Closing needs `approve`. */
export async function changeStatus(req: Request, srNo: string, body: z.infer<typeof statusChangeSchema>) {
  const doc = await findScoped(req, srNo)
  if ((doc.__v ?? 0) !== body.version) throw staleVersion()
  if (doc.status === body.status) return toDetail(doc.toObject())
  if (!canTransition(doc.status, body.status)) {
    throw conflict(
      `A request can't move from ${doc.status.replace('_', ' ')} to ${body.status.replace('_', ' ')}.`,
      { code: 'invalid_transition' },
    )
  }
  if (body.status === 'closed' && !can(req.auth!.permissions, 'serviceRequests.board', 'approve')) {
    throw forbidden('Closing a request needs the Approve permission on the Request board.')
  }
  const from = doc.status
  doc.set('status', body.status)
  if (body.status === 'resolved') doc.set({ resolvedAt: new Date(), resolutionNotes: body.resolutionNotes })
  if (body.status === 'closed') doc.set('closedAt', new Date())
  if (body.status === 'open' || body.status === 'in_progress') doc.set({ resolvedAt: undefined })
  await doc.save()
  await audit(
    {
      category: 'data',
      action: 'serviceRequest.status',
      actor: actor(req),
      entityType: 'serviceRequest',
      entityId: srNo,
      changes: [{ field: 'status', from, to: body.status }],
    },
    req,
  )
  return toDetail(doc.toObject())
}

/** Comments on a request, newest first, cursor-paginated. */
export async function comments(req: Request, srNo: string, cursor: string | undefined, limit: number) {
  await findScoped(req, srNo)
  const rows = await SrCommentModel.find({ srNo, ...cursorFilter(cursor) })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean()
  const page = toCursorPage(rows, limit)
  return {
    nextCursor: page.nextCursor,
    items: page.items.map<CommentDTO>((c) => ({
      id: String(c._id),
      by: c.by,
      byName: c.byName,
      text: c.text,
      createdAt: c.createdAt.toISOString(),
    })),
  }
}

/** Adds a comment as the signed-in user. */
export async function addComment(
  req: Request,
  srNo: string,
  body: z.infer<typeof commentSchema>,
): Promise<CommentDTO> {
  const doc = await findScoped(req, srNo)
  if (doc.status === 'closed') throw conflict("Closed requests can't take new comments.")
  const c = await SrCommentModel.create({
    srNo,
    by: actor(req),
    byName: req.auth!.user.name,
    text: body.text,
  })
  await audit(
    {
      category: 'data',
      action: 'serviceRequest.commented',
      actor: actor(req),
      entityType: 'serviceRequest',
      entityId: srNo,
    },
    req,
  )
  return { id: String(c._id), by: c.by, byName: c.byName, text: c.text, createdAt: c.createdAt.toISOString() }
}

/** Adds an attachment (JPG, PNG or PDF, at most 5 per request). */
export async function addAttachment(
  req: Request,
  srNo: string,
  file: Express.Multer.File | undefined,
  config: Config,
) {
  const doc = await findScoped(req, srNo)
  if (doc.status === 'closed') throw conflict("Closed requests can't take new attachments.")
  if (doc.attachments.length >= MAX_ATTACHMENTS)
    throw conflict(`A request can have at most ${MAX_ATTACHMENTS} attachments.`)
  const stored = await storeUpload(uploadDir(config), file)
  doc.attachments.push({ ...stored, uploadedBy: actor(req), uploadedAt: new Date() })
  await doc.save()
  return toDocumentDTO({ ...doc.attachments.at(-1)!.toObject(), kind: 'other' })
}

/** Streams an attachment. */
export async function sendAttachment(
  req: Request,
  res: Response,
  srNo: string,
  id: string,
  inline: boolean,
  config: Config,
) {
  const doc = await findScoped(req, srNo)
  const file = doc.attachments.find((a) => String(a._id) === id)
  if (!file) throw notFound('Attachment not found.')
  await sendUpload(res, uploadDir(config), file, inline)
}
