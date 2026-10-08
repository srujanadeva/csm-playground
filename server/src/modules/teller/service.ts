/**
 * Teller rules: account lookup, cash deposits and withdrawals, maker-checker authorisation
 * of large withdrawals, and the teller's cash drawer (open → closed → signed off).
 *
 * MongoDB runs standalone here, so there are no multi-document transactions. Money moves
 * with conditional atomic updates instead: the account update only matches while the balance
 * covers a withdrawal, the drawer update only matches while the drawer is open and holds
 * enough cash (or stays under its limit). If the second update fails, the first is reversed,
 * so the balance and the drawer can't drift apart or go negative under concurrent requests.
 */
import type { Request } from 'express'
import type { z } from 'zod'
import {
  ACCOUNT_NO,
  TELLER_CASH_LIMIT,
  TXN_NO,
  businessDate,
  can,
  denominationTotal,
  drawerVariance,
  expectedCash,
  maskMobile,
  needsAuthorisation,
  needsPan,
  type AccountDTO,
  type AccountSearchItem,
  type Denominations,
  type DrawerDTO,
  type OffsetPage,
  type PostTransactionInput,
  type TransactionDTO,
  type TxnType,
  type closeDrawerSchema,
  type drawerListQuery,
  type openDrawerSchema,
  type signOffSchema,
  type transactionDecisionSchema,
  type transactionListQuery,
} from '@csm/shared'
import { audit } from '../../lib/audit.ts'
import { conflict, forbidden, notFound, staleVersion, validationFailed } from '../../lib/errors.ts'
import { clampPageSize } from '../../lib/pagination.ts'
import { op } from '../../lib/query.ts'
import { escapeRegex } from '../../lib/regex.ts'
import { branchScope } from '../../middleware/auth.ts'
import { maxPageSizeFor } from '../admin/access.ts'
import { StaffUserModel } from '../auth/staffUser.model.ts'
import { CustomerModel } from '../customers/customer.model.ts'
import { formatMobile } from '../customers/dto.ts'
import { formatTxnNo, nextSeq } from '../system/counter.model.ts'
import { AccountModel } from './account.model.ts'
import { DrawerModel } from './drawer.model.ts'
import { TransactionModel } from './transaction.model.ts'

/* eslint-disable @typescript-eslint/no-explicit-any -- lean documents from Mongoose. */
type Rec = Record<string, any>

const actor = (req: Request) => req.auth!.user.staffId
const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null)

function denoms(d: Rec | undefined): Denominations {
  return {
    n500: d?.n500 ?? 0,
    n200: d?.n200 ?? 0,
    n100: d?.n100 ?? 0,
    n50: d?.n50 ?? 0,
    n20: d?.n20 ?? 0,
    n10: d?.n10 ?? 0,
    coins: d?.coins ?? 0,
  }
}

function toTxnDTO(r: Rec): TransactionDTO {
  return {
    txnNo: r.txnNo,
    accountNo: r.accountNo,
    cif: r.cif,
    customerName: r.customerName,
    type: r.type,
    amount: r.amount,
    denominations: denoms(r.denominations),
    narration: r.narration ?? null,
    panLast4: r.panLast4 ?? null,
    status: r.status,
    tellerId: r.tellerId,
    branchCode: r.branchCode,
    balanceAfter: r.balanceAfter ?? null,
    decidedBy: r.decidedBy ?? null,
    decidedAt: iso(r.decidedAt),
    decisionNote: r.decisionNote ?? null,
    createdAt: new Date(r.createdAt).toISOString(),
  }
}

function toDrawerDTO(r: Rec, tellerName: string, counts: { posted: number; pending: number }): DrawerDTO {
  return {
    id: String(r._id),
    tellerId: r.tellerId,
    tellerName,
    branchCode: r.branchCode,
    businessDate: r.businessDate,
    status: r.status,
    opening: denoms(r.opening),
    openingAmount: r.openingAmount,
    cashIn: r.cashIn ?? 0,
    cashOut: r.cashOut ?? 0,
    expected: expectedCash({
      openingAmount: r.openingAmount,
      cashIn: r.cashIn ?? 0,
      cashOut: r.cashOut ?? 0,
    }),
    counted: r.counted ? denoms(r.counted) : null,
    countedAmount: r.countedAmount ?? null,
    variance: r.variance ?? null,
    varianceReason: r.varianceReason ?? null,
    postedCount: counts.posted,
    pendingCount: counts.pending,
    openedAt: new Date(r.openedAt).toISOString(),
    closedAt: iso(r.closedAt),
    signedOffBy: r.signedOffBy ?? null,
    signedOffAt: iso(r.signedOffAt),
    signOffNote: r.signOffNote ?? null,
    version: r.__v ?? 0,
  }
}

async function staffNames(ids: string[]): Promise<Map<string, string>> {
  const rows = await StaffUserModel.find({ staffId: op({ $in: [...new Set(ids)] }) })
    .select('staffId name')
    .lean()
  return new Map(rows.map((r) => [r.staffId, r.name]))
}

/** Posted and pending transaction counts per drawer. */
async function drawerCounts(ids: unknown[]): Promise<Map<string, { posted: number; pending: number }>> {
  const rows = await TransactionModel.aggregate<{ _id: { d: unknown; s: string }; n: number }>([
    { $match: { drawerId: { $in: ids } } },
    { $group: { _id: { d: '$drawerId', s: '$status' }, n: { $sum: 1 } } },
  ])
  const out = new Map<string, { posted: number; pending: number }>()
  for (const r of rows) {
    const key = String(r._id.d)
    const c = out.get(key) ?? { posted: 0, pending: 0 }
    if (r._id.s === 'posted') c.posted = r.n
    if (r._id.s === 'pending_authorisation') c.pending = r.n
    out.set(key, c)
  }
  return out
}

async function drawerDTO(r: Rec): Promise<DrawerDTO> {
  const [names, counts] = await Promise.all([staffNames([r.tellerId]), drawerCounts([r._id])])
  return toDrawerDTO(
    r,
    names.get(r.tellerId) ?? r.tellerId,
    counts.get(String(r._id)) ?? { posted: 0, pending: 0 },
  )
}

// ── Accounts ─────────────────────────────────────────────────────────────────

/** Accounts in the caller's branch by account-number prefix or CIF. */
export async function searchAccounts(req: Request, q: string): Promise<AccountSearchItem[]> {
  const filter = q.startsWith('CIF-')
    ? { cif: op({ $regex: `^${escapeRegex(q)}` }) }
    : { accountNo: op({ $regex: `^${escapeRegex(q)}` }) }
  const rows = await AccountModel.find({ ...filter, ...branchScope(req) })
    .sort({ accountNo: 1 })
    .limit(10)
    .lean()
  return rows.map((r) => ({
    accountNo: r.accountNo,
    type: r.type,
    status: r.status,
    cif: r.cif,
    customerName: r.customerName,
    branchCode: r.branchCode,
  }))
}

async function findAccount(req: Request, accountNo: string) {
  if (!ACCOUNT_NO.test(accountNo)) throw notFound('Account not found.')
  const account = await AccountModel.findOne({ accountNo, ...branchScope(req) }).lean()
  if (!account) throw notFound('Account not found.')
  return account
}

async function customerFor(cif: string) {
  const customer = await CustomerModel.findOne({ cif })
    .select('status kyc.status kyc.idType contact.mobile')
    .lean()
  if (!customer) throw notFound('Customer not found.')
  return customer
}

/** Account holder card: balance, status and KYC, with the mobile masked unless viewPII. */
export async function getAccount(req: Request, accountNo: string): Promise<AccountDTO> {
  const account = await findAccount(req, accountNo)
  const customer = await customerFor(account.cif)
  const showPII = can(req.auth!.permissions, 'teller.counter', 'viewPII')
  const mobile = customer.contact?.mobile
  return {
    accountNo: account.accountNo,
    type: account.type,
    status: account.status,
    cif: account.cif,
    customerName: account.customerName,
    branchCode: account.branchCode,
    balance: account.balance,
    customerStatus: customer.status,
    kycStatus: customer.kyc?.status ?? 'pending',
    mobile: mobile ? (showPII ? formatMobile(mobile) : maskMobile(mobile)) : '',
    panOnFile: customer.kyc?.idType === 'pan',
    openedAt: new Date(account.openedAt).toISOString(),
    piiMasked: !showPII,
  }
}

// ── Moving money ─────────────────────────────────────────────────────────────

/** Cash on hand in the drawer, as a MongoDB expression. */
const CASH_EXPR = { $subtract: [{ $add: ['$openingAmount', '$cashIn'] }, '$cashOut'] }

/**
 * Applies a cash movement to the account and the drawer, or neither. Returns the balance
 * after the movement. Throws a 409 with a machine-readable code when a guard fails.
 */
async function moveCash(
  accountNo: string,
  drawerId: unknown,
  type: TxnType,
  amount: number,
): Promise<number> {
  if (type === 'cash_withdrawal') {
    const account = await AccountModel.findOneAndUpdate(
      { accountNo, status: 'active', balance: op({ $gte: amount }) },
      { $inc: { balance: -amount } },
      { returnDocument: 'after' },
    ).lean()
    if (!account)
      throw conflict("The account balance doesn't cover this withdrawal.", { code: 'insufficient_funds' })
    const drawer = await DrawerModel.findOneAndUpdate(
      { _id: drawerId, status: 'open', $expr: op({ $gte: [CASH_EXPR, amount] }) },
      { $inc: { cashOut: amount } },
    ).lean()
    if (!drawer) {
      await AccountModel.updateOne({ accountNo }, { $inc: { balance: amount } })
      throw conflict("The drawer doesn't hold enough cash for this withdrawal.", {
        code: 'insufficient_cash',
      })
    }
    return account.balance
  }

  const drawer = await DrawerModel.findOneAndUpdate(
    { _id: drawerId, status: 'open', $expr: op({ $lte: [CASH_EXPR, TELLER_CASH_LIMIT - amount] }) },
    { $inc: { cashIn: amount } },
  ).lean()
  if (!drawer) {
    throw conflict('This deposit would take the drawer over its ₹5,00,000 cash limit.', {
      code: 'drawer_limit',
    })
  }
  const account = await AccountModel.findOneAndUpdate(
    { accountNo, status: 'active' },
    { $inc: { balance: amount } },
    { returnDocument: 'after' },
  ).lean()
  if (!account) {
    await DrawerModel.updateOne({ _id: drawerId }, { $inc: { cashIn: -amount } })
    throw conflict('This account no longer accepts cash transactions.', { code: 'account_not_active' })
  }
  return account.balance
}

/** Reverses moveCash (used only when recording the transaction itself fails). */
async function undoCash(accountNo: string, drawerId: unknown, type: TxnType, amount: number) {
  const sign = type === 'cash_withdrawal' ? 1 : -1
  await AccountModel.updateOne({ accountNo }, { $inc: { balance: sign * amount } })
  await DrawerModel.updateOne(
    { _id: drawerId },
    { $inc: type === 'cash_withdrawal' ? { cashOut: -amount } : { cashIn: -amount } },
  )
}

/** The caller's open drawer, which must be today's. */
async function openDrawerFor(req: Request) {
  const drawer = await DrawerModel.findOne({ tellerId: actor(req), status: 'open' }).lean()
  if (!drawer)
    throw conflict('Open your cash drawer before posting transactions.', { code: 'drawer_not_open' })
  if (drawer.businessDate !== businessDate()) {
    throw conflict(`Your drawer from ${drawer.businessDate} is still open. Close it before posting.`, {
      code: 'drawer_stale',
    })
  }
  return drawer
}

/** Posts a cash deposit or withdrawal, or holds a large withdrawal for authorisation. */
export async function post(req: Request, input: PostTransactionInput): Promise<TransactionDTO> {
  const account = await findAccount(req, input.accountNo)
  if (account.status !== 'active') {
    throw conflict(`This account is ${account.status}, so it can't take cash transactions.`, {
      code: 'account_not_active',
    })
  }
  const customer = await customerFor(account.cif)
  if (customer.status !== 'active') {
    throw conflict(
      `The customer is ${customer.status.replace('_', ' ')}, so cash transactions aren't allowed.`,
      {
        code: 'customer_not_active',
      },
    )
  }
  if (needsPan(input.type, input.amount, customer.kyc?.idType === 'pan') && !input.panNumber) {
    throw validationFailed([
      {
        path: 'panNumber',
        code: 'panRequired',
        message: 'Cash deposits of ₹50,000 or more need the depositor’s PAN.',
      },
    ])
  }
  const drawer = await openDrawerFor(req)
  // Early checks give clear errors; moveCash re-checks atomically.
  if (input.type === 'cash_withdrawal' && input.amount > account.balance) {
    throw conflict("The account balance doesn't cover this withdrawal.", { code: 'insufficient_funds' })
  }

  const now = new Date()
  const year = Number(businessDate(now).slice(0, 4))
  const txnNo = formatTxnNo(year, await nextSeq(`txn-${year}`))
  const pending = needsAuthorisation(input.type, input.amount)
  const base = {
    txnNo,
    accountNo: account.accountNo,
    cif: account.cif,
    customerName: account.customerName,
    branchCode: account.branchCode,
    type: input.type,
    amount: input.amount,
    denominations: input.denominations,
    narration: input.narration,
    panLast4: input.panNumber?.slice(-4),
    tellerId: actor(req),
    drawerId: drawer._id,
    businessDate: drawer.businessDate,
  }

  if (pending) {
    const txn = await TransactionModel.create({ ...base, status: 'pending_authorisation' })
    await audit(
      {
        category: 'data',
        action: 'transaction.held',
        actor: actor(req),
        entityType: 'transaction',
        entityId: txnNo,
      },
      req,
    )
    return toTxnDTO(txn.toObject())
  }

  const balanceAfter = await moveCash(account.accountNo, drawer._id, input.type, input.amount)
  let txn
  try {
    txn = await TransactionModel.create({ ...base, status: 'posted', balanceAfter })
  } catch (err) {
    await undoCash(account.accountNo, drawer._id, input.type, input.amount)
    throw err
  }
  await audit(
    {
      category: 'data',
      action: 'transaction.posted',
      actor: actor(req),
      entityType: 'account',
      entityId: account.accountNo,
      changes: [
        {
          field: 'balance',
          from: balanceAfter + (input.type === 'cash_deposit' ? -1 : 1) * input.amount,
          to: balanceAfter,
        },
      ],
    },
    req,
  )
  return toTxnDTO(txn.toObject())
}

async function findTxn(req: Request, txnNo: string) {
  if (!TXN_NO.test(txnNo)) throw notFound('Transaction not found.')
  const txn = await TransactionModel.findOne({ txnNo, ...branchScope(req) }).lean()
  if (!txn) throw notFound('Transaction not found.')
  return txn
}

/** One transaction: the teller's own, or any in the branch for an approver. */
export async function getTransaction(req: Request, txnNo: string): Promise<TransactionDTO> {
  const txn = await findTxn(req, txnNo)
  if (txn.tellerId !== actor(req) && !can(req.auth!.permissions, 'teller.counter', 'approve')) {
    throw notFound('Transaction not found.')
  }
  return toTxnDTO(txn)
}

/** Approves (pays out) or rejects a held withdrawal. The checker can't be the teller. */
export async function decide(
  req: Request,
  txnNo: string,
  body: z.infer<typeof transactionDecisionSchema>,
): Promise<TransactionDTO> {
  const txn = await findTxn(req, txnNo)
  if (txn.status !== 'pending_authorisation') throw conflict('This transaction has already been decided.')
  if (txn.tellerId === actor(req)) {
    throw forbidden("You can't authorise your own transaction.", { code: 'own_request' })
  }
  const decided = { decidedBy: actor(req), decidedAt: new Date(), decisionNote: body.note }

  if (body.decision === 'reject') {
    const updated = await TransactionModel.findOneAndUpdate(
      { _id: txn._id, status: 'pending_authorisation' },
      { $set: { status: 'rejected', ...decided } },
      { returnDocument: 'after' },
    ).lean()
    if (!updated) throw conflict('This transaction has already been decided.')
    await audit(
      {
        category: 'data',
        action: 'transaction.rejected',
        actor: actor(req),
        entityType: 'transaction',
        entityId: txnNo,
      },
      req,
    )
    return toTxnDTO(updated)
  }

  // Claim the transaction first so two approvers can't both pay it out.
  const claimed = await TransactionModel.findOneAndUpdate(
    { _id: txn._id, status: 'pending_authorisation' },
    { $set: { status: 'posted', ...decided } },
  ).lean()
  if (!claimed) throw conflict('This transaction has already been decided.')
  let balanceAfter: number
  try {
    const drawer = await DrawerModel.findOne({ _id: txn.drawerId }).select('status').lean()
    if (drawer?.status !== 'open') {
      throw conflict(
        "The teller's drawer is closed, so this withdrawal can't be paid out. Reject it instead.",
        {
          code: 'drawer_not_open',
        },
      )
    }
    balanceAfter = await moveCash(txn.accountNo, txn.drawerId, txn.type, txn.amount)
  } catch (err) {
    await TransactionModel.updateOne(
      { _id: txn._id },
      { $set: { status: 'pending_authorisation' }, $unset: { decidedBy: 1, decidedAt: 1, decisionNote: 1 } },
    )
    throw err
  }
  const updated = await TransactionModel.findOneAndUpdate(
    { _id: txn._id },
    { $set: { balanceAfter } },
    { returnDocument: 'after' },
  ).lean()
  await audit(
    {
      category: 'data',
      action: 'transaction.authorised',
      actor: actor(req),
      entityType: 'transaction',
      entityId: txnNo,
      changes: [{ field: 'status', from: 'pending_authorisation', to: 'posted' }],
    },
    req,
  )
  return toTxnDTO(updated!)
}

/** The caller's transactions, or the whole branch's for an approver. Newest first. */
export async function listTransactions(
  req: Request,
  q: z.infer<typeof transactionListQuery>,
): Promise<OffsetPage<TransactionDTO>> {
  if (q.scope === 'branch' && !can(req.auth!.permissions, 'teller.counter', 'approve')) throw forbidden()
  const filter = {
    ...branchScope(req),
    ...(q.scope === 'mine' ? { tellerId: actor(req) } : {}),
    ...(q.status ? { status: q.status } : {}),
    // Pending withdrawals stay listed until decided, whatever day they were held.
    ...(q.status === 'pending_authorisation' ? {} : { businessDate: q.date ?? businessDate() }),
  }
  const pageSize = clampPageSize(q.pageSize, await maxPageSizeFor('teller.counter'))
  const [rows, total] = await Promise.all([
    TransactionModel.find(filter)
      .sort({ _id: -1 })
      .skip((q.page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    TransactionModel.countDocuments(filter),
  ])
  return { items: rows.map(toTxnDTO), page: q.page, pageSize, total }
}

// ── Cash drawer ──────────────────────────────────────────────────────────────

/** The caller's drawer: an open one (any day) first, else today's. */
export async function myDrawer(req: Request): Promise<{ businessDate: string; drawer: DrawerDTO | null }> {
  const today = businessDate()
  const drawer =
    (await DrawerModel.findOne({ tellerId: actor(req), status: 'open' }).lean()) ??
    (await DrawerModel.findOne({ tellerId: actor(req), businessDate: today }).lean())
  return { businessDate: today, drawer: drawer ? await drawerDTO(drawer) : null }
}

/** Opens today's drawer with a counted float. One drawer per teller per day. */
export async function openDrawer(req: Request, body: z.infer<typeof openDrawerSchema>): Promise<DrawerDTO> {
  const amount = denominationTotal(body.denominations)
  if (amount > TELLER_CASH_LIMIT) {
    throw validationFailed([
      {
        path: 'denominations',
        code: 'floatRange',
        message: "The opening float can't be more than ₹5,00,000.",
      },
    ])
  }
  const today = businessDate()
  const stale = await DrawerModel.exists({ tellerId: actor(req), status: 'open' })
  if (stale) throw conflict('You already have an open drawer. Close it first.', { code: 'drawer_open' })
  let drawer
  try {
    drawer = await DrawerModel.create({
      tellerId: actor(req),
      branchCode: req.auth!.user.branchCode,
      businessDate: today,
      status: 'open',
      opening: body.denominations,
      openingAmount: amount,
      openedAt: new Date(),
    })
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw conflict("You've already used a drawer today.", { code: 'drawer_exists' })
    }
    throw err
  }
  await audit(
    {
      category: 'data',
      action: 'drawer.opened',
      actor: actor(req),
      entityType: 'drawer',
      entityId: String(drawer._id),
    },
    req,
  )
  return drawerDTO(drawer.toObject())
}

/** Closes the caller's open drawer with a physical count. A difference needs a reason. */
export async function closeDrawer(req: Request, body: z.infer<typeof closeDrawerSchema>): Promise<DrawerDTO> {
  const drawer = await DrawerModel.findOne({ tellerId: actor(req), status: 'open' }).lean()
  if (!drawer) throw conflict("You don't have an open drawer.", { code: 'drawer_not_open' })
  if ((drawer.__v ?? 0) !== body.version) throw staleVersion()
  const pending = await TransactionModel.countDocuments({
    drawerId: drawer._id,
    status: 'pending_authorisation',
  })
  if (pending) {
    throw conflict(
      `${pending} withdrawal(s) are waiting for authorisation. Get them approved or rejected first.`,
      {
        code: 'pending_transactions',
      },
    )
  }
  const counted = denominationTotal(body.denominations)
  const variance = drawerVariance(expectedCash(drawer), counted)
  if (variance !== 0 && !body.varianceReason) {
    throw validationFailed([
      {
        path: 'varianceReason',
        code: 'varianceReasonRequired',
        message: "The count doesn't match the expected cash. Explain the difference.",
      },
    ])
  }
  // Matching cashIn/cashOut too means a transaction posted meanwhile makes this a stale close.
  const updated = await DrawerModel.findOneAndUpdate(
    { _id: drawer._id, status: 'open', __v: drawer.__v, cashIn: drawer.cashIn, cashOut: drawer.cashOut },
    {
      $set: {
        status: 'closed',
        counted: body.denominations,
        countedAmount: counted,
        variance,
        varianceReason: variance !== 0 ? body.varianceReason : undefined,
        closedAt: new Date(),
      },
      $inc: { __v: 1 },
    },
    { returnDocument: 'after' },
  ).lean()
  if (!updated) throw staleVersion()
  await audit(
    {
      category: 'data',
      action: 'drawer.closed',
      actor: actor(req),
      entityType: 'drawer',
      entityId: String(drawer._id),
      changes: [{ field: 'variance', from: 0, to: variance }],
    },
    req,
  )
  return drawerDTO(updated)
}

/** Drawers in the caller's branch, for supervisors: newest business day first. */
export async function listDrawers(
  req: Request,
  q: z.infer<typeof drawerListQuery>,
): Promise<OffsetPage<DrawerDTO>> {
  const filter = {
    ...branchScope(req),
    ...(q.status ? { status: q.status } : {}),
    ...(q.date ? { businessDate: q.date } : {}),
  }
  const pageSize = clampPageSize(q.pageSize, await maxPageSizeFor('teller.drawer'))
  const [rows, total] = await Promise.all([
    DrawerModel.find(filter)
      .sort({ businessDate: -1, _id: -1 })
      .skip((q.page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    DrawerModel.countDocuments(filter),
  ])
  const [names, counts] = await Promise.all([
    staffNames(rows.map((r) => r.tellerId)),
    drawerCounts(rows.map((r) => r._id)),
  ])
  return {
    items: rows.map((r) =>
      toDrawerDTO(
        r,
        names.get(r.tellerId) ?? r.tellerId,
        counts.get(String(r._id)) ?? { posted: 0, pending: 0 },
      ),
    ),
    page: q.page,
    pageSize,
    total,
  }
}

/** A supervisor signs off a closed drawer. A non-zero variance needs a note. */
export async function signOff(
  req: Request,
  id: string,
  body: z.infer<typeof signOffSchema>,
): Promise<DrawerDTO> {
  if (!/^[a-f0-9]{24}$/.test(id)) throw notFound('Drawer not found.')
  const drawer = await DrawerModel.findOne({ _id: id, ...branchScope(req) }).lean()
  if (!drawer) throw notFound('Drawer not found.')
  if (drawer.tellerId === actor(req)) {
    throw forbidden("You can't sign off your own drawer.", { code: 'own_request' })
  }
  if (drawer.status !== 'closed') {
    throw conflict(
      drawer.status === 'open'
        ? 'The teller has not closed this drawer yet.'
        : 'This drawer is already signed off.',
    )
  }
  if ((drawer.__v ?? 0) !== body.version) throw staleVersion()
  if (drawer.variance && (body.note?.length ?? 0) < 10) {
    throw validationFailed([
      {
        path: 'note',
        code: 'signOffNoteRequired',
        message: 'Enter at least 10 characters on how the difference was handled.',
      },
    ])
  }
  const updated = await DrawerModel.findOneAndUpdate(
    { _id: drawer._id, status: 'closed', __v: drawer.__v },
    {
      $set: {
        status: 'signed_off',
        signedOffBy: actor(req),
        signedOffAt: new Date(),
        signOffNote: body.note,
      },
      $inc: { __v: 1 },
    },
    { returnDocument: 'after' },
  ).lean()
  if (!updated) throw staleVersion()
  await audit(
    { category: 'data', action: 'drawer.signedOff', actor: actor(req), entityType: 'drawer', entityId: id },
    req,
  )
  return drawerDTO(updated)
}
