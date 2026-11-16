// The locator-style badge for practice sections (plan §3: TID, ID, NAME, CLS, TXT, ARIA, LBL, TTL,
// DATA, DYN, DUP, XP, CTX). Hidden unless the URL has ?hints=1, so testers can practise without it.
import { useTranslation } from 'react-i18next'
import { useLocatorHints } from '../hooks/useUrlNumber.ts'
import type { LocatorStyle } from '../lib/locators.ts'

export type { LocatorStyle }

/** A small pill naming the locator style; renders nothing without ?hints=1. */
export function LocatorBadge({ style }: { style: LocatorStyle }) {
  const { t } = useTranslation('ui')
  if (!useLocatorHints()) return null
  return (
    <span className="locator-badge" title={t(`locator.${style}`)}>
      {style}
    </span>
  )
}
