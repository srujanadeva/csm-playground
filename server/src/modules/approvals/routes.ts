/** /api/v1/approvals: the supervisors' queue. Needs `approve` on Customer 360. */
import { Router } from 'express'
import { z } from 'zod'
import { requireCapability } from '../../middleware/auth.ts'
import { validate } from '../../lib/validate.ts'
import * as approvals from './service.ts'

const listQuery = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
})
const decisionBody = z.strictObject({ note: z.string().trim().max(500, 'remarksLength').optional() })

/** Builds the approvals router. */
export function approvalRoutes(): Router {
  const router = Router()
  const canApprove = requireCapability('customers.360', 'approve')

  router.get('/', canApprove, validate('query', listQuery), async (req, res) => {
    res.json(await approvals.list(req, req.valid!.query as z.infer<typeof listQuery>))
  })

  for (const decision of ['approve', 'reject'] as const) {
    router.post(`/:id/${decision}`, canApprove, validate('body', decisionBody), async (req, res) => {
      const body = req.valid!.body as z.infer<typeof decisionBody>
      res.json(await approvals.decide(req, String(req.params.id), decision, body.note))
    })
  }
  return router
}
