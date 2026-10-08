/**
 * Teller counter (/teller?account=000110000043). Find an account in the branch, see the
 * holder card and balance, then post a cash deposit or withdrawal with its note breakdown.
 * The PAN field appears for large deposits without a PAN on file; withdrawals over ₹50,000
 * go to a supervisor instead of posting. Supervisors also see the authorisation queue.
 * Posting twice (double click, retry) creates one transaction thanks to the Idempotency-Key.
 */
import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  EMPTY_DENOMINATIONS,
  TXN_TYPES,
  businessDate,
  needsAuthorisation,
  needsPan,
  postTransactionSchema,
  suggestDenominations,
  type AccountDTO,
  type AccountSearchItem,
  type Denominations,
  type DrawerDTO,
  type OffsetPage,
  type TransactionDTO,
  type TxnType,
} from '@csm/shared'
import { ApiError, api, newIdempotencyKey } from '../../api/client.ts'
import { useCan } from '../../app/auth.tsx'
import { useCrumb } from '../../app/AppShell.tsx'
import { StatusPill } from '../../components/Badges.tsx'
import { Field, FieldGroup, controlProps, useErrorText } from '../../components/Field.tsx'
import { Icon } from '../../components/Icon.tsx'
import { Modal } from '../../components/Overlay.tsx'
import { useToast } from '../../components/Toast.tsx'
import { EmptyState, Pagination } from '../../components/Widgets.tsx'
import { useDebounce } from '../../hooks/useDebounce.ts'
import { formatDate, formatPaise, formatTime } from '../../lib/format.ts'
import { DenominationGrid } from './DenominationGrid.tsx'

type Errors = Partial<Record<'amount' | 'denominations' | 'narration' | 'panNumber' | 'root', string>>

/** /teller */
export default function TellerCounterPage() {
  const { t, i18n } = useTranslation('teller')
  const lang = i18n.language
  const [params, setParams] = useSearchParams()
  const accountNo = params.get('account')
  const canApprove = useCan('teller.counter', 'approve')
  const canPost = useCan('teller.counter', 'create')
  const canSeeDrawer = useCan('teller.drawer', 'view')
  useCrumb([t('nav.teller'), t('counter.title')])

  const drawer = useQuery({
    queryKey: ['teller-drawer'],
    queryFn: () => api<{ businessDate: string; drawer: DrawerDTO | null }>('/teller/drawer'),
    enabled: canSeeDrawer,
  })
  const open = drawer.data?.drawer?.status === 'open' ? drawer.data.drawer : null
  const stale = open && open.businessDate !== businessDate()

  const pick = (no: string | null) =>
    setParams((p) => {
      if (no) p.set('account', no)
      else p.delete('account')
      return p
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} data-testid="counter-page">
      <div className="ph">
        <div>
          <h1>{t('counter.title')}</h1>
          <p>{t('counter.subtitle')}</p>
        </div>
      </div>

      {canPost && drawer.isSuccess && (!open || stale) ? (
        <div className="note warn" role="status" data-testid="counter-drawer-banner">
          <Icon name="warn" />
          <span style={{ flex: 1 }}>
            {stale
              ? t('counter.staleDrawer', { date: formatDate(open.businessDate, lang) })
              : t('counter.needDrawer')}
          </span>
          <Link className="btn sm" to="/teller/drawer" data-testid="counter-drawer-link">
            {t('counter.openDrawer')}
          </Link>
        </div>
      ) : null}

      {accountNo ? (
        <AccountPanel
          accountNo={accountNo}
          onChange={() => pick(null)}
          canPost={canPost && !!open && !stale}
        />
      ) : (
        <AccountLookup onPick={(a) => pick(a.accountNo)} />
      )}

      {canApprove ? <AuthorisationQueue /> : null}
      <TodayTable />
    </div>
  )
}

// ── Account lookup ───────────────────────────────────────────────────────────

function AccountLookup({ onPick }: { onPick: (a: AccountSearchItem) => void }) {
  const { t } = useTranslation('teller')
  const [text, setText] = useState('')
  const q = useDebounce(text.trim().toUpperCase(), 300)
  const valid = /^([0-9]{4,12}|CIF-[0-9]{1,6})$/.test(q)
  const results = useQuery({
    queryKey: ['teller-accounts', q],
    queryFn: ({ signal }) =>
      api<{ items: AccountSearchItem[] }>(`/teller/accounts?q=${encodeURIComponent(q)}`, { signal }).then(
        (r) => r.items,
      ),
    enabled: valid,
    staleTime: 30_000,
  })
  return (
    <section className="panel" data-testid="counter-lookup">
      <header>
        <h2>{t('counter.lookup')}</h2>
      </header>
      <div className="body grid g2">
        <Field id="counter-lookup-q" label={t('counter.lookupLabel')} help={t('counter.lookupHelp')}>
          <div className="affix">
            <span aria-hidden>
              <Icon name="search" />
            </span>
            <input
              {...controlProps('counter-lookup-q')}
              className="in mono"
              autoComplete="off"
              autoFocus
              placeholder={t('counter.lookupPlaceholder')}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && results.data?.length === 1) onPick(results.data[0]!)
              }}
            />
            {results.isFetching ? <span className="spin" data-testid="counter-lookup-loading" /> : null}
          </div>
        </Field>
        <div data-testid="counter-lookup-results" data-state={results.isFetching ? 'loading' : 'idle'}>
          {valid && results.data?.length === 0 ? (
            <p className="help" data-testid="counter-lookup-empty">
              {t('counter.noMatches')}
            </p>
          ) : (
            <ul
              className="picklist"
              style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}
            >
              {(valid ? (results.data ?? []) : []).map((a) => (
                <li key={a.accountNo}>
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ width: '100%', justifyContent: 'flex-start', gap: 10 }}
                    data-testid="counter-lookup-option"
                    data-account={a.accountNo}
                    onClick={() => onPick(a)}
                  >
                    <span className="mono">{a.accountNo}</span>
                    <b style={{ fontWeight: 500 }}>{a.customerName}</b>
                    <span className="help">{t(`accountType.${a.type}`)}</span>
                    <span style={{ marginInlineStart: 'auto' }}>
                      <StatusPill value={a.status} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

// ── Holder card + transaction form ───────────────────────────────────────────

function AccountPanel({
  accountNo,
  onChange,
  canPost,
}: {
  accountNo: string
  onChange: () => void
  canPost: boolean
}) {
  const { t, i18n } = useTranslation('teller')
  const lang = i18n.language
  const canSee360 = useCan('customers.360', 'view')
  const account = useQuery({
    queryKey: ['teller-account', accountNo],
    queryFn: () => api<AccountDTO>(`/teller/accounts/${accountNo}`),
    retry: false,
  })

  if (account.error) {
    return (
      <div className="note bad" role="alert" data-testid="counter-account-error">
        <Icon name="warn" />
        <span style={{ flex: 1 }}>
          {account.error instanceof ApiError ? account.error.message : t('common:error.generic')}
        </span>
        <button type="button" className="btn sm" onClick={onChange} data-testid="counter-account-change">
          {t('counter.change')}
        </button>
      </div>
    )
  }
  const a = account.data
  return (
    <>
      <section className="panel" data-testid="counter-account" data-state={a ? 'loaded' : 'loading'}>
        <header>
          <h2>{t('counter.holder')}</h2>
          <div className="grow" />
          <button
            type="button"
            className="btn sm ghost"
            onClick={onChange}
            data-testid="counter-account-change"
          >
            <Icon name="back" />
            {t('counter.change')}
          </button>
        </header>
        {a ? (
          <div className="body grid g4">
            <dl className="kv span2">
              <div>
                <dt>{t('counter.holder')}</dt>
                <dd data-testid="counter-account-name">
                  {canSee360 ? <Link to={`/customers/${a.cif}`}>{a.customerName}</Link> : a.customerName}{' '}
                  <span className="mono help">{a.cif}</span>
                </dd>
              </div>
              <div>
                <dt>{t('counter.columns.account')}</dt>
                <dd className="mono" data-testid="counter-account-no">
                  {a.accountNo} · {t(`accountType.${a.type}`)}
                </dd>
              </div>
              <div>
                <dt>{t('counter.mobile')}</dt>
                <dd className="mono" data-testid="counter-account-mobile">
                  {a.mobile || '—'}
                </dd>
              </div>
            </dl>
            <dl className="kv span2">
              <div>
                <dt>{t('counter.columns.status')}</dt>
                <dd>
                  <StatusPill value={a.status} testId="counter-account-status" />{' '}
                  <StatusPill value={a.customerStatus} testId="counter-customer-status" />
                </dd>
              </div>
              <div>
                <dt>{t('counter.kyc')}</dt>
                <dd>
                  <StatusPill value={a.kycStatus} testId="counter-account-kyc" />
                </dd>
              </div>
              <div>
                <dt>{t('counter.panOnFile')}</dt>
                <dd data-testid="counter-account-pan">{a.panOnFile ? t('counter.yes') : t('counter.no')}</dd>
              </div>
            </dl>
            <div className="tile span-all" style={{ alignItems: 'flex-start' }}>
              <span>{t('counter.balance')}</span>
              <b className="mono" data-testid="counter-account-balance" data-paise={a.balance}>
                {formatPaise(a.balance, lang)}
              </b>
              <span>
                {t('counter.openedAt')} {formatDate(a.openedAt, lang)}
              </span>
            </div>
          </div>
        ) : (
          <div className="body">
            <span className="spin" />
          </div>
        )}
      </section>
      {a ? <TransactionForm key={a.accountNo} account={a} canPost={canPost} /> : null}
    </>
  )
}

function TransactionForm({ account, canPost }: { account: AccountDTO; canPost: boolean }) {
  const { t, i18n } = useTranslation('teller')
  const lang = i18n.language
  const toast = useToast()
  const qc = useQueryClient()
  const errorText = useErrorText()
  const idemKey = useRef(newIdempotencyKey())
  const [type, setType] = useState<TxnType>('cash_deposit')
  const [amountText, setAmountText] = useState('')
  const [denominations, setDenominations] = useState<Denominations>(EMPTY_DENOMINATIONS)
  const [narration, setNarration] = useState('')
  const [pan, setPan] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [result, setResult] = useState<TransactionDTO | null>(null)

  const amountRupees = Number(amountText.replace(/,/g, ''))
  const amount = Number.isFinite(amountRupees) ? Math.round(amountRupees * 100) : 0
  const showPan = needsPan(type, amount, account.panOnFile)
  const held = needsAuthorisation(type, amount)
  const usable = account.status === 'active' && account.customerStatus === 'active'
  const disabled = !canPost || !usable

  const submit = useMutation({
    mutationFn: (body: unknown) =>
      api<TransactionDTO>('/teller/transactions', { method: 'POST', body, idempotencyKey: idemKey.current }),
    onSuccess: (txn) => {
      idemKey.current = newIdempotencyKey()
      setResult(txn)
      setAmountText('')
      setDenominations(EMPTY_DENOMINATIONS)
      setNarration('')
      setPan('')
      toast(
        txn.status === 'posted'
          ? t('counter.posted', { txnNo: txn.txnNo, balance: formatPaise(txn.balanceAfter, lang) })
          : t('counter.held', { txnNo: txn.txnNo }),
        'success',
      )
      void qc.invalidateQueries({ queryKey: ['teller-account', account.accountNo] })
      void qc.invalidateQueries({ queryKey: ['teller-transactions'] })
      void qc.invalidateQueries({ queryKey: ['teller-drawer'] })
    },
    onError: (err) => {
      if (err instanceof ApiError && err.problem.errors) {
        const next: Errors = {}
        for (const e of err.problem.errors) next[e.path as keyof Errors] = e.code ?? e.message
        setErrors(next)
      } else {
        // A 409 (no drawer, overdraw, limits) is a sentence to show as is; a new key lets the user retry.
        idemKey.current = newIdempotencyKey()
        setErrors({ root: err instanceof ApiError ? err.message : t('common:error.generic') })
      }
    },
  })

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setResult(null)
    const body = {
      accountNo: account.accountNo,
      type,
      amount,
      denominations,
      narration,
      panNumber: showPan ? pan : '',
    }
    const parsed = postTransactionSchema.safeParse(body)
    const next: Errors = {}
    if (!amountText.trim()) next.amount = 'required'
    for (const issue of parsed.error?.issues ?? []) {
      const key = String(issue.path[0]) as keyof Errors
      next[key] ??= issue.message
    }
    if (showPan && !pan.trim()) next.panNumber = 'panRequired'
    setErrors(next)
    if (Object.keys(next).length === 0) submit.mutate(body)
  }

  const id = (f: string) => `counter-txn-${f}`
  return (
    <form className="panel" onSubmit={onSubmit} noValidate data-testid="counter-txn-form">
      <header>
        <h2>{t('counter.transaction')}</h2>
      </header>
      <div className="body grid g4">
        {!usable ? (
          <div className="note bad span-all" role="alert" data-testid={id('not-active')}>
            <Icon name="ban" />
            {t('counter.notActive', {
              status: t(
                `common:status.${account.status !== 'active' ? account.status : account.customerStatus}`,
              ),
            })}
          </div>
        ) : null}
        {errors.root ? (
          <div className="note bad span-all" role="alert" data-testid={id('error')}>
            <Icon name="warn" />
            {errors.root}
          </div>
        ) : null}
        {result ? (
          <div
            className={`note ${result.status === 'posted' ? 'ok' : 'warn'} span-all`}
            role="status"
            data-testid={id('result')}
            data-txn={result.txnNo}
            data-status={result.status}
          >
            <Icon name={result.status === 'posted' ? 'check' : 'clock'} />
            {result.status === 'posted'
              ? t('counter.posted', { txnNo: result.txnNo, balance: formatPaise(result.balanceAfter, lang) })
              : t('counter.held', { txnNo: result.txnNo })}
          </div>
        ) : null}

        <FieldGroup id={id('type')} label={t('counter.fields.type')} required className="span2">
          {TXN_TYPES.map((tt) => (
            <label className="choice" key={tt}>
              <input
                type="radio"
                name={id('type')}
                value={tt}
                checked={type === tt}
                disabled={disabled}
                onChange={() => setType(tt)}
                data-testid={`${id('type')}-${tt}`}
              />
              <span>{t(`type.${tt}`)}</span>
            </label>
          ))}
        </FieldGroup>
        <Field
          id={id('amount')}
          label={t('counter.fields.amount')}
          required
          error={errors.amount}
          help={t('counter.amountHelp')}
          className="span2"
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              {...controlProps(id('amount'), errors.amount)}
              className="in num"
              inputMode="decimal"
              disabled={disabled}
              value={amountText}
              onChange={(e) => setAmountText(e.target.value.replace(/[^0-9.,]/g, ''))}
            />
            <button
              type="button"
              className="btn"
              disabled={disabled || !(amountRupees > 0)}
              data-testid={id('fill-notes')}
              onClick={() => setDenominations(suggestDenominations(amountRupees))}
            >
              {t('notes.fill')}
            </button>
          </div>
        </Field>

        {held ? (
          <div className="note info span-all" role="status" data-testid={id('auth-notice')}>
            <Icon name="shield" />
            {t('counter.authNotice')}
          </div>
        ) : null}

        <div className="f span2">
          <span className="lbl req">{t('counter.fields.denominations')}</span>
          <DenominationGrid
            id={id('notes')}
            value={denominations}
            onChange={setDenominations}
            disabled={disabled}
            error={errorText(errors.denominations)}
          />
        </div>
        <div className="span2" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field id={id('narration')} label={t('counter.fields.narration')} error={errors.narration}>
            <input
              {...controlProps(id('narration'), errors.narration)}
              className="in"
              maxLength={80}
              disabled={disabled}
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
            />
          </Field>
          {showPan ? (
            <Field
              id={id('pan')}
              label={t('counter.fields.pan')}
              required
              error={errors.panNumber}
              help={t('counter.panHelp')}
            >
              <input
                {...controlProps(id('pan'), errors.panNumber)}
                className="in mono"
                maxLength={10}
                autoComplete="off"
                disabled={disabled}
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
              />
            </Field>
          ) : null}
        </div>
      </div>
      <div className="actions" style={{ padding: '0 16px 16px' }}>
        <div className="grow" />
        <button
          type="submit"
          className="btn pri"
          disabled={disabled || submit.isPending}
          data-testid={id('submit')}
          data-mode={held ? 'hold' : 'post'}
        >
          {submit.isPending ? <span className="spin" /> : null}
          {held ? t('counter.submitHold') : t('counter.post')}
        </button>
      </div>
    </form>
  )
}

// ── Tables ───────────────────────────────────────────────────────────────────

function TxnRows({
  items,
  withTeller,
  actions,
}: {
  items: TransactionDTO[]
  withTeller?: boolean
  actions?: (t: TransactionDTO) => React.ReactNode
}) {
  const { t, i18n } = useTranslation('teller')
  const lang = i18n.language
  return (
    <table>
      <thead>
        <tr>
          <th>{t('counter.columns.time')}</th>
          <th>{t('counter.columns.txnNo')}</th>
          <th>{t('counter.columns.account')}</th>
          <th>{t('counter.columns.customer')}</th>
          <th>{t('counter.columns.type')}</th>
          <th style={{ textAlign: 'end' }}>{t('counter.columns.amount')}</th>
          {withTeller ? <th>{t('counter.columns.teller')}</th> : null}
          <th>{t('counter.columns.status')}</th>
          {actions ? <th /> : <th style={{ textAlign: 'end' }}>{t('counter.columns.balanceAfter')}</th>}
        </tr>
      </thead>
      <tbody>
        {items.map((x) => (
          <tr key={x.txnNo} data-testid="txn-row" data-txn={x.txnNo} data-status={x.status}>
            <td className="mono">{formatTime(x.createdAt, lang)}</td>
            <td className="mono">{x.txnNo}</td>
            <td className="mono">{x.accountNo}</td>
            <td>{x.customerName}</td>
            <td>{t(`type.${x.type}`)}</td>
            <td className="mono" style={{ textAlign: 'end' }}>
              {formatPaise(x.amount, lang)}
            </td>
            {withTeller ? <td className="mono">{x.tellerId}</td> : null}
            <td>
              <StatusPill value={x.status} />
            </td>
            {actions ? (
              <td style={{ textAlign: 'end', whiteSpace: 'nowrap' }}>{actions(x)}</td>
            ) : (
              <td className="mono" style={{ textAlign: 'end' }}>
                {formatPaise(x.balanceAfter, lang)}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TodayTable() {
  const { t } = useTranslation('teller')
  const [page, setPage] = useState(1)
  const list = useQuery({
    queryKey: ['teller-transactions', 'mine', page],
    queryFn: () =>
      api<OffsetPage<TransactionDTO>>(`/teller/transactions?scope=mine&page=${page}&pageSize=10`),
    placeholderData: keepPreviousData,
  })
  return (
    <section
      className="panel tw"
      data-testid="counter-today"
      data-state={list.isFetching ? 'loading' : 'loaded'}
    >
      <header>
        <h2>{t('counter.today')}</h2>
      </header>
      {list.data && list.data.items.length === 0 ? (
        <EmptyState testId="counter-today-empty" title={t('counter.none')} />
      ) : list.data ? (
        <>
          <TxnRows items={list.data.items} />
          <Pagination
            testId="counter-today-pagination"
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onPage={setPage}
          />
        </>
      ) : null}
    </section>
  )
}

function AuthorisationQueue() {
  const { t } = useTranslation('teller')
  const toast = useToast()
  const qc = useQueryClient()
  const [rejecting, setRejecting] = useState<TransactionDTO | null>(null)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string>()
  const list = useQuery({
    queryKey: ['teller-transactions', 'pending'],
    queryFn: () =>
      api<OffsetPage<TransactionDTO>>(
        '/teller/transactions?scope=branch&status=pending_authorisation&pageSize=50',
      ),
    refetchInterval: 30_000,
  })
  const decide = useMutation({
    mutationFn: ({
      txnNo,
      decision,
      note,
    }: {
      txnNo: string
      decision: 'approve' | 'reject'
      note?: string
    }) =>
      api<TransactionDTO>(`/teller/transactions/${txnNo}/decision`, {
        method: 'POST',
        body: { decision, note },
      }),
    onSuccess: (txn) => {
      setRejecting(null)
      setNote('')
      toast(
        t(txn.status === 'posted' ? 'counter.approved' : 'counter.rejected', { txnNo: txn.txnNo }),
        'success',
      )
      void qc.invalidateQueries({ queryKey: ['teller-transactions'] })
      void qc.invalidateQueries({ queryKey: ['teller-account'] })
    },
    onError: (err) => {
      const field = err instanceof ApiError ? err.problem.errors?.find((e) => e.path === 'note') : undefined
      if (field) setNoteError(field.code ?? field.message)
      else toast(err instanceof ApiError ? err.message : t('common:error.generic'), 'error')
    },
  })
  const items = list.data?.items ?? []
  return (
    <section className="panel tw" data-testid="counter-pending" data-count={items.length}>
      <header>
        <h2>{t('counter.pending')}</h2>
        {items.length ? <span className="cnt">{items.length}</span> : null}
      </header>
      {list.data && items.length === 0 ? (
        <EmptyState testId="counter-pending-empty" title={t('counter.pendingNone')} />
      ) : (
        <TxnRows
          items={items}
          withTeller
          actions={(x) => (
            <>
              <button
                type="button"
                className="btn sm pri"
                disabled={decide.isPending}
                data-testid="txn-approve"
                onClick={() => decide.mutate({ txnNo: x.txnNo, decision: 'approve' })}
              >
                {t('counter.approve')}
              </button>{' '}
              <button
                type="button"
                className="btn sm"
                disabled={decide.isPending}
                data-testid="txn-reject"
                onClick={() => {
                  setNoteError(undefined)
                  setRejecting(x)
                }}
              >
                {t('counter.reject')}
              </button>
            </>
          )}
        />
      )}
      {rejecting ? (
        <Modal
          testId="txn-reject-modal"
          title={t('counter.rejectTitle', { txnNo: rejecting.txnNo })}
          onClose={() => setRejecting(null)}
          footer={
            <>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setRejecting(null)}
                data-testid="txn-reject-cancel"
              >
                {t('common:cancel')}
              </button>
              <button
                type="button"
                className="btn pri"
                disabled={decide.isPending}
                data-testid="txn-reject-confirm"
                onClick={() => {
                  if (note.trim().length < 10) return setNoteError('decisionNoteRequired')
                  decide.mutate({ txnNo: rejecting.txnNo, decision: 'reject', note })
                }}
              >
                {t('counter.reject')}
              </button>
            </>
          }
        >
          <Field id="txn-reject-note" label={t('counter.rejectNote')} required error={noteError}>
            <textarea
              {...controlProps('txn-reject-note', noteError)}
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
