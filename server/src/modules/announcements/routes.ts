// /api/v1/announcements: what the announcement bar shows. Any signed-in user may read it.
import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.ts'
import * as announcements from './service.ts'

/** Builds the announcements router. */
export function announcementRoutes(): Router {
  const router = Router()
  // GET /announcements/active
  router.get('/active', requireAuth(), async (req, res) => {
    res.json({ items: await announcements.active(req) })
  })
  return router
}
