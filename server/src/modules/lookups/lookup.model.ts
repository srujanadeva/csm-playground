import { Schema, model, type InferSchemaType } from 'mongoose'
import { LOOKUP_TYPES } from '@csm/shared'
import { cleanJSON } from '../../lib/toJSON.ts'

// Dropdown values, with English and Kannada labels. `parent` links dependent lists,
// e.g. an SR sub-category to its category.
const lookupSchema = new Schema(
  {
    type: { type: String, enum: LOOKUP_TYPES, required: true },
    code: { type: String, required: true },
    labels: { en: { type: String, required: true }, kn: { type: String, required: true } },
    parent: { type: String, default: null },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { toJSON: cleanJSON() },
)

lookupSchema.index({ type: 1, code: 1 }, { unique: true })
lookupSchema.index({ type: 1, parent: 1, order: 1 })

export type Lookup = InferSchemaType<typeof lookupSchema>
export const LookupModel = model('Lookup', lookupSchema, 'lookups')
