import { describe, expect, it } from 'vitest'
import {
  EMPTY_DENOMINATIONS,
  businessDate,
  denominationTotal,
  drawerVariance,
  expectedCash,
  needsAuthorisation,
  needsPan,
  rupees,
  suggestDenominations,
} from '../src/teller.ts'
import { ROLES, SCREENS, resolvePermissions } from '../src/permissions.ts'
import { closeDrawerSchema, postTransactionSchema, transactionDecisionSchema } from '../src/schemas/teller.ts'

const notes = (d: Partial<typeof EMPTY_DENOMINATIONS>) => ({ ...EMPTY_DENOMINATIONS, ...d })

describe('teller rules', () => {
  it('totals notes and coins in paise', () => {
    expect(denominationTotal(notes({ n500: 3, n200: 1, n10: 2, coins: 7 }))).toBe(rupees(1727))
    expect(denominationTotal(EMPTY_DENOMINATIONS)).toBe(0)
  })

  it('suggests the fewest notes, with coins for anything under ₹10', () => {
    const d = suggestDenominations(1_887)
    expect(d).toEqual({ n500: 3, n200: 1, n100: 1, n50: 1, n20: 1, n10: 1, coins: 7 })
    expect(denominationTotal(d)).toBe(rupees(1_887))
  })

  it('needs authorisation only for withdrawals above ₹50,000', () => {
    expect(needsAuthorisation('cash_withdrawal', rupees(50_000))).toBe(false)
    expect(needsAuthorisation('cash_withdrawal', rupees(50_001))).toBe(true)
    expect(needsAuthorisation('cash_deposit', rupees(4_00_000))).toBe(false)
  })

  it('needs a PAN for deposits of ₹50,000 or more unless one is on file', () => {
    expect(needsPan('cash_deposit', rupees(49_999), false)).toBe(false)
    expect(needsPan('cash_deposit', rupees(50_000), false)).toBe(true)
    expect(needsPan('cash_deposit', rupees(50_000), true)).toBe(false)
    expect(needsPan('cash_withdrawal', rupees(90_000), false)).toBe(false)
  })

  it('computes expected cash and the variance sign', () => {
    const expected = expectedCash({ openingAmount: rupees(1000), cashIn: rupees(500), cashOut: rupees(200) })
    expect(expected).toBe(rupees(1300))
    expect(drawerVariance(expected, rupees(1290))).toBe(rupees(-10))
  })

  it('uses the IST date, not UTC', () => {
    expect(businessDate(new Date('2026-10-07T19:00:00Z'))).toBe('2026-10-08')
    expect(businessDate(new Date('2026-10-07T18:00:00Z'))).toBe('2026-10-07')
  })
})

describe('teller schemas', () => {
  const base = { accountNo: '000110000123', type: 'cash_deposit', narration: '' }

  it('accepts a transaction whose notes add up', () => {
    const r = postTransactionSchema.safeParse({
      ...base,
      amount: rupees(1200),
      denominations: notes({ n500: 2, n200: 1 }),
    })
    expect(r.success).toBe(true)
  })

  it('rejects mismatched notes, paise amounts and bad account numbers', () => {
    const codes = (input: object) =>
      postTransactionSchema.safeParse(input).error?.issues.map((i) => i.message) ?? []
    expect(codes({ ...base, amount: rupees(1000), denominations: notes({ n500: 1 }) })).toContain(
      'denominationMismatch',
    )
    expect(codes({ ...base, amount: 150_050, denominations: notes({}) })).toContain('wholeRupees')
    expect(
      codes({ ...base, accountNo: '000910000123', amount: rupees(500), denominations: notes({ n500: 1 }) }),
    ).toContain('required')
  })

  it('upper-cases and checks the PAN format', () => {
    const r = postTransactionSchema.safeParse({
      ...base,
      amount: rupees(500),
      denominations: notes({ n500: 1 }),
      panNumber: 'abcpe1234f',
    })
    expect(r.success && r.data.panNumber).toBe('ABCPE1234F')
  })

  it('needs a note to reject, not to approve', () => {
    expect(transactionDecisionSchema.safeParse({ decision: 'approve' }).success).toBe(true)
    expect(transactionDecisionSchema.safeParse({ decision: 'reject', note: 'no' }).success).toBe(false)
    expect(
      closeDrawerSchema.safeParse({ denominations: notes({}), version: 0, varianceReason: '' }).success,
    ).toBe(true)
  })
})

describe('teller access', () => {
  it('gives tellers the counter and drawer without approve, and supervisors approve', () => {
    const grants = (key: string) => ROLES.find((r) => r.key === key)!.grants
    const teller = resolvePermissions('teller', grants('teller'), [], SCREENS)
    expect(teller['teller.counter']).toEqual(['view', 'create'])
    expect(teller['teller.drawer']).toEqual(['view', 'create', 'edit'])
    expect(teller['customers.onboard']).toBeUndefined()
    const sup = resolvePermissions('supervisor', grants('supervisor'), [], SCREENS)
    expect(sup['teller.counter']).toContain('approve')
    expect(sup['teller.drawer']).toContain('approve')
    const csr = resolvePermissions('csr', grants('csr'), [], SCREENS)
    expect(csr['teller.counter']).toBeUndefined()
  })
})
