export const LANGUAGES = ['en', 'kn'] as const
export type Language = (typeof LANGUAGES)[number]

export const STAFF_STATUS = ['active', 'locked', 'deactivated'] as const
export type StaffStatus = (typeof STAFF_STATUS)[number]

export const BRANCHES = [
  { code: '0001', name: { en: 'MG Road, Bengaluru', kn: 'ಎಂ.ಜಿ. ರಸ್ತೆ, ಬೆಂಗಳೂರು' } },
  { code: '0004', name: { en: 'Jayanagar, Bengaluru', kn: 'ಜಯನಗರ, ಬೆಂಗಳೂರು' } },
  { code: '0007', name: { en: 'Whitefield, Bengaluru', kn: 'ವೈಟ್‌ಫೀಲ್ಡ್, ಬೆಂಗಳೂರು' } },
] as const
export type BranchCode = (typeof BRANCHES)[number]['code']
export const BRANCH_CODES = BRANCHES.map((b) => b.code) as [BranchCode, ...BranchCode[]]

export const CUSTOMER_TYPES = ['individual', 'corporate'] as const
export const SEGMENTS = ['retail', 'premier', 'private'] as const
export const GENDERS = ['female', 'male', 'other'] as const
export const MARITAL_STATUS = ['single', 'married', 'divorced', 'widowed'] as const

export const CUSTOMER_STATUS = ['draft', 'pending_approval', 'active', 'blocked', 'closed'] as const
export type CustomerStatus = (typeof CUSTOMER_STATUS)[number]

export const KYC_STATUS = ['pending', 'verified', 'due', 'expired'] as const
export type KycStatus = (typeof KYC_STATUS)[number]

/** Aadhaar is deliberately not offered: storing it is restricted, so the app never asks for it. */
export const ID_TYPES = ['passport', 'pan', 'voter_id', 'driving_licence'] as const
export type IdType = (typeof ID_TYPES)[number]

export const ID_FORMATS: Record<IdType, RegExp> = {
  passport: /^[A-Z][0-9]{7}$/,
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  voter_id: /^[A-Z]{3}[0-9]{7}$/,
  driving_licence: /^KA[0-9]{2}[0-9]{11}$/,
}

export const RISK_RATINGS = ['low', 'medium', 'high'] as const
export type RiskRating = (typeof RISK_RATINGS)[number]

export const SR_CHANNELS = ['branch', 'phone', 'email', 'mobile_app'] as const
export const SR_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const
export type SrPriority = (typeof SR_PRIORITIES)[number]

/** Hours from creation until the SLA is due, per priority. */
export const SLA_HOURS: Record<SrPriority, number> = { low: 72, medium: 48, high: 24, critical: 4 }

export const SR_STATUS = ['open', 'in_progress', 'resolved', 'closed'] as const
export type SrStatus = (typeof SR_STATUS)[number]

/** Allowed status moves. Closing needs the `approve` capability; reopening a resolved request is allowed. */
export const SR_TRANSITIONS: Record<SrStatus, SrStatus[]> = {
  open: ['in_progress', 'resolved'],
  in_progress: ['open', 'resolved'],
  resolved: ['in_progress', 'closed'],
  closed: [],
}

export function canTransition(from: SrStatus, to: SrStatus): boolean {
  return SR_TRANSITIONS[from].includes(to)
}

export const APPROVAL_TYPES = ['customer.activate', 'customer.block', 'customer.unblock'] as const
export type ApprovalType = (typeof APPROVAL_TYPES)[number]
export const APPROVAL_STATUS = ['pending', 'approved', 'rejected'] as const

export const LOOKUP_TYPES = [
  'countries',
  'states',
  'occupations',
  'titles',
  'srCategories',
  'srSubCategories',
  'blockReasons',
  'products',
] as const
export type LookupType = (typeof LOOKUP_TYPES)[number]
