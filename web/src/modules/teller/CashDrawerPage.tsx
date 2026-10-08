/**
 * Cash drawer (/teller/drawer). A teller opens today's till with a counted float, watches
 * cash in / out / expected while working, and closes it with a physical count; any difference
 * needs a reason. Supervisors also get the list of closed drawers to sign off (maker-checker:
 * a non-zero difference needs a note, and nobody signs off their own drawer).
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  EMPTY_DENOMINATIONS,
  businessDate,
  denominationTotal,
  drawerVariance,
  type Denominations,
  type DrawerDTO,
  type OffsetPage,
} from '@csm/shared'
import { ApiError, api, newIdempotencyKey } from '../../api/client.ts'
import { useCan } from '../../app/auth.tsx'
import { useCrumb } from '../../app/AppShell.tsx'
import { StatusPill } from '../../components/Badges.tsx'
import { Field, controlProps, useErrorText } from '../../components/Field.tsx'
import { Icon } from '../../components/Icon.tsx'
import { Modal } from '../../components/Overlay.tsx'
import { useToast } from '../../components/Toast.tsx'
import { EmptyState } from '../../components/Widgets.tsx'
import { formatDate, formatDateTime, formatPaise } from '../../lib/format.ts'
import { DenominationGrid } from './DenominationGrid.tsx'

type MyDrawer = { businessDate: string; drawer: DrawerDTO | null }

/** Problem → field errors keyed by path, or one message for the whole form. */
function problemErrors(err: unknown, fallback: string): Record<string, string> {
  if (err instanceof ApiError && err.problem.errors?.length) {
    return Object.fromEntries(err.problem.errors.map((e) => [e.path, e.code ?? e.message]))
  }
  return { root: err instanceof ApiError ? err.message : fallback }
}

/** /teller/drawer */
export default function CashDrawerPage() {
  const { t, i18n } = useTranslation('teller')
  const lang = i18n.language
  const canSignOff = useCan('teller.drawer', 'approve')
  useCrumb([t('nav.teller'), t('drawer.title')])

  const mine = useQuery({ queryKey: ['teller-drawer'], queryFn: () => api<MyDrawer>('/teller/drawer') })
  const drawer = mine.data?.drawer ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} data-testid="drawer-page">
      <div className="ph">
        <div>
          <h1>{t('drawer.title')}</h1>
          <p>
            {t('drawer.subtitle')}{' '}
            <span className="mono" data-testid="drawer-business-date">
              {t('drawer.businessDate', {
                date: formatDate(mine.data?.businessDate ?? businessDate(), lang),
              })}
            </span>
          </p>
        </div>
      </div>

      {mine.isPending ? (
        <span className="spin" />
      ) : !drawer ? (
        <OpenDrawer />
      ) : (
        <>
          <DrawerSummary drawer={drawer} />
          {drawer.status === 'open' ? (
            <CloseDrawer key={drawer.version} drawer={drawer} />
          ) : (
            <ClosedNote drawer={drawer} />
          )}
        </>
      )}

      {canSignOff ? <SignOffList /> : null}
    </div>
  )
}

function OpenDrawer() {
  const { t, i18n } = useTranslation('teller')
  const toast = useToast()
  const qc = useQueryClient()
  const errorText = useErrorText()
  const canOpen = useCan('teller.drawer', 'create')
  const [denominations, setDenominations] = useState<Denominations>(EMPTY_DENOMINATIONS)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [key] = useState(newIdempotencyKey)
  const open = useMutation({
    mutationFn: () =>
      api<DrawerDTO>('/teller/drawer/open', { method: 'POST', body: { denominations }, idempotencyKey: key }),
    onSuccess: (d) => {
      toast(t('drawer.opened', { amount: formatPaise(d.openingAmount, i18n.language) }))
      void qc.invalidateQueries({ queryKey: ['teller-drawer'] })
    },
    onError: (err) => setErrors(problemErrors(err, t('common:error.generic'))),
  })
  return (
    <section className="panel" data-testid="drawer-open">
      <header>
        <h2>{t('drawer.openTitle')}</h2>
      </header>
      <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="help">{t('drawer.openHelp')}</p>
        {errors.root ? (
          <div className="note bad" role="alert" data-testid="drawer-open-error">
            <Icon name="warn" />
            {errors.root}
          </div>
        ) : null}
        <div style={{ maxWidth: 460 }}>
          <DenominationGrid
            id="drawer-open-notes"
            value={denominations}
            onChange={setDenominations}
            disabled={!canOpen}
            error={errorText(errors.denominations)}
          />
        </div>
      </div>
      <div className="actions" style={{ padding: '0 16px 16px' }}>
        <div className="grow" />
        <button
          type="button"
          className="btn pri"
          disabled={!canOpen || open.isPending}
          data-testid="drawer-open-submit"
          onClick={() => {
            setErrors({})
            open.mutate()
          }}
        >
          {open.isPending ? <span className="spin" /> : null}
          {t('drawer.open')}
        </button>
      </div>
    </section>
  )
}

function DrawerSummary({ drawer }: { drawer: DrawerDTO }) {
  const { t, i18n } = useTranslation('teller')
  const lang = i18n.language
  const stale = drawer.status === 'open' && drawer.businessDate !== businessDate()
  const tile = (id: string, label: string, paise: number) => (
    <div className="tile" data-testid={id} data-paise={paise}>
      <span>{label}</span>
      <b className="mono" style={{ fontSize: 20 }}>
        {formatPaise(paise, lang)}
      </b>
    </div>
  )
  return (
    <section
      className="panel"
      data-testid="drawer-summary"
      data-status={drawer.status}
      data-version={drawer.version}
    >
      <header>
        <h2>{formatDate(drawer.businessDate, lang)}</h2>
        <StatusPill value={drawer.status} testId="drawer-status" />
      </header>
      <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {stale ? (
          <div className="note warn" role="status" data-testid="drawer-stale">
            <Icon name="warn" />
            {t('drawer.stale', { date: formatDate(drawer.businessDate, lang) })}
          </div>
        ) : null}
        <div className="tiles">
          {tile('drawer-opening', t('drawer.openingAmount'), drawer.openingAmount)}
          {tile('drawer-cash-in', t('drawer.cashIn'), drawer.cashIn)}
          {tile('drawer-cash-out', t('drawer.cashOut'), drawer.cashOut)}
          {tile('drawer-expected', t('drawer.expected'), drawer.expected)}
          <div className="tile" data-testid="drawer-counts">
            <span>
              {t('drawer.posted')} / {t('drawer.pendingCount')}
            </span>
            <b className="mono" style={{ fontSize: 20 }}>
              <span data-testid="drawer-posted-count">{drawer.postedCount}</span> /{' '}
              <span
                data-testid="drawer-pending-count"
                style={drawer.pendingCount ? { color: 'var(--warn)' } : undefined}
              >
                {drawer.pendingCount}
              </span>
            </b>
          </div>
        </div>
      </div>
    </section>
  )
}

function VarianceText({ variance, testId }: { variance: number; testId: string }) {
  const { t, i18n } = useTranslation('teller')
  const amount = formatPaise(Math.abs(variance), i18n.language)
  return (
    <span className={`pill ${variance === 0 ? 'ok' : 'bad'}`} data-testid={testId} data-paise={variance}>
      {variance === 0
        ? t('drawer.balanced')
        : variance > 0
          ? t('drawer.excess', { amount })
          : t('drawer.short', { amount })}
    </span>
  )
}

function CloseDrawer({ drawer }: { drawer: DrawerDTO }) {
  const { t, i18n } = useTranslation('teller')
  const lang = i18n.language
  const toast = useToast()
  const qc = useQueryClient()
  const errorText = useErrorText()
  const canClose = useCan('teller.drawer', 'edit')
  const [counted, setCounted] = useState<Denominations>(EMPTY_DENOMINATIONS)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const total = denominationTotal(counted)
  const variance = drawerVariance(drawer.expected, total)
  const close = useMutation({
    mutationFn: () =>
      api<DrawerDTO>('/teller/drawer/close', {
        method: 'POST',
        body: { denominations: counted, varianceReason: reason, version: drawer.version },
      }),
    onSuccess: () => {
      toast(t('drawer.closed'))
      void qc.invalidateQueries({ queryKey: ['teller-drawer'] })
    },
    onError: (err) => {
      setErrors(problemErrors(err, t('common:error.generic')))
      void qc.invalidateQueries({ queryKey: ['teller-drawer'] })
    },
  })
  return (
    <section className="panel" data-testid="drawer-close">
      <header>
        <h2>{t('drawer.closeTitle')}</h2>
      </header>
      <div className="body grid g2">
        <p className="help span-all">{t('drawer.closeHelp')}</p>
        {errors.root ? (
          <div className="note bad span-all" role="alert" data-testid="drawer-close-error">
            <Icon name="warn" />
            {errors.root}
          </div>
        ) : null}
        <DenominationGrid
          id="drawer-close-notes"
          value={counted}
          onChange={setCounted}
          disabled={!canClose}
          error={errorText(errors.denominations)}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <dl className="kv">
            <div>
              <dt>{t('drawer.expected')}</dt>
              <dd className="mono">{formatPaise(drawer.expected, lang)}</dd>
            </div>
            <div>
              <dt>{t('drawer.counted')}</dt>
              <dd className="mono" data-testid="drawer-close-counted">
                {formatPaise(total, lang)}
              </dd>
            </div>
            <div>
              <dt>{t('drawer.variance')}</dt>
              <dd>
                <VarianceText variance={variance} testId="drawer-close-variance" />
              </dd>
            </div>
          </dl>
          <Field
            id="drawer-close-reason"
            label={t('drawer.varianceReason')}
            required={variance !== 0}
            error={errors.varianceReason}
          >
            <textarea
              {...controlProps('drawer-close-reason', errors.varianceReason)}
              className="in"
              maxLength={200}
              disabled={!canClose}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                setErrors(({ varianceReason: _, ...rest }) => rest)
              }}
            />
          </Field>
        </div>
      </div>
      <div className="actions" style={{ padding: '0 16px 16px' }}>
        <div className="grow" />
        <button
          type="button"
          className="btn pri"
          disabled={!canClose || close.isPending}
          data-testid="drawer-close-submit"
          onClick={() => {
            if (variance !== 0 && !reason.trim())
              return setErrors({ varianceReason: 'varianceReasonRequired' })
            setErrors({})
            close.mutate()
          }}
        >
          {close.isPending ? <span className="spin" /> : null}
          {t('drawer.close')}
        </button>
      </div>
    </section>
  )
}

function ClosedNote({ drawer }: { drawer: DrawerDTO }) {
  const { t, i18n } = useTranslation('teller')
  const lang = i18n.language
  return (
    <section className="panel" data-testid="drawer-closed">
      <header>
        <h2>{t('drawer.closedTitle')}</h2>
      </header>
      <div className="body">
        <dl className="kv">
          <div>
            <dt>{t('drawer.counted')}</dt>
            <dd className="mono">{formatPaise(drawer.countedAmount, lang)}</dd>
          </div>
          <div>
            <dt>{t('drawer.variance')}</dt>
            <dd>
              <VarianceText variance={drawer.variance ?? 0} testId="drawer-closed-variance" />
              {drawer.varianceReason ? <span className="help"> — {drawer.varianceReason}</span> : null}
            </dd>
          </div>
          <div>
            <dt>{t('drawer.status')}</dt>
            <dd data-testid="drawer-signoff-state">
              {drawer.status === 'signed_off'
                ? t('drawer.signedOffBy', {
                    by: drawer.signedOffBy,
                    at: formatDateTime(drawer.signedOffAt, lang),
                  })
                : t('drawer.waitingSignOff')}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  )
}

function SignOffList() {
  const { t, i18n } = useTranslation('teller')
  const lang = i18n.language
  const toast = useToast()
  const qc = useQueryClient()
  const [target, setTarget] = useState<DrawerDTO | null>(null)
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const list = useQuery({
    queryKey: ['teller-drawers', 'closed'],
    queryFn: () => api<OffsetPage<DrawerDTO>>('/teller/drawers?status=closed&pageSize=50'),
  })
  const signOff = useMutation({
    mutationFn: (d: DrawerDTO) =>
      api<DrawerDTO>(`/teller/drawers/${d.id}/sign-off`, {
        method: 'POST',
        body: { note, version: d.version },
      }),
    onSuccess: () => {
      setTarget(null)
      setNote('')
      toast(t('drawer.signedOff'))
      void qc.invalidateQueries({ queryKey: ['teller-drawers'] })
    },
    onError: (err) => setErrors(problemErrors(err, t('common:error.generic'))),
  })
  const items = list.data?.items ?? []
  return (
    <section className="panel tw" data-testid="drawer-signoff" data-count={items.length}>
      <header>
        <h2>{t('drawer.signOffList')}</h2>
        {items.length ? <span className="cnt">{items.length}</span> : null}
      </header>
      {list.data && items.length === 0 ? (
        <EmptyState testId="drawer-signoff-empty" title={t('drawer.signOffNone')} />
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t('drawer.columns.teller')}</th>
              <th>{t('drawer.columns.date')}</th>
              <th style={{ textAlign: 'end' }}>{t('drawer.columns.expected')}</th>
              <th style={{ textAlign: 'end' }}>{t('drawer.columns.counted')}</th>
              <th>{t('drawer.columns.variance')}</th>
              <th>{t('drawer.columns.reason')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.id} data-testid="drawer-row" data-id={d.id} data-teller={d.tellerId}>
                <td>
                  {d.tellerName} <span className="mono help">{d.tellerId}</span>
                </td>
                <td className="mono">{formatDate(d.businessDate, lang)}</td>
                <td className="mono" style={{ textAlign: 'end' }}>
                  {formatPaise(d.expected, lang)}
                </td>
                <td className="mono" style={{ textAlign: 'end' }}>
                  {formatPaise(d.countedAmount, lang)}
                </td>
                <td>
                  <VarianceText variance={d.variance ?? 0} testId="drawer-row-variance" />
                </td>
                <td>{d.varianceReason ?? '—'}</td>
                <td style={{ textAlign: 'end' }}>
                  <button
                    type="button"
                    className="btn sm pri"
                    data-testid="drawer-row-signoff"
                    onClick={() => {
                      setErrors({})
                      setNote('')
                      setTarget(d)
                    }}
                  >
                    {t('drawer.signOff')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {target ? (
        <Modal
          testId="drawer-signoff-modal"
          title={t('drawer.signOffTitle', {
            teller: target.tellerName,
            date: formatDate(target.businessDate, lang),
          })}
          onClose={() => setTarget(null)}
          footer={
            <>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setTarget(null)}
                data-testid="drawer-signoff-cancel"
              >
                {t('common:cancel')}
              </button>
              <button
                type="button"
                className="btn pri"
                disabled={signOff.isPending}
                data-testid="drawer-signoff-confirm"
                onClick={() => {
                  if (target.variance && note.trim().length < 10)
                    return setErrors({ note: 'signOffNoteRequired' })
                  signOff.mutate(target)
                }}
              >
                {t('drawer.signOff')}
              </button>
            </>
          }
        >
          {errors.root ? (
            <div className="note bad" role="alert" data-testid="drawer-signoff-error">
              {errors.root}
            </div>
          ) : null}
          <p>
            <VarianceText variance={target.variance ?? 0} testId="drawer-signoff-variance" />
            {target.varianceReason ? <span className="help"> — {target.varianceReason}</span> : null}
          </p>
          <Field
            id="drawer-signoff-note"
            label={t('drawer.signOffNote')}
            required={!!target.variance}
            error={errors.note}
            help={t('drawer.signOffNoteHelp')}
          >
            <textarea
              {...controlProps('drawer-signoff-note', errors.note)}
              className="in"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </Modal>
      ) : null}
    </section>
  )
}
