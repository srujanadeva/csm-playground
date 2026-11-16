// /api/v1/dev/inbox: the development inbox for codes and notices the app "sent". Public on purpose
// (signed-out users need their reset code), so it is only mounted outside production.
import { Router } from 'express'
import { z } from 'zod'
import { staffIdSchema } from '@csm/shared'
import { validate } from '../../lib/validate.ts'
import * as outbox from './service.ts'

const inboxQuery = z.object({
  staffId: z.preprocess((v) => (v === '' ? undefined : v), staffIdSchema.optional()),
  channel: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['sms', 'email']).optional()),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

/** Builds the dev inbox router. */
export function devInboxRoutes(): Router {
  const router = Router()

  // GET /dev/inbox?staffId=&channel=&limit=
  router.get('/inbox', validate('query', inboxQuery), async (req, res) => {
    res.json({ items: await outbox.inbox(req.valid!.query as z.infer<typeof inboxQuery>) })
  })

  // DELETE /dev/inbox
  router.delete('/inbox', async (_req, res) => {
    res.json({ deleted: await outbox.clear() })
  })

  return router
}
