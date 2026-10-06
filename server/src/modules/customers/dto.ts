/**
 * Customer DTOs: what the API returns for lists, the 360 view and wizard drafts.
 * PII (mobile, email, ID number) is masked unless the caller has `viewPII` (OWASP A04).
 */
import {
  maskEmail,
  maskId,
  maskMobile,
  type BranchCode,
  type CustomerDetail,
  type CustomerDraftForm,
  type CustomerListItem,
  type CustomerStatus,
  type DocumentDTO,
  type IdType,
  type KycStatus,
  type RiskRating,
} from '@csm/shared'
import { decryptField } from '../../lib/crypto.ts'
import { isoDay } from '../../lib/query.ts'

/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose nested subdocument types are loose. */
export type CustomerRecord = Record<string, any>

/** "+919845012312" → "+91 98450 12312" */
export function formatMobile(e164: string | undefined): string {
  if (!e164) return ''
  const local = e164.slice(-10)
  return `${e164.slice(0, -10)} ${local.slice(0, 5)} ${local.slice(5)}`.trim()
}

/** "+919845012312" → "9845012312" (the form's 10-digit shape). */
export const mobileToForm = (e164: string | undefined) => (e164 ? e164.slice(-10) : undefined)
/** "9845012312" → "+919845012312" */
export const formToMobile = (digits: string | undefined) => (digits ? `+91${digits}` : undefined)

/** The customer's reference in URLs: CIF once submitted, draft number before. */
export const refOf = (c: CustomerRecord): string => c.cif ?? c.draftNo

export const fullName = (c: CustomerRecord) =>
  [c.personal?.firstName, c.personal?.lastName].filter(Boolean).join(' ') || '—'

export function toDocumentDTO(d: CustomerRecord): DocumentDTO {
  return {
    id: String(d._id),
    kind: d.kind,
    fileName: d.fileName,
    mime: d.mime,
    size: d.size ?? 0,
    uploadedBy: d.uploadedBy ?? '',
    uploadedAt: new Date(d.uploadedAt).toISOString(),
  }
}

/** One row of the search results. */
export function toListItem(c: CustomerRecord, showPII: boolean): CustomerListItem {
  const mobile = c.contact?.mobile as string | undefined
  return {
    ref: refOf(c),
    cif: c.cif ?? null,
    draftNo: c.draftNo ?? null,
    name: fullName(c),
    mobile: mobile ? (showPII ? formatMobile(mobile) : maskMobile(mobile)) : '',
    status: c.status as CustomerStatus,
    kycStatus: (c.kyc?.status ?? 'pending') as KycStatus,
    kycExpiryDate: isoDay(c.kyc?.expiryDate) ?? null,
    branchCode: c.branchCode as BranchCode,
    createdAt: new Date(c.createdAt).toISOString(),
  }
}

/** The Customer 360 view. */
export function toDetail(
  c: CustomerRecord,
  showPII: boolean,
  pendingApproval: CustomerDetail['pendingApproval'],
): CustomerDetail {
  const p = c.personal ?? {}
  const k = c.kyc ?? {}
  const contact = c.contact ?? {}
  const mask = (v: string | undefined, fn: (x: string) => string) => (v ? (showPII ? v : fn(v)) : undefined)
  return {
    ref: refOf(c),
    cif: c.cif ?? null,
    draftNo: c.draftNo ?? null,
    status: c.status,
    type: c.type,
    segment: c.segment,
    branchCode: c.branchCode,
    version: c.__v ?? 0,
    personal: {
      title: p.title,
      firstName: p.firstName,
      middleName: p.middleName,
      lastName: p.lastName,
      fatherOrSpouseName: p.fatherOrSpouseName,
      dob: isoDay(p.dob),
      gender: p.gender,
      nationality: p.nationality,
      countryOfBirth: p.countryOfBirth,
      maritalStatus: p.maritalStatus,
      dependants: p.dependants,
      occupation: p.occupation,
      employer: p.employer,
      monthlyIncome: p.monthlyIncome,
      preferredLanguage: p.preferredLanguage,
      productsOfInterest: p.productsOfInterest ?? [],
    },
    contact: {
      mobile: mask(contact.mobile ? formatMobile(contact.mobile) : undefined, maskMobile),
      altMobile: mask(contact.altMobile ? formatMobile(contact.altMobile) : undefined, maskMobile),
      email: mask(contact.email, maskEmail),
      commPrefs: contact.commPrefs ?? [],
    },
    addresses: {
      permanent: c.addresses?.permanent,
      mailingSameAsPermanent: c.addresses?.mailingSameAsPermanent ?? true,
      mailing: c.addresses?.mailing,
    },
    kyc: {
      idType: k.idType as IdType | undefined,
      idNumberMasked: k.idNumberLast4 ? maskId(k.idNumberLast4) : undefined,
      issueDate: isoDay(k.issueDate),
      expiryDate: isoDay(k.expiryDate),
      pep: k.pep ?? false,
      pepDetails: k.pep ? k.pepDetails : undefined,
      fatcaUsPerson: k.fatcaUsPerson ?? false,
      riskRating: k.riskRating as RiskRating | undefined,
      status: k.status as KycStatus | undefined,
      verifiedAt: k.verifiedAt ? new Date(k.verifiedAt).toISOString() : undefined,
    },
    documents: (c.documents ?? []).map(toDocumentDTO),
    pendingApproval,
    piiMasked: !showPII,
    createdBy: c.createdBy ?? '',
    createdAt: new Date(c.createdAt).toISOString(),
    updatedAt: new Date(c.updatedAt).toISOString(),
  }
}

/**
 * The wizard's form shape, so a saved draft resumes exactly as typed. Includes the decrypted
 * ID number: drafts are only readable by onboarding staff in the same branch.
 */
export function toDraftForm(c: CustomerRecord, piiKey: string): CustomerDraftForm {
  const p = c.personal ?? {}
  const k = c.kyc ?? {}
  const contact = c.contact ?? {}
  const strip = <T extends Record<string, unknown>>(o: T) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T
  return {
    ref: refOf(c),
    draftNo: c.draftNo ?? null,
    cif: c.cif ?? null,
    status: c.status,
    version: c.__v ?? 0,
    personal: strip({
      type: c.type,
      segment: c.segment,
      title: p.title,
      firstName: p.firstName,
      middleName: p.middleName,
      lastName: p.lastName,
      fatherOrSpouseName: p.fatherOrSpouseName,
      dob: isoDay(p.dob),
      gender: p.gender,
      nationality: p.nationality,
      countryOfBirth: p.countryOfBirth,
      maritalStatus: p.maritalStatus,
      dependants: p.dependants,
      occupation: p.occupation,
      employer: p.employer,
      monthlyIncome: p.monthlyIncome,
      preferredLanguage: p.preferredLanguage,
      productsOfInterest: p.productsOfInterest ?? [],
    }),
    contact: strip({
      mobile: mobileToForm(contact.mobile),
      altMobile: mobileToForm(contact.altMobile),
      email: contact.email,
      commPrefs: contact.commPrefs ?? [],
      permanent: c.addresses?.permanent ? strip({ ...c.addresses.permanent }) : undefined,
      mailingSameAsPermanent: c.addresses?.mailingSameAsPermanent ?? true,
      mailing: c.addresses?.mailing ? strip({ ...c.addresses.mailing }) : undefined,
    }),
    kyc: strip({
      idType: k.idType,
      idNumber: k.idNumberEnc ? decryptField(k.idNumberEnc, piiKey) : undefined,
      issueDate: isoDay(k.issueDate),
      expiryDate: isoDay(k.expiryDate),
      pep: k.pep ?? false,
      pepDetails: k.pep && k.pepDetails ? strip({ ...k.pepDetails }) : undefined,
      fatcaUsPerson: k.fatcaUsPerson ?? false,
    }),
    riskRating: (k.riskRating as RiskRating | undefined) ?? null,
    documents: (c.documents ?? []).map(toDocumentDTO),
    updatedAt: new Date(c.updatedAt).toISOString(),
  }
}
