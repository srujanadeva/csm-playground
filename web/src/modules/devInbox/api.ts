// Dev inbox API (development only: the server doesn't mount it in production).
import type { InboxMessageDTO } from '@csm/shared'
import { api } from '../../api/client.ts'

export const fetchInbox = (q: { staffId?: string; channel?: string }) => {
  const qs = new URLSearchParams({
    limit: '50',
    ...(q.staffId ? { staffId: q.staffId } : {}),
    ...(q.channel ? { channel: q.channel } : {}),
  })
  return api<{ items: InboxMessageDTO[] }>(`/dev/inbox?${qs}`)
}

export const clearInbox = () => api<{ deleted: number }>('/dev/inbox', { method: 'DELETE' })
