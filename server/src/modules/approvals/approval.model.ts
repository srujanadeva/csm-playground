import { Schema, model, type InferSchemaType } from 'mongoose'
import { APPROVAL_STATUS, APPROVAL_TYPES, BRANCH_CODES } from '@csm/shared'
import { cleanJSON } from '../../lib/toJSON.ts'

// Maker-checker (OWASP A06): sensitive changes are requested by one person and take effect
// only when a different person with `approve` signs them off.
const approvalSchema = new Schema(
  {
    type: { type: String, enum: APPROVAL_TYPES, required: true },
    entityType: { type: String, enum: ['customer'], required: true },
    entityId: { type: String, required: true },
    branchCode: { type: String, enum: BRANCH_CODES, required: true },
    reason: { type: String, maxlength: 60 },
    remarks: { type: String, trim: true, maxlength: 500 },
    status: { type: String, enum: APPROVAL_STATUS, default: 'pending' },
    requestedBy: { type: String, required: true },
    decidedBy: String,
    decidedAt: Date,
    decisionNote: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true, optimisticConcurrency: true, toJSON: cleanJSON() },
)

approvalSchema.index({ status: 1, branchCode: 1, _id: -1 })
approvalSchema.index({ entityType: 1, entityId: 1, status: 1 })

export type Approval = InferSchemaType<typeof approvalSchema>
export const ApprovalModel = model('Approval', approvalSchema, 'approvals')
