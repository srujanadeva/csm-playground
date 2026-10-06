/**
 * Dropdown values from /lookups. Fetched the first time a screen needs them and cached for
 * the session (they change only through the database seed).
 */
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { LookupItem, LookupType } from '@csm/shared'
import { api } from '../api/client.ts'
import { label } from '../lib/format.ts'

/** Lookup items for a type (optionally only children of `parent`). */
export function useLookups(type: LookupType, parent?: string, enabled = true) {
  return useQuery({
    queryKey: ['lookups', type, parent ?? null],
    queryFn: () =>
      api<{ items: LookupItem[] }>(`/lookups/${type}${parent ? `?parent=${parent}` : ''}`).then(
        (r) => r.items,
      ),
    staleTime: Infinity,
    gcTime: Infinity,
    enabled,
  })
}

/** A function that turns a lookup code into its label in the current language. */
export function useLookupLabel(type: LookupType) {
  const { i18n } = useTranslation()
  const { data } = useLookups(type)
  return (code: string | undefined | null) => {
    if (!code) return '—'
    const item = data?.find((i) => i.code === code)
    return item ? label(item.labels, i18n.language) : code
  }
}
