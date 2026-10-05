import { Schema, model, type InferSchemaType } from 'mongoose'
import { BRANCH_CODES, SR_CHANNELS, SR_PRIORITIES, SR_STATUS } from '@csm/shared'
import { cleanJSON } from '../../lib/toJSON.ts'

const attachmentSchema = new Schema(
  {
    fileName: { type: String, required: true, maxlength: 120 },
    mime: { type: String, enum: ['image/jpeg', 'image/png', 'application/pdf'], required: true },
    size: Number,
    storageKey: { type: String, required: true },
    uploadedBy: String,
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
)

const serviceRequestSchema = new Schema(
  {
    srNo: { type: String, required: true, unique: true, match: /^SR-[0-9]{4}-[0-9]{6}$/ },
    customerCif: { type: String, required: true, index: true },
    /** Copied from the customer so the board doesn't need a join per card. */
    customerName: { type: String, required: true },
    branchCode: { type: String, enum: BRANCH_CODES, required: true },
    channel: { type: String, enum: SR_CHANNELS, required: true },
    category: { type: String, required: true },
    subCategory: { type: String, required: true },
    priority: { type: String, enum: SR_PRIORITIES, required: true },
    slaDueAt: { type: Date, required: true },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    attachments: { type: [attachmentSchema], default: [] },
    status: { type: String, enum: SR_STATUS, default: 'open' },
    assignedTo: { type: String, index: true },
    createdBy: { type: String, required: true },
    resolutionNotes: { type: String, trim: true, maxlength: 1000 },
    resolvedAt: Date,
    closedAt: Date,
    notifyBySms: { type: Boolean, default: true },
  },
  { timestamps: true, optimisticConcurrency: true, toJSON: cleanJSON() },
)

serviceRequestSchema.index({ status: 1, _id: -1 })
serviceRequestSchema.index({ assignedTo: 1, status: 1, _id: -1 })
serviceRequestSchema.index({ branchCode: 1, status: 1, _id: -1 })

export type ServiceRequest = InferSchemaType<typeof serviceRequestSchema>
export const ServiceRequestModel = model('ServiceRequest', serviceRequestSchema, 'servicerequests')

const srCommentSchema = new Schema(
  {
    srNo: { type: String, required: true },
    by: { type: String, required: true },
    byName: { type: String, required: true },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: cleanJSON() },
)
srCommentSchema.index({ srNo: 1, _id: -1 })

export const SrCommentModel = model('SrComment', srCommentSchema, 'srcomments')
