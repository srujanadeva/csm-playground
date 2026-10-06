/** /api/v1/lookups/:type — dropdown values with English and Kannada labels. Signed-in users only. */
import { Router } from 'express'
import { z } from 'zod'
import { LOOKUP_TYPES, type LookupItem } from '@csm/shared'
import { requireAuth } from '../../middleware/auth.ts'
import { validate } from '../../lib/validate.ts'
import { LookupModel } from './lookup.model.ts'

const params = z.strictObject({ type: z.enum(LOOKUP_TYPES) })
const query = z.strictObject({
  parent: z
    .string()
    .regex(/^[a-z_]{1,40}$/)
    .optional(),
})

/** Builds the lookups router. */
export function lookupRoutes(): Router {
  const router = Router()
  router.get(
    '/:type',
    requireAuth(),
    validate('params', params),
    validate('query', query),
    async (req, res) => {
      const { type } = req.valid!.params as z.infer<typeof params>
      const { parent } = req.valid!.query as z.infer<typeof query>
      const rows = await LookupModel.find({ type, active: true, ...(parent ? { parent } : {}) })
        .sort({ order: 1 })
        .lean()
      const items: LookupItem[] = rows.map((r) => ({
        code: r.code,
        labels: { en: r.labels?.en ?? r.code, kn: r.labels?.kn ?? r.code },
        parent: r.parent ?? null,
      }))
      res.json({ items })
    },
  )
  return router
}
