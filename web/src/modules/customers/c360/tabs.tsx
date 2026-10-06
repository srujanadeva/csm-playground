/**
 * Customer 360 tab panels. Each panel fetches its own data the first time it is shown;
 * the Service requests and Audit log tabs load more as you scroll (cursor pagination).
 */
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { AuditEntryDTO, CursorPage, CustomerDetail, ServiceRequestCard } from '@csm/shared'
import { ApiError, api } from '../../../api/client.ts'
import { useCan } from '../../../app/auth.tsx'
import { PriorityBadge, SlaTimer, StatusPill } from '../../../components/Badges.tsx'
import { Icon } from '../../../components/Icon.tsx'
import { useToast } from '../../../components/Toast.tsx'
import { EmptyState, InfiniteSentinel, Loading } from '../../../components/Widgets.tsx'
import { useLookupLabel } from '../../../hooks/useLookups.ts'
import { formatDate, formatDateTime, formatInr } from '../../../lib/format.ts'
import { DocumentsPanel } from '../onboard/shared.tsx'

function Item({ label, value, testId }: { label: string; value: ReactNode; testId: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-testid={testId}>{value === undefined || value === null || value === '' ? '—' : value}</dd>
    </div>
  )
}

/** Personal and employment details. */
export function OverviewTab({ c }: { c: CustomerDetail }) {
  const { t, i18n } = useTranslation('customers')
  const lang = i18n.language
  const country = useLookupLabel('countries')
  const occupation = useLookupLabel('occupations')
  const product = useLookupLabel('products')
  const p = c.personal as Record<string, string | number | string[] | undefined>
  return (
    <dl className="kv" data-testid="c360-overview">
      <Item label={t('fields.dob')} testId="c360-dob" value={formatDate(p.dob as string, lang)} />
      <Item
        label={t('fields.nationality')}
        testId="c360-nationality"
        value={country(p.nationality as string)}
      />
      <Item
        label={t('fields.gender')}
        testId="c360-gender"
        value={p.gender ? t(`values.gender.${p.gender}`) : null}
      />
      <Item
        label={t('fields.maritalStatus')}
        testId="c360-marital"
        value={p.maritalStatus ? t(`values.maritalStatus.${p.maritalStatus}`) : null}
      />
      <Item
        label={t('fields.fatherOrSpouseName')}
        testId="c360-father"
        value={p.fatherOrSpouseName as string}
      />
      <Item
        label={t('fields.occupation')}
        testId="c360-occupation"
        value={occupation(p.occupation as string)}
      />
      <Item label={t('fields.employer')} testId="c360-employer" value={p.employer as string} />
      <Item
        label={t('fields.monthlyIncome')}
        testId="c360-income"
        value={formatInr(p.monthlyIncome as number, lang)}
      />
      <Item label={t('fields.segment')} testId="c360-segment" value={t(`values.segment.${c.segment}`)} />
      <Item
        label={t('fields.preferredLanguage')}
        testId="c360-language"
        value={p.preferredLanguage === 'kn' ? 'ಕನ್ನಡ' : 'English'}
      />
      <Item
        label={t('fields.productsOfInterest')}
        testId="c360-products"
        value={((p.productsOfInterest as string[]) ?? []).map(product).join(', ')}
      />
      <Item label={t('c360.since')} testId="c360-since" value={formatDate(c.createdAt, lang)} />
    </dl>
  )
}

/** Phone, email, preferences and addresses (masked without viewPII). */
export function ContactTab({ c }: { c: CustomerDetail }) {
  const { t } = useTranslation('customers')
  const state = useLookupLabel('states')
  const addr = (a?: CustomerDetail['addresses']['permanent']) =>
    a ? [a.line1, a.line2, a.locality, a.city, state(a.state), a.pincode].filter(Boolean).join(', ') : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {c.piiMasked ? (
        <div className="note info" data-testid="c360-pii-masked">
          <Icon name="lock" />
          <span>{t('c360.piiMasked')}</span>
        </div>
      ) : null}
      <dl className="kv" data-testid="c360-contact">
        <Item
          label={t('fields.mobile')}
          testId="c360-mobile"
          value={<span className="mono">{c.contact.mobile}</span>}
        />
        <Item
          label={t('fields.altMobile')}
          testId="c360-alt-mobile"
          value={c.contact.altMobile ? <span className="mono">{c.contact.altMobile}</span> : null}
        />
        <Item label={t('fields.email')} testId="c360-email" value={c.contact.email} />
        <Item
          label={t('fields.commPrefs')}
          testId="c360-comm"
          value={(c.contact.commPrefs ?? []).map((x) => t(`values.commPrefs.${x}`)).join(', ')}
        />
        <div className="span2">
          <dt>{t('onboard.contact.permanent')}</dt>
          <dd data-testid="c360-permanent">{addr(c.addresses.permanent) ?? '—'}</dd>
        </div>
        <div className="span2">
          <dt>{t('onboard.contact.mailing')}</dt>
          <dd data-testid="c360-mailing">
            {c.addresses.mailingSameAsPermanent
              ? t('onboard.review.sameAsPermanent')
              : (addr(c.addresses.mailing) ?? '—')}
          </dd>
        </div>
      </dl>
    </div>
  )
}

/** ID details with an audited "reveal" for viewPII users, and the documents. */
export function KycTab({ c, onChanged }: { c: CustomerDetail; onChanged: () => void }) {
  const { t, i18n } = useTranslation('customers')
  const lang = i18n.language
  const toast = useToast()
  const canPII = useCan('customers.360', 'viewPII')
  const canEdit = useCan('customers.360', 'edit')
  const [revealed, setRevealed] = useState<string | null>(null)
  const reveal = useMutation({
    mutationFn: () => api<{ idNumber: string }>(`/customers/${c.ref}/reveal-id`, { method: 'POST' }),
    onSuccess: (d) => setRevealed(d.idNumber),
    onError: (err) => toast(err instanceof ApiError ? err.message : t('common:error.generic'), 'error'),
  })
  const k = c.kyc
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <dl className="kv" data-testid="c360-kyc">
        <Item
          label={t('fields.idType')}
          testId="c360-id-type"
          value={k.idType ? t(`values.idType.${k.idType}`) : null}
        />
        <Item
          label={t('fields.idNumber')}
          testId="c360-id-number"
          value={
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <span className="mono">{revealed ?? k.idNumberMasked}</span>
              {canPII && !revealed ? (
                <button
                  type="button"
                  className="btn ghost sm"
                  data-testid="c360-reveal-id"
                  disabled={reveal.isPending}
                  onClick={() => reveal.mutate()}
                >
                  <Icon name="eye" />
                  {t('c360.reveal')}
                </button>
              ) : null}
            </span>
          }
        />
        <Item label={t('fields.issueDate')} testId="c360-issue" value={formatDate(k.issueDate, lang)} />
        <Item
          label={t('fields.expiryDate')}
          testId="c360-expiry"
          value={k.expiryDate ? formatDate(k.expiryDate, lang) : t('onboard.kyc.noExpiry')}
        />
        <Item
          label={t('c360.kycStatus')}
          testId="c360-kyc-status"
          value={k.status ? <StatusPill value={k.status} /> : null}
        />
        <Item
          label={t('fields.riskRating')}
          testId="c360-risk"
          value={k.riskRating ? <StatusPill value={k.riskRating} /> : null}
        />
        <Item label={t('fields.pep')} testId="c360-pep" value={t(k.pep ? 'common:yes' : 'common:no')} />
        <Item
          label={t('fields.fatca')}
          testId="c360-fatca"
          value={t(k.fatcaUsPerson ? 'common:yes' : 'common:no')}
        />
        {k.pep && k.pepDetails ? (
          <div className="span-all">
            <dt>{t('fields.pepPosition')}</dt>
            <dd data-testid="c360-pep-details">
              {String(k.pepDetails.position ?? '')} · {String(k.pepDetails.since ?? '')} ·{' '}
              {String(k.pepDetails.sourceOfWealth ?? '')}
            </dd>
          </div>
        ) : null}
      </dl>
      <div>
        <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>{t('docs.title')}</h3>
        <DocumentsPanel
          customerRef={c.ref}
          documents={c.documents}
          canUpload={canEdit && c.status !== 'closed'}
          canDelete={false}
          onChanged={onChanged}
          idPrefix="c360"
        />
      </div>
    </div>
  )
}

/** The customer's service requests, newest first. */
export function RequestsTab({ c }: { c: CustomerDetail }) {
  const { t } = useTranslation('customers')
  const q = useInfiniteQuery({
    queryKey: ['customer', c.ref, 'requests'],
    queryFn: ({ pageParam }) =>
      api<CursorPage<ServiceRequestCard>>(
        `/customers/${c.ref}/service-requests?limit=10${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  if (q.isLoading) return <Loading testId="c360-requests-loading" />
  const items = q.data?.pages.flatMap((p) => p.items) ?? []
  if (!items.length) return <EmptyState testId="c360-requests-empty" title={t('c360.noRequests')} />
  return (
    <div className="tw">
      <table data-testid="c360-requests">
        <tbody>
          {items.map((r) => (
            <tr key={r.srNo} data-row-id={r.srNo} data-testid="c360-request-row">
              <td>
                <Link to={`/service-requests?sr=${r.srNo}`} className="mono">
                  {r.srNo}
                </Link>
              </td>
              <td>{r.subject}</td>
              <td>
                <PriorityBadge value={r.priority} />
              </td>
              <td>
                <StatusPill value={r.status} />
              </td>
              <td>
                <SlaTimer slaDueAt={r.slaDueAt} status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <InfiniteSentinel
        testId="c360-requests-more"
        hasMore={!!q.hasNextPage}
        loading={q.isFetchingNextPage}
        onVisible={() => void q.fetchNextPage()}
      />
    </div>
  )
}

/** Field-level change history, newest first. */
export function AuditTab({ c }: { c: CustomerDetail }) {
  const { t, i18n } = useTranslation('customers')
  const q = useInfiniteQuery({
    queryKey: ['customer', c.ref, 'audit'],
    queryFn: ({ pageParam }) =>
      api<CursorPage<AuditEntryDTO>>(
        `/customers/${c.ref}/audit?limit=10${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  if (q.isLoading) return <Loading testId="c360-audit-loading" />
  const items = q.data?.pages.flatMap((p) => p.items) ?? []
  if (!items.length) return <EmptyState testId="c360-audit-empty" title={t('c360.noAudit')} />
  const show = (v: unknown) =>
    v === null || v === undefined || v === '' ? '—' : Array.isArray(v) ? v.join(', ') : String(v)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="c360-audit">
      {items.map((a) => (
        <div key={a.id} data-testid="c360-audit-entry" data-action={a.action}>
          <b>{t(`audit.${a.action}`, { defaultValue: a.action })}</b>
          {a.changes?.length ? (
            <ul style={{ margin: '4px 0', paddingInlineStart: 18, fontSize: 13 }}>
              {a.changes.map((ch) => (
                <li key={ch.field}>
                  <span className="mono">{ch.field}</span>: {show(ch.from)} → {show(ch.to)}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="help">
            <span className="mono">{a.actor}</span> · {formatDateTime(a.createdAt, i18n.language)}
          </div>
        </div>
      ))}
      <InfiniteSentinel
        testId="c360-audit-more"
        hasMore={!!q.hasNextPage}
        loading={q.isFetchingNextPage}
        onVisible={() => void q.fetchNextPage()}
      />
    </div>
  )
}
