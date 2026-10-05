import { Router } from 'express'
import type { Config } from '../../config.ts'
import { issueCsrfToken } from '../../middleware/csrf.ts'

// Phase 1 exposes only the CSRF token endpoint; sign-in, sign-out and /me arrive in phase 2.
export function authRoutes(config: Config): Router {
  const router = Router()

  router.get('/csrf', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json({ csrfToken: issueCsrfToken(res, config.CSRF_SECRET, req.sessionId) })
  })

  return router
}
