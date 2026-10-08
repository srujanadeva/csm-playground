/**
 * Response shapes shared by the API and the web app. The server builds these DTOs from its
 * models; the web app reads them. Keeping them here makes contract changes a type error.
 */
import type { Capability, EffectivePermissions, NavGroup } from './permissions.ts'
import type { Denominations } from './teller.ts'
import type {
  AccountStatus,
  AccountType,
  BranchCode,
  CustomerStatus,
  IdType,
  KycStatus,
  DrawerStatus,
  Language,
  RiskRating,
  SrPriority,
  SrStatus,
  StaffStatus,
  TxnStatus,
  TxnType,
} from './enums.ts'

export interface Labels {
  en: string
  kn: string
}

export interface NavItem {
  key: string
  route: string
  navGroup: NavGroup | null
  labels: Labels
  icon: string
  order: number
}

export interface ScreenSettings {
  unauthorisedMode: 'hide' | 'disable'
  defaultPageSize: number
  maxPageSize: number
}

export interface MeResponse {
  user: {
    staffId: string
    name: string
    roleKey: string
    branchCode: BranchCode
    preferredLanguage: Language
    mustChangePassword: boolean
    lastLoginAt: string | null
  }
  permissions: EffectivePermissions
  nav: NavItem[]
  screens: Record<string, ScreenSettings>
  session: { idleTimeoutSeconds: number; expiresAt: string; permVersion: number }
}

export interface LookupItem {
  code: string
  labels: Labels
  parent: string | null
}

export interface CustomerListItem {
  ref: string
  cif: string | null
  draftNo: string | null
  name: string
  mobile: string
  status: CustomerStatus
  kycStatus: KycStatus
  kycExpiryDate: string | null
  branchCode: BranchCode
  createdAt: string
}

export interface AddressDTO {
  line1: string
  line2?: string
  locality: string
  city: string
  state: string
  pincode: string
  country: string
}

export interface DocumentDTO {
  id: string
  kind: string
  fileName: string
  mime: string
  size: number
  uploadedBy: string
  uploadedAt: string
}

export interface CustomerDetail {
  ref: string
  cif: string | null
  draftNo: string | null
  status: CustomerStatus
  type: string
  segment: string
  branchCode: BranchCode
  version: number
  personal: Record<string, unknown> & { firstName?: string; lastName?: string }
  contact: { mobile?: string; altMobile?: string; email?: string; commPrefs?: string[] }
  addresses: { permanent?: AddressDTO; mailingSameAsPermanent?: boolean; mailing?: AddressDTO }
  kyc: {
    idType?: IdType
    idNumberMasked?: string
    issueDate?: string
    expiryDate?: string
    pep?: boolean
    pepDetails?: Record<string, unknown>
    fatcaUsPerson?: boolean
    riskRating?: RiskRating
    status?: KycStatus
    verifiedAt?: string
  }
  documents: DocumentDTO[]
  pendingApproval: { id: string; type: string; requestedBy: string; createdAt: string } | null
  piiMasked: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

/** Draft data in the wizard's own form shape, so a saved draft can be resumed exactly. */
export interface CustomerDraftForm {
  ref: string
  draftNo: string | null
  cif: string | null
  status: CustomerStatus
  version: number
  personal: Record<string, unknown>
  contact: Record<string, unknown>
  kyc: Record<string, unknown>
  /** Calculated from the answers; read-only, so it is not part of any form section. */
  riskRating: RiskRating | null
  documents: DocumentDTO[]
  updatedAt: string
}

export interface CustomerTypeaheadItem {
  cif: string
  name: string
  mobile: string
  branchCode: BranchCode
}

export interface AuditEntryDTO {
  id: string
  category: string
  action: string
  outcome: string
  actor: string
  entityType?: string
  entityId?: string
  changes?: { field: string; from: unknown; to: unknown }[]
  createdAt: string
}

export interface ApprovalDTO {
  id: string
  type: string
  entityId: string
  customerName: string
  branchCode: BranchCode
  reason?: string
  remarks?: string
  status: string
  requestedBy: string
  decidedBy?: string
  createdAt: string
}

export interface ServiceRequestCard {
  srNo: string
  subject: string
  customerCif: string
  customerName: string
  priority: SrPriority
  status: SrStatus
  slaDueAt: string
  assignedTo: string | null
  createdAt: string
  version: number
}

export interface ServiceRequestDetail extends ServiceRequestCard {
  branchCode: BranchCode
  channel: string
  category: string
  subCategory: string
  description: string
  resolutionNotes: string | null
  createdBy: string
  resolvedAt: string | null
  closedAt: string | null
  notifyBySms: boolean
  attachments: DocumentDTO[]
}

export interface CommentDTO {
  id: string
  by: string
  byName: string
  text: string
  createdAt: string
}

export interface StaffUserDTO {
  id: string
  staffId: string
  name: string
  email: string | null
  roleKey: string
  branchCode: BranchCode
  status: StaffStatus
  overrides: { screenKey: string; grant: Capability[]; revoke: Capability[] }[]
  mustChangePassword: boolean
  lastLoginAt: string | null
  locked: boolean
}

export interface ScreenDTO extends NavItem, ScreenSettings {
  inNav: boolean
  adminOnly: boolean
  enabled: boolean
  capabilities: Capability[]
  version: number
  roles: string[]
  updatedAt: string
}

export interface RoleDTO {
  key: string
  names: Labels
  grants: { screenKey: string; capabilities: Capability[] }[]
}

export interface DashboardSummary {
  myOpenRequests: number
  overdueRequests: number
  pendingApprovals: number | null
  customersInScope: number
  draftsByMe: number
}

// ── Teller (all amounts in paise) ───────────────────────────────────────────────

export interface AccountSearchItem {
  accountNo: string
  type: AccountType
  status: AccountStatus
  cif: string
  customerName: string
  branchCode: BranchCode
}

export interface AccountDTO extends AccountSearchItem {
  balance: number
  customerStatus: CustomerStatus
  kycStatus: KycStatus
  mobile: string
  /** The customer's KYC ID is a PAN, so large deposits don't need one entered. */
  panOnFile: boolean
  openedAt: string
  piiMasked: boolean
}

export interface TransactionDTO {
  txnNo: string
  accountNo: string
  cif: string
  customerName: string
  type: TxnType
  amount: number
  denominations: Denominations
  narration: string | null
  /** Last 4 characters of a PAN entered at the counter. */
  panLast4: string | null
  status: TxnStatus
  tellerId: string
  branchCode: BranchCode
  balanceAfter: number | null
  decidedBy: string | null
  decidedAt: string | null
  decisionNote: string | null
  createdAt: string
}

export interface DrawerDTO {
  id: string
  tellerId: string
  tellerName: string
  branchCode: BranchCode
  businessDate: string
  status: DrawerStatus
  opening: Denominations
  openingAmount: number
  cashIn: number
  cashOut: number
  expected: number
  counted: Denominations | null
  countedAmount: number | null
  variance: number | null
  varianceReason: string | null
  postedCount: number
  pendingCount: number
  openedAt: string
  closedAt: string | null
  signedOffBy: string | null
  signedOffAt: string | null
  signOffNote: string | null
  version: number
}
