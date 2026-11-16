// Messages the app "sends" (SMS and e-mail). Nothing leaves the server: in development they are
// read back through the dev inbox. Each message expires after a day (TTL index).
import { Schema, model, type InferSchemaType } from 'mongoose'
import { cleanJSON } from '../../lib/toJSON.ts'

const outboxSchema = new Schema(
  {
    channel: { type: String, enum: ['sms', 'email'], required: true },
    to: { type: String, required: true, maxlength: 120 },
    /** The staff user it was meant for, when there is one (filters the inbox). */
    staffId: { type: String, default: null, index: true },
    subject: { type: String, required: true, maxlength: 160 },
    body: { type: String, required: true, maxlength: 2000 },
    purpose: { type: String, required: true, maxlength: 40 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: cleanJSON() },
)

outboxSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export type OutboxMessage = InferSchemaType<typeof outboxSchema>
export const OutboxModel = model('OutboxMessage', outboxSchema, 'outbox')
