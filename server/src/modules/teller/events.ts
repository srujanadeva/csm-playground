// Branch cash events for the live feed (FR-TEL-025): stored (so a new viewer gets the last 50) and
// pushed in-process to open server-sent-event streams. One API process, so an EventEmitter is enough.
import { EventEmitter } from 'node:events'
import { Schema, model } from 'mongoose'
import { TELLER_EVENT_TYPES, type TellerEventDTO, type TellerEventType, type TxnType } from '@csm/shared'
import { nextSeq } from '../system/counter.model.ts'

const tellerEventSchema = new Schema(
  {
    seq: { type: Number, required: true, unique: true },
    branchCode: { type: String, required: true },
    type: { type: String, enum: TELLER_EVENT_TYPES, required: true },
    tellerId: { type: String, required: true },
    txnNo: String,
    txnType: String,
    amount: Number,
    accountLast4: String,
    // Kept a week; the feed only ever shows the newest 50.
    at: { type: Date, default: Date.now, expires: 7 * 86_400 },
  },
  { versionKey: false },
)
tellerEventSchema.index({ branchCode: 1, seq: -1 })

export const TellerEventModel = model('TellerEvent', tellerEventSchema, 'tellerevents')

const bus = new EventEmitter()
bus.setMaxListeners(0)

const toDTO = (e: Record<string, unknown>): TellerEventDTO => ({
  seq: e.seq as number,
  type: e.type as TellerEventType,
  at: new Date(e.at as Date).toISOString(),
  tellerId: e.tellerId as string,
  txnNo: (e.txnNo as string) ?? null,
  txnType: (e.txnType as TxnType) ?? null,
  amount: (e.amount as number) ?? null,
  accountLast4: (e.accountLast4 as string) ?? null,
})

/**
 * Records and broadcasts a branch event. Never throws: the feed must not fail a posting.
 * @param e What happened; accountNo is reduced to its last 4 digits before storing.
 */
export async function publish(e: {
  branchCode: string
  type: TellerEventType
  tellerId: string
  txnNo?: string
  txnType?: TxnType
  amount?: number
  accountNo?: string
}): Promise<void> {
  try {
    const doc = await TellerEventModel.create({
      seq: await nextSeq('teller-events'),
      branchCode: e.branchCode,
      type: e.type,
      tellerId: e.tellerId,
      txnNo: e.txnNo,
      txnType: e.txnType,
      amount: e.amount,
      accountLast4: e.accountNo?.slice(-4),
    })
    bus.emit(e.branchCode, toDTO(doc.toObject()))
  } catch {
    // Best effort, like the outbox.
  }
}

/** The newest events for a branch, newest first. */
export async function recent(branchCode: string, limit = 50): Promise<TellerEventDTO[]> {
  const rows = await TellerEventModel.find({ branchCode }).sort({ seq: -1 }).limit(limit).lean()
  return rows.map(toDTO)
}

/** Calls `fn` for each new event in a branch until the returned function is called. */
export function subscribe(branchCode: string, fn: (e: TellerEventDTO) => void): () => void {
  bus.on(branchCode, fn)
  return () => bus.off(branchCode, fn)
}
