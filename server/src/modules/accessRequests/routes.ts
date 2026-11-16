// /api/v1/access-requests (public: submit) and /api/v1/admin/access-requests (list, decide).
// The public route is rate-limited like sign-in; the admin routes sit behind requireAdmin.
import { Router } from 'express'
import { z } from 'zod'
import { accessDecisionSchema, accessRequestSchema, offsetQuery } from '@csm/shared'
import { requireCapability } from '../../middleware/auth.ts'
import { createAuthLimiter } from '../../middleware/rateLimit.ts'
import { idempotent } from '../../middleware/idempotency.ts'
import { validate } from '../../lib/validate.ts'
import * as requests from './service.ts'

const listQuery = offsetQuery.extend({
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
})

/** Public router: submitting a request. */
export function accessRequestRoutes(rateLimit?: number): Router {
  const router = Router()
  // POST / { fullName, email, mobile, employeeNo, branchCode, roleRequested, … }
  router.post('/', createAuthLimiter(rateLimit), validate('body', accessRequestSchema), async (req, res) => {
    res.status(201).json(await requests.submit(req, req.valid!.body as z.infer<typeof accessRequestSchema>))
  })
  return router
}

/** Admin router (mounted inside /admin, so requireAdmin already applies). */
export function accessRequestAdminRoutes(): Router {
  const router = Router()
  // GET /admin/access-requests?status=pending&page=&pageSize=
  router.get(
    '/',
    requireCapability('admin.users', 'view'),
    validate('query', listQuery),
    async (req, res) => {
      res.json(await requests.list(req.valid!.query as z.infer<typeof listQuery>))
    },
  )
  // POST /admin/access-requests/:id/decision { decision: 'approve', staffId, roleKey, branchCode } | { decision: 'reject', note }
  router.post(
    '/:id/decision',
    requireCapability('admin.users', 'create'),
    idempotent,
    validate('body', accessDecisionSchema),
    async (req, res) => {
      res.json(
        await requests.decide(
          req,
          String(req.params.id),
          req.valid!.body as z.infer<typeof accessDecisionSchema>,
        ),
      )
    },
  )
  return router
}
