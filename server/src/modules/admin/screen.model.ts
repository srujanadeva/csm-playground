import { Schema, model, type InferSchemaType } from 'mongoose'
import { CAPABILITIES, NAV_GROUPS } from '@csm/shared'
import { cleanJSON } from '../../lib/toJSON.ts'

const screenSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    route: { type: String, required: true },
    navGroup: { type: String, enum: [...NAV_GROUPS, null], default: null },
    labels: { en: { type: String, required: true }, kn: { type: String, required: true } },
    icon: { type: String, default: 'square' },
    order: { type: Number, default: 0 },
    inNav: { type: Boolean, default: true },
    adminOnly: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
    capabilities: { type: [String], enum: CAPABILITIES, default: ['view'] },
    unauthorisedMode: { type: String, enum: ['hide', 'disable'], default: 'hide' },
    defaultPageSize: { type: Number, min: 5, max: 100, default: 25 },
    maxPageSize: { type: Number, min: 5, max: 100, default: 100 },
  },
  { timestamps: true, optimisticConcurrency: true, toJSON: cleanJSON() },
)

export type Screen = InferSchemaType<typeof screenSchema>
export const ScreenModel = model('Screen', screenSchema, 'screens')
