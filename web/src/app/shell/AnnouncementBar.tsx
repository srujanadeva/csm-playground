// Announcements across the top of the signed-in app, most severe first. Located by class only
// (.ann-bar, .ann, .ann-critical, .ann-close): there are no ids or test ids. Dismissals are
// remembered in this browser; critical notices can't be dismissed.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { AnnouncementDTO } from '@csm/shared'
import { api } from '../../api/client.ts'
import { RichTextView } from '../../components/data/RichTextView.tsx'
import { readStored, writeStored } from '../../lib/storage.ts'

const DISMISSED_KEY = 'csm.dismissedAnnouncements'

/** The bar; renders nothing when there's nothing to show. */
export function AnnouncementBar() {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState<string[]>(() => readStored<string[]>(DISMISSED_KEY, []))
  const { data } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => api<{ items: AnnouncementDTO[] }>('/announcements/active'),
    staleTime: 5 * 60_000,
  })
  const shown = (data?.items ?? []).filter((a) => !(a.dismissible && dismissed.includes(a.id)))
  if (!shown.length) return null
  const dismiss = (id: string) => {
    // Keep only ids still live, so the list doesn't grow forever.
    const live = new Set((data?.items ?? []).map((a) => a.id))
    const next = [...dismissed.filter((d) => live.has(d)), id]
    writeStored(DISMISSED_KEY, next)
    setDismissed(next)
  }
  return (
    <div className="ann-bar" role="region" aria-label={t('announcements.label')}>
      {shown.map((a) => (
        <div key={a.id} className={`ann ann-${a.severity}`} style={{ borderInlineStartColor: a.color }}>
          <b className="ann-title">{a.title}</b>
          <RichTextView html={a.bodyHtml} className="ann-body" />
          {a.dismissible ? (
            <button
              type="button"
              className="ann-close"
              aria-label={t('announcements.dismiss')}
              onClick={() => dismiss(a.id)}
            >
              ✕
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}
