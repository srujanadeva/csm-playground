/**
 * Admin › Users & access (/admin/users). Paginated, searchable user list; the access drawer
 * edits role, branch and per-user overrides through a screen × capability matrix where role
 * defaults show as inherited and per-user changes are marked ●. Also unlock, password reset
 * (one-time password shown once), deactivate/activate, and creating users.
 */
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import type { z } from 'zod'
import {
  BRANCHES,
  CAPABILITIES,
  ROLE_KEYS,
  STAFF_STATUS,
  createUserSchema,
  type Capability,
  type EffectivePermissions,
  type OffsetPage,
  type ScreenDTO,
  type StaffUserDTO,
} from '@csm/shared'
import { ApiError, api, newIdempotencyKey } from '../../api/client.ts'
import { useMe } from '../../app/auth.tsx'
import { useCrumb } from '../../app/AppShell.tsx'
import { StatusPill } from '../../components/Badges.tsx'
import { Field, controlProps } from '../../components/Field.tsx'
import { Icon } from '../../components/Icon.tsx'
import { ConfirmDialog, Drawer, Modal } from '../../components/Overlay.tsx'
import { useToast } from '../../components/Toast.tsx'
import { EmptyState, KebabMenu, Loading, Pagination } from '../../components/Widgets.tsx'
import { useDebounce } from '../../hooks/useDebounce.ts'
import { formatDateTime, initials, label } from '../../lib/format.ts'

type Override = { screenKey: string; grant: Capability[]; revoke: Capability[] }
interface UserDetail {
  user: StaffUserDTO
  roleGrants: { screenKey: string; capabilities: Capability[] }[]
  effective: EffectivePermissions
}

/** Shows a one-time password once, with a copy button. */
function PasswordModal({
  staffId,
  password,
  onClose,
}: {
  staffId: string
  password: string
  onClose: () => void
}) {
  const { t } = useTranslation('admin')
  const [copied, setCopied] = useState(false)
  return (
    <Modal
      testId="admin-otp"
      title={t('users.otp.title', { staffId })}
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn pri"
          data-testid="admin-otp-done"
          onClick={onClose}
          data-autofocus
        >
          {t('users.otp.done')}
        </button>
      }
    >
      <span>{t('users.otp.message')}</span>
      <div className="affix">
        <input
          className="in mono"
          readOnly
          value={password}
          data-testid="admin-otp-value"
          aria-label={t('users.otp.label')}
          onFocus={(e) => e.target.select()}
        />
        <button
          type="button"
          data-testid="admin-otp-copy"
          onClick={() => {
            void navigator.clipboard?.writeText(password).then(() => setCopied(true))
          }}
        >
          {copied ? t('users.otp.copied') : t('users.otp.copy')}
        </button>
      </div>
    </Modal>
  )
}

function NewUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (u: StaffUserDTO, pw: string) => void
}) {
  const { t, i18n } = useTranslation('admin')
  const key = useMemo(() => newIdempotencyKey(), [])
  type Form = z.input<typeof createUserSchema>
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { staffId: '', name: '', email: '', roleKey: 'csr', branchCode: '0001' },
  })
  const submit = handleSubmit(async (values) => {
    try {
      const r = await api<{ user: StaffUserDTO; oneTimePassword: string }>('/admin/users', {
        method: 'POST',
        body: values,
        idempotencyKey: key,
      })
      onCreated(r.user, r.oneTimePassword)
    } catch (err) {
      if (err instanceof ApiError && err.problem.errors)
        err.problem.errors.forEach((e) =>
          setError(e.path as keyof Form, {
            message: e.code === 'invalid' ? e.message : (e.code ?? e.message),
          }),
        )
      else setError('root', { message: (err as Error).message })
    }
  })
  return (
    <Modal
      testId="admin-new-user"
      title={t('users.new.title')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" data-testid="admin-new-user-cancel" onClick={onClose}>
            {t('common:cancel')}
          </button>
          <button
            type="submit"
            form="admin-new-user-form"
            className="btn pri"
            data-testid="admin-new-user-submit"
            disabled={isSubmitting}
          >
            {t('users.new.create')}
          </button>
        </>
      }
    >
      <form id="admin-new-user-form" onSubmit={submit} noValidate className="grid g2">
        {errors.root ? (
          <div className="note bad span-all" role="alert">
            {errors.root.message}
          </div>
        ) : null}
        <Field
          id="admin-new-staff-id"
          label={t('users.fields.staffId')}
          required
          error={errors.staffId?.message}
          help="csr005"
        >
          <input
            {...register('staffId')}
            {...controlProps('admin-new-staff-id', errors.staffId?.message)}
            className="in mono"
            data-autofocus
          />
        </Field>
        <Field id="admin-new-name" label={t('users.fields.name')} required error={errors.name?.message}>
          <input
            {...register('name')}
            {...controlProps('admin-new-name', errors.name?.message)}
            className="in"
          />
        </Field>
        <Field
          id="admin-new-email"
          label={t('users.fields.email')}
          error={errors.email?.message}
          className="span-all"
        >
          <input
            type="email"
            {...register('email')}
            {...controlProps('admin-new-email', errors.email?.message)}
            className="in"
          />
        </Field>
        <Field id="admin-new-role" label={t('users.fields.role')} required error={errors.roleKey?.message}>
          <select
            {...register('roleKey')}
            {...controlProps('admin-new-role', errors.roleKey?.message)}
            className="in"
          >
            {ROLE_KEYS.map((r) => (
              <option key={r} value={r}>
                {t(`common:role.${r}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id="admin-new-branch"
          label={t('users.fields.branch')}
          required
          error={errors.branchCode?.message}
        >
          <select
            {...register('branchCode')}
            {...controlProps('admin-new-branch', errors.branchCode?.message)}
            className="in"
          >
            {BRANCHES.map((b) => (
              <option key={b.code} value={b.code}>
                {b.code} · {label(b.name, i18n.language)}
              </option>
            ))}
          </select>
        </Field>
      </form>
    </Modal>
  )
}

function AccessDrawer({
  staffId,
  onClose,
  onPassword,
}: {
  staffId: string
  onClose: () => void
  onPassword: (id: string, pw: string) => void
}) {
  const { t, i18n } = useTranslation('admin')
  const me = useMe()
  const toast = useToast()
  const qc = useQueryClient()
  const detail = useQuery({
    queryKey: ['admin', 'user', staffId],
    queryFn: () => api<UserDetail>(`/admin/users/${staffId}`),
  })
  const screens = useQuery({
    queryKey: ['admin', 'screens'],
    queryFn: () => api<{ items: ScreenDTO[] }>('/admin/screens').then((r) => r.items),
  })
  const roles = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () =>
      api<{ items: { key: string; grants: { screenKey: string; capabilities: Capability[] }[] }[] }>(
        '/admin/roles',
      ).then((r) => r.items),
  })
  const [role, setRole] = useState<string | null>(null)
  const [branch, setBranch] = useState<string | null>(null)
  const [overrides, setOverrides] = useState<Override[] | null>(null)
  const [confirm, setConfirm] = useState<'deactivate' | 'activate' | 'reset' | null>(null)

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    void qc.invalidateQueries({ queryKey: ['admin', 'user', staffId] })
  }
  const save = useMutation({
    mutationFn: () =>
      api<UserDetail>(`/admin/users/${staffId}`, {
        method: 'PATCH',
        body: {
          ...(role ? { roleKey: role } : {}),
          ...(branch ? { branchCode: branch } : {}),
          ...(overrides ? { overrides } : {}),
        },
      }),
    onSuccess: () => {
      toast(t('users.access.saved', { staffId }))
      setRole(null)
      setBranch(null)
      setOverrides(null)
      refresh()
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : t('common:error.generic'), 'error'),
  })
  const action = useMutation({
    mutationFn: (a: 'unlock' | 'reset-password' | 'deactivate' | 'activate') =>
      api<{ oneTimePassword?: string }>(`/admin/users/${staffId}/${a}`, { method: 'POST' }),
    onSuccess: (r, a) => {
      setConfirm(null)
      if (r?.oneTimePassword) onPassword(staffId, r.oneTimePassword)
      else toast(t(`users.actions.done.${a}`, { staffId }))
      refresh()
    },
    onError: (err) => {
      setConfirm(null)
      toast(err instanceof ApiError ? err.message : t('common:error.generic'), 'error')
    },
  })

  if (
    detail.isLoading ||
    screens.isLoading ||
    roles.isLoading ||
    !detail.data ||
    !screens.data ||
    !roles.data
  ) {
    return (
      <Drawer testId="admin-access" title={staffId} onClose={onClose}>
        <Loading testId="admin-access-loading" />
      </Drawer>
    )
  }
  const u = detail.data.user
  const currentRole = role ?? u.roleKey
  const roleGrants = roles.data.find((r) => r.key === currentRole)?.grants ?? []
  const ov = overrides ?? u.overrides
  const fromRole = (screen: string, cap: Capability) =>
    roleGrants.find((g) => g.screenKey === screen)?.capabilities.includes(cap) ?? false
  const effective = (screen: string, cap: Capability) => {
    const o = ov.find((x) => x.screenKey === screen)
    if (o?.revoke.includes(cap)) return false
    if (o?.grant.includes(cap)) return true
    return fromRole(screen, cap)
  }
  const toggle = (screen: string, cap: Capability) => {
    const want = !effective(screen, cap)
    const base = fromRole(screen, cap)
    const others = ov.filter((o) => o.screenKey !== screen)
    const cur = ov.find((o) => o.screenKey === screen) ?? { screenKey: screen, grant: [], revoke: [] }
    const next: Override = {
      screenKey: screen,
      grant: cur.grant.filter((c) => c !== cap).concat(want && !base ? [cap] : []),
      revoke: cur.revoke.filter((c) => c !== cap).concat(!want && base ? [cap] : []),
    }
    setOverrides(next.grant.length || next.revoke.length ? [...others, next] : others)
  }
  const changes =
    (role && role !== u.roleKey ? 1 : 0) +
    (branch && branch !== u.branchCode ? 1 : 0) +
    (overrides
      ? Math.abs(JSON.stringify(overrides).length - JSON.stringify(u.overrides).length) > 0 ||
        JSON.stringify(overrides) !== JSON.stringify(u.overrides)
        ? 1
        : 0
      : 0)
  const self = u.staffId === me.user.staffId
  const visibleScreens = screens.data.filter((s) => s.enabled)

  return (
    <Drawer
      testId="admin-access"
      wide
      title={u.name}
      subtitle={
        <>
          <span className="mono">{u.staffId}</span> · {u.branchCode} · {t(`common:status.${u.status}`)}
        </>
      }
      leading={<span className="avatar">{initials(u.name)}</span>}
      onClose={onClose}
      footer={
        <>
          <span className="help" data-testid="admin-access-changes">
            {changes ? t('users.access.unsaved') : ''}
          </span>
          <div className="grow" />
          <button
            type="button"
            className="btn"
            data-testid="admin-access-discard"
            disabled={!changes}
            onClick={() => {
              setRole(null)
              setBranch(null)
              setOverrides(null)
            }}
          >
            {t('common:discard')}
          </button>
          <button
            type="button"
            className="btn pri"
            data-testid="admin-access-save"
            disabled={!changes || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <span className="spin" /> : null}
            {t('users.access.save')}
          </button>
        </>
      }
    >
      <div className="grid g2">
        <Field
          id="admin-access-role"
          label={t('users.fields.role')}
          help={self ? t('users.access.selfRole') : undefined}
        >
          <select
            id="admin-access-role"
            data-testid="admin-access-role"
            className="in"
            value={currentRole}
            disabled={self}
            onChange={(e) => setRole(e.target.value)}
          >
            {ROLE_KEYS.map((r) => (
              <option key={r} value={r}>
                {t(`common:role.${r}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="admin-access-branch" label={t('users.fields.branch')}>
          <select
            id="admin-access-branch"
            data-testid="admin-access-branch"
            className="in"
            value={branch ?? u.branchCode}
            onChange={(e) => setBranch(e.target.value)}
          >
            {BRANCHES.map((b) => (
              <option key={b.code} value={b.code}>
                {b.code} · {label(b.name, i18n.language)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div>
        <div className="lbl" style={{ marginBottom: 4 }}>
          {t('users.access.screenAccess')}
        </div>
        <div className="help" style={{ marginBottom: 8 }}>
          {t('users.access.legend')}
        </div>
        <div className="panel tw">
          <table className="matrix" data-testid="admin-access-matrix">
            <thead>
              <tr>
                <th>{t('users.access.screen')}</th>
                {CAPABILITIES.map((c) => (
                  <th key={c}>{t(`common:capability.${c}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleScreens.map((s) => {
                const disabledRow = s.adminOnly && currentRole !== 'admin'
                return (
                  <tr key={s.key} data-row-id={s.key} data-testid="admin-access-row">
                    <td style={{ color: disabledRow ? 'var(--faint)' : undefined }}>
                      {label(s.labels, i18n.language)}
                    </td>
                    {CAPABILITIES.map((c) => {
                      if (!s.capabilities.includes(c)) {
                        return (
                          <td key={c} className="na" aria-label={t('users.access.notOffered')}>
                            —
                          </td>
                        )
                      }
                      const on = !disabledRow && effective(s.key, c)
                      const o = ov.find((x) => x.screenKey === s.key)
                      const overridden = !!o && (o.grant.includes(c) || o.revoke.includes(c))
                      return (
                        <td key={c} className={!overridden && fromRole(s.key, c) ? 'inherited' : undefined}>
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={disabledRow}
                            aria-label={`${label(s.labels, i18n.language)}: ${t(`common:capability.${c}`)}`}
                            data-testid={`admin-access-${s.key}-${c}`}
                            data-source={overridden ? 'override' : fromRole(s.key, c) ? 'role' : 'none'}
                            onChange={() => toggle(s.key, c)}
                          />
                          {overridden ? (
                            <span className="ovr" title={t('users.access.override')}>
                              ●
                            </span>
                          ) : null}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="note info">
        <Icon name="info" />
        <span>{t('users.access.applies', { name: u.name.split(' ')[0] })}</span>
      </div>
      <div className="actions">
        <button
          type="button"
          className="btn sm"
          data-testid="admin-access-unlock"
          disabled={!u.locked || action.isPending}
          onClick={() => action.mutate('unlock')}
        >
          <Icon name="lock" />
          {t('users.actions.unlock')}
        </button>
        <button
          type="button"
          className="btn sm"
          data-testid="admin-access-reset"
          disabled={action.isPending}
          onClick={() => setConfirm('reset')}
        >
          {t('users.actions.reset')}
        </button>
        {u.status === 'deactivated' ? (
          <button
            type="button"
            className="btn sm"
            data-testid="admin-access-activate"
            onClick={() => setConfirm('activate')}
          >
            {t('users.actions.activate')}
          </button>
        ) : (
          <button
            type="button"
            className="btn sm danger"
            data-testid="admin-access-deactivate"
            disabled={self}
            title={self ? t('users.access.selfDeactivate') : undefined}
            onClick={() => setConfirm('deactivate')}
          >
            {t('users.actions.deactivate')}
          </button>
        )}
      </div>
      {u.lastLoginAt ? (
        <span className="help">
          {t('users.lastLogin', { date: formatDateTime(u.lastLoginAt, i18n.language) })}
        </span>
      ) : null}
      {confirm ? (
        <ConfirmDialog
          testId="admin-access-confirm"
          title={t(`users.actions.confirm.${confirm}.title`, { name: u.name })}
          message={t(`users.actions.confirm.${confirm}.message`, { name: u.name })}
          confirmLabel={t(`users.actions.${confirm}`)}
          danger={confirm !== 'activate'}
          busy={action.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => action.mutate(confirm === 'reset' ? 'reset-password' : confirm)}
        />
      ) : null}
    </Drawer>
  )
}

/** /admin/users */
export default function UsersPage() {
  const { t, i18n } = useTranslation('admin')
  const toast = useToast()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const q = useDebounce(search.trim(), 300)
  const [creating, setCreating] = useState(false)
  const [otp, setOtp] = useState<{ staffId: string; password: string } | null>(null)
  useCrumb([t('nav.admin'), t('users.title')])

  const page = Number(params.get('page')) || 1
  const role = params.get('role') ?? ''
  const status = params.get('status') ?? ''
  const qs = new URLSearchParams({
    page: String(page),
    pageSize: '10',
    ...(q ? { q } : {}),
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
  })
  const { data, isFetching, isPlaceholderData } = useQuery({
    queryKey: ['admin', 'users', qs.toString()],
    queryFn: () => api<OffsetPage<StaffUserDTO>>(`/admin/users?${qs}`),
    placeholderData: keepPreviousData,
  })
  const set = (k: string, v: string | number) => {
    const next = new URLSearchParams(params)
    if (v === '' || v === null) next.delete(k)
    else next.set(k, String(v))
    if (k !== 'page' && k !== 'user') next.set('page', '1')
    setParams(next)
  }
  const openUser = params.get('user')

  return (
    <>
      <div className="ph">
        <div>
          <h1>{t('users.title')}</h1>
          <p>{t('users.subtitle')}</p>
        </div>
        <div className="grow" />
        <button
          type="button"
          className="btn pri"
          data-testid="admin-users-new"
          onClick={() => setCreating(true)}
        >
          <Icon name="plus" />
          {t('users.new.button')}
        </button>
      </div>
      <section
        className="panel tw"
        data-testid="admin-users"
        data-page={data?.page}
        data-state={isFetching || isPlaceholderData ? 'loading' : 'loaded'}
      >
        <div className="body grid g4" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="f span2">
            <label htmlFor="admin-users-search">{t('users.search')}</label>
            <input
              id="admin-users-search"
              data-testid="admin-users-search"
              className="in"
              placeholder={t('users.searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                set('page', 1)
              }}
            />
          </div>
          <div className="f">
            <label htmlFor="admin-users-role">{t('users.fields.role')}</label>
            <select
              id="admin-users-role"
              data-testid="admin-users-role"
              className="in"
              value={role}
              onChange={(e) => set('role', e.target.value)}
            >
              <option value="">{t('users.allRoles')}</option>
              {ROLE_KEYS.map((r) => (
                <option key={r} value={r}>
                  {t(`common:role.${r}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="f">
            <label htmlFor="admin-users-status">{t('users.fields.status')}</label>
            <select
              id="admin-users-status"
              data-testid="admin-users-status"
              className="in"
              value={status}
              onChange={(e) => set('status', e.target.value)}
            >
              <option value="">{t('common:all')}</option>
              {STAFF_STATUS.map((s) => (
                <option key={s} value={s}>
                  {t(`common:status.${s}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {data && !data.items.length ? (
          <EmptyState testId="admin-users-empty" title={t('users.empty')} />
        ) : (
          <table data-testid="admin-users-table">
            <thead>
              <tr>
                <th>{t('users.fields.staffId')}</th>
                <th>{t('users.fields.name')}</th>
                <th>{t('users.fields.role')}</th>
                <th>{t('users.fields.branch')}</th>
                <th>{t('users.fields.status')}</th>
                <th>{t('users.fields.lastLogin')}</th>
                <th>
                  <span className="sr-only">{t('users.actionsLabel')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((u) => (
                <tr
                  key={u.staffId}
                  className={`clickable ${openUser === u.staffId ? 'sel' : ''}`}
                  data-row-id={u.staffId}
                  data-testid="admin-users-row"
                  onClick={() => set('user', u.staffId)}
                >
                  <td className="mono">{u.staffId}</td>
                  <td>{u.name}</td>
                  <td>
                    {t(`common:role.${u.roleKey}`)}
                    {u.overrides.length ? (
                      <span className="ovr" data-testid="admin-users-row-overrides">
                        {t('users.changes', {
                          count: u.overrides.reduce((n, o) => n + o.grant.length + o.revoke.length, 0),
                        })}
                      </span>
                    ) : null}
                  </td>
                  <td>{u.branchCode}</td>
                  <td>
                    <StatusPill
                      value={u.mustChangePassword && u.status === 'active' ? 'pending' : u.status}
                      prefix={u.mustChangePassword && u.status === 'active' ? '' : undefined}
                    />
                  </td>
                  <td className="num">
                    {u.lastLoginAt ? formatDateTime(u.lastLoginAt, i18n.language) : '—'}
                  </td>
                  <td style={{ textAlign: 'end' }}>
                    <KebabMenu
                      testId={`admin-users-row-menu-${u.staffId}`}
                      label={t('users.actionsLabel')}
                      items={[
                        {
                          key: 'access',
                          label: t('users.editAccess'),
                          icon: 'edit',
                          onSelect: () => set('user', u.staffId),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && data.total ? (
          <Pagination
            testId="admin-users-pagination"
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPage={(p) => set('page', p)}
          />
        ) : null}
      </section>
      {openUser ? (
        <AccessDrawer
          key={openUser}
          staffId={openUser}
          onClose={() => set('user', '')}
          onPassword={(staffId, password) => setOtp({ staffId, password })}
        />
      ) : null}
      {creating ? (
        <NewUserModal
          onClose={() => setCreating(false)}
          onCreated={(u, pw) => {
            setCreating(false)
            setOtp({ staffId: u.staffId, password: pw })
            toast(t('users.new.created', { staffId: u.staffId }))
            void qc.invalidateQueries({ queryKey: ['admin', 'users'] })
          }}
        />
      ) : null}
      {otp ? (
        <PasswordModal staffId={otp.staffId} password={otp.password} onClose={() => setOtp(null)} />
      ) : null}
    </>
  )
}
