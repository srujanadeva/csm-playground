import { describe, expect, it } from 'vitest'
import {
  cardBrand,
  formatAmountFromPaise,
  formatCard,
  formatIndianMobile,
  groupIndian,
  luhnValid,
  normaliseHex,
} from '../src/inputMasks.ts'

describe('input masks', () => {
  it('groups Indian mobiles 5 + 5 and drops extra digits', () => {
    expect(formatIndianMobile('98450')).toBe('98450')
    expect(formatIndianMobile('984501')).toBe('98450 1')
    expect(formatIndianMobile('98450-12345-99')).toBe('98450 12345')
  })

  it('detects card brands, including RuPay', () => {
    expect(cardBrand('4111')).toBe('visa')
    expect(cardBrand('5105')).toBe('mastercard')
    expect(cardBrand('6521')).toBe('rupay')
    expect(cardBrand('3782')).toBe('amex')
    expect(cardBrand('9')).toBe('unknown')
    expect(cardBrand('')).toBe('')
  })

  it('formats cards by brand and checks Luhn', () => {
    expect(formatCard('4111111111111111')).toBe('4111 1111 1111 1111')
    expect(formatCard('378282246310005')).toBe('3782 822463 10005')
    expect(luhnValid('4111111111111111')).toBe(true)
    expect(luhnValid('4111111111111112')).toBe(false)
  })

  it('uses lakh/crore grouping for amounts', () => {
    expect(groupIndian('999')).toBe('999')
    expect(groupIndian('123456')).toBe('1,23,456')
    expect(groupIndian('12345678')).toBe('1,23,45,678')
    expect(formatAmountFromPaise('5')).toBe('₹0.05')
    expect(formatAmountFromPaise('12345600')).toBe('₹1,23,456.00')
    expect(formatAmountFromPaise('000')).toBe('')
  })

  it('normalises hex colours', () => {
    expect(normaliseHex('0D7564')).toBe('#0d7564')
    expect(normaliseHex('#abc')).toBe('#aabbcc')
    expect(normaliseHex('green')).toBeNull()
  })
})
