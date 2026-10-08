// Screens, capabilities and the default role templates. The database copy of screens and
// roles is seeded from here; after that, admins change them from the Admin screens.

export const CAPABILITIES = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'viewPII'] as const
export type Capability = (typeof CAPABILITIES)[number]

export const NAV_GROUPS = ['customers', 'serviceRequests', 'teller', 'admin', 'accounts', 'cards'] as const
export type NavGroup = (typeof NAV_GROUPS)[number]

export interface ScreenDefinition {
  key: string
  route: string
  navGroup: NavGroup | null
  labels: { en: string; kn: string }
  icon: string
  order: number
  /** Shown as a menu entry (detail pages like Customer 360 are reached from other screens). */
  inNav: boolean
  /** Only users whose role is admin can ever be granted this screen. */
  adminOnly: boolean
  enabled: boolean
  capabilities: Capability[]
  unauthorisedMode: 'hide' | 'disable'
  defaultPageSize: number
  maxPageSize: number
}

export const SCREENS: ScreenDefinition[] = [
  {
    key: 'dashboard',
    route: '/dashboard',
    navGroup: null,
    labels: { en: 'Dashboard', kn: 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್' },
    icon: 'home',
    order: 10,
    inNav: true,
    adminOnly: false,
    enabled: true,
    capabilities: ['view'],
    unauthorisedMode: 'hide',
    defaultPageSize: 25,
    maxPageSize: 100,
  },
  {
    key: 'customers.onboard',
    route: '/customers/new',
    navGroup: 'customers',
    labels: { en: 'Onboard customer', kn: 'ಗ್ರಾಹಕರ ನೋಂದಣಿ' },
    icon: 'user-plus',
    order: 20,
    inNav: true,
    adminOnly: false,
    enabled: true,
    capabilities: ['view', 'create', 'edit'],
    unauthorisedMode: 'hide',
    defaultPageSize: 25,
    maxPageSize: 100,
  },
  {
    key: 'customers.search',
    route: '/customers',
    navGroup: 'customers',
    labels: { en: 'Customer search', kn: 'ಗ್ರಾಹಕರ ಹುಡುಕಾಟ' },
    icon: 'search',
    order: 30,
    inNav: true,
    adminOnly: false,
    enabled: true,
    capabilities: ['view', 'export', 'viewPII'],
    unauthorisedMode: 'hide',
    defaultPageSize: 25,
    maxPageSize: 100,
  },
  {
    key: 'customers.360',
    route: '/customers/:cif',
    navGroup: 'customers',
    labels: { en: 'Customer 360', kn: 'ಗ್ರಾಹಕ 360' },
    icon: 'user',
    order: 40,
    inNav: false,
    adminOnly: false,
    enabled: true,
    capabilities: ['view', 'edit', 'approve', 'viewPII'],
    unauthorisedMode: 'disable',
    defaultPageSize: 25,
    maxPageSize: 100,
  },
  {
    key: 'serviceRequests.new',
    route: '/service-requests/new',
    navGroup: 'serviceRequests',
    labels: { en: 'New request', kn: 'ಹೊಸ ವಿನಂತಿ' },
    icon: 'plus',
    order: 50,
    inNav: true,
    adminOnly: false,
    enabled: true,
    capabilities: ['view', 'create'],
    unauthorisedMode: 'hide',
    defaultPageSize: 25,
    maxPageSize: 100,
  },
  {
    key: 'serviceRequests.board',
    route: '/service-requests',
    navGroup: 'serviceRequests',
    labels: { en: 'Request board', kn: 'ವಿನಂತಿ ಫಲಕ' },
    icon: 'board',
    order: 60,
    inNav: true,
    adminOnly: false,
    enabled: true,
    capabilities: ['view', 'edit', 'approve', 'export'],
    unauthorisedMode: 'disable',
    defaultPageSize: 25,
    maxPageSize: 100,
  },
  {
    key: 'teller.counter',
    route: '/teller',
    navGroup: 'teller',
    labels: { en: 'Teller counter', kn: 'ಕ್ಯಾಷ್ ಕೌಂಟರ್' },
    icon: 'cash',
    order: 64,
    inNav: true,
    adminOnly: false,
    enabled: true,
    capabilities: ['view', 'create', 'approve', 'viewPII'],
    unauthorisedMode: 'hide',
    defaultPageSize: 25,
    maxPageSize: 100,
  },
  {
    key: 'teller.drawer',
    route: '/teller/drawer',
    navGroup: 'teller',
    labels: { en: 'Cash drawer', kn: 'ನಗದು ಪೆಟ್ಟಿಗೆ' },
    icon: 'drawer',
    order: 66,
    inNav: true,
    adminOnly: false,
    enabled: true,
    capabilities: ['view', 'create', 'edit', 'approve'],
    unauthorisedMode: 'hide',
    defaultPageSize: 25,
    maxPageSize: 100,
  },
  {
    key: 'admin.users',
    route: '/admin/users',
    navGroup: 'admin',
    labels: { en: 'Users & access', kn: 'ಬಳಕೆದಾರರು ಮತ್ತು ಪ್ರವೇಶ' },
    icon: 'users',
    order: 70,
    inNav: true,
    adminOnly: true,
    enabled: true,
    capabilities: ['view', 'create', 'edit'],
    unauthorisedMode: 'hide',
    defaultPageSize: 25,
    maxPageSize: 100,
  },
  {
    key: 'admin.screens',
    route: '/admin/screens',
    navGroup: 'admin',
    labels: { en: 'Screen configuration', kn: 'ಪರದೆ ಸಂರಚನೆ' },
    icon: 'sliders',
    order: 80,
    inNav: true,
    adminOnly: true,
    enabled: true,
    capabilities: ['view', 'edit'],
    unauthorisedMode: 'hide',
    defaultPageSize: 25,
    maxPageSize: 100,
  },
  // Placeholders for later modules: seeded switched off.
  {
    key: 'accounts',
    route: '/accounts',
    navGroup: 'accounts',
    labels: { en: 'Accounts', kn: 'ಖಾತೆಗಳು' },
    icon: 'wallet',
    order: 90,
    inNav: true,
    adminOnly: false,
    enabled: false,
    capabilities: ['view', 'create', 'edit', 'approve'],
    unauthorisedMode: 'hide',
    defaultPageSize: 25,
    maxPageSize: 100,
  },
  {
    key: 'cards',
    route: '/cards',
    navGroup: 'cards',
    labels: { en: 'Cards', kn: 'ಕಾರ್ಡ್‌ಗಳು' },
    icon: 'card',
    order: 100,
    inNav: true,
    adminOnly: false,
    enabled: false,
    capabilities: ['view', 'edit', 'approve'],
    unauthorisedMode: 'hide',
    defaultPageSize: 25,
    maxPageSize: 100,
  },
]

export type RoleKey = 'admin' | 'supervisor' | 'csr' | 'teller'

export interface Grant {
  screenKey: string
  capabilities: Capability[]
}

export interface RoleDefinition {
  key: RoleKey
  names: { en: string; kn: string }
  grants: Grant[]
}

const all = (key: string): Grant => ({
  screenKey: key,
  capabilities: SCREENS.find((s) => s.key === key)?.capabilities ?? [],
})

export const ROLES: RoleDefinition[] = [
  {
    key: 'admin',
    names: { en: 'Administrator', kn: 'ನಿರ್ವಾಹಕ' },
    grants: SCREENS.map((s) => all(s.key)),
  },
  {
    key: 'supervisor',
    names: { en: 'Supervisor', kn: 'ಮೇಲ್ವಿಚಾರಕ' },
    grants: SCREENS.filter((s) => !s.adminOnly).map((s) => all(s.key)),
  },
  {
    key: 'csr',
    names: { en: 'Customer service rep', kn: 'ಗ್ರಾಹಕ ಸೇವಾ ಪ್ರತಿನಿಧಿ' },
    grants: [
      { screenKey: 'dashboard', capabilities: ['view'] },
      { screenKey: 'customers.onboard', capabilities: ['view', 'create', 'edit'] },
      { screenKey: 'customers.search', capabilities: ['view'] },
      { screenKey: 'customers.360', capabilities: ['view', 'edit'] },
      { screenKey: 'serviceRequests.new', capabilities: ['view', 'create'] },
      { screenKey: 'serviceRequests.board', capabilities: ['view', 'edit'] },
    ],
  },
  {
    key: 'teller',
    names: { en: 'Teller', kn: 'ಕ್ಯಾಷಿಯರ್' },
    grants: [
      { screenKey: 'dashboard', capabilities: ['view'] },
      { screenKey: 'customers.search', capabilities: ['view'] },
      { screenKey: 'customers.360', capabilities: ['view'] },
      { screenKey: 'teller.counter', capabilities: ['view', 'create'] },
      { screenKey: 'teller.drawer', capabilities: ['view', 'create', 'edit'] },
    ],
  },
]

export interface Override {
  screenKey: string
  grant: Capability[]
  revoke: Capability[]
}

/** Screen key → capabilities the user actually has. Screens with no capabilities are left out. */
export type EffectivePermissions = Record<string, Capability[]>

type ScreenLike = Pick<ScreenDefinition, 'key' | 'enabled' | 'adminOnly' | 'capabilities'>

/**
 * Effective permissions = (role grants ∪ user grants) − user revokes, limited to what each
 * screen offers, and only for enabled screens. Admin-only screens need the admin role, so a
 * per-user grant can never hand them to anyone else. Capabilities without `view` are dropped:
 * an action on a screen you can't open is meaningless.
 */
export function resolvePermissions(
  roleKey: string,
  roleGrants: Grant[],
  overrides: Override[],
  screens: ScreenLike[],
): EffectivePermissions {
  const result: EffectivePermissions = {}
  for (const screen of screens) {
    if (!screen.enabled) continue
    if (screen.adminOnly && roleKey !== 'admin') continue
    const caps = new Set<Capability>(roleGrants.find((g) => g.screenKey === screen.key)?.capabilities ?? [])
    const override = overrides.find((o) => o.screenKey === screen.key)
    override?.grant.forEach((c) => caps.add(c))
    override?.revoke.forEach((c) => caps.delete(c))
    const offered = screen.capabilities.filter((c) => caps.has(c))
    if (offered.includes('view')) result[screen.key] = offered
  }
  return result
}

export function can(perms: EffectivePermissions, screenKey: string, capability: Capability): boolean {
  return perms[screenKey]?.includes(capability) ?? false
}
