import { describe, expect, it } from 'vitest'
import { ROLES, SCREENS, can, resolvePermissions } from '../src/permissions.ts'

const role = (key: string) => ROLES.find((r) => r.key === key)!

describe('resolvePermissions', () => {
  it('gives a CSR only their role grants and never an admin screen', () => {
    const perms = resolvePermissions('csr', role('csr').grants, [], SCREENS)
    expect(perms['customers.search']).toEqual(['view'])
    expect(perms['admin.users']).toBeUndefined()
    expect(perms['admin.screens']).toBeUndefined()
  })

  it('applies per-user grants and revokes', () => {
    const perms = resolvePermissions(
      'csr',
      role('csr').grants,
      [
        { screenKey: 'customers.search', grant: ['export'], revoke: [] },
        { screenKey: 'serviceRequests.board', grant: [], revoke: ['edit'] },
      ],
      SCREENS,
    )
    expect(perms['customers.search']).toEqual(['view', 'export'])
    expect(perms['serviceRequests.board']).toEqual(['view'])
  })

  it('cannot grant an admin screen to a non-admin, even with an override', () => {
    const perms = resolvePermissions(
      'supervisor',
      role('supervisor').grants,
      [{ screenKey: 'admin.users', grant: ['view', 'edit'], revoke: [] }],
      SCREENS,
    )
    expect(perms['admin.users']).toBeUndefined()
  })

  it('drops capabilities the screen does not offer', () => {
    const perms = resolvePermissions(
      'csr',
      role('csr').grants,
      [{ screenKey: 'dashboard', grant: ['delete'], revoke: [] }],
      SCREENS,
    )
    expect(perms.dashboard).toEqual(['view'])
  })

  it('hides a screen when view is revoked, even if other capabilities remain', () => {
    const perms = resolvePermissions(
      'csr',
      role('csr').grants,
      [{ screenKey: 'customers.onboard', grant: [], revoke: ['view'] }],
      SCREENS,
    )
    expect(perms['customers.onboard']).toBeUndefined()
  })

  it('leaves out disabled screens for everyone, admins included', () => {
    const perms = resolvePermissions('admin', role('admin').grants, [], SCREENS)
    expect(perms.accounts).toBeUndefined()
    expect(can(perms, 'admin.screens', 'edit')).toBe(true)
  })
})
