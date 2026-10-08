import { Schema, model } from 'mongoose'

// Atomic sequences for human-readable numbers (CIF-000124, SR-2026-000031).
const counterSchema = new Schema({ _id: { type: String, required: true }, seq: { type: Number, default: 0 } })

export const CounterModel = model('Counter', counterSchema, 'counters')

export async function nextSeq(key: string): Promise<number> {
  const doc = await CounterModel.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  )
  return doc.seq
}

/** Raises a counter to at least `value` (used by the seed so new numbers follow seeded ones). */
export async function ensureSeqAtLeast(key: string, value: number): Promise<void> {
  await CounterModel.updateOne({ _id: key }, { $max: { seq: value } }, { upsert: true })
}

export const formatCif = (n: number) => `CIF-${String(n).padStart(6, '0')}`
export const formatSrNo = (year: number, n: number) => `SR-${year}-${String(n).padStart(6, '0')}`
export const formatTxnNo = (year: number, n: number) => `TXN-${year}-${String(n).padStart(6, '0')}`
/** Branch + type code (10 savings, 20 current) + running number per branch and type. */
export const formatAccountNo = (branch: string, type: 'savings' | 'current', n: number) =>
  `${branch}${type === 'savings' ? '10' : '20'}${String(n).padStart(6, '0')}`
