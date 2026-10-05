import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ZodError } from 'zod'
import mongoose from 'mongoose'
import type { Problem } from '@csm/shared'
import { AppError, notFound } from '../lib/errors.ts'

// Every error leaves as RFC 9457 problem+json with the request id (OWASP A10). Expected
// errors keep their message; anything unexpected is logged in full but answered with a
// generic 500, so stack traces and internals never reach the client.

const TYPE_BASE = 'https://csm-playground.local/problems/'

export const notFoundHandler: RequestHandler = (req) => {
  throw notFound(`No route for ${req.method} ${req.originalUrl.split('?')[0]}.`)
}

function toProblem(err: unknown): Problem {
  if (err instanceof AppError) {
    return {
      type: TYPE_BASE + err.title.toLowerCase().replace(/\s+/g, '-'),
      title: err.title,
      status: err.status,
      ...(err.detail ? { detail: err.detail } : {}),
      ...(err.errors ? { errors: err.errors } : {}),
    }
  }
  if (err instanceof ZodError) {
    return {
      type: TYPE_BASE + 'validation',
      title: 'Validation failed',
      status: 400,
      detail: 'Some fields are missing or invalid.',
      errors: err.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message })),
    }
  }
  if (err instanceof mongoose.Error.CastError) {
    return {
      type: TYPE_BASE + 'bad-request',
      title: 'Bad request',
      status: 400,
      detail: `Invalid value for ${err.path}.`,
    }
  }
  if (err instanceof mongoose.Error.VersionError) {
    return {
      type: TYPE_BASE + 'conflict',
      title: 'Conflict',
      status: 409,
      detail: 'Someone else changed this record. Reload it and try again.',
    }
  }
  const e = err as { code?: number; type?: string; status?: number }
  if (e?.code === 11000) {
    return {
      type: TYPE_BASE + 'conflict',
      title: 'Conflict',
      status: 409,
      detail: 'A record with that value already exists.',
    }
  }
  // body-parser errors: malformed JSON, payload too large, wrong charset.
  if (e?.type === 'entity.parse.failed') {
    return {
      type: TYPE_BASE + 'bad-request',
      title: 'Bad request',
      status: 400,
      detail: 'The request body is not valid JSON.',
    }
  }
  if (e?.type === 'entity.too.large') {
    return {
      type: TYPE_BASE + 'payload-too-large',
      title: 'Payload too large',
      status: 413,
      detail: 'The request body is too large.',
    }
  }
  if (typeof e?.status === 'number' && e.status >= 400 && e.status < 500) {
    return { type: TYPE_BASE + 'bad-request', title: 'Bad request', status: e.status }
  }
  return {
    type: TYPE_BASE + 'internal',
    title: 'Something went wrong',
    status: 500,
    detail: 'The server hit an unexpected error. Quote the request id if you report it.',
  }
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err)
  const problem = toProblem(err)
  problem.instance = req.originalUrl
  problem.requestId = req.id
  if (problem.status >= 500) req.log?.error({ err }, 'unhandled error')
  else req.log?.info({ status: problem.status, title: problem.title }, 'request rejected')
  res.status(problem.status).type('application/problem+json').json(problem)
}
