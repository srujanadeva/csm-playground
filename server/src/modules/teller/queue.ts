/**
 * The branch token queue (FR-TEL-020): walk-in customers get T-001, T-002 … (restarting each business
 * day); tellers call the next waiting token, recall it, skip it (it goes to the back once, then is a
 * no-show) or mark it served. Each teller's daily counts are kept for the counter screen.
 */
import type { Request } from 'express'
import { Schema, model } from 'mongoose'
import { businessDate, formatToken, type LobbyDTO, type QueueStateDTO, type TokenDTO } from '@csm/shared'
import { conflict } from '../../lib/errors.ts'
import { op } from '../../lib/query.ts'
import { StaffUserModel } from '../auth/staffUser.model.ts'
import { nextSeq } from '../system/counter.model.ts'

const tokenSchema = new Schema(
  {
    branchCode: { type: String, required: true },
    businessDate: { type: String, required: true },
    number: { type: Number, required: true },
    status: { type: String, enum: ['waiting', 'called', 'served', 'no_show'], default: 'waiting' },
    /** Queue order: issue time, moved to "now" when skipped once. */
    queuedAt: { type: Date, default: Date.now },
    skips: { type: Number, default: 0 },
    recalls: { type: Number, default: 0 },
    counter: String,
    calledAt: Date,
    servedAt: Date,
    issuedBy: String,
  },
  { versionKey: false },
)
tokenSchema.index({ branchCode: 1, businessDate: 1, number: 1 }, { unique: true })
tokenSchema.index({ branchCode: 1, businessDate: 1, status: 1, queuedAt: 1 })
const TokenModel = model('QueueToken', tokenSchema, 'queuetokens')

const statsSchema = new Schema(
  {
    tellerId: { type: String, required: true },
    businessDate: { type: String, required: true },
    called: { type: Number, default: 0 },
    recalled: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    served: { type: Number, default: 0 },
  },
  { versionKey: false },
)
statsSchema.index({ tellerId: 1, businessDate: 1 }, { unique: true })
const StatsModel = model('QueueStats', statsSchema, 'queuestats')

type Stat = 'called' | 'recalled' | 'skipped' | 'served'
const actor = (req: Request) => req.auth!.user.staffId
const branch = (req: Request) => req.auth!.user.branchCode
const today = () => businessDate()

const toToken = (t: Record<string, unknown>): TokenDTO => ({
  label: formatToken(t.number as number),
  status: t.status as TokenDTO['status'],
  counter: (t.counter as string) ?? null,
  calledAt: t.calledAt ? new Date(t.calledAt as Date).toISOString() : null,
})

const waitingFilter = (branchCode: string) => ({
  branchCode,
  businessDate: today(),
  status: 'waiting' as const,
})

async function bump(tellerId: string, stat: Stat) {
  await StatsModel.updateOne({ tellerId, businessDate: today() }, { $inc: { [stat]: 1 } }, { upsert: true })
}

/** This teller's token being served now, if any. */
const currentFor = (req: Request) =>
  TokenModel.findOne({
    branchCode: branch(req),
    businessDate: today(),
    status: 'called',
    counter: actor(req),
  })

/** Issues the next token number for the caller's branch. */
export async function issue(req: Request): Promise<TokenDTO> {
  const number = await nextSeq(`token-${branch(req)}-${today()}`)
  const doc = await TokenModel.create({
    branchCode: branch(req),
    businessDate: today(),
    number,
    issuedBy: actor(req),
  })
  return toToken(doc.toObject())
}

/** The caller's queue view: current token, what's waiting, and today's counts. */
export async function state(req: Request): Promise<QueueStateDTO> {
  const [current, waiting, next, stats] = await Promise.all([
    currentFor(req).lean(),
    TokenModel.countDocuments(waitingFilter(branch(req))),
    TokenModel.find(waitingFilter(branch(req)))
      .sort({ queuedAt: 1 })
      .limit(3)
      .lean(),
    StatsModel.findOne({ tellerId: actor(req), businessDate: today() }).lean(),
  ])
  return {
    businessDate: today(),
    current: current ? toToken(current) : null,
    waiting,
    next: next.map((t) => formatToken(t.number)),
    stats: {
      called: stats?.called ?? 0,
      recalled: stats?.recalled ?? 0,
      skipped: stats?.skipped ?? 0,
      served: stats?.served ?? 0,
    },
  }
}

/** Calls the longest-waiting token to the caller's counter. */
export async function callNext(req: Request): Promise<QueueStateDTO> {
  if (await currentFor(req))
    throw conflict('Finish the current token first: mark it served or skip it.', {
      code: 'token_in_progress',
    })
  // Claim atomically, so two tellers pressing at once never get the same token.
  const claimed = await TokenModel.findOneAndUpdate(
    waitingFilter(branch(req)),
    { $set: { status: 'called', counter: actor(req), calledAt: new Date() } },
    { sort: { queuedAt: 1 }, returnDocument: 'after' },
  )
  if (!claimed) throw conflict('Nobody is waiting.', { code: 'queue_empty' })
  await bump(actor(req), 'called')
  return state(req)
}

/** Announces the current token again. */
export async function recall(req: Request): Promise<QueueStateDTO> {
  const cur = await currentFor(req)
  if (!cur) throw conflict('There is no token at your counter.', { code: 'no_token' })
  cur.set({ recalls: cur.recalls + 1, calledAt: new Date() })
  await cur.save()
  await bump(actor(req), 'recalled')
  return state(req)
}

/** Skips the current token: back of the queue the first time, a no-show the second. */
export async function skip(req: Request): Promise<QueueStateDTO> {
  const cur = await currentFor(req)
  if (!cur) throw conflict('There is no token at your counter.', { code: 'no_token' })
  if (cur.skips === 0)
    cur.set({ status: 'waiting', skips: 1, queuedAt: new Date(), counter: undefined, calledAt: undefined })
  else cur.set({ status: 'no_show' })
  await cur.save()
  await bump(actor(req), 'skipped')
  return state(req)
}

/** Marks the current token served. */
export async function serve(req: Request): Promise<QueueStateDTO> {
  const cur = await currentFor(req)
  if (!cur) throw conflict('There is no token at your counter.', { code: 'no_token' })
  cur.set({ status: 'served', servedAt: new Date() })
  await cur.save()
  await bump(actor(req), 'served')
  return state(req)
}

/** The lobby display for the caller's branch. */
export async function lobby(req: Request): Promise<LobbyDTO> {
  const base = { branchCode: branch(req), businessDate: today() }
  const [serving, next, waiting] = await Promise.all([
    TokenModel.find({ ...base, status: 'called' })
      .sort({ calledAt: -1 })
      .lean(),
    TokenModel.find({ ...base, status: 'waiting' })
      .sort({ queuedAt: 1 })
      .limit(3)
      .lean(),
    TokenModel.countDocuments({ ...base, status: 'waiting' }),
  ])
  const names = new Map(
    (
      await StaffUserModel.find({ staffId: op({ $in: serving.map((s) => s.counter) }) })
        .select('staffId name')
        .lean()
    ).map((u) => [u.staffId, u.name]),
  )
  return {
    businessDate: today(),
    counters: serving.map((s) => ({
      tellerId: s.counter!,
      tellerName: names.get(s.counter!) ?? s.counter!,
      token: formatToken(s.number),
      calledAt: s.calledAt!.toISOString(),
      recalls: s.recalls,
    })),
    next: next.map((t) => formatToken(t.number)),
    waiting,
  }
}
