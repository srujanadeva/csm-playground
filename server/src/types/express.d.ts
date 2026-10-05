import 'express-serve-static-core'

declare module 'express-serve-static-core' {
  interface Request {
    /** Correlation id, also returned as the X-Request-Id response header. */
    id: string
    /** Request parts parsed by the `validate` middleware. */
    valid?: { body?: unknown; query?: unknown; params?: unknown }
    /** Set by the auth middleware (phase 2). Binds the CSRF token to the session. */
    sessionId?: string
  }
}
