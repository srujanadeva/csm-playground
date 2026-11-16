// One-time code challenges (password reset now; withdrawal step-up later). The code itself is
// never stored: only an HMAC of it, bound to the challenge id. Expired challenges are removed by TTL.
import { Schema, model, type InferSchemaType } from 'mongoose'

const challengeSchema = new Schema(
  {
    purpose: { type: String, required: true, maxlength: 40 },
    /** Who it is for; empty for decoy challenges created for unknown staff IDs. */
    subject: { type: String, default: '' },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    resendAt: { type: Date, required: true },
    resends: { type: Number, default: 0 },
    attempts: { type: Number, default: 0 },
    verifiedAt: { type: Date, default: null },
    /** HMAC of the reset token handed out after a correct code (single use). */
    tokenHash: { type: String, default: null },
    tokenExpiresAt: { type: Date, default: null },
    usedAt: { type: Date, default: null },
    /** Removal time: well after expiry, so "expired" can still be reported for a while. */
    purgeAt: { type: Date, required: true },
  },
  { timestamps: true },
)

challengeSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 })
challengeSchema.index({ tokenHash: 1 }, { sparse: true })

export type Challenge = InferSchemaType<typeof challengeSchema>
export const ChallengeModel = model('OtpChallenge', challengeSchema, 'otpchallenges')
