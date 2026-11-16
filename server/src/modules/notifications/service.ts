// Sending (really: storing) SMS and e-mail, and reading them back for the dev inbox.
import type { InboxMessageDTO } from '@csm/shared'
import { OutboxModel } from './outbox.model.ts'

const KEEP_MS = 24 * 60 * 60_000

export interface Outgoing {
  channel: 'sms' | 'email'
  to: string
  staffId?: string | null
  subject: string
  body: string
  purpose: string
}

/** Queues a message. Never throws into the caller: a lost notification mustn't fail a request. */
export async function send(msg: Outgoing): Promise<void> {
  try {
    await OutboxModel.create({
      ...msg,
      staffId: msg.staffId ?? null,
      expiresAt: new Date(Date.now() + KEEP_MS),
    })
  } catch {
    // The outbox is best-effort by design (a real gateway can be down too).
  }
}

/**
 * Newest messages first, optionally for one staff user or one channel.
 * @param limit At most 100.
 */
export async function inbox(q: { staffId?: string; channel?: 'sms' | 'email'; limit: number }) {
  const filter: Record<string, string> = {}
  if (q.staffId) filter.staffId = q.staffId
  if (q.channel) filter.channel = q.channel
  const rows = await OutboxModel.find(filter).sort({ _id: -1 }).limit(Math.min(100, q.limit)).lean()
  return rows.map((r): InboxMessageDTO => ({
    id: String(r._id),
    channel: r.channel,
    to: r.to,
    staffId: r.staffId ?? null,
    subject: r.subject,
    body: r.body,
    purpose: r.purpose,
    createdAt: new Date(r.createdAt as Date).toISOString(),
  }))
}

/** Empties the inbox (dev only). */
export async function clear(): Promise<number> {
  return (await OutboxModel.deleteMany({})).deletedCount
}
