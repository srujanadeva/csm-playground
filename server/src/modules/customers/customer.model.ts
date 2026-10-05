import { Schema, model, type InferSchemaType } from 'mongoose'
import {
  BRANCH_CODES,
  CUSTOMER_STATUS,
  CUSTOMER_TYPES,
  GENDERS,
  ID_TYPES,
  KYC_STATUS,
  LANGUAGES,
  MARITAL_STATUS,
  RISK_RATINGS,
  SEGMENTS,
} from '@csm/shared'
import { cleanJSON } from '../../lib/toJSON.ts'

const addressSchema = new Schema(
  {
    line1: { type: String, trim: true, maxlength: 120 },
    line2: { type: String, trim: true, maxlength: 120 },
    locality: { type: String, trim: true, maxlength: 80 },
    city: { type: String, trim: true, maxlength: 60 },
    state: { type: String, trim: true, maxlength: 60 },
    pincode: { type: String, match: /^[1-9][0-9]{5}$/ },
    country: { type: String, default: 'IN' },
  },
  { _id: false },
)

const documentSchema = new Schema(
  {
    kind: { type: String, enum: ['id_front', 'id_back', 'photo', 'address_proof', 'other'], required: true },
    fileName: { type: String, required: true, maxlength: 120 },
    mime: { type: String, enum: ['image/jpeg', 'image/png', 'application/pdf'], required: true },
    size: { type: Number, max: 2 * 1024 * 1024 },
    /** Random name on disk, outside the web root; never the uploaded name. */
    storageKey: { type: String, required: true },
    uploadedBy: String,
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
)

const customerSchema = new Schema(
  {
    cif: { type: String, unique: true, sparse: true, match: /^CIF-[0-9]{6}$/ },
    draftNo: { type: String, unique: true, sparse: true },
    type: { type: String, enum: CUSTOMER_TYPES, default: 'individual' },
    segment: { type: String, enum: SEGMENTS, default: 'retail' },
    status: { type: String, enum: CUSTOMER_STATUS, default: 'draft' },
    branchCode: { type: String, enum: BRANCH_CODES, required: true },
    personal: {
      title: String,
      firstName: { type: String, trim: true, maxlength: 60 },
      middleName: { type: String, trim: true, maxlength: 60 },
      lastName: { type: String, trim: true, maxlength: 60 },
      fatherOrSpouseName: { type: String, trim: true, maxlength: 120 },
      dob: Date,
      gender: { type: String, enum: GENDERS },
      nationality: String,
      countryOfBirth: String,
      maritalStatus: { type: String, enum: MARITAL_STATUS },
      dependants: { type: Number, min: 0, max: 20 },
      occupation: String,
      employer: { type: String, trim: true, maxlength: 120 },
      /** Whole rupees. */
      monthlyIncome: { type: Number, min: 0 },
      preferredLanguage: { type: String, enum: LANGUAGES, default: 'en' },
      productsOfInterest: { type: [String], default: [] },
    },
    /** Lowercase "first last" for prefix search on name. */
    nameSearch: { type: String },
    contact: {
      /** E.164, e.g. +919845012345 */
      mobile: { type: String, match: /^\+[1-9][0-9]{7,14}$/ },
      altMobile: { type: String, match: /^\+[1-9][0-9]{7,14}$/ },
      email: { type: String, trim: true, lowercase: true, maxlength: 120 },
      commPrefs: { type: [String], enum: ['sms', 'email', 'post'], default: ['sms'] },
    },
    addresses: {
      permanent: addressSchema,
      mailingSameAsPermanent: { type: Boolean, default: true },
      mailing: addressSchema,
    },
    kyc: {
      idType: { type: String, enum: ID_TYPES },
      /** AES-256-GCM ciphertext; never returned by the API. */
      idNumberEnc: { type: String, select: false },
      /** Keyed HMAC for exact-match search without decrypting. */
      idNumberIndex: { type: String, select: false },
      idNumberLast4: String,
      issueDate: Date,
      expiryDate: Date,
      pep: { type: Boolean, default: false },
      pepDetails: { position: String, country: String, since: Number, sourceOfWealth: String },
      fatcaUsPerson: { type: Boolean, default: false },
      riskRating: { type: String, enum: RISK_RATINGS, default: 'low' },
      status: { type: String, enum: KYC_STATUS, default: 'pending' },
      verifiedAt: Date,
    },
    documents: { type: [documentSchema], default: [] },
    createdBy: String,
    updatedBy: String,
  },
  { timestamps: true, optimisticConcurrency: true, toJSON: cleanJSON() },
)

// One index per search filter and sort the search screen offers.
customerSchema.index({ status: 1, createdAt: -1 })
customerSchema.index({ 'kyc.status': 1, createdAt: -1 })
customerSchema.index({ branchCode: 1, createdAt: -1 })
customerSchema.index({ nameSearch: 1 })
customerSchema.index({ 'contact.mobile': 1 })
customerSchema.index({ 'kyc.idNumberIndex': 1 }, { sparse: true })

export type Customer = InferSchemaType<typeof customerSchema>
export const CustomerModel = model('Customer', customerSchema, 'customers')
