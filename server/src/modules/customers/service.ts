/**
 * Customer business rules: onboarding drafts, submission, search, the 360 view, edits,
 * documents, PII reveal and block/unblock requests. Every read and write is limited to the
 * caller's branch (admins see all), and every change is audited.
 */
import type { Request } from 'express'
import {
  calculateRisk,
  can,
  maskMobile,
  contactSchema,
  kycSchema,
  personalSchema,
  validationMessage,
  type CustomerDetail,
  type CustomerSearchQuery,
  type OffsetPage,
  type CustomerListItem,
  type CustomerTypeaheadItem,
} from '@csm/shared'
import type { z } from 'zod'
import type {
  blockRequestSchema,
  contactDraftSchema,
  kycDraftSchema,
  personalDraftSchema,
  submitSchema,
  updateActiveSchema,
  updateDraftSchema,
} from '@csm/shared'
import type { Config } from '../../config.ts'
import { audit, diff } from '../../lib/audit.ts'
import { blindIndex, decryptField, encryptField } from '../../lib/crypto.ts'
import { conflict, notFound, staleVersion, validationFailed, type FieldError } from '../../lib/errors.ts'
import { clampPageSize, cursorFilter, parseSort, toCursorPage } from '../../lib/pagination.ts'
import { endOfDay, op, startOfDay } from '../../lib/query.ts'
import { escapeRegex } from '../../lib/regex.ts'
import { deleteUpload, sendUpload, storeUpload } from '../../lib/uploads.ts'
import { toCsv } from '../../lib/csv.ts'
import { branchScope } from '../../middleware/auth.ts'
import { maxPageSizeFor } from '../admin/access.ts'
import { ApprovalModel } from '../approvals/approval.model.ts'
import { AuditLogModel } from '../audit/auditLog.model.ts'
import { LookupModel } from '../lookups/lookup.model.ts'
import { ServiceRequestModel } from '../serviceRequests/serviceRequest.model.ts'
import { formatCif, nextSeq } from '../system/counter.model.ts'
import { CustomerModel } from './customer.model.ts'
import {
  formatMobile,
  formToMobile,
  fullName,
  refOf,
  toDetail,
  toDocumentDTO,
  toDraftForm,
  toListItem,
  type CustomerRecord,
} from './dto.ts'
import { resolve } from 'node:path'
import { SERVER_DIR } from '../../env.ts'

type PersonalDraft = z.infer<typeof personalDraftSchema>
type ContactDraft = z.infer<typeof contactDraftSchema>
type KycDraft = z.infer<typeof kycDraftSchema>

const MAX_DOCUMENTS = 10
const EXPORT_LIMIT = 5000
const uploadDir = (config: Config) => resolve(SERVER_DIR, config.UPLOAD_DIR)

/** URL reference → filter: CIF-000124 or D-2026-00012. Anything else is a 404. */
function refFilter(ref: string): Record<string, string> {
  if (/^CIF-[0-9]{6}$/.test(ref)) return { cif: ref }
  if (/^D-[0-9]{4}-[0-9]{5}$/.test(ref)) return { draftNo: ref }
  throw notFound('Customer not found.')
}

/** Loads a customer in the caller's scope, or throws 404. */
async function findScoped(ref: string, req: Request, withSecrets = false) {
  const query = CustomerModel.findOne({ ...refFilter(ref), ...branchScope(req) })
  if (withSecrets) query.select('+kyc.idNumberEnc +kyc.idNumberIndex')
  const doc = await query
  if (!doc) throw notFound('Customer not found.')
  return doc
}

const checkVersion = (doc: { __v?: number }, version: number) => {
  if ((doc.__v ?? 0) !== version) throw staleVersion()
}

const actor = (req: Request) => req.auth!.user.staffId

// ── Applying wizard sections ─────────────────────────────────────────────────
// Each section replaces the stored one as a whole, so clearing a field in the form clears it.

type Doc = Awaited<ReturnType<typeof findScoped>>

function applyPersonal(doc: Doc, p: PersonalDraft) {
  if (p.type) doc.set('type', p.type)
  if (p.segment) doc.set('segment', p.segment)
  const fields = [
    'title',
    'firstName',
    'middleName',
    'lastName',
    'fatherOrSpouseName',
    'gender',
    'nationality',
    'countryOfBirth',
    'maritalStatus',
    'dependants',
    'occupation',
    'employer',
    'monthlyIncome',
    'preferredLanguage',
    'productsOfInterest',
  ] as const
  for (const f of fields) doc.set(`personal.${f}`, p[f] ?? undefined)
  doc.set('personal.dob', p.dob ? startOfDay(p.dob) : undefined)
  doc.set('nameSearch', [p.firstName, p.lastName].filter(Boolean).join(' ').toLowerCase() || undefined)
  updateRisk(doc)
}

function applyContact(doc: Doc, c: ContactDraft) {
  doc.set('contact.mobile', formToMobile(c.mobile))
  doc.set('contact.altMobile', formToMobile(c.altMobile))
  doc.set('contact.email', c.email ?? undefined)
  doc.set('contact.commPrefs', c.commPrefs ?? [])
  doc.set('addresses.permanent', c.permanent ? { country: 'IN', ...c.permanent } : undefined)
  const same = c.mailingSameAsPermanent ?? true
  doc.set('addresses.mailingSameAsPermanent', same)
  doc.set('addresses.mailing', !same && c.mailing ? { country: 'IN', ...c.mailing } : undefined)
}

function applyKyc(doc: Doc, k: KycDraft, config: Config) {
  doc.set('kyc.idType', k.idType ?? undefined)
  if (k.idNumber) {
    doc.set('kyc.idNumberEnc', encryptField(k.idNumber, config.PII_ENC_KEY))
    doc.set('kyc.idNumberIndex', blindIndex(k.idNumber, config.PII_ENC_KEY))
    doc.set('kyc.idNumberLast4', k.idNumber.slice(-4))
  } else {
    doc.set('kyc.idNumberEnc', undefined)
    doc.set('kyc.idNumberIndex', undefined)
    doc.set('kyc.idNumberLast4', undefined)
  }
  doc.set('kyc.issueDate', k.issueDate ? startOfDay(k.issueDate) : undefined)
  doc.set('kyc.expiryDate', k.expiryDate ? startOfDay(k.expiryDate) : undefined)
  doc.set('kyc.pep', k.pep ?? false)
  doc.set('kyc.pepDetails', k.pep && k.pepDetails ? k.pepDetails : undefined)
  doc.set('kyc.fatcaUsPerson', k.fatcaUsPerson ?? false)
  updateRisk(doc)
}

function updateRisk(doc: Doc) {
  doc.set(
    'kyc.riskRating',
    calculateRisk({
      pep: doc.get('kyc.pep'),
      fatcaUsPerson: doc.get('kyc.fatcaUsPerson'),
      nationality: doc.get('personal.nationality'),
      monthlyIncome: doc.get('personal.monthlyIncome'),
    }),
  )
}

// ── Drafts and submission ────────────────────────────────────────────────────

/** Starts an onboarding draft from step 1 and gives it a draft number. */
export async function createDraft(req: Request, personal: PersonalDraft, config: Config) {
  const year = new Date().getFullYear()
  const draftNo = `D-${year}-${String(await nextSeq(`draft-${year}`)).padStart(5, '0')}`
  const doc = new CustomerModel({
    draftNo,
    status: 'draft',
    branchCode: req.auth!.user.branchCode,
    createdBy: actor(req),
    updatedBy: actor(req),
  })
  applyPersonal(doc, personal)
  await doc.save()
  await audit(
    {
      category: 'data',
      action: 'customer.created',
      actor: actor(req),
      entityType: 'customer',
      entityId: draftNo,
    },
    req,
  )
  return toDraftForm(doc.toObject(), config.PII_ENC_KEY)
}

/**
 * A record in wizard form shape. The decrypted ID number is included only for drafts (the
 * maker's own input); for submitted customers it stays behind the audited reveal endpoint.
 */
export async function getForm(req: Request, ref: string, config: Config) {
  const doc = await findScoped(ref, req, true)
  const form = toDraftForm(doc.toObject(), config.PII_ENC_KEY)
  if (doc.status !== 'draft') delete form.kyc.idNumber
  return form
}

/** Saves one or more wizard steps of a draft. */
export async function updateDraft(
  req: Request,
  ref: string,
  body: z.infer<typeof updateDraftSchema>,
  config: Config,
) {
  const doc = await findScoped(ref, req, true)
  if (doc.status !== 'draft') throw conflict('Only drafts can be changed in the onboarding wizard.')
  checkVersion(doc, body.version)
  if (body.personal) applyPersonal(doc, body.personal)
  if (body.contact) applyContact(doc, body.contact)
  if (body.kyc) applyKyc(doc, body.kyc, config)
  doc.set('updatedBy', actor(req))
  await doc.save()
  return toDraftForm(doc.toObject(), config.PII_ENC_KEY)
}

/** Validates every step, assigns a CIF and sends the customer for supervisor approval. */
export async function submit(req: Request, ref: string, body: z.infer<typeof submitSchema>, config: Config) {
  const doc = await findScoped(ref, req, true)
  if (doc.status !== 'draft') throw conflict('This customer has already been submitted.')
  checkVersion(doc, body.version)

  const form = toDraftForm(doc.toObject(), config.PII_ENC_KEY)
  const errors: FieldError[] = []
  for (const [step, schema, data] of [
    ['personal', personalSchema, form.personal],
    ['contact', contactSchema, form.contact],
    ['kyc', kycSchema, form.kyc],
  ] as const) {
    const result = (schema as z.ZodType).safeParse(data)
    if (!result.success) {
      for (const i of result.error.issues) {
        errors.push({
          path: [step, ...i.path].join('.'),
          code: i.message,
          message: validationMessage(i.message),
        })
      }
    }
  }
  if (form.documents.length === 0) {
    errors.push({ path: 'documents', code: 'required', message: 'Upload at least one identity document.' })
  }
  if (errors.length) throw validationFailed(errors, 'Complete every step before submitting.')

  const cif = formatCif(await nextSeq('cif'))
  doc.set({ cif, status: 'pending_approval', 'kyc.status': 'pending', updatedBy: actor(req) })
  updateRisk(doc)
  await doc.save()
  await ApprovalModel.create({
    type: 'customer.activate',
    entityType: 'customer',
    entityId: cif,
    branchCode: doc.branchCode,
    status: 'pending',
    requestedBy: actor(req),
  })
  await audit(
    {
      category: 'data',
      action: 'customer.submitted',
      actor: actor(req),
      entityType: 'customer',
      entityId: cif,
      changes: [{ field: 'status', from: 'draft', to: 'pending_approval' }],
    },
    req,
  )
  return { cif, status: doc.status }
}

// ── Search, typeahead, export ────────────────────────────────────────────────

function searchFilter(req: Request, q: CustomerSearchQuery, config: Config): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...branchScope(req) }
  if (q.branch && req.auth!.user.roleKey === 'admin') filter.branchCode = q.branch
  if (q.cif) filter.cif = op({ $regex: `^${escapeRegex(q.cif)}` })
  if (q.draftNo) filter.draftNo = q.draftNo
  if (q.name) filter.nameSearch = op({ $regex: `(^| )${escapeRegex(q.name.toLowerCase())}` })
  if (q.mobile) filter['contact.mobile'] = op({ $regex: `^\\+91${escapeRegex(q.mobile)}` })
  if (q.idNumber) filter['kyc.idNumberIndex'] = blindIndex(q.idNumber, config.PII_ENC_KEY)
  if (q.status) filter.status = q.status
  if (q.kyc) filter['kyc.status'] = q.kyc
  if (q.from || q.to) {
    filter.createdAt = op({
      ...(q.from ? { $gte: startOfDay(q.from) } : {}),
      ...(q.to ? { $lte: endOfDay(q.to) } : {}),
    })
  }
  return filter
}

const LIST_FIELDS =
  'cif draftNo personal.firstName personal.lastName contact.mobile status kyc.status kyc.expiryDate branchCode createdAt'
const SORT_FIELDS = ['cif', 'nameSearch', 'createdAt', 'status']

/** Customer search: server-side filters, sorting and page-number pagination. */
export async function search(
  req: Request,
  q: CustomerSearchQuery,
  config: Config,
): Promise<OffsetPage<CustomerListItem>> {
  const filter = searchFilter(req, q, config)
  const pageSize = clampPageSize(q.pageSize, await maxPageSizeFor('customers.search'))
  const sort = parseSort(q.sort, SORT_FIELDS, { createdAt: -1, _id: -1 })
  const [rows, total] = await Promise.all([
    CustomerModel.find(filter)
      .select(LIST_FIELDS)
      .sort(sort)
      .skip((q.page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    CustomerModel.countDocuments(filter),
  ])
  const showPII = can(req.auth!.permissions, 'customers.search', 'viewPII')
  return { items: rows.map((r) => toListItem(r, showPII)), page: q.page, pageSize, total }
}

/** CSV of the current search (first 5,000 rows), PII masked unless the caller may see it. */
export async function exportCsv(req: Request, q: CustomerSearchQuery, config: Config): Promise<string> {
  const filter = searchFilter(req, q, config)
  const sort = parseSort(q.sort, SORT_FIELDS, { createdAt: -1, _id: -1 })
  const rows = await CustomerModel.find(filter).select(LIST_FIELDS).sort(sort).limit(EXPORT_LIMIT).lean()
  const showPII = can(req.auth!.permissions, 'customers.search', 'viewPII')
  await audit(
    {
      category: 'data',
      action: 'customer.exported',
      actor: actor(req),
      entityType: 'customer',
      entityId: `${rows.length} rows`,
    },
    req,
  )
  return toCsv(
    ['CIF', 'Draft', 'Name', 'Mobile', 'Status', 'KYC', 'Branch', 'Onboarded'],
    rows.map((r) => {
      const item = toListItem(r, showPII)
      return [
        item.cif,
        item.draftNo,
        item.name,
        item.mobile,
        item.status,
        item.kycStatus,
        item.branchCode,
        item.createdAt.slice(0, 10),
      ]
    }),
  )
}

/** Up to 10 active or blocked customers matching a name, CIF or mobile fragment. */
export async function typeahead(req: Request, text: string): Promise<CustomerTypeaheadItem[]> {
  const t = escapeRegex(text.toLowerCase())
  const digits = text.replace(/\D/g, '')
  const or: Record<string, unknown>[] = [
    { nameSearch: op({ $regex: `(^| )${t}` }) },
    { cif: op({ $regex: `^${escapeRegex(text.toUpperCase())}` }) },
  ]
  if (digits.length >= 3) or.push({ 'contact.mobile': op({ $regex: `^\\+91${digits}` }) })
  const rows = await CustomerModel.find({
    ...branchScope(req),
    status: op({ $in: ['active', 'blocked'] }),
    $or: or,
  })
    .select('cif personal.firstName personal.lastName contact.mobile branchCode')
    .sort({ nameSearch: 1 })
    .limit(10)
    .lean()
  const showPII = can(req.auth!.permissions, 'customers.search', 'viewPII')
  return rows.map((r) => ({
    cif: r.cif as string,
    name: fullName(r),
    mobile: r.contact?.mobile
      ? showPII
        ? formatMobile(r.contact.mobile)
        : maskMobile(r.contact.mobile)
      : '',
    branchCode: r.branchCode as CustomerTypeaheadItem['branchCode'],
  }))
}

// ── Customer 360 ─────────────────────────────────────────────────────────────

/** The 360 view, with PII masked unless the caller has viewPII on Customer 360. */
export async function detail(req: Request, ref: string): Promise<CustomerDetail> {
  const doc = await findScoped(ref, req)
  const pending = await ApprovalModel.findOne({
    entityType: 'customer',
    entityId: refOf(doc),
    status: 'pending',
  }).lean()
  const showPII = can(req.auth!.permissions, 'customers.360', 'viewPII')
  return toDetail(
    doc.toObject(),
    showPII,
    pending
      ? {
          id: String(pending._id),
          type: pending.type,
          requestedBy: pending.requestedBy,
          createdAt: pending.createdAt.toISOString(),
        }
      : null,
  )
}

/** Edits contact details and/or personal details after activation (KYC needs re-KYC instead). */
export async function updateActive(req: Request, ref: string, body: z.infer<typeof updateActiveSchema>) {
  const doc = await findScoped(ref, req)
  if (!['active', 'blocked', 'pending_approval'].includes(doc.status)) {
    throw conflict('Use the onboarding wizard to change a draft.')
  }
  checkVersion(doc, body.version)
  const before = flatten(doc.toObject())
  if (body.personal) applyPersonal(doc, body.personal)
  if (body.contact) applyContact(doc, body.contact)
  doc.set('updatedBy', actor(req))
  await doc.save()
  const changes = diff(before, flatten(doc.toObject())).filter(
    (c) => !['updatedAt', 'updatedBy', '__v'].includes(c.field),
  )
  if (changes.length) {
    await audit(
      {
        category: 'data',
        action: 'customer.updated',
        actor: actor(req),
        entityType: 'customer',
        entityId: refOf(doc),
        changes,
      },
      req,
    )
  }
  return detail(req, ref)
}

/** Flattens the editable parts of a customer to "personal.firstName"-style keys for auditing. */
function flatten(c: CustomerRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const walk = (prefix: string, value: unknown) => {
    if (value && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) walk(prefix ? `${prefix}.${k}` : k, v)
    } else out[prefix] = value instanceof Date ? value.toISOString().slice(0, 10) : value
  }
  walk('personal', c.personal)
  walk('contact', c.contact)
  walk('addresses', c.addresses)
  return out
}

/** Decrypts the ID number for someone with viewPII. Always audited. */
export async function revealIdNumber(req: Request, ref: string, config: Config) {
  const doc = await findScoped(ref, req, true)
  const enc = doc.get('kyc.idNumberEnc') as string | undefined
  if (!enc) throw notFound('No ID number on record.')
  await audit(
    {
      category: 'security',
      action: 'customer.pii.viewed',
      actor: actor(req),
      entityType: 'customer',
      entityId: refOf(doc),
    },
    req,
  )
  return { idNumber: decryptField(enc, config.PII_ENC_KEY) }
}

/** Newest-first audit history for one customer. */
export async function auditFeed(req: Request, ref: string, cursor: string | undefined, limit: number) {
  const doc = await findScoped(ref, req)
  const ids = [doc.cif, doc.draftNo].filter(Boolean)
  const rows = await AuditLogModel.find({
    entityType: 'customer',
    entityId: op({ $in: ids }),
    ...cursorFilter(cursor),
  })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean()
  const page = toCursorPage(rows, limit)
  return {
    nextCursor: page.nextCursor,
    items: page.items.map((a) => ({
      id: String(a._id),
      category: a.category,
      action: a.action,
      outcome: a.outcome,
      actor: a.actor,
      entityType: a.entityType ?? undefined,
      entityId: a.entityId ?? undefined,
      changes: a.changes ?? undefined,
      createdAt: a.createdAt.toISOString(),
    })),
  }
}

/** Newest-first service requests for one customer. */
export async function serviceRequestsFor(
  req: Request,
  ref: string,
  cursor: string | undefined,
  limit: number,
) {
  const doc = await findScoped(ref, req)
  if (!doc.cif) return { items: [], nextCursor: null }
  const rows = await ServiceRequestModel.find({ customerCif: doc.cif, ...cursorFilter(cursor) })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean()
  const page = toCursorPage(rows, limit)
  return {
    nextCursor: page.nextCursor,
    items: page.items.map((r) => ({
      srNo: r.srNo,
      subject: r.subject,
      customerCif: r.customerCif,
      customerName: r.customerName,
      priority: r.priority,
      status: r.status,
      slaDueAt: r.slaDueAt.toISOString(),
      assignedTo: r.assignedTo ?? null,
      createdAt: r.createdAt.toISOString(),
      version: r.__v ?? 0,
    })),
  }
}

// ── Block / unblock (maker-checker) ──────────────────────────────────────────

/** Asks a supervisor to block (or unblock) a customer. Takes effect only when approved. */
export async function requestStatusChange(
  req: Request,
  ref: string,
  kind: 'block' | 'unblock',
  body: z.infer<typeof blockRequestSchema>,
) {
  const doc = await findScoped(ref, req)
  if (kind === 'block' && doc.status !== 'active') throw conflict('Only active customers can be blocked.')
  if (kind === 'unblock' && doc.status !== 'blocked')
    throw conflict('Only blocked customers can be unblocked.')
  const pending = await ApprovalModel.exists({ entityType: 'customer', entityId: doc.cif, status: 'pending' })
  if (pending) throw conflict('There is already a request waiting for approval on this customer.')
  const reasonOk = await LookupModel.exists({ type: 'blockReasons', code: body.reason, active: true })
  if (!reasonOk)
    throw validationFailed([{ path: 'reason', code: 'required', message: 'Choose a reason from the list.' }])
  const approval = await ApprovalModel.create({
    type: kind === 'block' ? 'customer.block' : 'customer.unblock',
    entityType: 'customer',
    entityId: doc.cif!,
    branchCode: doc.branchCode,
    reason: body.reason,
    remarks: body.remarks,
    status: 'pending',
    requestedBy: actor(req),
  })
  await audit(
    {
      category: 'data',
      action: `customer.${kind}.requested`,
      actor: actor(req),
      entityType: 'customer',
      entityId: doc.cif!,
    },
    req,
  )
  return { approvalId: String(approval._id) }
}

// ── Documents ────────────────────────────────────────────────────────────────

/** Uploads a KYC document to a draft or customer. */
export async function addDocument(
  req: Request,
  ref: string,
  kind: string,
  file: Express.Multer.File | undefined,
  config: Config,
) {
  const doc = await findScoped(ref, req)
  if (doc.status === 'closed') throw conflict("Closed customers can't take new documents.")
  if ((doc.documents?.length ?? 0) >= MAX_DOCUMENTS)
    throw conflict(`A customer can have at most ${MAX_DOCUMENTS} documents.`)
  const stored = await storeUpload(uploadDir(config), file)
  doc.documents.push({ kind, ...stored, uploadedBy: actor(req), uploadedAt: new Date() })
  await doc.save()
  const added = doc.documents.at(-1)!
  await audit(
    {
      category: 'data',
      action: 'customer.document.added',
      actor: actor(req),
      entityType: 'customer',
      entityId: refOf(doc),
      changes: [{ field: 'documents', from: null, to: stored.fileName }],
    },
    req,
  )
  return toDocumentDTO(added.toObject())
}

/** Streams a document (images inline if asked, PDFs as downloads). */
export async function sendDocument(
  req: Request,
  res: import('express').Response,
  ref: string,
  docId: string,
  inline: boolean,
  config: Config,
) {
  const doc = await findScoped(ref, req)
  const file = doc.documents.find((d) => String(d._id) === docId)
  if (!file) throw notFound('Document not found.')
  await sendUpload(res, uploadDir(config), file, inline)
}

/** Removes a document from a draft (submitted records keep theirs for the audit trail). */
export async function removeDocument(req: Request, ref: string, docId: string, config: Config) {
  const doc = await findScoped(ref, req)
  if (doc.status !== 'draft') throw conflict('Documents can only be removed from drafts.')
  const file = doc.documents.find((d) => String(d._id) === docId)
  if (!file) throw notFound('Document not found.')
  doc.documents.pull({ _id: file._id })
  await doc.save()
  await deleteUpload(uploadDir(config), file.storageKey)
  await audit(
    {
      category: 'data',
      action: 'customer.document.removed',
      actor: actor(req),
      entityType: 'customer',
      entityId: refOf(doc),
      changes: [{ field: 'documents', from: file.fileName, to: null }],
    },
    req,
  )
}

/** Name of a customer by CIF, for approvals and requests. */
export async function namesByCif(cifs: string[]): Promise<Map<string, string>> {
  const rows = await CustomerModel.find({ cif: op({ $in: cifs }) })
    .select('cif personal.firstName personal.lastName')
    .lean()
  return new Map(rows.map((r) => [r.cif as string, fullName(r)]))
}
