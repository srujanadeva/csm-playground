import { Schema, model, type InferSchemaType } from 'mongoose'
import { CAPABILITIES } from '@csm/shared'
import { cleanJSON } from '../../lib/toJSON.ts'

const grantSchema = new Schema(
  {
    screenKey: { type: String, required: true },
    capabilities: { type: [String], enum: CAPABILITIES, default: [] },
  },
  { _id: false },
)

const roleSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    names: { en: { type: String, required: true }, kn: { type: String, required: true } },
    grants: { type: [grantSchema], default: [] },
    /** Seeded roles can be edited but not deleted. */
    system: { type: Boolean, default: false },
  },
  { timestamps: true, optimisticConcurrency: true, toJSON: cleanJSON() },
)

export type Role = InferSchemaType<typeof roleSchema>
export const RoleModel = model('Role', roleSchema, 'roles')
