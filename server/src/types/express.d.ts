/** Request properties added by this app's middleware. */
import 'express-serve-static-core'
import type { BranchCode, Language } from '@csm/shared'
import type { SessionClaims } from '../lib/session.ts'
import type { UserAccess } from '../modules/admin/access.ts'

interface AuthContext extends UserAccess {
  user: {
    id: string
    staffId: string
    name: string
    roleKey: string
    branchCode: BranchCode
    preferredLanguage: Language
    mustChangePassword: boolean
    lastLoginAt: Date | null
    permVersion: number
  }
  session: SessionClaims
}

declare module 'express-serve-static-core' {
  interface Request {
    /** Correlation id, also returned as the X-Request-Id response header. */
    id: string
    /** Request parts parsed by the `validate` middleware. */
    valid?: { body?: unknown; query?: unknown; params?: unknown }
    /** Session id of the signed-in user; binds the CSRF token to the session. */
    sessionId?: string
    /** The signed-in user, their permissions and menu (set by `loadSession`). */
    auth?: AuthContext
  }
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext
    }
  }
}
