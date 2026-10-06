/**
 * /api/v1/admin. The whole router sits behind `requireAdmin`, which answers 404 to anyone
 * else, then each route also checks the specific admin screen capability.
 */
import { Router } from 'express'
import type { z } from 'zod'
import {
  createUserSchema,
  screenOrderSchema,
  screenRolesSchema,
  updateScreenSchema,
  updateUserSchema,
  userListQuery,
} from '@csm/shared'
import { requireAdmin, requireCapability } from '../../middleware/auth.ts'
import { idempotent } from '../../middleware/idempotency.ts'
import { validate } from '../../lib/validate.ts'
import * as admin from './service.ts'

const staffId = (p: unknown) => String((p as { staffId: string }).staffId).toLowerCase()
const key = (p: unknown) => String((p as { key: string }).key)

/** Builds the admin router. */
export function adminRoutes(): Router {
  const router = Router()
  router.use(requireAdmin)
  const usersView = requireCapability('admin.users', 'view')
  const usersCreate = requireCapability('admin.users', 'create')
  const usersEdit = requireCapability('admin.users', 'edit')
  const screensView = requireCapability('admin.screens', 'view')
  const screensEdit = requireCapability('admin.screens', 'edit')

  router.get('/users', usersView, validate('query', userListQuery), async (req, res) => {
    res.json(await admin.listUsers(req.valid!.query as z.infer<typeof userListQuery>))
  })
  router.post('/users', usersCreate, idempotent, validate('body', createUserSchema), async (req, res) => {
    res.status(201).json(await admin.createUser(req, req.valid!.body as z.infer<typeof createUserSchema>))
  })
  router.get('/users/:staffId', usersView, async (req, res) => {
    res.json(await admin.getUser(staffId(req.params)))
  })
  router.patch('/users/:staffId', usersEdit, validate('body', updateUserSchema), async (req, res) => {
    res.json(
      await admin.updateUser(req, staffId(req.params), req.valid!.body as z.infer<typeof updateUserSchema>),
    )
  })
  router.post('/users/:staffId/unlock', usersEdit, async (req, res) => {
    res.json(await admin.unlockUser(req, staffId(req.params)))
  })
  router.post('/users/:staffId/reset-password', usersEdit, async (req, res) => {
    res.json(await admin.resetPassword(req, staffId(req.params)))
  })
  router.post('/users/:staffId/deactivate', usersEdit, async (req, res) => {
    res.json(await admin.setActive(req, staffId(req.params), false))
  })
  router.post('/users/:staffId/activate', usersEdit, async (req, res) => {
    res.json(await admin.setActive(req, staffId(req.params), true))
  })

  router.get('/screens', screensView, async (_req, res) => {
    res.json({ items: await admin.listScreens() })
  })
  router.put('/screens/order', screensEdit, validate('body', screenOrderSchema), async (req, res) => {
    res.json({ items: await admin.reorderScreens(req, req.valid!.body as z.infer<typeof screenOrderSchema>) })
  })
  router.get('/screens/:key/impact', screensView, async (req, res) => {
    res.json(await admin.screenImpact(key(req.params)))
  })
  router.patch('/screens/:key', screensEdit, validate('body', updateScreenSchema), async (req, res) => {
    res.json(
      await admin.updateScreen(req, key(req.params), req.valid!.body as z.infer<typeof updateScreenSchema>),
    )
  })
  router.put('/screens/:key/roles', screensEdit, validate('body', screenRolesSchema), async (req, res) => {
    res.json(
      await admin.setScreenRoles(req, key(req.params), req.valid!.body as z.infer<typeof screenRolesSchema>),
    )
  })

  router.get('/roles', usersView, async (_req, res) => {
    res.json({ items: await admin.listRoles() })
  })

  return router
}
