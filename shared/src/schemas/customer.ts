/**
 * Customer onboarding and search schemas.
 *
 * Each wizard step has a full schema (used by "Next", by submit, and by edits after
 * activation) and a draft schema (used by "Save draft": every field optional, but any value
 * given must be valid). Form-shaped values: dates are "YYYY-MM-DD", mobiles are 10 digits.
 */
import { z } from 'zod'
import {
  BRANCH_CODES,
  CUSTOMER_STATUS,
  CUSTOMER_TYPES,
  GENDERS,
  ID_FORMATS,
  ID_TYPES,
  KYC_STATUS,
  LANGUAGES,
  MARITAL_STATUS,
  SEGMENTS,
} from '../enums.ts'
import { offsetQuery } from './common.ts'

/** Empty form inputs arrive as "", which should mean "not given" for optional fields. */
const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v)

const personName = (max = 60) =>
  z
    .string()
    .trim()
    .min(1, 'required')
    .max(max, 'tooLong')
    .regex(/^[\p{L}][\p{L} .'-]*$/u, 'nameFormat')

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'invalid')

const today = () => new Date().toISOString().slice(0, 10)

function ageOn(dob: string, on = new Date()): number {
  const d = new Date(`${dob}T00:00:00Z`)
  let age = on.getUTCFullYear() - d.getUTCFullYear()
  const m = on.getUTCMonth() - d.getUTCMonth()
  if (m < 0 || (m === 0 && on.getUTCDate() < d.getUTCDate())) age--
  return age
}

export const TITLES = ['mr', 'mrs', 'ms', 'dr'] as const
export const COMM_PREFS = ['sms', 'email', 'post'] as const

// ── Step 1: personal ─────────────────────────────────────────────────────────

export const personalBase = z.strictObject({
  type: z.enum(CUSTOMER_TYPES),
  segment: z.enum(SEGMENTS),
  title: z.enum(TITLES),
  firstName: personName(),
  middleName: z.preprocess(emptyToUndefined, personName().optional()),
  lastName: personName(),
  fatherOrSpouseName: personName(120),
  dob: isoDate.refine((v) => ageOn(v) >= 18, 'dobAdult').refine((v) => ageOn(v) <= 120, 'invalid'),
  gender: z.enum(GENDERS),
  nationality: z.string().regex(/^[A-Z]{2}$/, 'required'),
  countryOfBirth: z.string().regex(/^[A-Z]{2}$/, 'required'),
  maritalStatus: z.enum(MARITAL_STATUS),
  dependants: z.coerce.number().int('invalid').min(0, 'invalid').max(20, 'invalid'),
  occupation: z.string().min(1, 'required').max(40, 'tooLong'),
  employer: z.preprocess(emptyToUndefined, z.string().trim().max(120, 'tooLong').optional()),
  monthlyIncome: z.coerce.number().int('incomeRange').min(0, 'incomeRange').max(10_000_000, 'incomeRange'),
  preferredLanguage: z.enum(LANGUAGES),
  productsOfInterest: z.array(z.string().max(30)).max(7),
})
export const personalSchema = personalBase
export const personalDraftSchema = personalBase.partial()
export type PersonalInput = z.infer<typeof personalSchema>

// ── Step 2: contact & address ────────────────────────────────────────────────

const mobile = z
  .string()
  .trim()
  .regex(/^[6-9][0-9]{9}$/, 'mobileFormat')

export const addressSchema = z.strictObject({
  line1: z.string().trim().min(3, 'required').max(120, 'tooLong'),
  line2: z.preprocess(emptyToUndefined, z.string().trim().max(120, 'tooLong').optional()),
  locality: z.string().trim().min(2, 'required').max(80, 'tooLong'),
  city: z.string().trim().min(2, 'required').max(60, 'tooLong'),
  state: z.string().regex(/^[A-Z]{2}$/, 'required'),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'pincodeFormat'),
  country: z.literal('IN').default('IN'),
})
export type AddressInput = z.infer<typeof addressSchema>

export const contactBase = z.strictObject({
  mobile,
  altMobile: z.preprocess(emptyToUndefined, mobile.optional()),
  email: z.email('emailFormat').max(120, 'tooLong'),
  commPrefs: z.array(z.enum(COMM_PREFS)).min(1, 'commPrefsMin'),
  permanent: addressSchema,
  mailingSameAsPermanent: z.boolean(),
  mailing: addressSchema.optional(),
})
export const contactSchema = contactBase.refine((d) => d.mailingSameAsPermanent || !!d.mailing, {
  error: 'required',
  path: ['mailing', 'line1'],
})
export const contactDraftSchema = contactBase.partial().extend({
  permanent: addressSchema.partial().optional(),
  mailing: addressSchema.partial().optional(),
})
export type ContactInput = z.infer<typeof contactSchema>

// ── Step 3: KYC ──────────────────────────────────────────────────────────────

export const pepDetailsSchema = z.strictObject({
  position: z.string().trim().min(2, 'required').max(80, 'tooLong'),
  country: z.string().regex(/^[A-Z]{2}$/, 'required'),
  since: z.coerce.number().int('invalid').min(1950, 'invalid').max(new Date().getFullYear(), 'invalid'),
  sourceOfWealth: z.string().trim().min(10, 'remarksLength').max(500, 'remarksLength'),
})

export const kycBase = z.strictObject({
  idType: z.enum(ID_TYPES),
  idNumber: z.string().trim().toUpperCase().min(1, 'required').max(20, 'tooLong'),
  issueDate: isoDate.refine((v) => v <= today(), 'issueNotFuture'),
  expiryDate: z.preprocess(emptyToUndefined, isoDate.optional()),
  pep: z.boolean(),
  pepDetails: pepDetailsSchema.optional(),
  fatcaUsPerson: z.boolean(),
})

/** Rules that span fields: ID format per type, expiry rules, PEP details. */
export const kycSchema = kycBase.superRefine((d, ctx) => {
  if (!ID_FORMATS[d.idType].test(d.idNumber)) {
    ctx.addIssue({ code: 'custom', message: 'idNumberFormat', path: ['idNumber'] })
  }
  const needsExpiry = d.idType === 'passport' || d.idType === 'driving_licence'
  if (needsExpiry && !d.expiryDate) {
    ctx.addIssue({ code: 'custom', message: 'expiryRequired', path: ['expiryDate'] })
  }
  if (d.expiryDate && d.expiryDate <= d.issueDate) {
    ctx.addIssue({ code: 'custom', message: 'expiryAfterIssue', path: ['expiryDate'] })
  } else if (d.expiryDate && d.expiryDate <= today()) {
    ctx.addIssue({ code: 'custom', message: 'idExpired', path: ['expiryDate'] })
  }
  if (d.pep && !d.pepDetails) {
    ctx.addIssue({ code: 'custom', message: 'pepDetailsRequired', path: ['pepDetails', 'position'] })
  }
})
export const kycDraftSchema = kycBase.partial().extend({ pepDetails: pepDetailsSchema.partial().optional() })
export type KycInput = z.infer<typeof kycSchema>

// ── Draft save, submit, edit ─────────────────────────────────────────────────

export const createDraftSchema = z.strictObject({ personal: personalDraftSchema })

export const updateDraftSchema = z.strictObject({
  version: z.number().int().min(0),
  personal: personalDraftSchema.optional(),
  contact: contactDraftSchema.optional(),
  kyc: kycDraftSchema.optional(),
})

/** Edits after activation: full sections only, and KYC is not editable (needs re-KYC). */
export const updateActiveSchema = z.strictObject({
  version: z.number().int().min(0),
  personal: personalSchema.optional(),
  contact: contactSchema.optional(),
})

export const declarationsSchema = z.strictObject({
  idVerified: z.literal(true, 'declarationRequired'),
  termsAccepted: z.literal(true, 'declarationRequired'),
})

export const submitSchema = z.strictObject({
  version: z.number().int().min(0),
  declarations: declarationsSchema,
})

export const blockRequestSchema = z.strictObject({
  reason: z.string().min(1, 'required').max(40),
  remarks: z.string().trim().min(10, 'remarksLength').max(500, 'remarksLength'),
})

// ── Search ───────────────────────────────────────────────────────────────────

export const CUSTOMER_SORTS = ['cif', 'nameSearch', 'createdAt', 'status'] as const

export const customerSearchQuery = offsetQuery.extend({
  cif: z.preprocess(emptyToUndefined, z.string().trim().toUpperCase().max(10).optional()),
  draftNo: z.preprocess(emptyToUndefined, z.string().trim().toUpperCase().max(14).optional()),
  name: z.preprocess(emptyToUndefined, z.string().trim().min(2, 'invalid').max(60).optional()),
  mobile: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^[0-9]{3,10}$/, 'invalid')
      .optional(),
  ),
  idNumber: z.preprocess(emptyToUndefined, z.string().trim().max(20).optional()),
  status: z.preprocess(emptyToUndefined, z.enum(CUSTOMER_STATUS).optional()),
  kyc: z.preprocess(emptyToUndefined, z.enum(KYC_STATUS).optional()),
  branch: z.preprocess(emptyToUndefined, z.enum(BRANCH_CODES).optional()),
  from: z.preprocess(emptyToUndefined, isoDate.optional()),
  to: z.preprocess(emptyToUndefined, isoDate.optional()),
})
export type CustomerSearchQuery = z.infer<typeof customerSearchQuery>

export const typeaheadQuery = z.strictObject({ q: z.string().trim().min(2, 'invalid').max(40) })
