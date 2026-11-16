// The simulated credit bureau (FR-CUS-025): every value is derived from a hash of the CIF, so the same
// customer always gets the same score, report and "as of" date, and about one in eleven has no record.
import { createHash } from 'node:crypto'
import { BUREAU_MAX, BUREAU_MIN } from '@csm/shared'

export interface Tradeline {
  lender: string
  kind: 'Credit card' | 'Home loan' | 'Personal loan' | 'Auto loan'
  opened: string
  limit: number
  balance: number
  /** Days past due, worst in the last 12 months. */
  worstDpd: number
}

export interface BureauRecord {
  score: number
  asOf: string
  tradelines: Tradeline[]
  enquiries: { date: string; lender: string; purpose: string }[]
}

const LENDERS = [
  'Kaveri Bank',
  'Deccan Finance',
  'Malnad Credit Co-op',
  'Coastal Housing Finance',
  'Tunga Auto Credit',
]
const KINDS: Tradeline['kind'][] = ['Credit card', 'Home loan', 'Personal loan', 'Auto loan']

/** A small deterministic number stream seeded by the CIF. */
function stream(cif: string) {
  let block = createHash('sha256').update(`bureau:${cif}`).digest()
  let i = 0
  return () => {
    if (i + 4 > block.length) {
      block = createHash('sha256').update(block).digest()
      i = 0
    }
    const n = block.readUInt32BE(i)
    i += 4
    return n
  }
}

const day = (from: Date, minusDays: number) =>
  new Date(from.getTime() - minusDays * 86_400_000).toISOString().slice(0, 10)

/**
 * The bureau's data for a customer.
 * @param cif e.g. CIF-000124
 * @param today Reference date for "as of" and history (tests pass a fixed one).
 * @returns null when the bureau has no record of the customer.
 */
export function bureauFor(cif: string, today = new Date()): BureauRecord | null {
  const next = stream(cif)
  if (next() % 11 === 0) return null
  const score = BUREAU_MIN + (next() % (BUREAU_MAX - BUREAU_MIN + 1))
  const tradelines = Array.from({ length: 1 + (next() % 4) }, () => {
    const limit = (5 + (next() % 60)) * 10_000
    return {
      lender: LENDERS[next() % LENDERS.length]!,
      kind: KINDS[next() % KINDS.length]!,
      opened: day(today, 200 + (next() % 3000)),
      limit,
      balance: Math.round((limit * (next() % 90)) / 100),
      // Low scores come with late payments, so the report reads consistently.
      worstDpd: score < 650 ? [30, 60, 90][next() % 3]! : score < 700 ? [0, 30][next() % 2]! : 0,
    }
  })
  const enquiries = Array.from({ length: next() % 4 }, () => ({
    date: day(today, next() % 360),
    lender: LENDERS[next() % LENDERS.length]!,
    purpose: KINDS[next() % KINDS.length]!,
  }))
  return { score, asOf: day(today, 1 + (next() % 20)), tradelines, enquiries }
}
