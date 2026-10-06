/**
 * /api/v1/customers. Each route names the screen capability it needs; the service applies
 * branch scoping and auditing.
 */
import { Router } from 'express'
import { z } from 'zod'
import {
  blockRequestSchema,
  createDraftSchema,
  cursorQuery,
  customerSearchQuery,
  submitSchema,
  typeaheadQuery,
  updateActiveSchema,
  updateDraftSchema,
} from '@csm/shared'
import type { Config } from '../../config.ts'
import { requireAuth, requireCapability } from '../../middleware/auth.ts'
import { idempotent } from '../../middleware/idempotency.ts'
import { singleUpload } from '../../lib/uploads.ts'
import { validate } from '../../lib/validate.ts'
import { forbidden } from '../../lib/errors.ts'
import { can } from '@csm/shared'
import * as customers from './service.ts'

const ref = (p: unknown) => String((p as { ref: string }).ref)
const DOC_KINDS = ['id_front', 'id_back', 'photo', 'address_proof', 'other'] as const

/** Builds the customers router. */
export function customerRoutes(config: Config): Router {
  const router = Router()
  const search = requireCapability('customers.search', 'view')
  const onboardCreate = requireCapability('customers.onboard', 'create')
  const onboardEdit = requireCapability('customers.onboard', 'edit')
  const view360 = requireCapability('customers.360', 'view')

  router.get('/', search, validate('query', customerSearchQuery), async (req, res) => {
    res.json(await customers.search(req, req.valid!.query as z.infer<typeof customerSearchQuery>, config))
  })

  router.get(
    '/export.csv',
    requireCapability('customers.search', 'export'),
    validate('query', customerSearchQuery),
    async (req, res) => {
      const csv = await customers.exportCsv(
        req,
        req.valid!.query as z.infer<typeof customerSearchQuery>,
        config,
      )
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`,
      )
      res.send(csv)
    },
  )

  // Typeahead serves the New request screen too, so either screen's view is enough.
  router.get('/typeahead', requireAuth(), validate('query', typeaheadQuery), async (req, res) => {
    const p = req.auth!.permissions
    if (!can(p, 'customers.search', 'view') && !can(p, 'serviceRequests.new', 'create')) throw forbidden()
    res.json(await customers.typeahead(req, (req.valid!.query as { q: string }).q))
  })

  router.post('/', onboardCreate, idempotent, validate('body', createDraftSchema), async (req, res) => {
    const body = req.valid!.body as z.infer<typeof createDraftSchema>
    res.status(201).json(await customers.createDraft(req, body.personal, config))
  })

  // Form-shaped record for the wizard (drafts) and the 360 edit drawer (customers).
  router.get('/:ref/form', requireAuth(), async (req, res) => {
    const p = req.auth!.permissions
    if (!can(p, 'customers.onboard', 'edit') && !can(p, 'customers.360', 'edit')) throw forbidden()
    res.json(await customers.getForm(req, ref(req.params), config))
  })

  router.patch('/:ref/draft', onboardEdit, validate('body', updateDraftSchema), async (req, res) => {
    res.json(
      await customers.updateDraft(
        req,
        ref(req.params),
        req.valid!.body as z.infer<typeof updateDraftSchema>,
        config,
      ),
    )
  })

  router.post('/:ref/submit', onboardEdit, idempotent, validate('body', submitSchema), async (req, res) => {
    res.json(
      await customers.submit(req, ref(req.params), req.valid!.body as z.infer<typeof submitSchema>, config),
    )
  })

  router.get('/:ref', view360, async (req, res) => {
    res.json(await customers.detail(req, ref(req.params)))
  })

  router.patch(
    '/:ref',
    requireCapability('customers.360', 'edit'),
    validate('body', updateActiveSchema),
    async (req, res) => {
      res.json(
        await customers.updateActive(
          req,
          ref(req.params),
          req.valid!.body as z.infer<typeof updateActiveSchema>,
        ),
      )
    },
  )

  router.post('/:ref/reveal-id', requireCapability('customers.360', 'viewPII'), async (req, res) => {
    res.json(await customers.revealIdNumber(req, ref(req.params), config))
  })

  router.get('/:ref/audit', view360, validate('query', cursorQuery), async (req, res) => {
    const q = req.valid!.query as z.infer<typeof cursorQuery>
    res.json(await customers.auditFeed(req, ref(req.params), q.cursor, q.limit))
  })

  router.get('/:ref/service-requests', view360, validate('query', cursorQuery), async (req, res) => {
    const q = req.valid!.query as z.infer<typeof cursorQuery>
    res.json(await customers.serviceRequestsFor(req, ref(req.params), q.cursor, q.limit))
  })

  for (const kind of ['block', 'unblock'] as const) {
    router.post(
      `/:ref/${kind}-requests`,
      requireCapability('customers.360', 'edit'),
      validate('body', blockRequestSchema),
      async (req, res) => {
        const body = req.valid!.body as z.infer<typeof blockRequestSchema>
        res.status(201).json(await customers.requestStatusChange(req, ref(req.params), kind, body))
      },
    )
  }

  // Documents: uploading needs onboarding edit (drafts) or 360 edit (customers).
  router.post('/:ref/documents', requireAuth(), singleUpload, async (req, res) => {
    const p = req.auth!.permissions
    if (!can(p, 'customers.onboard', 'edit') && !can(p, 'customers.360', 'edit')) throw forbidden()
    const kind = z.enum(DOC_KINDS).parse((req.body as { kind?: string })?.kind)
    res.status(201).json(await customers.addDocument(req, ref(req.params), kind, req.file, config))
  })

  router.get('/:ref/documents/:docId/content', requireAuth(), async (req, res) => {
    const p = req.auth!.permissions
    if (!can(p, 'customers.onboard', 'edit') && !can(p, 'customers.360', 'view')) throw forbidden()
    await customers.sendDocument(
      req,
      res,
      ref(req.params),
      String(req.params.docId),
      req.query.inline === '1',
      config,
    )
  })

  router.delete('/:ref/documents/:docId', onboardEdit, async (req, res) => {
    await customers.removeDocument(req, ref(req.params), String(req.params.docId), config)
    res.status(204).end()
  })

  return router
}
