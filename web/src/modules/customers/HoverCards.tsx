/**
 * Hover previews (FR-CUS-023): resting on a CIF shows a customer card, resting on a staff ID shows
 * name, role and branch. Used on Customer search, the Request board and the approval queue. The
 * triggers' only hook is their title, e.g. [title="Preview CIF-000124"] (plan §3, TTL).
 */
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { CustomerCardDTO, StaffCardDTO } from '@csm/shared'
import { api } from '../../api/client.ts'
import { StatusPill } from '../../components/Badges.tsx'
import { HoverCard } from '../../components/overlays/HoverCard.tsx'
import { SkeletonLine } from '../../components/data/Skeleton.tsx'
import './customers.css'

function CustomerCardBody({ customerRef }: { customerRef: string }) {
  const { t } = useTranslation('customers')
  const { data, isError } = useQuery({
    queryKey: ['customer-card', customerRef],
    queryFn: () => api<CustomerCardDTO>(`/customers/${customerRef}/card`),
    staleTime: 60_000,
  })
  if (isError) return <span className="help">{t('preview.unavailable')}</span>
  if (!data) return <SkeletonLine width="180px" />
  return (
    <span className="preview-card">
      <b>{data.name}</b>
      <span className="mono help">
        {data.ref} · {data.branchCode}
      </span>
      <span className="preview-pills">
        <StatusPill value={data.status} />
        <StatusPill value={data.kycStatus} prefix={`${t('preview.kyc')}: `} />
        {data.riskRating ? (
          <StatusPill value={data.riskRating} prefix={`${t('fields.riskRating')}: `} />
        ) : null}
      </span>
      {data.mobile ? <span className="mono">{data.mobile}</span> : null}
    </span>
  )
}

/** A CIF (or draft number) with a customer preview on hover or focus. */
export function CustomerHoverCard({ customerRef, children }: { customerRef: string; children: ReactNode }) {
  const { t } = useTranslation('customers')
  return (
    <HoverCard
      title={t('preview.customerTitle', { ref: customerRef })}
      render={() => <CustomerCardBody customerRef={customerRef} />}
    >
      {children}
    </HoverCard>
  )
}

function StaffCardBody({ staffId }: { staffId: string }) {
  const { t } = useTranslation('customers')
  const { data, isError } = useQuery({
    queryKey: ['staff-card', staffId],
    queryFn: () => api<StaffCardDTO>(`/staff/${staffId}/card`),
    staleTime: 5 * 60_000,
  })
  if (isError) return <span className="help">{t('preview.unavailable')}</span>
  if (!data) return <SkeletonLine width="140px" />
  return (
    <span className="preview-card">
      <b>{data.name}</b>
      <span className="help">
        {t(`common:role.${data.roleKey}`, { defaultValue: data.roleKey })} · {data.branchCode}
      </span>
      <span className="mono help">{data.staffId}</span>
    </span>
  )
}

/** A staff ID with a staff preview on hover or focus. */
export function StaffHoverCard({ staffId, children }: { staffId: string; children: ReactNode }) {
  const { t } = useTranslation('customers')
  return (
    <HoverCard
      title={t('preview.staffTitle', { staffId })}
      render={() => <StaffCardBody staffId={staffId} />}
    >
      {children}
    </HoverCard>
  )
}
