/**
 * Teller rules shared by the API and the web app, so the counter screen and the server
 * enforce the same limits. Every amount is an integer number of paise (₹1 = 100), never a
 * float; cash amounts must also be whole rupees, because the counter can't pay out paise.
 */
import type { TxnType } from './enums.ts'

/** Notes the counter handles, largest first. Coins are counted as one rupee total. */
export const NOTES = [500, 200, 100, 50, 20, 10] as const
export type Note = (typeof NOTES)[number]
export const NOTE_KEYS = NOTES.map((n) => `n${n}` as const)
export type NoteKey = `n${Note}`

/** Count of each note plus the coin total in rupees, e.g. { n500: 4, n200: 0, …, coins: 15 }. */
export type Denominations = Record<NoteKey, number> & { coins: number }

export const EMPTY_DENOMINATIONS: Denominations = {
  n500: 0,
  n200: 0,
  n100: 0,
  n50: 0,
  n20: 0,
  n10: 0,
  coins: 0,
}

export const rupees = (r: number) => r * 100

/** Withdrawals above this need a supervisor's authorisation before cash is paid out. */
export const CASH_WITHDRAWAL_AUTH_LIMIT = rupees(50_000)
/** Cash deposits of this amount or more need the depositor's PAN. */
export const PAN_REQUIRED_DEPOSIT = rupees(50_000)
/** The most cash one drawer may hold at any time (also the largest single transaction). */
export const TELLER_CASH_LIMIT = rupees(5_00_000)

/** Total value of a denomination breakdown, in paise. */
export function denominationTotal(d: Denominations): number {
  return rupees(NOTES.reduce((sum, n) => sum + n * (d[`n${n}`] ?? 0), 0) + (d.coins ?? 0))
}

/** Fewest-notes breakdown of a whole-rupee amount; anything under ₹10 goes to coins. */
export function suggestDenominations(amountRupees: number): Denominations {
  const d = { ...EMPTY_DENOMINATIONS }
  let left = Math.max(0, Math.floor(amountRupees))
  for (const n of NOTES) {
    d[`n${n}`] = Math.floor(left / n)
    left -= d[`n${n}`] * n
  }
  d.coins = left
  return d
}

export function needsAuthorisation(type: TxnType, amount: number): boolean {
  return type === 'cash_withdrawal' && amount > CASH_WITHDRAWAL_AUTH_LIMIT
}

export function needsPan(type: TxnType, amount: number, panOnFile: boolean): boolean {
  return type === 'cash_deposit' && amount >= PAN_REQUIRED_DEPOSIT && !panOnFile
}

/** Cash the drawer should hold: opening float + deposits − withdrawals. */
export const expectedCash = (d: { openingAmount: number; cashIn: number; cashOut: number }) =>
  d.openingAmount + d.cashIn - d.cashOut

/** Positive = more cash than expected (excess), negative = short. */
export const drawerVariance = (expected: number, counted: number) => counted - expected

/** Today's business date at the branch (Bengaluru, IST) as "YYYY-MM-DD". */
export function businessDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Withdrawals above this need a one-time code from the customer's registered mobile (FR-TEL-024). */
export const WITHDRAWAL_OTP_LIMIT = rupees(25_000)

export function needsCustomerOtp(type: TxnType, amount: number): boolean {
  return type === 'cash_withdrawal' && amount > WITHDRAWAL_OTP_LIMIT
}

/** Cash cut-off (IST): weekdays 17:30, Saturdays 13:30, no business on Sundays (FR-TEL-026). */
export const CUTOFF_TIMES = { weekday: '17:30', saturday: '13:30' } as const
/** The counter starts counting down this long before the cut-off. */
export const CUTOFF_WARNING_MS = 60 * 60_000

export interface CutoffInfo {
  cutoffAt: string
  countdownFrom: string
  passed: boolean
}

/**
 * Today's cut-off at the branch.
 * @param override "HH:MM" used for every day, Sundays included (practice and tests).
 */
export function cutoffFor(now = new Date(), override?: string): CutoffInfo {
  const date = businessDate(now)
  const day = new Date(`${date}T12:00:00+05:30`).getUTCDay()
  const time = override ?? (day === 0 ? '00:00' : day === 6 ? CUTOFF_TIMES.saturday : CUTOFF_TIMES.weekday)
  const cutoff = new Date(`${date}T${time}:00+05:30`)
  return {
    cutoffAt: cutoff.toISOString(),
    countdownFrom: new Date(cutoff.getTime() - CUTOFF_WARNING_MS).toISOString(),
    passed: now.getTime() >= cutoff.getTime(),
  }
}

/** "T-007" */
export const formatToken = (n: number) => `T-${String(n).padStart(3, '0')}`
