/**
 * Admin rules (OWASP A01): staff users, per-user access, screens and roles.
 *
 * Safety rails: admins can't remove their own admin role or deactivate themselves, admin
 * screens can't be switched off or taken from the admin role, and overrides can only use
 * capabilities a screen offers. Every change is audited and applies on the next request.
 */
import type { Request } from 'express'
import type { z } from 'zod'
import {
  CAPABILITIES,
  type Capability,
  type OffsetPage,
  type RoleDTO,
  type ScreenDTO,
  type StaffUserDTO,
  type createUserSchema,
  type screenOrderSchema,
  type screenRolesSchema,
  type updateScreenSchema,
  type updateUserSchema,
  type userListQuery,
} from '@csm/shared'
import { audit, diff } from '../../lib/audit.ts'
import { conflict, notFound, staleVersion, validationFailed } from '../../lib/errors.ts'
import { clampPageSize, parseSort } from '../../lib/pagination.ts'
import { hashPassword, oneTimePassword } from '../../lib/password.ts'
import { op } from '../../lib/query.ts'
import { escapeRegex } from '../../lib/regex.ts'
import { StaffUserModel } from '../auth/staffUser.model.ts'
import { accessFor, invalidateAccessCache } from './access.ts'
import { RoleModel } from './role.model.ts'
import { ScreenModel } from './screen.model.ts'

/* eslint-disable @typescript-eslint/no-explicit-any -- lean documents from Mongoose. */
type Rec = Record<string, any>

const me = (req: Request) => req.auth!.user.staffId
const adminAudit = (
  req: Request,
  action: string,
  entityType: string,
  entityId: string,
  changes?: { field: string; from: unknown; to: unknown }[],
) =>
  audit(
    {
      category: 'admin',
      action,
      actor: me(req),
      entityType,
      entityId,
      ...(changes?.length ? { changes } : {}),
    },
    req,
  )

function toUserDTO(u: Rec): StaffUserDTO {
  return {
    id: String(u._id),
    staffId: u.staffId,
    name: u.name,
    email: u.email ?? null,
    roleKey: u.roleKey,
    branchCode: u.branchCode,
    status: u.status,
    overrides: (u.overrides ?? []).map((o: Rec) => ({
      screenKey: o.screenKey,
      grant: o.grant ?? [],
      revoke: o.revoke ?? [],
    })),
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null,
    locked: u.status === 'locked',
  }
}

async function findUser(staffId: string) {
  const user = await StaffUserModel.findOne({ staffId })
  if (!user) throw notFound('User not found.')
  return user
}

// ── Users ────────────────────────────────────────────────────────────────────

/** Staff list with search, filters and page-number pagination. */
export async function listUsers(q: z.infer<typeof userListQuery>): Promise<OffsetPage<StaffUserDTO>> {
  const filter: Record<string, unknown> = {}
  if (q.q) {
    const t = escapeRegex(q.q)
    filter.$or = [
      { staffId: op({ $regex: `^${t.toLowerCase()}` }) },
      { name: op({ $regex: t, $options: 'i' }) },
    ]
  }
  if (q.role) filter.roleKey = q.role
  if (q.status) filter.status = q.status
  const pageSize = clampPageSize(q.pageSize, 100)
  const sort = parseSort(q.sort, ['staffId', 'name', 'roleKey', 'status', 'lastLoginAt'], {
    staffId: 1,
    _id: 1,
  })
  const [rows, total] = await Promise.all([
    StaffUserModel.find(filter)
      .sort(sort)
      .skip((q.page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    StaffUserModel.countDocuments(filter),
  ])
  return { items: rows.map(toUserDTO), page: q.page, pageSize, total }
}

/** One user plus their effective permissions, for the access drawer. */
export async function getUser(staffId: string) {
  const user = await StaffUserModel.findOne({ staffId }).lean()
  if (!user) throw notFound('User not found.')
  const role = await RoleModel.findOne({ key: user.roleKey }).lean()
  const access = await accessFor(user)
  return {
    user: toUserDTO(user),
    roleGrants: (role?.grants ?? []).map((g) => ({
      screenKey: g.screenKey,
      capabilities: g.capabilities as Capability[],
    })),
    effective: access.permissions,
  }
}

/** Creates a user with a one-time password, returned once and never stored in plain text. */
export async function createUser(req: Request, input: z.infer<typeof createUserSchema>) {
  if (await StaffUserModel.exists({ staffId: input.staffId })) {
    throw validationFailed([
      { path: 'staffId', code: 'invalid', message: 'That staff ID is already in use.' },
    ])
  }
  const password = oneTimePassword()
  const user = await StaffUserModel.create({
    ...input,
    passwordHash: await hashPassword(password),
    mustChangePassword: true,
  })
  await adminAudit(req, 'admin.user.created', 'staffUser', user.staffId, [
    { field: 'roleKey', from: null, to: user.roleKey },
  ])
  return { user: toUserDTO(user.toObject()), oneTimePassword: password }
}

/** Updates name, email, role, branch and per-user overrides. */
export async function updateUser(req: Request, staffId: string, input: z.infer<typeof updateUserSchema>) {
  const user = await findUser(staffId)
  if (staffId === me(req) && input.roleKey && input.roleKey !== 'admin') {
    throw conflict("You can't remove your own admin role. Ask another administrator.", {
      code: 'self_protection',
    })
  }
  if (input.overrides) await checkOverrides(input.overrides)
  const before = toUserDTO(user.toObject()) as unknown as Rec
  user.set(Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)))
  // Keep only overrides that change something.
  if (input.overrides)
    user.set(
      'overrides',
      input.overrides.filter((o) => o.grant.length || o.revoke.length),
    )
  // Open sessions pick the change up on their next request; permVersion tells the menu to refresh.
  user.permVersion += 1
  await user.save()
  invalidateAccessCache()
  const after = toUserDTO(user.toObject()) as unknown as Rec
  const changes = diff(
    {
      name: before.name,
      email: before.email,
      roleKey: before.roleKey,
      branchCode: before.branchCode,
      overrides: before.overrides,
    },
    {
      name: after.name,
      email: after.email,
      roleKey: after.roleKey,
      branchCode: after.branchCode,
      overrides: after.overrides,
    },
  )
  await adminAudit(req, 'admin.user.updated', 'staffUser', staffId, changes)
  return getUser(staffId)
}

async function checkOverrides(overrides: { screenKey: string; grant: Capability[]; revoke: Capability[] }[]) {
  const screens = await ScreenModel.find().lean()
  overrides.forEach((o, i) => {
    const screen = screens.find((s) => s.key === o.screenKey)
    if (!screen)
      throw validationFailed([
        { path: `overrides.${i}.screenKey`, code: 'invalid', message: `Unknown screen ${o.screenKey}.` },
      ])
    const bad = [...o.grant, ...o.revoke].find((c) => !(screen.capabilities as string[]).includes(c))
    if (bad) {
      throw validationFailed([
        { path: `overrides.${i}`, code: 'invalid', message: `${screen.labels?.en} doesn't offer ${bad}.` },
      ])
    }
  })
}

/** Unlocks an account locked by failed sign-ins. */
export async function unlockUser(req: Request, staffId: string) {
  const user = await findUser(staffId)
  if (user.status !== 'locked') throw conflict('This account is not locked.')
  user.set({ status: 'active', failedLogins: 0, lockedUntil: null })
  await user.save()
  await adminAudit(req, 'admin.user.unlocked', 'staffUser', staffId, [
    { field: 'status', from: 'locked', to: 'active' },
  ])
  return toUserDTO(user.toObject())
}

/** Issues a new one-time password and signs the user out everywhere. */
export async function resetPassword(req: Request, staffId: string) {
  const user = await findUser(staffId)
  const password = oneTimePassword()
  user.set({ passwordHash: await hashPassword(password), mustChangePassword: true, failedLogins: 0 })
  user.tokenVersion += 1
  if (user.status === 'locked') user.status = 'active'
  await user.save()
  await adminAudit(req, 'admin.user.passwordReset', 'staffUser', staffId)
  return { user: toUserDTO(user.toObject()), oneTimePassword: password }
}

/** Deactivates or reactivates a user. Deactivating signs them out everywhere. */
export async function setActive(req: Request, staffId: string, active: boolean) {
  if (staffId === me(req))
    throw conflict("You can't deactivate your own account.", { code: 'self_protection' })
  const user = await findUser(staffId)
  const from = user.status
  user.set('status', active ? 'active' : 'deactivated')
  if (active) user.set('failedLogins', 0)
  else user.tokenVersion += 1
  await user.save()
  await adminAudit(req, active ? 'admin.user.activated' : 'admin.user.deactivated', 'staffUser', staffId, [
    { field: 'status', from, to: user.status },
  ])
  return toUserDTO(user.toObject())
}

// ── Screens and roles ────────────────────────────────────────────────────────

async function rolesWithView(): Promise<Map<string, string[]>> {
  const roles = await RoleModel.find().lean()
  const map = new Map<string, string[]>()
  for (const r of roles) {
    for (const g of r.grants)
      if (g.capabilities.includes('view')) map.set(g.screenKey, [...(map.get(g.screenKey) ?? []), r.key])
  }
  return map
}

function toScreenDTO(s: Rec, roles: string[]): ScreenDTO {
  return {
    key: s.key,
    route: s.route,
    navGroup: s.navGroup ?? null,
    labels: { en: s.labels?.en, kn: s.labels?.kn },
    icon: s.icon,
    order: s.order,
    inNav: s.inNav,
    adminOnly: s.adminOnly,
    enabled: s.enabled,
    capabilities: s.capabilities,
    unauthorisedMode: s.unauthorisedMode,
    defaultPageSize: s.defaultPageSize,
    maxPageSize: s.maxPageSize,
    version: s.__v ?? 0,
    roles,
    updatedAt: new Date(s.updatedAt).toISOString(),
  }
}

/** Every screen in menu order, with the roles that can open it. */
export async function listScreens(): Promise<ScreenDTO[]> {
  const [screens, roles] = await Promise.all([ScreenModel.find().sort({ order: 1 }).lean(), rolesWithView()])
  return screens.map((s) => toScreenDTO(s, roles.get(s.key) ?? []))
}

/** How many active users can currently open a screen (for the "turning this off" warning). */
export async function screenImpact(key: string): Promise<{ users: number }> {
  const users = await StaffUserModel.find({ status: op({ $ne: 'deactivated' }) }).lean()
  let count = 0
  for (const u of users) if ((await accessFor(u)).permissions[key]) count++
  return { users: count }
}

/** Updates a screen's labels, menu group, capabilities, behaviour and page sizes. */
export async function updateScreen(req: Request, key: string, input: z.infer<typeof updateScreenSchema>) {
  const screen = await ScreenModel.findOne({ key })
  if (!screen) throw notFound('Screen not found.')
  if ((screen.__v ?? 0) !== input.version) throw staleVersion()
  if (screen.adminOnly && input.enabled === false) {
    throw conflict("Admin screens can't be turned off, or nobody could turn them back on.", {
      code: 'self_protection',
    })
  }
  const max = input.maxPageSize ?? screen.maxPageSize
  const def = input.defaultPageSize ?? screen.defaultPageSize
  if (def > max)
    throw validationFailed([
      {
        path: 'defaultPageSize',
        code: 'pageSizeOrder',
        message: "The default page size can't be more than the maximum.",
      },
    ])

  const before = toScreenDTO(screen.toObject(), []) as unknown as Rec
  const { version: _version, ...changes } = input
  screen.set(Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)))
  await screen.save()

  // Capabilities a screen no longer offers are removed from role grants too.
  if (input.capabilities) {
    await RoleModel.updateMany(
      { 'grants.screenKey': key },
      { $pull: { 'grants.$[g].capabilities': op({ $nin: input.capabilities }) } },
      { arrayFilters: [{ 'g.screenKey': key }] },
    )
  }
  invalidateAccessCache()
  const after = toScreenDTO(screen.toObject(), []) as unknown as Rec
  const fields = [
    'labels',
    'navGroup',
    'enabled',
    'capabilities',
    'unauthorisedMode',
    'defaultPageSize',
    'maxPageSize',
    'icon',
  ]
  await adminAudit(
    req,
    'admin.screen.updated',
    'screen',
    key,
    diff(pick(before, fields), pick(after, fields)),
  )
  return toScreenDTO(screen.toObject(), (await rolesWithView()).get(key) ?? [])
}

const pick = (o: Rec, keys: string[]) => Object.fromEntries(keys.map((k) => [k, o[k]]))

/** Sets the menu order from a list of screen keys. */
export async function reorderScreens(req: Request, input: z.infer<typeof screenOrderSchema>) {
  const screens = await ScreenModel.find().lean()
  const known = new Set(screens.map((s) => s.key))
  if (
    input.keys.length !== known.size ||
    input.keys.some((k) => !known.has(k)) ||
    new Set(input.keys).size !== input.keys.length
  ) {
    throw validationFailed([
      { path: 'keys', code: 'invalid', message: 'Send every screen key exactly once.' },
    ])
  }
  await ScreenModel.bulkWrite(
    input.keys.map((key, i) => ({
      updateOne: { filter: { key }, update: { $set: { order: (i + 1) * 10 } } },
    })),
  )
  invalidateAccessCache()
  await adminAudit(req, 'admin.screen.reordered', 'screen', 'all', [
    { field: 'order', from: null, to: input.keys.join(',') },
  ])
  return listScreens()
}

/** Sets which roles can open a screen. Added roles get View; removed roles lose the screen. */
export async function setScreenRoles(req: Request, key: string, input: z.infer<typeof screenRolesSchema>) {
  const screen = await ScreenModel.findOne({ key }).lean()
  if (!screen) throw notFound('Screen not found.')
  if (screen.adminOnly && !input.roles.includes('admin')) {
    throw conflict("The admin role can't lose an admin screen.", { code: 'self_protection' })
  }
  if (screen.adminOnly && input.roles.some((r) => r !== 'admin')) {
    throw validationFailed([
      { path: 'roles', code: 'invalid', message: 'Admin screens are for the admin role only.' },
    ])
  }
  const before = (await rolesWithView()).get(key) ?? []
  for (const role of await RoleModel.find()) {
    const grant = role.grants.find((g) => g.screenKey === key)
    const wants = input.roles.includes(role.key as never)
    if (wants && !grant) role.grants.push({ screenKey: key, capabilities: ['view'] })
    else if (wants && grant && !grant.capabilities.includes('view')) grant.capabilities.push('view')
    else if (!wants && grant) role.grants.pull(grant)
    await role.save()
  }
  invalidateAccessCache()
  await adminAudit(req, 'admin.screen.roles', 'screen', key, [
    { field: 'roles', from: before, to: input.roles },
  ])
  return (await listScreens()).find((s) => s.key === key)!
}

/** Every role with its grants. */
export async function listRoles(): Promise<RoleDTO[]> {
  const roles = await RoleModel.find().sort({ key: 1 }).lean()
  return roles.map((r) => ({
    key: r.key,
    names: { en: r.names?.en ?? r.key, kn: r.names?.kn ?? r.key },
    grants: r.grants.map((g) => ({
      screenKey: g.screenKey,
      capabilities: g.capabilities.filter((c): c is Capability =>
        (CAPABILITIES as readonly string[]).includes(c),
      ),
    })),
  }))
}
