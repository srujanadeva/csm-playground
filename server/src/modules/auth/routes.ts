/**
 * /api/v1/auth: CSRF token, sign-in, sign-out, current user, password change, language.
 * Sign-in and password change sit behind the stricter auth rate limiter.
 */
import { Router } from 'express'
import { z } from 'zod'
import { changePasswordSchema, loginSchema } from '@csm/shared'
import type { Config } from '../../config.ts'
import { issueCsrfToken } from '../../middleware/csrf.ts'
import { requireAuth } from '../../middleware/auth.ts'
import { createAuthLimiter } from '../../middleware/rateLimit.ts'
import { validate } from '../../lib/validate.ts'
import * as auth from './service.ts'

/** Builds the auth router. `authRateLimit` lets tests raise or lower the limit. */
export function authRoutes(config: Config, authRateLimit?: number): Router {
  const router = Router()
  const limiter = createAuthLimiter(authRateLimit)
  const allowPending = requireAuth({ allowPendingPasswordChange: true })

  router.get('/csrf', (req, res) => {
    res.json({ csrfToken: issueCsrfToken(res, config.CSRF_SECRET, req.sessionId) })
  })

  router.post('/login', limiter, validate('body', loginSchema), async (req, res) => {
    await auth.login(req, res, config, req.valid!.body as z.infer<typeof loginSchema>)
    // The session changed, so hand out a CSRF token bound to the new one.
    res.json({
      ...(await auth.me(req, config)),
      csrfToken: issueCsrfToken(res, config.CSRF_SECRET, req.sessionId),
    })
  })

  router.post('/logout', async (req, res) => {
    await auth.logout(req, res)
    res.status(204).end()
  })

  router.get('/me', allowPending, async (req, res) => {
    res.json(await auth.me(req, config))
  })

  router.post(
    '/change-password',
    limiter,
    allowPending,
    validate('body', changePasswordSchema),
    async (req, res) => {
      await auth.changePassword(req, res, config, req.valid!.body as z.infer<typeof changePasswordSchema>)
      res.json({
        ...(await auth.me(req, config)),
        csrfToken: issueCsrfToken(res, config.CSRF_SECRET, req.sessionId),
      })
    },
  )

  router.put(
    '/me/language',
    allowPending,
    validate('body', z.strictObject({ language: z.enum(['en', 'kn']) })),
    async (req, res) => {
      await auth.setLanguage(req, (req.valid!.body as { language: 'en' | 'kn' }).language)
      res.status(204).end()
    },
  )

  return router
}
