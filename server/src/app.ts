import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express, { type Express } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { pinoHttp } from 'pino-http'
import type { Logger } from 'pino'
import type { Config } from './config.ts'
import { requestId } from './middleware/requestId.ts'
import { rejectOperators } from './middleware/rejectOperators.ts'
import { csrfProtection } from './middleware/csrf.ts'
import { createApiLimiter } from './middleware/rateLimit.ts'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.ts'
import { loadSession } from './middleware/auth.ts'
import { systemRoutes } from './modules/system/routes.ts'
import { authRoutes } from './modules/auth/routes.ts'
import { lookupRoutes } from './modules/lookups/routes.ts'
import { customerRoutes } from './modules/customers/routes.ts'
import { approvalRoutes } from './modules/approvals/routes.ts'
import { serviceRequestRoutes } from './modules/serviceRequests/routes.ts'
import { adminRoutes } from './modules/admin/routes.ts'
import { dashboardRoutes } from './modules/dashboard/routes.ts'

const WEB_DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist')

export interface AppOptions {
  apiRateLimit?: number
  authRateLimit?: number
}

/** Builds the Express app. No network side effects, so tests can create it freely. */
export function createApp(config: Config, logger: Logger, options: AppOptions = {}): Express {
  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', config.TRUST_PROXY)
  // "simple" keeps query values flat strings: ?a[b]=1 stays the key "a[b]", never an object.
  app.set('query parser', 'simple')

  app.use(requestId)
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id,
      quietReqLogger: true,
      // One short line per request; headers (cookies, tokens) are never logged.
      serializers: {
        req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  )

  // Security headers (OWASP A02). One strict policy serves both the JSON API and the built SPA:
  // only same-origin scripts, styles, fonts and images; no framing; no plugins.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      // HSTS only in production: on localhost it would pin every local port to HTTPS,
      // including other apps (like test-playground's http API) in the same browser.
      strictTransportSecurity: config.isProd ? { maxAge: 31_536_000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  )

  app.use(
    '/api',
    cors({
      origin: config.CORS_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id', 'Idempotency-Key'],
      exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy'],
      maxAge: 600,
    }),
  )
  app.use('/api', createApiLimiter(options.apiRateLimit))
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })
  app.use(express.json({ limit: '100kb', strict: true }))
  app.use(cookieParser())
  app.use('/api', rejectOperators)
  // Session before CSRF: the CSRF token is bound to the session id.
  app.use('/api', loadSession(config))
  app.use('/api', csrfProtection(config.CSRF_SECRET, config.CORS_ORIGINS))

  app.use('/api/v1', systemRoutes)
  app.use('/api/v1/auth', authRoutes(config, options.authRateLimit))
  app.use('/api/v1/lookups', lookupRoutes())
  app.use('/api/v1/customers', customerRoutes(config))
  app.use('/api/v1/approvals', approvalRoutes())
  app.use('/api/v1/service-requests', serviceRequestRoutes(config))
  app.use('/api/v1/admin', adminRoutes())
  app.use('/api/v1/dashboard', dashboardRoutes())
  app.use('/api', notFoundHandler)

  // Production: serve the built SPA, with client-side routes falling back to index.html.
  if (config.isProd && existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST, { index: false, maxAge: '1h' }))
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(resolve(WEB_DIST, 'index.html')))
  }

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
