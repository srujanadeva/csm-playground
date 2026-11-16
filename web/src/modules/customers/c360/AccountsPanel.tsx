/**
 * Accounts on Customer 360 with copy buttons, and "Confirm account number" (FR-CUS-024): staff key
 * in the number the customer reads out; the screen says whether it matches and whether it was typed
 * or pasted. Locators are plain ids (plan §3, ID): #acct-<number>, #copy-acct-<number>,
 * #confirm-account-no and #confirm-account-result (data-match, data-source).
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { CustomerAccountDTO, CustomerDetail } from '@csm/shared'
import { api } from '../../../api/client.ts'
import { StatusPill } from '../../../components/Badges.tsx'
import { Icon } from '../../../components/Icon.tsx'
import { LocatorBadge } from '../../../components/LocatorBadge.tsx'
import { Skeleton } from '../../../components/data/Skeleton.tsx'
import { useClipboard, usePasteCheck } from '../../../hooks/useClipboard.ts'
import { formatDate } from '../../../lib/format.ts'

/** The Accounts panel. */
export function AccountsPanel({ c }: { c: CustomerDetail }) {
  const { t, i18n } = useTranslation('customers')
  const { data, isLoading } = useQuery({
    queryKey: ['customer', c.ref, 'accounts'],
    queryFn: () => api<{ items: CustomerAccountDTO[] }>(`/customers/${c.ref}/accounts`).then((r) => r.items),
  })
  const clipboard = useClipboard()
  const [copied, setCopied] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const paste = usePasteCheck()
  const digits = typed.replace(/\D/g, '')
  const match = digits ? (data ?? []).some((a) => a.accountNo === digits) : null

  return (
    <section className="panel accounts">
      <header>
        <h2>{t('accounts.title')}</h2>
        <LocatorBadge style="ID" />
      </header>
      <div className="body">
        {isLoading ? (
          <Skeleton kind="lines" rows={2} />
        ) : !data?.length ? (
          <p className="help">{t('accounts.none')}</p>
        ) : (
          <ul className="acct-list">
            {data.map((a) => (
              <li key={a.accountNo}>
                <span className="mono" id={`acct-${a.accountNo}`}>
                  {a.accountNo}
                </span>
                <span className="help">
                  {t(`accounts.types.${a.type}`)} ·{' '}
                  {t('accounts.opened', { date: formatDate(a.openedAt, i18n.language) })}
                </span>
                <StatusPill value={a.status} />
                <button
                  type="button"
                  className="btn sm ghost"
                  id={`copy-acct-${a.accountNo}`}
                  onClick={() =>
                    void clipboard.copy(a.accountNo).then((ok) => setCopied(ok ? a.accountNo : 'blocked'))
                  }
                >
                  <Icon name={copied === a.accountNo ? 'check' : 'file'} />
                  {copied === a.accountNo ? t('accounts.copied') : t('accounts.copy')}
                </button>
              </li>
            ))}
          </ul>
        )}
        {copied === 'blocked' ? (
          <p className="note warn" role="alert">
            {t('accounts.copyBlocked')}
          </p>
        ) : null}
        {data?.length ? (
          <div className="f acct-confirm">
            <label htmlFor="confirm-account-no">{t('accounts.confirm')}</label>
            <input
              id="confirm-account-no"
              className="in mono"
              inputMode="numeric"
              autoComplete="off"
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value)
                if (!e.target.value) paste.reset()
              }}
              {...paste.handlers}
            />
            {digits ? (
              <span
                id="confirm-account-result"
                role="status"
                data-match={match}
                data-source={paste.source}
                className={match ? 'help ok' : 'errmsg'}
              >
                {t(match ? 'accounts.matches' : 'accounts.noMatch')}{' '}
                {paste.source === 'pasted' ? t('accounts.pasted') : t('accounts.typed')}
              </span>
            ) : (
              <span className="help">{t('accounts.confirmHint')}</span>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}
