// Requests from new joiners for a staff account. An administrator approves one (creating the
// staff user with a one-time password) or rejects it with a note.
import { Schema, model, type InferSchemaType } from 'mongoose'
import { BRANCH_CODES, REQUESTABLE_ROLES } from '@csm/shared'
import { cleanJSON } from '../../lib/toJSON.ts'

const accessRequestSchema = new Schema(
  {
    requestNo: { type: String, required: true, unique: true },
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 120 },
    mobile: { type: String, required: true },
    employeeNo: { type: String, required: true },
    branchCode: { type: String, enum: BRANCH_CODES, required: true },
    roleRequested: { type: String, enum: REQUESTABLE_ROLES, required: true },
    managerEmail: { type: String, default: null },
    reason: { type: String, required: true, maxlength: 500 },
    subscribeUpdates: { type: Boolean, default: false },
    acceptedTermsAt: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    decidedBy: { type: String, default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: null },
    /** The staff ID created on approval. */
    staffId: { type: String, default: null },
  },
  { timestamps: true, optimisticConcurrency: true, toJSON: cleanJSON() },
)

accessRequestSchema.index({ status: 1, _id: -1 })
accessRequestSchema.index({ email: 1, status: 1 })

export type AccessRequest = InferSchemaType<typeof accessRequestSchema>
export const AccessRequestModel = model('AccessRequest', accessRequestSchema, 'accessrequests')
