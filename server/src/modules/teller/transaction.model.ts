import { Schema, model, type InferSchemaType } from 'mongoose'
import { ACCOUNT_NO, BRANCH_CODES, TXN_NO, TXN_STATUS, TXN_TYPES } from '@csm/shared'
import { cleanJSON } from '../../lib/toJSON.ts'

export const denominationsDef = {
  n500: { type: Number, min: 0, default: 0 },
  n200: { type: Number, min: 0, default: 0 },
  n100: { type: Number, min: 0, default: 0 },
  n50: { type: Number, min: 0, default: 0 },
  n20: { type: Number, min: 0, default: 0 },
  n10: { type: Number, min: 0, default: 0 },
  coins: { type: Number, min: 0, default: 0 },
}

// Cash transactions at the counter. Posted ones have moved money; pending ones wait for a
// supervisor (maker-checker); rejected ones never touched the balance or the drawer.
const transactionSchema = new Schema(
  {
    txnNo: { type: String, required: true, unique: true, match: TXN_NO },
    accountNo: { type: String, required: true, match: ACCOUNT_NO },
    cif: { type: String, required: true },
    customerName: { type: String, required: true },
    branchCode: { type: String, enum: BRANCH_CODES, required: true },
    type: { type: String, enum: TXN_TYPES, required: true },
    /** Paise. */
    amount: { type: Number, required: true, min: 100 },
    denominations: denominationsDef,
    narration: { type: String, trim: true, maxlength: 80 },
    /** Only the last 4 characters of a PAN entered at the counter are kept. */
    panLast4: String,
    status: { type: String, enum: TXN_STATUS, required: true },
    tellerId: { type: String, required: true },
    drawerId: { type: Schema.Types.ObjectId, required: true },
    businessDate: { type: String, required: true, match: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/ },
    balanceAfter: Number,
    decidedBy: String,
    decidedAt: Date,
    decisionNote: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: true, optimisticConcurrency: true, toJSON: cleanJSON() },
)

transactionSchema.index({ tellerId: 1, businessDate: 1, _id: -1 })
transactionSchema.index({ branchCode: 1, status: 1, _id: -1 })
transactionSchema.index({ accountNo: 1, _id: -1 })
transactionSchema.index({ drawerId: 1 })

export type Transaction = InferSchemaType<typeof transactionSchema>
export const TransactionModel = model('Transaction', transactionSchema, 'transactions')
