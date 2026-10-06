/**
 * Idempotency keys for create endpoints (OWASP A06/A08). A client that sends the same
 * `Idempotency-Key` twice (a double click, a retry after a timeout) gets the first response
 * replayed instead of creating a second record. Keys are per user and kept for 24 hours.
 */
import type { RequestHandler } from 'express'
import { Schema, model } from 'mongoose'
import { badRequest, conflict } from '../lib/errors.ts'

const idempotencySchema = new Schema({
  key: { type: String, required: true },
  staffId: { type: String, required: true },
  route: { type: String, required: true },
  status: { type: Number, default: 0 },
  body: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now, index: { expireAfterSeconds: 24 * 3600 } },
})
idempotencySchema.index({ key: 1, staffId: 1 }, { unique: true })

export const IdempotencyModel = model('IdempotencyKey', idempotencySchema, 'idempotencykeys')

const KEY = /^[A-Za-z0-9-]{8,64}$/

/** Replays the stored response for a repeated key; without a key the request runs normally. */
export const idempotent: RequestHandler = async (req, res, next) => {
  const key = req.get('idempotency-key')
  if (!key) return next()
  if (!KEY.test(key)) throw badRequest('Idempotency-Key must be 8–64 letters, digits or hyphens.')
  const staffId = req.auth!.user.staffId
  const route = `${req.method} ${req.baseUrl}${req.path}`

  const existing = await IdempotencyModel.findOne({ key, staffId }).lean()
  if (existing) {
    if (existing.route !== route)
      throw conflict('This Idempotency-Key was already used for a different request.')
    if (!existing.status) throw conflict('A request with this Idempotency-Key is still being processed.')
    res.setHeader('Idempotent-Replayed', 'true')
    return res.status(existing.status).json(existing.body)
  }
  try {
    await IdempotencyModel.create({ key, staffId, route })
  } catch {
    throw conflict('A request with this Idempotency-Key is still being processed.')
  }

  const json = res.json.bind(res)
  res.json = (body: unknown) => {
    if (res.statusCode < 500) {
      void IdempotencyModel.updateOne({ key, staffId }, { $set: { status: res.statusCode, body } }).exec()
    } else {
      void IdempotencyModel.deleteOne({ key, staffId }).exec()
    }
    return json(body)
  }
  res.on('close', () => {
    if (!res.writableFinished) void IdempotencyModel.deleteOne({ key, staffId, status: 0 }).exec()
  })
  next()
}
