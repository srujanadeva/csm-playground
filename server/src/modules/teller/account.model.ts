import { Schema, model, type InferSchemaType } from 'mongoose'
import { ACCOUNT_NO, ACCOUNT_STATUS, ACCOUNT_TYPES, BRANCH_CODES } from '@csm/shared'
import { cleanJSON } from '../../lib/toJSON.ts'

// Deposit accounts. Only the teller module moves money, and only through conditional $inc
// updates (see service.ts), so the balance can never go below zero.
const accountSchema = new Schema(
  {
    accountNo: { type: String, required: true, unique: true, match: ACCOUNT_NO },
    cif: { type: String, required: true, index: true },
    /** Copied from the customer so lookups don't need a join. */
    customerName: { type: String, required: true },
    branchCode: { type: String, enum: BRANCH_CODES, required: true },
    type: { type: String, enum: ACCOUNT_TYPES, required: true },
    status: { type: String, enum: ACCOUNT_STATUS, default: 'active' },
    /** Paise. */
    balance: { type: Number, required: true, min: 0, default: 0 },
    openedAt: { type: Date, required: true },
  },
  { timestamps: true, optimisticConcurrency: true, toJSON: cleanJSON() },
)

accountSchema.index({ branchCode: 1, accountNo: 1 })

export type Account = InferSchemaType<typeof accountSchema>
export const AccountModel = model('Account', accountSchema, 'accounts')
