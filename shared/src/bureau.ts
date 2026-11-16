// Credit bureau score bands (FR-CUS-025): 750–900 Excellent, 700–749 Good, 650–699 Fair, below 650 Poor.

export const BUREAU_BANDS = ['Excellent', 'Good', 'Fair', 'Poor'] as const
export type BureauBand = (typeof BUREAU_BANDS)[number]

export const BUREAU_MIN = 300
export const BUREAU_MAX = 900

/**
 * The band for a bureau score.
 * @param score 300–900.
 */
export function bureauBand(score: number): BureauBand {
  if (score >= 750) return 'Excellent'
  if (score >= 700) return 'Good'
  if (score >= 650) return 'Fair'
  return 'Poor'
}
