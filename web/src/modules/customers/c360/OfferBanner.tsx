/**
 * The cross-sell offer on Customer 360 (FR-CUS-026): at most one, chosen by the server. "Not now" hides
 * it for this customer for 30 days in this browser. Found by class only (plan §3, CLS): .promo-banner,
 * .promo-banner .btn.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { OfferDTO } from '@csm/shared'
import { api } from '../../../api/client.ts'
import { LocatorBadge } from '../../../components/LocatorBadge.tsx'
import { formatInr } from '../../../lib/format.ts'

const SNOOZE_DAYS = 30
const key = (ref: string) => `csm.offerSnooze.${ref}`

/** Whether "Not now" was chosen for this customer within the last 30 days. */
function snoozed(ref: string): boolean {
  try {
    const until = Number(localStorage.getItem(key(ref)))
    return Number.isFinite(until) && until > Date.now()
  } catch {
    return false
  }
}

/** The offer banner, or nothing. */
export function OfferBanner({ customerRef }: { customerRef: string }) {
  const { t, i18n } = useTranslation('customers')
  const [hidden, setHidden] = useState(() => snoozed(customerRef))
  const { data } = useQuery({
    queryKey: ['customer', customerRef, 'offer'],
    queryFn: () => api<{ offer: OfferDTO | null }>(`/customers/${customerRef}/offers`).then((r) => r.offer),
    enabled: !hidden,
  })
  if (hidden || !data) return null
  const params = {
    ...data.params,
    ...(typeof data.params.limit === 'number' ? { limit: formatInr(data.params.limit, i18n.language) } : {}),
  }
  return (
    <div className="promo-banner" data-offer={data.key}>
      <div className="promo-text">
        <b>{t(`offers.${data.key}.title`, params)}</b>
        <span>{t(`offers.${data.key}.body`, params)}</span>
      </div>
      <LocatorBadge style="CLS" />
      <button
        type="button"
        className="btn sm"
        onClick={() => {
          try {
            localStorage.setItem(key(customerRef), String(Date.now() + SNOOZE_DAYS * 86_400_000))
          } catch {
            // Storage blocked: hide for this visit only.
          }
          setHidden(true)
        }}
      >
        {t('offers.notNow')}
      </button>
    </div>
  )
}
