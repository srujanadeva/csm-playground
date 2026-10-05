import { Schema, model, type InferSchemaType } from 'mongoose'
import { BRANCH_CODES, CAPABILITIES, LANGUAGES, STAFF_STATUS } from '@csm/shared'
import { cleanJSON } from '../../lib/toJSON.ts'

const overrideSchema = new Schema(
  {
    screenKey: { type: String, required: true },
    grant: { type: [String], enum: CAPABILITIES, default: [] },
    revoke: { type: [String], enum: CAPABILITIES, default: [] },
  },
  { _id: false },
)

const staffUserSchema = new Schema(
  {
    staffId: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z]{2,5}[0-9]{3}$/,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, trim: true, lowercase: true, maxlength: 120 },
    passwordHash: { type: String, required: true, select: false },
    roleKey: { type: String, required: true, index: true },
    overrides: { type: [overrideSchema], default: [] },
    branchCode: { type: String, enum: BRANCH_CODES, required: true },
    status: { type: String, enum: STAFF_STATUS, default: 'active', index: true },
    preferredLanguage: { type: String, enum: LANGUAGES, default: 'en' },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    /** Bumped on logout-everywhere, password change or deactivation: invalidates sessions. */
    tokenVersion: { type: Number, default: 0 },
    /** Bumped when access changes, so open sessions refresh their menu. */
    permVersion: { type: Number, default: 0 },
    mustChangePassword: { type: Boolean, default: true },
    passwordChangedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: cleanJSON(['passwordHash']) },
)

export type StaffUser = InferSchemaType<typeof staffUserSchema>
export const StaffUserModel = model('StaffUser', staffUserSchema, 'staffusers')
