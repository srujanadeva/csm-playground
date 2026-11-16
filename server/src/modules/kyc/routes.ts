// /api/v1/kyc: reading ID cards and e-KYC sessions for the onboarding wizard. Both need Create or
// Edit on Onboard customer.
import { Router, type RequestHandler } from 'express'
import { can, ekycStartSchema } from '@csm/shared'
import type { Config } from '../../config.ts'
import { requireAuth } from '../../middleware/auth.ts'
import { forbidden } from '../../lib/errors.ts'
import { singleUpload } from '../../lib/uploads.ts'
import { validate } from '../../lib/validate.ts'
import * as kyc from './service.ts'

const canOnboard: RequestHandler = (req, _res, next) => {
  const p = req.auth!.permissions
  if (!can(p, 'customers.onboard', 'create') && !can(p, 'customers.onboard', 'edit')) throw forbidden()
  next()
}

/** Builds the KYC router. */
export function kycRoutes(config: Config): Router {
  const router = Router()
  router.use(requireAuth(), canOnboard)

  // POST /kyc/ocr (multipart "file")
  router.post('/ocr', singleUpload, (req, res) => {
    res.json(kyc.readCard(req.file))
  })

  // POST /kyc/ekyc/sessions { customerRef }
  router.post('/ekyc/sessions', validate('body', ekycStartSchema), async (req, res) => {
    const { customerRef } = req.valid!.body as { customerRef: string }
    res.status(201).json(await kyc.startEkyc(req, customerRef, config))
  })

  // GET /kyc/ekyc/sessions/:id
  router.get('/ekyc/sessions/:id', async (req, res) => {
    res.json(await kyc.ekycResult(req, String(req.params.id)))
  })

  return router
}
