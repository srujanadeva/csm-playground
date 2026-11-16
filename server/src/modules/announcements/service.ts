// Announcements currently in force for the signed-in user's branch.
import type { Request } from 'express'
import type { AnnouncementDTO } from '@csm/shared'
import { op } from '../../lib/query.ts'
import { AnnouncementModel } from './announcement.model.ts'

/** Live now (started, not ended), for everyone or for the user's branch; most severe first. */
export async function active(req: Request): Promise<AnnouncementDTO[]> {
  const now = new Date()
  const rows = await AnnouncementModel.find({
    startsAt: op({ $lte: now }),
    $or: [{ endsAt: null }, { endsAt: op({ $gt: now }) }],
    branchCodes: op({ $in: [[], req.auth!.user.branchCode] }),
  })
    .sort({ startsAt: -1 })
    .limit(5)
    .lean()
  const rank = { critical: 0, warning: 1, info: 2 } as const
  return rows
    .map((a) => ({
      id: String(a._id),
      title: a.title,
      bodyHtml: a.bodyHtml,
      severity: a.severity,
      color: a.color,
      // FR-NAV-002: critical notices always stay up, whatever the stored flag says.
      dismissible: a.severity !== 'critical' && a.dismissible,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt ? a.endsAt.toISOString() : null,
    }))
    .sort((a, b) => rank[a.severity] - rank[b.severity])
}
