import { Schema, model, type InferSchemaType } from 'mongoose'
import { BRANCH_CODES, DRAWER_STATUS } from '@csm/shared'
import { cleanJSON } from '../../lib/toJSON.ts'
import { denominationsDef } from './transaction.model.ts'

// A teller's till for one business day. cashIn/cashOut move only with posted transactions;
// the close records the physical count, and a supervisor signs the variance off.
const drawerSchema = new Schema(
  {
    tellerId: { type: String, required: true },
    branchCode: { type: String, enum: BRANCH_CODES, required: true },
    businessDate: { type: String, required: true, match: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/ },
    status: { type: String, enum: DRAWER_STATUS, default: 'open' },
    opening: denominationsDef,
    /** Paise, like every amount below. */
    openingAmount: { type: Number, required: true, min: 0 },
    cashIn: { type: Number, default: 0, min: 0 },
    cashOut: { type: Number, default: 0, min: 0 },
    counted: { type: denominationsDef, default: undefined },
    countedAmount: Number,
    variance: Number,
    varianceReason: { type: String, trim: true, maxlength: 200 },
    openedAt: { type: Date, required: true },
    closedAt: Date,
    signedOffBy: String,
    signedOffAt: Date,
    signOffNote: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: true, optimisticConcurrency: true, toJSON: cleanJSON() },
)

drawerSchema.index({ tellerId: 1, businessDate: 1 }, { unique: true })
drawerSchema.index({ branchCode: 1, status: 1, businessDate: -1 })

export type Drawer = InferSchemaType<typeof drawerSchema>
export const DrawerModel = model('Drawer', drawerSchema, 'drawers')
