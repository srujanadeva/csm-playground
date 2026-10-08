/**
 * /api/v1/teller. The counter needs Teller counter capabilities (authorising needs approve);
 * the drawer needs Cash drawer capabilities (signing off needs approve).
 */
import { Router } from 'express'
import type { z } from 'zod'
import {
  accountSearchQuery,
  closeDrawerSchema,
  drawerListQuery,
  openDrawerSchema,
  postTransactionSchema,
  signOffSchema,
  transactionDecisionSchema,
  transactionListQuery,
} from '@csm/shared'
import { requireCapability } from '../../middleware/auth.ts'
import { idempotent } from '../../middleware/idempotency.ts'
import { validate } from '../../lib/validate.ts'
import * as teller from './service.ts'

const param = (p: unknown, name: string) => String((p as Record<string, string>)[name])

/** Builds the teller router. */
export function tellerRoutes(): Router {
  const router = Router()
  const counter = requireCapability('teller.counter', 'view')
  const post = requireCapability('teller.counter', 'create')
  const authorise = requireCapability('teller.counter', 'approve')
  const drawer = requireCapability('teller.drawer', 'view')
  const openDrawer = requireCapability('teller.drawer', 'create')
  const closeDrawer = requireCapability('teller.drawer', 'edit')
  const signOff = requireCapability('teller.drawer', 'approve')

  router.get('/accounts', counter, validate('query', accountSearchQuery), async (req, res) => {
    const q = req.valid!.query as z.infer<typeof accountSearchQuery>
    res.json({ items: await teller.searchAccounts(req, q.q) })
  })

  router.get('/accounts/:accountNo', counter, async (req, res) => {
    res.json(await teller.getAccount(req, param(req.params, 'accountNo')))
  })

  router.post(
    '/transactions',
    post,
    idempotent,
    validate('body', postTransactionSchema),
    async (req, res) => {
      res.status(201).json(await teller.post(req, req.valid!.body as z.infer<typeof postTransactionSchema>))
    },
  )

  router.get('/transactions', counter, validate('query', transactionListQuery), async (req, res) => {
    res.json(await teller.listTransactions(req, req.valid!.query as z.infer<typeof transactionListQuery>))
  })

  router.get('/transactions/:txnNo', counter, async (req, res) => {
    res.json(await teller.getTransaction(req, param(req.params, 'txnNo')))
  })

  router.post(
    '/transactions/:txnNo/decision',
    authorise,
    validate('body', transactionDecisionSchema),
    async (req, res) => {
      const body = req.valid!.body as z.infer<typeof transactionDecisionSchema>
      res.json(await teller.decide(req, param(req.params, 'txnNo'), body))
    },
  )

  router.get('/drawer', drawer, async (req, res) => {
    res.json(await teller.myDrawer(req))
  })

  router.post(
    '/drawer/open',
    openDrawer,
    idempotent,
    validate('body', openDrawerSchema),
    async (req, res) => {
      res.status(201).json(await teller.openDrawer(req, req.valid!.body as z.infer<typeof openDrawerSchema>))
    },
  )

  router.post('/drawer/close', closeDrawer, validate('body', closeDrawerSchema), async (req, res) => {
    res.json(await teller.closeDrawer(req, req.valid!.body as z.infer<typeof closeDrawerSchema>))
  })

  router.get('/drawers', signOff, validate('query', drawerListQuery), async (req, res) => {
    res.json(await teller.listDrawers(req, req.valid!.query as z.infer<typeof drawerListQuery>))
  })

  router.post('/drawers/:id/sign-off', signOff, validate('body', signOffSchema), async (req, res) => {
    const body = req.valid!.body as z.infer<typeof signOffSchema>
    res.json(await teller.signOff(req, param(req.params, 'id'), body))
  })

  return router
}
