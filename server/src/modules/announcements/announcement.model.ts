// Notices shown in the bar at the top of the signed-in app. Phase 7 adds the admin editor; until
// then they come from the seed. bodyHtml is limited to simple formatting tags.
import { Schema, model, type InferSchemaType } from 'mongoose'
import { cleanJSON } from '../../lib/toJSON.ts'

const announcementSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    bodyHtml: { type: String, required: true, maxlength: 4000 },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
    color: { type: String, match: /^#[0-9a-f]{6}$/, default: '#2560a0' },
    dismissible: { type: Boolean, default: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, default: null },
    /** Empty means every branch. */
    branchCodes: { type: [String], default: [] },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, optimisticConcurrency: true, toJSON: cleanJSON() },
)

announcementSchema.index({ startsAt: 1, endsAt: 1 })

export type Announcement = InferSchemaType<typeof announcementSchema>
export const AnnouncementModel = model('Announcement', announcementSchema, 'announcements')
