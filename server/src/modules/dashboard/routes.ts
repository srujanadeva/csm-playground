/** /api/v1/dashboard/summary — the counts on the Dashboard tiles, all in the caller's scope. */
import { Router } from 'express'
import { can, type DashboardSummary } from '@csm/shared'
import { branchScope, requireCapability } from '../../middleware/auth.ts'
import { op } from '../../lib/query.ts'
import { ApprovalModel } from '../approvals/approval.model.ts'
import { CustomerModel } from '../customers/customer.model.ts'
import { ServiceRequestModel } from '../serviceRequests/serviceRequest.model.ts'

/** Builds the dashboard router. */
export function dashboardRoutes(): Router {
  const router = Router()
  router.get('/summary', requireCapability('dashboard', 'view'), async (req, res) => {
    const scope = branchScope(req)
    const me = req.auth!.user.staffId
    const working = op({ $in: ['open', 'in_progress'] })
    const canApprove = can(req.auth!.permissions, 'customers.360', 'approve')
    const [myOpenRequests, overdueRequests, pendingApprovals, customersInScope, draftsByMe] =
      await Promise.all([
        ServiceRequestModel.countDocuments({ assignedTo: me, status: working }),
        ServiceRequestModel.countDocuments({ ...scope, status: working, slaDueAt: op({ $lt: new Date() }) }),
        canApprove ? ApprovalModel.countDocuments({ ...scope, status: 'pending' }) : Promise.resolve(null),
        CustomerModel.countDocuments({ ...scope, status: op({ $ne: 'draft' }) }),
        CustomerModel.countDocuments({ createdBy: me, status: 'draft' }),
      ])
    const summary: DashboardSummary = {
      myOpenRequests,
      overdueRequests,
      pendingApprovals,
      customersInScope,
      draftsByMe,
    }
    res.json(summary)
  })
  return router
}
