import { Schema, model, type InferSchemaType } from 'mongoose'
import { cleanJSON } from '../../lib/toJSON.ts'

// One collection for data changes and security events (OWASP A09). Append-only: the app
// never updates or deletes entries.
const auditLogSchema = new Schema(
  {
    category: { type: String, enum: ['data', 'security', 'admin'], required: true },
    action: { type: String, required: true },
    outcome: { type: String, enum: ['success', 'denied', 'failure'], default: 'success' },
    actor: { type: String, required: true },
    entityType: String,
    entityId: String,
    changes: {
      type: [{ field: String, from: Schema.Types.Mixed, to: Schema.Types.Mixed, _id: false }],
      default: undefined,
    },
    ip: String,
    requestId: String,
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: cleanJSON() },
)

auditLogSchema.index({ entityType: 1, entityId: 1, _id: -1 })
auditLogSchema.index({ category: 1, _id: -1 })
auditLogSchema.index({ actor: 1, _id: -1 })

export type AuditLog = InferSchemaType<typeof auditLogSchema>
export const AuditLogModel = model('AuditLog', auditLogSchema, 'auditlogs')
