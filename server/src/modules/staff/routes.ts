// /api/v1/staff: the staff directory card shown when hovering a staff ID (FR-CUS-023). Any signed-in
// user may read it; it carries only name, role and branch.
import { Router } from 'express'
import { staffIdSchema, type StaffCardDTO } from '@csm/shared'
import { requireAuth } from '../../middleware/auth.ts'
import { notFound } from '../../lib/errors.ts'
import { StaffUserModel } from '../auth/staffUser.model.ts'

/** Builds the staff directory router. */
export function staffRoutes(): Router {
  const router = Router()

  // GET /staff/:staffId/card
  router.get('/:staffId/card', requireAuth(), async (req, res) => {
    const staffId = String(req.params.staffId)
    if (!staffIdSchema.safeParse(staffId).success) throw notFound('Staff member not found.')
    const u = await StaffUserModel.findOne({ staffId }).select('staffId name roleKey branchCode').lean()
    if (!u) throw notFound('Staff member not found.')
    const body: StaffCardDTO = {
      staffId: u.staffId,
      name: u.name,
      roleKey: u.roleKey,
      branchCode: u.branchCode as StaffCardDTO['branchCode'],
    }
    res.json(body)
  })

  return router
}
