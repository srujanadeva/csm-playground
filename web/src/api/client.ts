/**
 * API client. Every call goes to /api/v1 on the same origin with the session cookie.
 * State-changing calls carry the CSRF token; if the server says it's stale, the client
 * fetches a fresh one and retries once. Errors arrive as problem+json and are thrown as
 * `ApiError`, so screens can show field errors and the app can react to expired sessions.
 */
import type { Problem } from '@csm/shared'

export class ApiError extends Error {
  constructor(public readonly problem: Problem) {
    super(problem.detail ?? problem.title)
    this.name = 'ApiError'
  }
  get status() {
    return this.problem.status
  }
  get code() {
    return this.problem.code
  }
}

let csrfToken: string | null = null

/** Stores the CSRF token handed out by sign-in and password change. */
export function setCsrfToken(token: string | null): void {
  csrfToken = token
}

/** The current CSRF token, fetched if needed (also used by upload requests). */
export async function ensureCsrf(): Promise<string> {
  if (!csrfToken) {
    const res = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' })
    csrfToken = ((await res.json()) as { csrfToken: string }).csrfToken
  }
  return csrfToken
}

/** Listeners told when the server reports the session is gone (expired, revoked, signed out). */
const sessionListeners = new Set<() => void>()
export function onSessionEnded(listener: () => void): () => void {
  sessionListeners.add(listener)
  return () => sessionListeners.delete(listener)
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  form?: FormData
  signal?: AbortSignal
  idempotencyKey?: string
  /** Let the request finish even if the page navigates away (small fire-and-forget saves). */
  keepalive?: boolean
}

/** Calls the API and returns the parsed JSON body (or undefined for 204). */
export async function api<T>(path: string, options: ApiOptions = {}, retried = false): Promise<T> {
  const method = options.method ?? 'GET'
  const unsafe = method !== 'GET'
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (unsafe) headers['X-CSRF-Token'] = await ensureCsrf()
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey

  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'same-origin',
    headers,
    body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    signal: options.signal,
    keepalive: options.keepalive,
  })

  if (res.status === 204) return undefined as T
  const isJson = (res.headers.get('content-type') ?? '').includes('json')
  const data: unknown = isJson ? await res.json() : await res.text()

  if (!res.ok) {
    const problem: Problem = isJson
      ? (data as Problem)
      : { type: 'about:blank', title: res.statusText || 'Error', status: res.status }
    if (problem.code === 'csrf_invalid' && !retried) {
      csrfToken = null
      return api<T>(path, options, true)
    }
    if (res.status === 401 && path !== '/auth/login' && path !== '/auth/me') {
      sessionListeners.forEach((l) => l())
    }
    throw new ApiError(problem)
  }
  return data as T
}

/** A random key for Idempotency-Key headers (one per form submission attempt). */
export function newIdempotencyKey(): string {
  return crypto.randomUUID()
}
