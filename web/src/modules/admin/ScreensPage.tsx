/**
 * Admin › Screen configuration (/admin/screens). Drag ⠿ to reorder the menu, switch screens
 * on or off (with a warning that says how many users lose it), and edit a screen's labels,
 * menu group, capabilities, hide-or-disable behaviour, page sizes and roles with access.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CAPABILITIES, NAV_GROUPS, ROLE_KEYS, type Capability, type ScreenDTO } from '@csm/shared'
import { ApiError, api } from '../../api/client.ts'
import { useAuth } from '../../app/auth.tsx'
import { useCrumb } from '../../app/AppShell.tsx'
import { Field, FieldGroup } from '../../components/Field.tsx'
import { Icon } from '../../components/Icon.tsx'
import { ConfirmDialog } from '../../components/Overlay.tsx'
import { useToast } from '../../components/Toast.tsx'
import { Loading } from '../../components/Widgets.tsx'
import { formatDateTime, label } from '../../lib/format.ts'

const LETTER: Record<Capability, string> = {
  view: 'V',
  create: 'C',
  edit: 'E',
  delete: 'D',
  approve: 'A',
  export: 'X',
  viewPII: 'P',
}

function Editor({ screen, onSaved }: { screen: ScreenDTO; onSaved: () => void }) {
  const { t, i18n } = useTranslation('admin')
  const toast = useToast()
  const [form, setForm] = useState({
    labels: screen.labels,
    navGroup: screen.navGroup,
    capabilities: screen.capabilities,
    unauthorisedMode: screen.unauthorisedMode,
    defaultPageSize: screen.defaultPageSize,
    maxPageSize: screen.maxPageSize,
  })
  const [roles, setRoles] = useState<string[]>(screen.roles)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const dirty =
    JSON.stringify(form) !==
    JSON.stringify({
      labels: screen.labels,
      navGroup: screen.navGroup,
      capabilities: screen.capabilities,
      unauthorisedMode: screen.unauthorisedMode,
      defaultPageSize: screen.defaultPageSize,
      maxPageSize: screen.maxPageSize,
    })
  const rolesDirty = [...roles].sort().join() !== [...screen.roles].sort().join()

  const save = useMutation({
    mutationFn: async () => {
      if (dirty)
        await api(`/admin/screens/${screen.key}`, {
          method: 'PATCH',
          body: { version: screen.version, ...form },
        })
      if (rolesDirty) await api(`/admin/screens/${screen.key}/roles`, { method: 'PUT', body: { roles } })
    },
    onSuccess: () => {
      toast(t('screens.saved', { name: label(screen.labels, i18n.language) }))
      setErrors({})
      onSaved()
    },
    onError: (err) => {
      if (err instanceof ApiError && err.problem.errors)
        setErrors(
          Object.fromEntries(err.problem.errors.map((e) => [e.path.split('.')[0]!, e.code ?? e.message])),
        )
      else toast(err instanceof ApiError ? err.message : t('common:error.generic'), 'error')
    },
  })

  const id = (f: string) => `admin-screen-${f}`
  return (
    <section className="panel" data-testid="admin-screen-editor" data-screen={screen.key}>
      <header>
        <h2>{label(screen.labels, i18n.language)}</h2>
        <span className="hint mono">{screen.key}</span>
      </header>
      <div className="body grid g2">
        <Field id={id('label-en')} label={t('screens.fields.labelEn')} error={errors.labels}>
          <input
            id={id('label-en')}
            data-testid={id('label-en')}
            className="in"
            value={form.labels.en}
            onChange={(e) => setForm({ ...form, labels: { ...form.labels, en: e.target.value } })}
          />
        </Field>
        <Field id={id('label-kn')} label={t('screens.fields.labelKn')} error={errors.labels}>
          <input
            id={id('label-kn')}
            data-testid={id('label-kn')}
            className="in"
            lang="kn"
            value={form.labels.kn}
            onChange={(e) => setForm({ ...form, labels: { ...form.labels, kn: e.target.value } })}
          />
        </Field>
        <Field id={id('group')} label={t('screens.fields.group')}>
          <select
            id={id('group')}
            data-testid={id('group')}
            className="in"
            value={form.navGroup ?? ''}
            disabled={screen.adminOnly}
            onChange={(e) =>
              setForm({ ...form, navGroup: (e.target.value || null) as ScreenDTO['navGroup'] })
            }
          >
            <option value="">{t('screens.noGroup')}</option>
            {NAV_GROUPS.map((g) => (
              <option key={g} value={g}>
                {t(`common:navGroup.${g}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field id={id('route')} label={t('screens.fields.route')}>
          <input
            id={id('route')}
            data-testid={id('route')}
            className="in mono"
            readOnly
            value={screen.route}
          />
        </Field>
        <FieldGroup
          id={id('capabilities')}
          label={t('screens.fields.capabilities')}
          error={errors.capabilities}
          className="span-all"
        >
          {CAPABILITIES.map((c) => (
            <label className="choice" key={c}>
              <input
                type="checkbox"
                checked={form.capabilities.includes(c)}
                disabled={c === 'view'}
                data-testid={`${id('capabilities')}-${c}`}
                onChange={(e) =>
                  setForm({
                    ...form,
                    capabilities: e.target.checked
                      ? [...form.capabilities, c]
                      : form.capabilities.filter((x) => x !== c),
                  })
                }
              />
              <span>{t(`common:capability.${c}`)}</span>
            </label>
          ))}
        </FieldGroup>
        <FieldGroup id={id('mode')} label={t('screens.fields.mode')} className="span-all">
          {(['hide', 'disable'] as const).map((m) => (
            <label className="choice" key={m}>
              <input
                type="radio"
                name={id('mode')}
                checked={form.unauthorisedMode === m}
                data-testid={`${id('mode')}-${m}`}
                onChange={() => setForm({ ...form, unauthorisedMode: m })}
              />
              <span>{t(`screens.modes.${m}`)}</span>
            </label>
          ))}
        </FieldGroup>
        <Field id={id('default-size')} label={t('screens.fields.defaultSize')} error={errors.defaultPageSize}>
          <select
            id={id('default-size')}
            data-testid={id('default-size')}
            className="in"
            value={form.defaultPageSize}
            onChange={(e) => setForm({ ...form, defaultPageSize: Number(e.target.value) })}
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id={id('max-size')}
          label={t('screens.fields.maxSize')}
          error={errors.maxPageSize}
          help={t('screens.maxHelp')}
        >
          <input
            id={id('max-size')}
            data-testid={id('max-size')}
            type="number"
            className="in num"
            min={5}
            max={100}
            value={form.maxPageSize}
            onChange={(e) => setForm({ ...form, maxPageSize: Number(e.target.value) })}
          />
        </Field>
        <div className="f span-all">
          <span className="lbl" id={id('roles-label')}>
            {t('screens.fields.roles')}
          </span>
          <div className="tags" role="group" aria-labelledby={id('roles-label')} data-testid={id('roles')}>
            {ROLE_KEYS.map((r) => {
              const on = roles.includes(r)
              const locked = screen.adminOnly
              return (
                <button
                  key={r}
                  type="button"
                  className="tag"
                  aria-pressed={on}
                  disabled={locked}
                  data-testid={`${id('roles')}-${r}`}
                  title={locked ? t('screens.adminOnly') : undefined}
                  onClick={() => setRoles(on ? roles.filter((x) => x !== r) : [...roles, r])}
                >
                  {on ? <Icon name="check" size={13} /> : null}
                  {t(`common:role.${r}`)}
                </button>
              )
            })}
          </div>
        </div>
        <div className="span-all actions">
          <span className="help">
            {t('screens.lastChanged', { date: formatDateTime(screen.updatedAt, i18n.language) })}
          </span>
          <div className="grow" />
          <button
            type="button"
            className="btn"
            data-testid={id('discard')}
            disabled={!dirty && !rolesDirty}
            onClick={() => {
              setForm({
                labels: screen.labels,
                navGroup: screen.navGroup,
                capabilities: screen.capabilities,
                unauthorisedMode: screen.unauthorisedMode,
                defaultPageSize: screen.defaultPageSize,
                maxPageSize: screen.maxPageSize,
              })
              setRoles(screen.roles)
              setErrors({})
            }}
          >
            {t('common:discard')}
          </button>
          <button
            type="button"
            className="btn pri"
            data-testid={id('save')}
            disabled={(!dirty && !rolesDirty) || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <span className="spin" /> : null}
            {t('screens.save')}
          </button>
        </div>
      </div>
    </section>
  )
}

/** /admin/screens */
export default function ScreensPage() {
  const { t, i18n } = useTranslation('admin')
  const toast = useToast()
  const qc = useQueryClient()
  const { refresh } = useAuth()
  const [selected, setSelected] = useState<string>('customers.search')
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const [disabling, setDisabling] = useState<{ screen: ScreenDTO; users: number } | null>(null)
  useCrumb([t('nav.admin'), t('screens.title')])

  const { data: screens, isLoading } = useQuery({
    queryKey: ['admin', 'screens'],
    queryFn: () => api<{ items: ScreenDTO[] }>('/admin/screens').then((r) => r.items),
  })
  const after = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'screens'] })
    void refresh()
  }
  const reorder = useMutation({
    mutationFn: (keys: string[]) => api('/admin/screens/order', { method: 'PUT', body: { keys } }),
    onSuccess: () => {
      toast(t('screens.reordered'))
      after()
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : t('common:error.generic'), 'error'),
  })
  const setEnabled = useMutation({
    mutationFn: (s: { screen: ScreenDTO; enabled: boolean }) =>
      api(`/admin/screens/${s.screen.key}`, {
        method: 'PATCH',
        body: { version: s.screen.version, enabled: s.enabled },
      }),
    onSuccess: (_r, s) => {
      setDisabling(null)
      toast(
        t(s.enabled ? 'screens.enabled' : 'screens.disabled', {
          name: label(s.screen.labels, i18n.language),
        }),
      )
      after()
    },
    onError: (err) => {
      setDisabling(null)
      toast(err instanceof ApiError ? err.message : t('common:error.generic'), 'error')
    },
  })

  if (isLoading || !screens) return <Loading testId="admin-screens-loading" />
  const current = screens.find((s) => s.key === selected) ?? screens[0]!

  const onDrop = (targetKey: string) => {
    if (!dragKey || dragKey === targetKey) return
    const keys = screens.map((s) => s.key).filter((k) => k !== dragKey)
    keys.splice(keys.indexOf(targetKey), 0, dragKey)
    reorder.mutate(keys)
  }
  const askDisable = async (screen: ScreenDTO) => {
    const impact = await api<{ users: number }>(`/admin/screens/${screen.key}/impact`)
    setDisabling({ screen, users: impact.users })
  }

  return (
    <>
      <div className="ph">
        <div>
          <h1>{t('screens.title')}</h1>
          <p>{t('screens.subtitle')}</p>
        </div>
      </div>
      <div
        className="grid"
        style={{ gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)', alignItems: 'start' }}
      >
        <section className="panel tw" data-testid="admin-screens">
          <header>
            <h2>{t('screens.list')}</h2>
            <span className="hint">{t('screens.dragHint')}</span>
          </header>
          <table data-testid="admin-screens-table">
            <thead>
              <tr>
                <th>
                  <span className="sr-only">{t('screens.order')}</span>
                </th>
                <th>{t('screens.fields.screen')}</th>
                <th>{t('screens.fields.group')}</th>
                <th>{t('screens.fields.capabilities')}</th>
                <th>{t('screens.fields.enabled')}</th>
              </tr>
            </thead>
            <tbody>
              {screens.map((s, i) => (
                <tr
                  key={s.key}
                  className={`clickable ${s.key === current.key ? 'sel' : ''} ${dragKey === s.key ? 'dragging' : ''} ${overKey === s.key ? 'drop-target' : ''}`}
                  data-row-id={s.key}
                  data-testid="admin-screens-row"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', s.key)
                    setDragKey(s.key)
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setOverKey(s.key)
                  }}
                  onDragLeave={() => setOverKey(null)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setOverKey(null)
                    onDrop(s.key)
                    setDragKey(null)
                  }}
                  onDragEnd={() => {
                    setDragKey(null)
                    setOverKey(null)
                  }}
                  onClick={() => setSelected(s.key)}
                >
                  <td>
                    <span className="drag" aria-hidden data-testid="admin-screens-handle">
                      ⠿
                    </span>
                    <span className="sr-only">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={(e) => {
                          e.stopPropagation()
                          const keys = screens.map((x) => x.key)
                          keys.splice(i - 1, 2, s.key, keys[i - 1]!)
                          reorder.mutate(keys)
                        }}
                      >
                        {t('screens.moveUp', { name: label(s.labels, i18n.language) })}
                      </button>
                    </span>
                  </td>
                  <td
                    style={{
                      color: s.enabled ? undefined : 'var(--muted)',
                      fontWeight: s.key === current.key ? 600 : undefined,
                    }}
                  >
                    {label(s.labels, i18n.language)}
                  </td>
                  <td style={{ color: 'var(--muted)' }}>
                    {s.navGroup ? t(`common:navGroup.${s.navGroup}`) : '—'}
                  </td>
                  <td
                    className="mono"
                    title={s.capabilities.map((c) => t(`common:capability.${c}`)).join(', ')}
                  >
                    {s.capabilities.map((c) => LETTER[c]).join(' ')}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      role="switch"
                      className="switch"
                      aria-checked={s.enabled}
                      aria-label={t('screens.toggle', { name: label(s.labels, i18n.language) })}
                      data-testid={`admin-screens-toggle-${s.key}`}
                      disabled={s.adminOnly || setEnabled.isPending}
                      title={s.adminOnly ? t('screens.adminOnly') : undefined}
                      onClick={() =>
                        s.enabled ? void askDisable(s) : setEnabled.mutate({ screen: s, enabled: true })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="tfoot">{t('screens.legend')}</div>
        </section>
        <Editor
          key={`${current.key}-${current.version}-${current.roles.join()}`}
          screen={current}
          onSaved={after}
        />
      </div>
      {disabling ? (
        <ConfirmDialog
          testId="admin-screens-disable"
          title={t('screens.disableTitle', { name: label(disabling.screen.labels, i18n.language) })}
          message={t('screens.disableMessage', { count: disabling.users })}
          confirmLabel={t('screens.disableConfirm')}
          danger
          busy={setEnabled.isPending}
          onCancel={() => setDisabling(null)}
          onConfirm={() => setEnabled.mutate({ screen: disabling.screen, enabled: false })}
        />
      ) : null}
    </>
  )
}
