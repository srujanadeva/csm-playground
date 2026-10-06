/** Onboarding rules that span fields, and the risk-rating formula. */
import { describe, expect, it } from 'vitest'
import { calculateRisk } from '../src/risk.ts'
import { contactSchema, kycSchema, personalSchema } from '../src/schemas/customer.ts'
import { createServiceRequestSchema } from '../src/schemas/serviceRequest.ts'

const codes = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((r.error?.issues ?? []).map((i) => [i.path.join('.'), i.message]))

const kyc = {
  idType: 'passport',
  idNumber: 'w1234567',
  issueDate: '2022-02-03',
  expiryDate: '2032-02-02',
  pep: false,
  fatcaUsPerson: false,
}

describe('KYC rules', () => {
  it('accepts a valid passport and upper-cases the number', () => {
    const r = kycSchema.safeParse(kyc)
    expect(r.success && r.data.idNumber).toBe('W1234567')
  })

  it('checks the ID format for the chosen type', () => {
    expect(codes(kycSchema.safeParse({ ...kyc, idType: 'pan' }))).toEqual({ idNumber: 'idNumberFormat' })
  })

  it('requires an expiry for passports, after the issue date and not in the past', () => {
    expect(codes(kycSchema.safeParse({ ...kyc, expiryDate: '' }))).toEqual({ expiryDate: 'expiryRequired' })
    expect(codes(kycSchema.safeParse({ ...kyc, expiryDate: '2021-01-01' }))).toEqual({
      expiryDate: 'expiryAfterIssue',
    })
    expect(codes(kycSchema.safeParse({ ...kyc, issueDate: '2010-01-01', expiryDate: '2020-01-01' }))).toEqual(
      { expiryDate: 'idExpired' },
    )
  })

  it('needs PEP details when the customer is a PEP', () => {
    expect(codes(kycSchema.safeParse({ ...kyc, pep: true }))).toEqual({
      'pepDetails.position': 'pepDetailsRequired',
    })
  })

  it('rejects fields the form does not have', () => {
    expect(kycSchema.safeParse({ ...kyc, riskRating: 'low' }).success).toBe(false)
  })
})

describe('personal and contact rules', () => {
  it('requires the customer to be 18 or older', () => {
    const young = new Date()
    young.setFullYear(young.getFullYear() - 17)
    const r = personalSchema.safeParse({ dob: young.toISOString().slice(0, 10) })
    expect(codes(r).dob).toBe('dobAdult')
  })

  it('validates Indian mobiles and PIN codes, and needs a mailing address when it differs', () => {
    const r = contactSchema.safeParse({
      mobile: '5845012345',
      email: 'a@example.com',
      commPrefs: [],
      permanent: {
        line1: '12, 1st Main',
        locality: 'Jayanagar',
        city: 'Bengaluru',
        state: 'KA',
        pincode: '060041',
      },
      mailingSameAsPermanent: false,
    })
    expect(codes(r)).toMatchObject({
      mobile: 'mobileFormat',
      commPrefs: 'commPrefsMin',
      'permanent.pincode': 'pincodeFormat',
    })
  })
})

describe('service request rules', () => {
  it('needs an SLA in the future', () => {
    const r = createServiceRequestSchema.safeParse({
      customerCif: 'CIF-000124',
      channel: 'branch',
      category: 'cards',
      subCategory: 'card_blocked',
      priority: 'high',
      slaDueAt: '2020-01-01T00:00:00Z',
      subject: 'Card blocked',
      description: 'Lost wallet at the mall.',
    })
    expect(codes(r)).toEqual({ slaDueAt: 'slaFuture' })
  })
})

describe('calculateRisk', () => {
  it('scores PEP, US tax residency, foreign nationality and high income', () => {
    expect(calculateRisk({ nationality: 'IN', monthlyIncome: 120_000 })).toBe('low')
    expect(calculateRisk({ pep: true, nationality: 'IN' })).toBe('medium')
    expect(calculateRisk({ pep: true, fatcaUsPerson: true, nationality: 'US' })).toBe('high')
    expect(calculateRisk({ monthlyIncome: 600_000 })).toBe('medium')
  })
})
