/** /api/v1/service-requests. Creating needs New request:create; everything else the Request board. */
import { Router } from 'express'
import type { z } from 'zod'
import {
  boardQuery,
  commentSchema,
  createServiceRequestSchema,
  cursorQuery,
  srListQuery,
  statusChangeSchema,
} from '@csm/shared'
import type { Config } from '../../config.ts'
import { requireCapability } from '../../middleware/auth.ts'
import { idempotent } from '../../middleware/idempotency.ts'
import { singleUpload } from '../../lib/uploads.ts'
import { validate } from '../../lib/validate.ts'
import * as sr from './service.ts'

const srNo = (p: unknown) => String((p as { srNo: string }).srNo)

/** Builds the service-requests router. */
export function serviceRequestRoutes(config: Config): Router {
  const router = Router()
  const create = requireCapability('serviceRequests.new', 'create')
  const view = requireCapability('serviceRequests.board', 'view')
  const edit = requireCapability('serviceRequests.board', 'edit')

  router.get('/assignees', create, async (req, res) => {
    res.json({ items: await sr.assignees(req) })
  })

  router.post('/', create, idempotent, validate('body', createServiceRequestSchema), async (req, res) => {
    res.status(201).json(await sr.create(req, req.valid!.body as z.infer<typeof createServiceRequestSchema>))
  })

  router.get('/board', view, validate('query', boardQuery), async (req, res) => {
    res.json(await sr.boardColumn(req, req.valid!.query as z.infer<typeof boardQuery>))
  })

  router.get('/', view, validate('query', srListQuery), async (req, res) => {
    res.json(await sr.list(req, req.valid!.query as z.infer<typeof srListQuery>))
  })

  router.get(
    '/export.csv',
    requireCapability('serviceRequests.board', 'export'),
    validate('query', srListQuery),
    async (req, res) => {
      const csv = await sr.exportCsv(req, req.valid!.query as z.infer<typeof srListQuery>)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="service-requests-${new Date().toISOString().slice(0, 10)}.csv"`,
      )
      res.send(csv)
    },
  )

  router.get('/:srNo', view, async (req, res) => {
    res.json(await sr.get(req, srNo(req.params)))
  })

  router.patch('/:srNo/status', edit, validate('body', statusChangeSchema), async (req, res) => {
    res.json(
      await sr.changeStatus(req, srNo(req.params), req.valid!.body as z.infer<typeof statusChangeSchema>),
    )
  })

  router.get('/:srNo/comments', view, validate('query', cursorQuery), async (req, res) => {
    const q = req.valid!.query as z.infer<typeof cursorQuery>
    res.json(await sr.comments(req, srNo(req.params), q.cursor, q.limit))
  })

  router.post('/:srNo/comments', edit, validate('body', commentSchema), async (req, res) => {
    res
      .status(201)
      .json(await sr.addComment(req, srNo(req.params), req.valid!.body as z.infer<typeof commentSchema>))
  })

  router.post('/:srNo/attachments', create, singleUpload, async (req, res) => {
    res.status(201).json(await sr.addAttachment(req, srNo(req.params), req.file, config))
  })

  router.get('/:srNo/attachments/:id/content', view, async (req, res) => {
    await sr.sendAttachment(
      req,
      res,
      srNo(req.params),
      String(req.params.id),
      req.query.inline === '1',
      config,
    )
  })

  return router
}
