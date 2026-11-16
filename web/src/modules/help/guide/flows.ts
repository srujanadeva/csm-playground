// The user guide's flows, by persona. Structure lives here; the words live in
// locales/<lang>/help.json under flows.<id>. Both the in-app Help centre and docs/user-guide.md
// (npm run guide:md) are built from these, so they can't drift apart. No React imports: the
// generator runs in Node.
import type { LocatorStyle } from '../../../lib/locators.ts'

export const PERSONAS = ['visitor', 'csr', 'teller', 'supervisor', 'admin', 'everyone'] as const
export type Persona = (typeof PERSONAS)[number]

/** Demo sign-in for each persona (see README "Staff users"). */
export const DEMO_LOGIN: Record<Persona, string | null> = {
  visitor: null,
  csr: 'csr001',
  teller: 'tel001',
  supervisor: 'sup001',
  admin: 'admin001',
  everyone: 'csr001',
}

export interface GuideElement {
  /** Key under help.json `elements`. */
  key: string
  locator: LocatorStyle
}

export interface GuideFlow {
  id: string
  personas: Persona[]
  /** Where the flow starts (a route in the app). */
  route: string
  /** Files under testresources/ the flow uses. */
  samples?: string[]
  elements: GuideElement[]
  /** The plan phase that added it. */
  phase: number
}

export const FLOWS: GuideFlow[] = [
  {
    id: 'cookieConsent',
    personas: ['visitor'],
    route: '/login',
    elements: [{ key: 'cookieBanner', locator: 'TXT' }],
    phase: 1,
  },
  {
    id: 'requestAccess',
    personas: ['visitor'],
    route: '/request-access',
    elements: [
      { key: 'signupForm', locator: 'NAME' },
      { key: 'termsCheckboxes', locator: 'NAME' },
      { key: 'maskedMobile', locator: 'NAME' },
      { key: 'termsModal', locator: 'TXT' },
    ],
    phase: 1,
  },
  {
    id: 'forgotPassword',
    personas: ['visitor'],
    route: '/forgot-password',
    elements: [
      { key: 'forgotForm', locator: 'LBL' },
      { key: 'otpBoxes', locator: 'DYN' },
      { key: 'countdown', locator: 'TXT' },
      { key: 'passwordToggle', locator: 'ARIA' },
    ],
    phase: 1,
  },
  {
    id: 'devInbox',
    personas: ['visitor', 'everyone'],
    route: '/dev/inbox',
    elements: [{ key: 'inboxTable', locator: 'XP' }],
    phase: 1,
  },
  {
    id: 'decideAccessRequest',
    personas: ['admin'],
    route: '/admin/users',
    elements: [
      { key: 'requestRows', locator: 'DATA' },
      { key: 'decisionModal', locator: 'DATA' },
    ],
    phase: 1,
  },
  {
    id: 'commandPalette',
    personas: ['everyone'],
    route: '/dashboard',
    elements: [{ key: 'palette', locator: 'ARIA' }],
    phase: 1,
  },
  {
    id: 'sidebar',
    personas: ['everyone'],
    route: '/dashboard',
    elements: [
      { key: 'navGroups', locator: 'ARIA' },
      { key: 'pagesGroup', locator: 'TXT' },
    ],
    phase: 1,
  },
  {
    id: 'announcements',
    personas: ['everyone'],
    route: '/dashboard',
    elements: [{ key: 'announcementBar', locator: 'CLS' }],
    phase: 1,
  },
  {
    id: 'breadcrumbs',
    personas: ['everyone'],
    route: '/customers',
    elements: [{ key: 'breadcrumbLinks', locator: 'XP' }],
    phase: 1,
  },
]
