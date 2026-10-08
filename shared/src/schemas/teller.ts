/** Teller schemas: account lookup, cash transactions, authorisation and the cash drawer. */
import { z } from 'zod'
import { DRAWER_STATUS, TXN_STATUS, TXN_TYPES } from '../enums.ts'
import { TELLER_CASH_LIMIT, denominationTotal } from '../teller.ts'
import { offsetQuery } from './common.ts'

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v)

/** "0001 10 000123": branch code, account type (10 savings, 20 current), running number. */
export const ACCOUNT_NO = /^(0001|0004|0007)(10|20)[0-9]{6}$/
export const TXN_NO = /^TXN-[0-9]{4}-[0-9]{6}$/
export const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/

const count = z.coerce.number().int('invalid').min(0, 'invalid').max(10_000, 'invalid')

export const denominationsSchema = z.strictObject({
  n500: count,
  n200: count,
  n100: count,
  n50: count,
  n20: count,
  n10: count,
  /** Coins, as a rupee total. */
  coins: z.coerce.number().int('invalid').min(0, 'invalid').max(9_999, 'invalid'),
})

export const accountSearchQuery = z.strictObject({
  q: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^([0-9]{4,12}|CIF-[0-9]{1,6})$/, 'accountQuery'),
})

export const postTransactionSchema = z
  .strictObject({
    accountNo: z.string().regex(ACCOUNT_NO, 'required'),
    type: z.enum(TXN_TYPES),
    /** Paise; whole rupees only. */
    amount: z
      .number()
      .int('invalid')
      .min(100, 'amountRange')
      .max(TELLER_CASH_LIMIT, 'amountRange')
      .refine((a) => a % 100 === 0, 'wholeRupees'),
    denominations: denominationsSchema,
    narration: z.preprocess(emptyToUndefined, z.string().trim().max(80, 'tooLong').optional()),
    panNumber: z.preprocess(
      emptyToUndefined,
      z.string().trim().toUpperCase().regex(PAN, 'panFormat').optional(),
    ),
  })
  .refine((d) => denominationTotal(d.denominations) === d.amount, {
    error: 'denominationMismatch',
    path: ['denominations'],
  })
export type PostTransactionInput = z.infer<typeof postTransactionSchema>

export const transactionDecisionSchema = z
  .strictObject({
    decision: z.enum(['approve', 'reject']),
    note: z.preprocess(emptyToUndefined, z.string().trim().max(200, 'tooLong').optional()),
  })
  .refine((d) => d.decision === 'approve' || (d.note?.length ?? 0) >= 10, {
    error: 'decisionNoteRequired',
    path: ['note'],
  })

export const TXN_SCOPES = ['mine', 'branch'] as const

export const transactionListQuery = offsetQuery.extend({
  scope: z.enum(TXN_SCOPES).default('mine'),
  status: z.preprocess(emptyToUndefined, z.enum(TXN_STATUS).optional()),
  date: z.preprocess(emptyToUndefined, z.iso.date().optional()),
})

export const openDrawerSchema = z.strictObject({ denominations: denominationsSchema })

export const closeDrawerSchema = z.strictObject({
  denominations: denominationsSchema,
  varianceReason: z.preprocess(emptyToUndefined, z.string().trim().max(200, 'tooLong').optional()),
  version: z.number().int().min(0),
})

export const signOffSchema = z.strictObject({
  note: z.preprocess(emptyToUndefined, z.string().trim().max(200, 'tooLong').optional()),
  version: z.number().int().min(0),
})

export const drawerListQuery = offsetQuery.extend({
  status: z.preprocess(emptyToUndefined, z.enum(DRAWER_STATUS).optional()),
  date: z.preprocess(emptyToUndefined, z.iso.date().optional()),
})
