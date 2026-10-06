/**
 * Signed-out sessions. A session id stays here until its token could no longer be valid
 * anyway; MongoDB's TTL index then deletes it.
 */
import { Schema, model } from 'mongoose'

const revokedSessionSchema = new Schema({
  sid: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
})

export const RevokedSessionModel = model('RevokedSession', revokedSessionSchema, 'revokedsessions')
