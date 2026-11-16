// One e-KYC verification attempt. The session id is the only link between the app and the provider
// page (it travels in the iframe URL), so it is long and random. Sessions are removed by TTL.
import { Schema, model, type InferSchemaType } from 'mongoose'
import { EKYC_SIMULATIONS, EKYC_STATUS } from '@csm/shared'

const ekycSessionSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    customerRef: { type: String, required: true },
    branchCode: { type: String, required: true },
    createdBy: { type: String, required: true },
    /** What the bank holds; the provider compares against it. */
    expectedName: { type: String, default: '' },
    expectedDob: { type: String, default: '' },
    status: { type: String, enum: EKYC_STATUS, default: 'pending' },
    simulation: { type: String, enum: EKYC_SIMULATIONS },
    reference: String,
    verifiedName: String,
    verifiedDob: String,
    reason: String,
    completedAt: Date,
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
)

ekycSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 })

export type EkycSession = InferSchemaType<typeof ekycSessionSchema>
export const EkycSessionModel = model('EkycSession', ekycSessionSchema, 'ekycsessions')
