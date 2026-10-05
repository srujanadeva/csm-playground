import { describe, expect, it } from 'vitest'
import { maskEmail, maskId, maskMobile } from '../src/mask.ts'

describe('masking', () => {
  it('masks Indian mobiles with and without the country code', () => {
    expect(maskMobile('+91 98450 12345')).toBe('+91 98450 •••• 45')
    expect(maskMobile('9845012345')).toBe('98450 •••• 45')
  })

  it('masks emails and IDs', () => {
    expect(maskEmail('ananya.rao@mail.com')).toBe('an••••@mail.com')
    expect(maskId('W1234567')).toBe('••••67')
  })

  it('never returns the input for malformed values', () => {
    expect(maskMobile('12')).toBe('••••')
    expect(maskEmail('no-at-sign')).toBe('••••')
  })
})
