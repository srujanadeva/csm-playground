/**
 * Effective permissions and the navigation menu for a user (OWASP A01).
 *
 * Screens and roles change rarely, so they are cached in memory for 30 seconds; every admin
 * change calls `invalidateAccessCache()` so it applies on the next request.
 */
import {
  resolvePermissions,
  type Capability,
  type EffectivePermissions,
  type NavItem,
  type ScreenSettings,
} from '@csm/shared'
import { RoleModel } from './role.model.ts'
import { ScreenModel } from './screen.model.ts'

const TTL_MS = 30_000

interface CachedScreen extends NavItem, ScreenSettings {
  inNav: boolean
  adminOnly: boolean
  enabled: boolean
  capabilities: Capability[]
}

interface AccessData {
  screens: CachedScreen[]
  roles: Map<string, { screenKey: string; capabilities: Capability[] }[]>
  loadedAt: number
}

let cache: AccessData | null = null

/** Drops the cache so the next request reloads screens and roles. */
export function invalidateAccessCache(): void {
  cache = null
}

/** Screens (sorted by menu order) and role grants, from the cache when fresh. */
export async function getAccessData(): Promise<AccessData> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache
  const [screens, roles] = await Promise.all([
    ScreenModel.find().sort({ order: 1 }).lean(),
    RoleModel.find().lean(),
  ])
  cache = {
    screens: screens.map((s) => ({
      key: s.key,
      route: s.route,
      navGroup: (s.navGroup ?? null) as NavItem['navGroup'],
      labels: { en: s.labels?.en ?? s.key, kn: s.labels?.kn ?? s.key },
      icon: s.icon,
      order: s.order,
      inNav: s.inNav,
      adminOnly: s.adminOnly,
      enabled: s.enabled,
      capabilities: s.capabilities as Capability[],
      unauthorisedMode: s.unauthorisedMode as 'hide' | 'disable',
      defaultPageSize: s.defaultPageSize,
      maxPageSize: s.maxPageSize,
    })),
    roles: new Map(
      roles.map((r) => [
        r.key,
        r.grants.map((g) => ({ screenKey: g.screenKey, capabilities: g.capabilities as Capability[] })),
      ]),
    ),
    loadedAt: Date.now(),
  }
  return cache
}

export interface UserAccess {
  permissions: EffectivePermissions
  nav: NavItem[]
  screens: Record<string, ScreenSettings>
}

/** Resolves what a user can do and which menu entries they see. */
export async function accessFor(user: {
  roleKey: string
  overrides?: { screenKey: string; grant: string[]; revoke: string[] }[]
}): Promise<UserAccess> {
  const data = await getAccessData()
  const overrides = (user.overrides ?? []).map((o) => ({
    screenKey: o.screenKey,
    grant: o.grant as Capability[],
    revoke: o.revoke as Capability[],
  }))
  const permissions = resolvePermissions(
    user.roleKey,
    data.roles.get(user.roleKey) ?? [],
    overrides,
    data.screens,
  )
  const visible = data.screens.filter((s) => permissions[s.key])
  return {
    permissions,
    nav: visible
      .filter((s) => s.inNav)
      .map(({ key, route, navGroup, labels, icon, order }) => ({
        key,
        route,
        navGroup,
        labels,
        icon,
        order,
      })),
    screens: Object.fromEntries(
      visible.map((s) => [
        s.key,
        {
          unauthorisedMode: s.unauthorisedMode,
          defaultPageSize: s.defaultPageSize,
          maxPageSize: s.maxPageSize,
        },
      ]),
    ),
  }
}

/** The configured maximum page size for a screen (100 if unknown). */
export async function maxPageSizeFor(screenKey: string): Promise<number> {
  const data = await getAccessData()
  return data.screens.find((s) => s.key === screenKey)?.maxPageSize ?? 100
}
