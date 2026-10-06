// Errors the services throw on purpose. The error handler turns them into problem+json
// responses; anything else becomes a generic 500 so internals never leak (OWASP A10).

/** A field-level problem: `code` is a validation code (see @csm/shared), `message` its English text. */
export interface FieldError {
  path: string
  code?: string
  message: string
}

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly title: string,
    public readonly detail?: string,
    public readonly errors?: FieldError[],
    /** Extra problem members, e.g. { code: 'account_locked', attemptsLeft: 2 }. */
    public readonly extras?: Record<string, unknown>,
  ) {
    super(detail ?? title)
    this.name = 'AppError'
  }
}

export const badRequest = (detail: string, errors?: FieldError[]) =>
  new AppError(400, 'Bad request', detail, errors)
export const unauthorized = (detail = 'Sign in to continue.', extras?: Record<string, unknown>) =>
  new AppError(401, 'Unauthorized', detail, undefined, extras)
export const forbidden = (
  detail = "You don't have permission to do that.",
  extras?: Record<string, unknown>,
) => new AppError(403, 'Forbidden', detail, undefined, extras)
/** Also used for resources a caller may not know exist (admin APIs for non-admins). */
export const notFound = (detail = 'Not found.') => new AppError(404, 'Not found', detail)
export const conflict = (detail: string, extras?: Record<string, unknown>) =>
  new AppError(409, 'Conflict', detail, undefined, extras)
export const validationFailed = (errors: FieldError[], detail = 'Some fields are missing or invalid.') =>
  new AppError(400, 'Validation failed', detail, errors)
/** The record changed since the caller read it (optimistic concurrency, OWASP A08). */
export const staleVersion = () =>
  conflict('Someone else changed this record. Reload it and try again.', { code: 'stale_version' })
export const tooManyRequests = (detail = 'Too many requests. Try again later.') =>
  new AppError(429, 'Too many requests', detail)
