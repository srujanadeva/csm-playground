/**
 * /api/v1/teller. The counter needs Teller counter capabilities (authorising needs approve);
 * the drawer needs Cash drawer capabilities (signing off needs approve). Issuing queue tokens and
 * the lobby display are open to any signed-in user of the branch. /feed/stream is server-sent events.
 */
import { Router } from 'express'
import type { z } from 'zod'
import {
  withdrawalOtpResendSchema,
  withdrawalOtpStartSchema,
  withdrawalOtpVerifySchema,
  accountSearchQuery,
  closeDrawerSchema,
  drawerListQuery,
  openDrawerSchema,
  postTransactionSchema,
  signOffSchema,
  transactionDecisionSchema,
  transactionListQuery,
} from '@csm/shared'
import type { Config } from '../../config.ts'
import { requireAuth, requireCapability } from '../../middleware/auth.ts'
import { recent, subscribe } from './events.ts'
import * as queue from './queue.ts'
import { idempotent } from '../../middleware/idempotency.ts'
import { validate } from '../../lib/validate.ts'
import * as teller from './service.ts'

const param = (p: unknown, name: string) => String((p as Record<string, string>)[name])

/** Builds the teller router. */
export function tellerRoutes(config: Config): Router {
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

  // GET /teller/accounts/:accountNo/specimen: the holder's specimen signature image
  router.get('/accounts/:accountNo/specimen', counter, async (req, res) => {
    await teller.sendSpecimen(req, res, param(req.params, 'accountNo'), config)
  })

  // GET /teller/cutoff
  router.get('/cutoff', counter, (_req, res) => {
    res.json(teller.cutoff(config))
  })

  // POST /teller/withdrawal-otp { accountNo, amount }
  router.post('/withdrawal-otp', post, validate('body', withdrawalOtpStartSchema), async (req, res) => {
    const body = req.valid!.body as z.infer<typeof withdrawalOtpStartSchema>
    res.status(201).json(await teller.startWithdrawalOtp(req, body, config))
  })

  // POST /teller/withdrawal-otp/resend { challengeId }
  router.post(
    '/withdrawal-otp/resend',
    post,
    validate('body', withdrawalOtpResendSchema),
    async (req, res) => {
      const { challengeId } = req.valid!.body as z.infer<typeof withdrawalOtpResendSchema>
      res.json(await teller.resendWithdrawalOtp(req, challengeId, config))
    },
  )

  // POST /teller/withdrawal-otp/verify { challengeId, code }
  router.post(
    '/withdrawal-otp/verify',
    post,
    validate('body', withdrawalOtpVerifySchema),
    async (req, res) => {
      res.json(
        await teller.verifyWithdrawalOtp(
          req,
          req.valid!.body as z.infer<typeof withdrawalOtpVerifySchema>,
          config,
        ),
      )
    },
  )

  // Token queue.
  // POST /teller/queue/tokens
  router.post('/queue/tokens', requireAuth(), async (req, res) => {
    res.status(201).json(await queue.issue(req))
  })
  // GET /teller/queue/lobby
  router.get('/queue/lobby', requireAuth(), async (req, res) => {
    res.json(await queue.lobby(req))
  })
  // GET /teller/queue
  router.get('/queue', post, async (req, res) => {
    res.json(await queue.state(req))
  })
  // POST /teller/queue/call-next | recall | skip | serve
  const actions = { 'call-next': queue.callNext, recall: queue.recall, skip: queue.skip, serve: queue.serve }
  for (const [path, fn] of Object.entries(actions)) {
    router.post(`/queue/${path}`, post, async (req, res) => {
      res.json(await fn(req))
    })
  }

  // GET /teller/feed: the newest 50 branch cash events
  router.get('/feed', counter, async (req, res) => {
    res.json({ items: await recent(req.auth!.user.branchCode) })
  })

  // GET /teller/feed/stream: new events as server-sent events
  router.get('/feed/stream', counter, (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      // Proxies must pass events through as they come, not buffer them.
      'X-Accel-Buffering': 'no',
    })
    res.write(': connected\n\n')
    const unsubscribe = subscribe(req.auth!.user.branchCode, (e) =>
      res.write(`id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`),
    )
    // A comment line now and then keeps idle connections from being closed by the browser or proxies.
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000)
    req.on('close', () => {
      unsubscribe()
      clearInterval(keepAlive)
    })
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
      res
        .status(201)
        .json(await teller.post(req, req.valid!.body as z.infer<typeof postTransactionSchema>, config))
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
