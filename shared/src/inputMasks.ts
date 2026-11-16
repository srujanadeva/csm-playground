// Formatting for masked inputs (phone, card, amount, hex colour). Inputs store raw digits;
// these turn them into what is shown, so the web app and tests agree on the exact text.

/** Raw digits only: "98450-12 345" → "9845012345". */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Indian mobile as typed so far, grouped 5 + 5: "9845012345" → "98450 12345".
 * @param digits Up to 10 digits; extra digits are dropped.
 */
export function formatIndianMobile(digits: string): string {
  const d = digitsOnly(digits).slice(0, 10)
  return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d
}

export type CardBrand = 'visa' | 'mastercard' | 'rupay' | 'amex' | 'unknown' | ''

/**
 * The card network from the leading digits. RuPay's 60/65/81/82/508 prefixes are checked
 * before Mastercard because 65 would otherwise read as nothing at all.
 * @returns '' when there are no digits yet.
 */
export function cardBrand(digits: string): CardBrand {
  const d = digitsOnly(digits)
  if (!d) return ''
  if (/^3[47]/.test(d)) return 'amex'
  if (/^4/.test(d)) return 'visa'
  if (/^(60|65|81|82|508)/.test(d)) return 'rupay'
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(d)) return 'mastercard'
  return 'unknown'
}

/** Card number length for a brand (Amex 15, everything else 16). */
export function cardLength(brand: CardBrand): number {
  return brand === 'amex' ? 15 : 16
}

/** Groups card digits for display: Amex 4-6-5, every other brand in fours. */
export function formatCard(digits: string): string {
  const brand = cardBrand(digits)
  const d = digitsOnly(digits).slice(0, cardLength(brand))
  if (brand === 'amex') return [d.slice(0, 4), d.slice(4, 10), d.slice(10)].filter(Boolean).join(' ')
  return d.replace(/(.{4})(?=.)/g, '$1 ')
}

/**
 * Luhn checksum used by card numbers: from the right, double every second digit
 * (subtracting 9 when that gives two digits); the total must be a multiple of 10.
 */
export function luhnValid(digits: string): boolean {
  const d = digitsOnly(digits)
  if (d.length < 12) return false
  let sum = 0
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i])
    if (i % 2) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
  }
  return sum % 10 === 0
}

/**
 * Lakh/crore grouping for whole rupees: 12345678 → "1,23,45,678". Done by hand rather than
 * Intl so the result is identical in every browser and in Node tests.
 */
export function groupIndian(whole: string): string {
  const w = whole.replace(/^0+(?=\d)/, '')
  if (w.length <= 3) return w
  const head = w.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return `${head},${w.slice(-3)}`
}

/**
 * Cash-register style amount: digits fill from the right, so "5" → "₹0.05" and
 * "12345600" → "₹1,23,456.00".
 * @param paiseDigits The digits typed so far (paise).
 * @returns '' for no digits.
 */
export function formatAmountFromPaise(paiseDigits: string): string {
  const d = digitsOnly(paiseDigits).replace(/^0+/, '')
  if (!d) return ''
  const padded = d.padStart(3, '0')
  return `₹${groupIndian(padded.slice(0, -2))}.${padded.slice(-2)}`
}

/**
 * Normalises a typed hex colour ("#" optional, 3 or 6 digits) to lower-case "#rrggbb".
 * @returns null when the text is not a hex colour.
 */
export function normaliseHex(value: string): string | null {
  const v = value.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{6}$/.test(v)) return `#${v}`
  if (/^[0-9a-f]{3}$/.test(v)) return `#${[...v].map((c) => c + c).join('')}`
  return null
}
