// Cross-sell offers on Customer 360 (FR-CUS-026): at most one, the first rule that matches. The rules
// move to the product catalogue in Phase 6; until then they are fixed here.
import type { OfferDTO } from '@csm/shared'
import type { CustomerRecord } from './dto.ts'

const LOAN_CAP = 15_00_000

/**
 * The offer a customer qualifies for, if any.
 * @returns null for anyone who isn't active, or matches no rule.
 */
export function offerFor(c: CustomerRecord): OfferDTO | null {
  if (c.status !== 'active') return null
  const income = (c.personal?.monthlyIncome as number | undefined) ?? 0
  if (['premier', 'private'].includes(c.segment) && income > 1_00_000)
    return { key: 'creditCard', params: {} }
  if (income >= 40_000) return { key: 'personalLoan', params: { limit: Math.min(income * 10, LOAN_CAP) } }
  return null
}
