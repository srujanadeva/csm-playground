// Errors the services throw on purpose. The error handler turns them into problem+json
// responses; anything else becomes a generic 500 so internals never leak (OWASP A10).

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly title: string,
    public readonly detail?: string,
    public readonly errors?: { path: string; message: string }[],
  ) {
    super(detail ?? title)
    this.name = 'AppError'
  }
}

export const badRequest = (detail: string, errors?: { path: string; message: string }[]) =>
  new AppError(400, 'Bad request', detail, errors)
export const unauthorized = (detail = 'Sign in to continue.') => new AppError(401, 'Unauthorized', detail)
export const forbidden = (detail = "You don't have permission to do that.") =>
  new AppError(403, 'Forbidden', detail)
/** Also used for resources a caller may not know exist (admin APIs for non-admins). */
export const notFound = (detail = 'Not found.') => new AppError(404, 'Not found', detail)
export const conflict = (detail: string) => new AppError(409, 'Conflict', detail)
export const tooManyRequests = (detail = 'Too many requests. Try again later.') =>
  new AppError(429, 'Too many requests', detail)
