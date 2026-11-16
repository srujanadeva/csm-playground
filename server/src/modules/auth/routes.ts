/**
 * /api/v1/auth: CSRF token, sign-in, sign-out, current user, password change, language, and the
 * signed-out password reset. Everything that checks a secret sits behind the stricter auth limiter.
 */
import { Router } from 'express'
import { z } from 'zod'
import {
  changePasswordSchema,
  loginSchema,
  resetCompleteSchema,
  resetResendSchema,
  resetStartSchema,
  resetVerifySchema,
  type ResetCompleteInput,
} from '@csm/shared'
import type { Config } from '../../config.ts'
import { issueCsrfToken } from '../../middleware/csrf.ts'
import { requireAuth } from '../../middleware/auth.ts'
import { createAuthLimiter } from '../../middleware/rateLimit.ts'
import { validate } from '../../lib/validate.ts'
import * as reset from './passwordReset.ts'
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

  // POST /password-reset { staffId } → always 202 with a challenge (a decoy for unknown IDs)
  router.post('/password-reset', limiter, validate('body', resetStartSchema), async (req, res) => {
    res.status(202).json(await reset.start(req, config, (req.valid!.body as { staffId: string }).staffId))
  })

  // POST /password-reset/resend { challengeId }
  router.post('/password-reset/resend', limiter, validate('body', resetResendSchema), async (req, res) => {
    res.json(await reset.resend(config, (req.valid!.body as { challengeId: string }).challengeId))
  })

  // POST /password-reset/verify { challengeId, code } → { resetToken }
  router.post('/password-reset/verify', limiter, validate('body', resetVerifySchema), async (req, res) => {
    const { challengeId, code } = req.valid!.body as { challengeId: string; code: string }
    res.json(await reset.verify(config, challengeId, code))
  })

  // POST /password-reset/complete { resetToken, newPassword, confirmPassword }
  router.post(
    '/password-reset/complete',
    limiter,
    validate('body', resetCompleteSchema),
    async (req, res) => {
      await reset.complete(req, config, req.valid!.body as ResetCompleteInput)
      res.status(204).end()
    },
  )

  return router
}
