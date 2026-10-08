import { Types } from 'mongoose'
import {
  CASH_WITHDRAWAL_AUTH_LIMIT,
  SLA_HOURS,
  businessDate,
  denominationTotal,
  rupees,
  suggestDenominations,
  type BranchCode,
  type IdType,
  type SrPriority,
  type SrStatus,
} from '@csm/shared'
import { blindIndex, encryptField } from '../lib/crypto.ts'
import {
  COMMENTS,
  EMPLOYERS,
  FEMALE_NAMES,
  LOCALITIES,
  LOOKUPS,
  MALE_NAMES,
  MOBILE_PREFIXES,
  SR_SUBJECTS,
  STAFF,
  SURNAMES,
} from './data.ts'

// Deterministic sample data: the same seed gives the same customers on every machine, so
// tests and exercises can refer to specific records (e.g. CIF-000124 is Ananya Rao).

export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DAY = 86_400_000
const YEAR = 365.25 * DAY
const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!
const int = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1))
const chance = (rng: Rng, p: number) => rng() < p
function weighted<T>(rng: Rng, entries: [T, number][]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let r = rng() * total
  for (const [value, w] of entries) {
    r -= w
    if (r < 0) return value
  }
  return entries.at(-1)![0]
}
const digits = (rng: Rng, n: number) => Array.from({ length: n }, () => int(rng, 0, 9)).join('')
const letters = (rng: Rng, n: number) =>
  Array.from({ length: n }, () => String.fromCharCode(65 + int(rng, 0, 25))).join('')

/** ObjectId whose timestamp matches `at`, so _id order follows creation time (cursor paging). */
export function oidAt(at: Date, rng: Rng): Types.ObjectId {
  const time = Math.floor(at.getTime() / 1000)
    .toString(16)
    .padStart(8, '0')
  const rest = Array.from({ length: 16 }, () => int(rng, 0, 15).toString(16)).join('')
  return new Types.ObjectId(time + rest)
}

const csrFor = (branch: BranchCode, rng: Rng) =>
  pick(
    rng,
    STAFF.filter((s) => s.roleKey === 'csr' && s.branchCode === branch && s.status !== 'deactivated'),
  )
const supervisorFor = (branch: BranchCode) =>
  STAFF.find((s) => s.roleKey === 'supervisor' && s.branchCode === branch) ??
  STAFF.find((s) => s.roleKey === 'supervisor')!

function idNumber(rng: Rng, type: IdType): string {
  switch (type) {
    case 'passport':
      return letters(rng, 1) + digits(rng, 7)
    case 'pan':
      return letters(rng, 3) + 'P' + letters(rng, 1) + digits(rng, 4) + letters(rng, 1)
    case 'voter_id':
      return letters(rng, 3) + digits(rng, 7)
    case 'driving_licence':
      return 'KA' + String(int(rng, 1, 70)).padStart(2, '0') + String(int(rng, 2005, 2024)) + digits(rng, 7)
  }
}

function address(rng: Rng) {
  const [locality, pincode] = pick(rng, LOCALITIES)
  return {
    line1: `${int(rng, 1, 480)}, ${int(rng, 1, 18)}th Cross, ${int(rng, 1, 12)}th Main`,
    locality,
    city: 'Bengaluru',
    state: 'KA',
    pincode,
    country: 'IN',
  }
}

type Doc = Record<string, unknown> & { _id: Types.ObjectId; createdAt: Date }

export interface GeneratedData {
  customers: Doc[]
  approvals: Doc[]
  audit: Doc[]
  counters: Record<string, number>
}

export function generateCustomers(rng: Rng, count: number, piiKey: string, now: Date): GeneratedData {
  const start = now.getTime() - 2 * YEAR
  const customers: Doc[] = []
  const approvals: Doc[] = []
  const audit: Doc[] = []
  const counters: Record<string, number> = {}
  let cifSeq = 0
  const products = LOOKUPS.products.map((p) => p.code)

  for (let i = 0; i < count; i++) {
    const createdAt = new Date(start + ((now.getTime() - start) * (i + rng())) / count)
    const ageDays = (now.getTime() - createdAt.getTime()) / DAY
    const status =
      ageDays < 30
        ? weighted(rng, [
            ['draft', 25],
            ['pending_approval', 15],
            ['active', 60],
          ] as const)
        : weighted(rng, [
            ['active', 89],
            ['blocked', 6],
            ['closed', 5],
          ] as const)

    const female = chance(rng, 0.5)
    const firstName = pick(rng, female ? FEMALE_NAMES : MALE_NAMES)
    const lastName = pick(rng, SURNAMES)
    const age = int(rng, 21, 75)
    const dob = new Date(createdAt.getTime() - age * YEAR - int(rng, 0, 360) * DAY)
    const maritalStatus =
      age < 26
        ? weighted(rng, [
            ['single', 80],
            ['married', 20],
          ] as const)
        : age > 65
          ? weighted(rng, [
              ['married', 70],
              ['widowed', 25],
              ['divorced', 5],
            ] as const)
          : weighted(rng, [
              ['married', 75],
              ['single', 18],
              ['divorced', 7],
            ] as const)
    const married = maritalStatus === 'married'
    const title = chance(rng, 0.05) ? 'dr' : female ? (married ? 'mrs' : 'ms') : 'mr'
    const fatherOrSpouseName =
      female && married ? `${pick(rng, MALE_NAMES)} ${lastName}` : `${pick(rng, MALE_NAMES)} ${lastName}`
    const occupation =
      age > 62
        ? 'retired'
        : weighted(rng, [
            ['salaried_private', 45],
            ['salaried_govt', 12],
            ['self_employed', 12],
            ['business', 12],
            ['student', age < 25 ? 15 : 1],
            ['homemaker', 6],
            ['agriculture', 3],
          ] as const)
    const employer =
      occupation === 'salaried_private'
        ? pick(rng, EMPLOYERS)
        : occupation === 'salaried_govt'
          ? 'Government of Karnataka'
          : occupation === 'business'
            ? `${lastName} Enterprises`
            : undefined
    const segment = weighted(rng, [
      ['retail', 85],
      ['premier', 12],
      ['private', 3],
    ] as const)
    const income =
      segment === 'retail'
        ? int(rng, 20, 150)
        : segment === 'premier'
          ? int(rng, 150, 500)
          : int(rng, 500, 2500)
    const branchCode = pick(rng, ['0001', '0004', '0007'] as const)
    const maker = csrFor(branchCode, rng).staffId
    const checker = supervisorFor(branchCode).staffId
    const nationality = chance(rng, 0.97) ? 'IN' : pick(rng, ['US', 'GB', 'AE', 'SG'])

    const kycStatus =
      status === 'draft' || status === 'pending_approval'
        ? 'pending'
        : status === 'blocked'
          ? weighted(rng, [
              ['expired', 50],
              ['verified', 50],
            ] as const)
          : status === 'closed'
            ? 'verified'
            : weighted(rng, [
                ['verified', 91],
                ['due', 6],
                ['expired', 3],
              ] as const)
    const idType: IdType =
      kycStatus === 'due' || kycStatus === 'expired'
        ? 'passport'
        : weighted(rng, [
            ['passport', 30],
            ['pan', 40],
            ['voter_id', 15],
            ['driving_licence', 15],
          ] as const)
    const id = idNumber(rng, idType)
    let issueDate: Date | undefined = new Date(createdAt.getTime() - int(rng, 30, 8 * 365) * DAY)
    let expiryDate: Date | undefined
    if (idType === 'passport') {
      if (kycStatus === 'expired') expiryDate = new Date(now.getTime() - int(rng, 1, 300) * DAY)
      else if (kycStatus === 'due') expiryDate = new Date(now.getTime() + int(rng, 1, 60) * DAY)
      else expiryDate = new Date(now.getTime() + int(rng, 90, 9 * 365) * DAY)
      issueDate = new Date(expiryDate.getTime() - 10 * YEAR)
    } else if (idType === 'driving_licence') {
      expiryDate = new Date(issueDate.getTime() + 20 * YEAR)
    }
    const pep = chance(rng, 0.02)
    const riskRating = pep
      ? weighted(rng, [
          ['medium', 60],
          ['high', 40],
        ] as const)
      : weighted(rng, [
          ['low', 78],
          ['medium', 18],
          ['high', 4],
        ] as const)

    let cif: string | undefined
    let draftNo: string | undefined
    if (status === 'draft') {
      const key = `draft-${createdAt.getFullYear()}`
      counters[key] = (counters[key] ?? 0) + 1
      draftNo = `D-${createdAt.getFullYear()}-${String(counters[key]).padStart(5, '0')}`
    } else {
      cifSeq += 1
      cif = `CIF-${String(cifSeq).padStart(6, '0')}`
    }

    const sameMailing = chance(rng, 0.9)
    const verifiedAt =
      status === 'draft' || status === 'pending_approval'
        ? undefined
        : new Date(createdAt.getTime() + int(rng, 1, 3) * DAY)
    const _id = oidAt(createdAt, rng)
    const prods = [
      ...new Set([
        ...(chance(rng, 0.8) ? ['savings'] : []),
        ...Array.from({ length: int(rng, 0, 2) }, () => pick(rng, products)),
      ]),
    ]

    customers.push({
      _id,
      ...(cif ? { cif } : {}),
      ...(draftNo ? { draftNo } : {}),
      type: 'individual',
      segment,
      status,
      branchCode,
      personal: {
        title,
        firstName,
        lastName,
        fatherOrSpouseName,
        dob,
        gender: female ? 'female' : 'male',
        nationality,
        countryOfBirth: nationality,
        maritalStatus,
        dependants: married ? int(rng, 0, 3) : 0,
        occupation,
        ...(employer ? { employer } : {}),
        monthlyIncome: income * 1000,
        preferredLanguage: chance(rng, 0.45) ? 'kn' : 'en',
        productsOfInterest: prods.length ? prods : ['savings'],
      },
      nameSearch: `${firstName} ${lastName}`.toLowerCase(),
      contact: {
        mobile: `+91${pick(rng, MOBILE_PREFIXES)}${digits(rng, 5)}`,
        email: `${firstName}.${lastName}${int(rng, 10, 99)}@example.com`.toLowerCase(),
        commPrefs: chance(rng, 0.6) ? ['sms', 'email'] : ['sms'],
      },
      addresses: {
        permanent: address(rng),
        mailingSameAsPermanent: sameMailing,
        ...(sameMailing ? {} : { mailing: address(rng) }),
      },
      kyc: {
        idType,
        idNumberEnc: encryptField(id, piiKey),
        idNumberIndex: blindIndex(id, piiKey),
        idNumberLast4: id.slice(-4),
        issueDate,
        ...(expiryDate ? { expiryDate } : {}),
        pep,
        ...(pep
          ? {
              pepDetails: {
                position: pick(rng, ['BBMP ward corporator', 'Zilla panchayat member', 'Senior IAS officer']),
                country: 'IN',
                since: int(rng, 2010, 2024),
                sourceOfWealth: 'Salary and family business income.',
              },
            }
          : {}),
        fatcaUsPerson: nationality === 'US',
        riskRating,
        status: kycStatus,
        ...(verifiedAt ? { verifiedAt } : {}),
      },
      documents: [],
      createdBy: maker,
      updatedBy: maker,
      createdAt,
      updatedAt: verifiedAt ?? createdAt,
    })

    const entityId = cif ?? draftNo!
    audit.push({
      _id: oidAt(createdAt, rng),
      category: 'data',
      action: 'customer.created',
      actor: maker,
      entityType: 'customer',
      entityId,
      outcome: 'success',
      createdAt,
    })
    if (status !== 'draft') {
      const submittedAt = new Date(createdAt.getTime() + 2 * 3_600_000)
      audit.push({
        _id: oidAt(submittedAt, rng),
        category: 'data',
        action: 'customer.submitted',
        actor: maker,
        entityType: 'customer',
        entityId,
        outcome: 'success',
        createdAt: submittedAt,
      })
    }
    if (status === 'pending_approval') {
      approvals.push({
        _id: oidAt(createdAt, rng),
        type: 'customer.activate',
        entityType: 'customer',
        entityId,
        branchCode,
        status: 'pending',
        requestedBy: maker,
        createdAt,
        updatedAt: createdAt,
      })
    }
    if (verifiedAt) {
      audit.push({
        _id: oidAt(verifiedAt, rng),
        category: 'data',
        action: 'customer.activated',
        actor: checker,
        entityType: 'customer',
        entityId,
        outcome: 'success',
        changes: [{ field: 'status', from: 'pending_approval', to: 'active' }],
        createdAt: verifiedAt,
      })
    }
    if (status === 'blocked' && verifiedAt) {
      const blockedAt = new Date(
        verifiedAt.getTime() + int(rng, 30, Math.max(31, Math.floor(ageDays) - 5)) * DAY,
      )
      const reason =
        kycStatus === 'expired'
          ? 'kyc_expired'
          : pick(rng, ['suspected_fraud', 'court_order', 'customer_request'])
      approvals.push({
        _id: oidAt(blockedAt, rng),
        type: 'customer.block',
        entityType: 'customer',
        entityId,
        branchCode,
        reason,
        remarks: 'Blocked after review at the branch.',
        status: 'approved',
        requestedBy: maker,
        decidedBy: checker,
        decidedAt: blockedAt,
        createdAt: blockedAt,
        updatedAt: blockedAt,
      })
      audit.push({
        _id: oidAt(blockedAt, rng),
        category: 'data',
        action: 'customer.blocked',
        actor: checker,
        entityType: 'customer',
        entityId,
        outcome: 'success',
        changes: [{ field: 'status', from: 'active', to: 'blocked' }],
        createdAt: blockedAt,
      })
    }
  }
  counters.cif = cifSeq

  // A few open block requests so the supervisors' approval queue isn't empty.
  const active = customers.filter((c) => c.status === 'active')
  for (let k = 0; k < 8; k++) {
    const c = active[active.length - 1 - k * 7]!
    const at = new Date(now.getTime() - int(rng, 1, 10) * DAY)
    approvals.push({
      _id: oidAt(at, rng),
      type: 'customer.block',
      entityType: 'customer',
      entityId: c.cif as string,
      branchCode: c.branchCode,
      reason: pick(rng, ['suspected_fraud', 'customer_request']),
      remarks: 'Customer reported unrecognised card transactions.',
      status: 'pending',
      requestedBy: c.createdBy,
      createdAt: at,
      updatedAt: at,
    })
  }

  applyStoryCustomers(customers, piiKey)
  return { customers, approvals, audit, counters }
}

/** The people shown in the mockups, so screens and docs line up with the data. */
function applyStoryCustomers(customers: Doc[], piiKey: string) {
  const byCif = (cif: string) => customers.find((c) => c.cif === cif)
  const patch = (
    cif: string,
    fn: (
      c: Doc & {
        personal: Record<string, unknown>
        kyc: Record<string, unknown>
        contact: Record<string, unknown>
      },
    ) => void,
  ) => {
    const c = byCif(cif)
    if (c) fn(c as never)
  }
  patch('CIF-000124', (c) => {
    Object.assign(c.personal, {
      title: 'mrs',
      firstName: 'Ananya',
      lastName: 'Rao',
      fatherOrSpouseName: 'Suresh Rao',
      gender: 'female',
      maritalStatus: 'married',
      dependants: 2,
      nationality: 'IN',
      countryOfBirth: 'IN',
      dob: new Date('1990-04-12'),
      occupation: 'salaried_private',
      employer: 'Kaveri Software Labs Pvt Ltd',
      monthlyIncome: 120_000,
      preferredLanguage: 'kn',
      productsOfInterest: ['savings', 'personal_loan'],
    })
    c.nameSearch = 'ananya rao'
    c.status = 'active'
    c.branchCode = '0001'
    c.contact.mobile = '+919845012312'
    c.contact.email = 'ananya.rao@example.com'
    Object.assign(c.kyc, {
      idType: 'passport',
      idNumberEnc: encryptField('W1234567', piiKey),
      idNumberIndex: blindIndex('W1234567', piiKey),
      idNumberLast4: '4567',
      issueDate: new Date('2022-02-03'),
      expiryDate: new Date('2032-02-02'),
      status: 'verified',
      pep: true,
      riskRating: 'medium',
      pepDetails: {
        position: 'BBMP ward corporator',
        country: 'IN',
        since: 2019,
        sourceOfWealth: 'Salary and family business income. Supporting letter attached.',
      },
    })
  })
  patch('CIF-000123', (c) => {
    Object.assign(c.personal, { firstName: 'Kiran', lastName: 'Gowda', gender: 'male', title: 'mr' })
    c.nameSearch = 'kiran gowda'
    c.contact.mobile = '+919901112370'
  })
  patch('CIF-000122', (c) => {
    Object.assign(c.personal, { firstName: 'Shreya', lastName: 'Hegde', gender: 'female', title: 'ms' })
    c.nameSearch = 'shreya hegde'
    c.status = 'active'
    c.kyc.status = 'verified'
  })
  patch('CIF-000121', (c) => {
    Object.assign(c.personal, { firstName: 'Manjunath', lastName: 'Shetty', gender: 'male', title: 'mr' })
    c.nameSearch = 'manjunath shetty'
    c.status = 'blocked'
    Object.assign(c.kyc, {
      idType: 'passport',
      status: 'expired',
      expiryDate: new Date('2026-09-22'),
      issueDate: new Date('2016-09-23'),
    })
  })
}

export interface GeneratedSrs {
  requests: Doc[]
  comments: Doc[]
  audit: Doc[]
  counters: Record<string, number>
}

export function generateServiceRequests(rng: Rng, count: number, customers: Doc[], now: Date): GeneratedSrs {
  const eligible = customers.filter((c) => c.status === 'active' || c.status === 'blocked')
  const categories = LOOKUPS.srCategories.map((c) => c.code)
  const subs = LOOKUPS.srSubCategories
  const times = Array.from({ length: count }, () => now.getTime() - rng() * 120 * DAY).sort((a, b) => a - b)
  const requests: Doc[] = []
  const comments: Doc[] = []
  const audit: Doc[] = []
  const counters: Record<string, number> = {}
  const staffName = (id: string) => STAFF.find((s) => s.staffId === id)?.name ?? id

  for (const t of times) {
    const createdAt = new Date(t)
    const ageDays = (now.getTime() - t) / DAY
    const customer = pick(rng, eligible) as Doc & { personal: { firstName: string; lastName: string } }
    const category = weighted(
      rng,
      categories.map((c) => [c, c === 'cards' || c === 'accounts' ? 3 : 2] as [string, number]),
    )
    const sub = pick(
      rng,
      subs.filter((s) => s.parent === category),
    )
    const priority = weighted<SrPriority>(rng, [
      ['low', 30],
      ['medium', 40],
      ['high', 22],
      ['critical', 8],
    ])
    const status = (
      ageDays < 3
        ? weighted(rng, [
            ['open', 70],
            ['in_progress', 30],
          ])
        : ageDays < 14
          ? weighted(rng, [
              ['open', 30],
              ['in_progress', 30],
              ['resolved', 30],
              ['closed', 10],
            ])
          : weighted(rng, [
              ['in_progress', 5],
              ['resolved', 25],
              ['closed', 70],
            ])
    ) as SrStatus
    const branchCode = customer.branchCode as BranchCode
    const assignee = csrFor(branchCode, rng).staffId
    const slaDueAt = new Date(t + SLA_HOURS[priority] * 3_600_000)
    const resolvedAt =
      status === 'resolved' || status === 'closed'
        ? new Date(Math.min(now.getTime() - 3_600_000, t + rng() * SLA_HOURS[priority] * 1.3 * 3_600_000))
        : undefined
    const closedAt =
      status === 'closed' && resolvedAt
        ? new Date(Math.min(now.getTime(), resolvedAt.getTime() + int(rng, 1, 3) * DAY))
        : undefined
    const year = createdAt.getFullYear()
    counters[`sr-${year}`] = (counters[`sr-${year}`] ?? 0) + 1
    const srNo = `SR-${year}-${String(counters[`sr-${year}`]).padStart(6, '0')}`
    const _id = oidAt(createdAt, rng)

    requests.push({
      _id,
      srNo,
      customerCif: customer.cif,
      customerName: `${customer.personal.firstName} ${customer.personal.lastName}`,
      branchCode,
      channel: weighted(rng, [
        ['branch', 45],
        ['phone', 25],
        ['email', 10],
        ['mobile_app', 20],
      ]),
      category,
      subCategory: sub.code,
      priority,
      slaDueAt,
      subject: pick(rng, SR_SUBJECTS[sub.code] ?? [sub.en]),
      description: `${sub.en} raised by the customer. Details were captured at the ${branchCode === '0001' ? 'MG Road' : branchCode === '0004' ? 'Jayanagar' : 'Whitefield'} branch.`,
      status,
      assignedTo: assignee,
      createdBy: assignee,
      ...(resolvedAt ? { resolvedAt, resolutionNotes: 'Resolved and confirmed with the customer.' } : {}),
      ...(closedAt ? { closedAt } : {}),
      notifyBySms: chance(rng, 0.8),
      createdAt,
      updatedAt: closedAt ?? resolvedAt ?? createdAt,
    })
    audit.push({
      _id: oidAt(createdAt, rng),
      category: 'data',
      action: 'serviceRequest.created',
      actor: assignee,
      entityType: 'serviceRequest',
      entityId: srNo,
      outcome: 'success',
      createdAt,
    })

    const end = (resolvedAt ?? now).getTime()
    const n = status === 'open' ? int(rng, 0, 1) : int(rng, 1, 3)
    const commentTimes = Array.from({ length: n }, () => t + rng() * (end - t)).sort((a, b) => a - b)
    for (const ct of commentTimes) {
      const at = new Date(ct)
      comments.push({
        _id: oidAt(at, rng),
        srNo,
        by: assignee,
        byName: staffName(assignee),
        text: pick(rng, COMMENTS),
        createdAt: at,
      })
    }
  }

  // Story request for Ananya Rao (CIF-000124): high priority, open and just past its SLA.
  const ananya = customers.find((c) => c.cif === 'CIF-000124')
  const recent = requests
    .filter((r) => now.getTime() - (r.createdAt as Date).getTime() > 25 * 3_600_000)
    .at(-1)
  if (ananya && recent) {
    Object.assign(recent, {
      customerCif: 'CIF-000124',
      customerName: 'Ananya Rao',
      branchCode: '0001',
      assignedTo: 'csr001',
      createdBy: 'csr001',
      category: 'cards',
      subCategory: 'card_blocked',
      priority: 'high',
      status: 'open',
      slaDueAt: new Date((recent.createdAt as Date).getTime() + SLA_HOURS.high * 3_600_000),
      subject: 'Card blocked after lost wallet',
      description:
        'Customer lost her wallet at Phoenix Marketcity, Whitefield. Debit card ending 2231 was blocked from the app. She needs a replacement card and confirmation that no UPI or card transactions went through after 18:00.',
      channel: 'branch',
    })
    delete recent.resolvedAt
    delete recent.closedAt
    delete recent.resolutionNotes
  }

  return { requests, comments, audit, counters }
}

// ── Teller data ──────────────────────────────────────────────────────────────

/** The customer fields the teller generator needs (read back from the database). */
export interface TellerSeedCustomer {
  cif: string
  status: string
  branchCode: BranchCode
  segment?: string
  name: string
  createdAt: Date
}

export interface GeneratedTellerData {
  accounts: Doc[]
  transactions: Doc[]
  drawers: Doc[]
  audit: Doc[]
  counters: Record<string, number>
}

const IST_OFFSET = 5.5 * 3_600_000
/** "2026-10-05" + IST hour → UTC Date. */
const istAt = (day: string, hour: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + hour * 3_600_000 - IST_OFFSET)

/**
 * Accounts for every customer with a CIF, then 30 days of counter history per teller:
 * a drawer per business day (Mon–Sat), cash deposits and withdrawals, a few large
 * withdrawals authorised (or rejected) by the branch supervisor, one drawer that closed
 * ₹500 short, and the last day's drawers closed but not yet signed off. Today has no drawer,
 * so each teller starts by opening one.
 */
export function generateTellerData(
  rng: Rng,
  customers: TellerSeedCustomer[],
  now: Date,
): GeneratedTellerData {
  const accounts: Doc[] = []
  const transactions: Doc[] = []
  const drawers: Doc[] = []
  const audit: Doc[] = []
  const counters: Record<string, number> = {}

  for (const c of [...customers].sort((a, b) => a.cif.localeCompare(b.cif))) {
    const n = c.status === 'active' && chance(rng, 0.25) ? 2 : 1
    for (let k = 0; k < n; k++) {
      const type = k === 0 && chance(rng, 0.92) ? 'savings' : 'current'
      const key = `acct-${c.branchCode}-${type}`
      counters[key] = (counters[key] ?? 0) + 1
      const status =
        c.status === 'blocked'
          ? 'frozen'
          : c.status === 'closed'
            ? 'closed'
            : weighted(rng, [
                ['active', 90],
                ['dormant', 7],
                ['frozen', 3],
              ] as const)
      const [lo, hi] =
        c.segment === 'private'
          ? [5_00_000, 1_00_00_000]
          : c.segment === 'premier'
            ? [50_000, 15_00_000]
            : [2_000, 2_00_000]
      const openedAt = new Date(
        Math.min(now.getTime() - 40 * DAY, c.createdAt.getTime() + int(rng, 1, 30) * DAY),
      )
      accounts.push({
        _id: oidAt(openedAt, rng),
        accountNo: `${c.branchCode}${type === 'savings' ? '10' : '20'}${String(counters[key]).padStart(6, '0')}`,
        cif: c.cif,
        customerName: c.name,
        branchCode: c.branchCode,
        type,
        status,
        balance: status === 'closed' ? 0 : rupees(int(rng, lo, hi)) + int(rng, 0, 99),
        openedAt,
        createdAt: openedAt,
        updatedAt: openedAt,
        __v: 0,
      })
    }
  }

  const tellers = STAFF.filter((s) => s.roleKey === 'teller' && s.status !== 'deactivated')
  const today = businessDate(now)
  const days: string[] = []
  for (let i = 30; i >= 1; i--) {
    const day = businessDate(new Date(now.getTime() - i * DAY))
    if (new Date(`${day}T12:00:00Z`).getUTCDay() !== 0 && day !== today && !days.includes(day)) days.push(day)
  }
  const lastDay = days.at(-1)
  const shortDay = days.at(-6)

  for (const day of days) {
    for (const teller of tellers) {
      const supervisor = supervisorFor(teller.branchCode).staffId
      const usable = accounts.filter((a) => a.branchCode === teller.branchCode && a.status === 'active')
      const drawerId = oidAt(istAt(day, 9.5), rng)
      const openingAmount = rupees(int(rng, 10, 20) * 10_000)
      let cashIn = 0
      let cashOut = 0
      const openedAt = istAt(day, 9.5)
      const count = int(rng, 8, 20)
      const times = Array.from({ length: count }, () => 10 + rng() * 6).sort((a, b) => a - b)
      for (const hour of times) {
        const account = pick(rng, usable)
        const at = istAt(day, hour)
        const year = Number(day.slice(0, 4))
        const deposit = chance(rng, 0.55)
        const large = !deposit && chance(rng, 0.06)
        const amountRupees = large
          ? int(rng, 51, 120) * 1_000
          : int(rng, 5, 450) * 100 + (chance(rng, 0.2) ? 50 : 0)
        const amount = rupees(amountRupees)
        const cash = openingAmount + cashIn - cashOut
        if (!deposit && (amount > (account.balance as number) || amount > cash)) continue
        const rejected = large && chance(rng, 0.3)
        counters[`txn-${year}`] = (counters[`txn-${year}`] ?? 0) + 1
        const txnNo = `TXN-${year}-${String(counters[`txn-${year}`]).padStart(6, '0')}`
        let balanceAfter: number | undefined
        if (!rejected) {
          account.balance = (account.balance as number) + (deposit ? amount : -amount)
          balanceAfter = account.balance as number
          if (deposit) cashIn += amount
          else cashOut += amount
        }
        const decided = amount > CASH_WITHDRAWAL_AUTH_LIMIT && !deposit
        transactions.push({
          _id: oidAt(at, rng),
          txnNo,
          accountNo: account.accountNo,
          cif: account.cif,
          customerName: account.customerName,
          branchCode: teller.branchCode,
          type: deposit ? 'cash_deposit' : 'cash_withdrawal',
          amount,
          denominations: suggestDenominations(amountRupees),
          narration: deposit
            ? pick(rng, ['Self deposit', 'Shop takings', 'Rent received', '']) || undefined
            : undefined,
          status: rejected ? 'rejected' : 'posted',
          tellerId: teller.staffId,
          drawerId,
          businessDate: day,
          ...(balanceAfter !== undefined ? { balanceAfter } : {}),
          ...(decided
            ? {
                decidedBy: supervisor,
                decidedAt: new Date(at.getTime() + 8 * 60_000),
                ...(rejected ? { decisionNote: 'Signature on the withdrawal slip does not match.' } : {}),
              }
            : {}),
          createdAt: at,
          updatedAt: at,
          __v: 0,
        })
      }

      const expected = openingAmount + cashIn - cashOut
      const short = day === shortDay && teller.staffId === 'tel001'
      const countedAmount = short ? expected - rupees(500) : expected
      const closedAt = istAt(day, 16.5)
      const signed = day !== lastDay
      drawers.push({
        _id: drawerId,
        tellerId: teller.staffId,
        branchCode: teller.branchCode,
        businessDate: day,
        status: signed ? 'signed_off' : 'closed',
        opening: suggestDenominations(openingAmount / 100),
        openingAmount,
        cashIn,
        cashOut,
        counted: suggestDenominations(countedAmount / 100),
        countedAmount,
        variance: countedAmount - expected,
        ...(short ? { varianceReason: 'Short by one ₹500 note. Reported to the branch manager.' } : {}),
        openedAt,
        closedAt,
        ...(signed
          ? {
              signedOffBy: supervisor,
              signedOffAt: istAt(day, 17),
              ...(short ? { signOffNote: 'Shortage recovered from the teller as per branch policy.' } : {}),
            }
          : {}),
        createdAt: openedAt,
        updatedAt: closedAt,
        __v: signed ? 2 : 1,
      })
      for (const [action, at, who] of [
        ['drawer.opened', openedAt, teller.staffId],
        ['drawer.closed', closedAt, teller.staffId],
        ...(signed ? [['drawer.signedOff', istAt(day, 17), supervisor]] : []),
      ] as [string, Date, string][]) {
        audit.push({
          _id: oidAt(at, rng),
          category: 'data',
          action,
          actor: who,
          entityType: 'drawer',
          entityId: String(drawerId),
          outcome: 'success',
          createdAt: at,
        })
      }
      if (denominationTotal(suggestDenominations(countedAmount / 100)) !== countedAmount)
        throw new Error('breakdown mismatch')
    }
  }

  return { accounts, transactions, drawers, audit, counters }
}
