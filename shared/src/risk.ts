/**
 * Customer risk rating, shown read-only on the KYC step and stored on submit.
 * The same function runs in the browser (live preview) and on the server (stored value).
 */
import type { RiskRating } from './enums.ts'

export interface RiskInputs {
  pep?: boolean
  fatcaUsPerson?: boolean
  nationality?: string
  monthlyIncome?: number
}

/** Points: PEP 2, US tax resident 1, non-Indian national 1, income over ₹5,00,000 a month 1. */
export function calculateRisk(input: RiskInputs): RiskRating {
  const points =
    (input.pep ? 2 : 0) +
    (input.fatcaUsPerson ? 1 : 0) +
    (input.nationality && input.nationality !== 'IN' ? 1 : 0) +
    ((input.monthlyIncome ?? 0) > 500_000 ? 1 : 0)
  return points >= 3 ? 'high' : points >= 1 ? 'medium' : 'low'
}
