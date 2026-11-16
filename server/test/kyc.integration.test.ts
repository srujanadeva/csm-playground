/**
 * Phase 2 onboarding against a real MongoDB (database csm_playground_test_kyc): ID-card OCR, an
 * e-KYC round trip through the mock provider, photo/signature documents and nominee rules.
 * Skipped automatically when MongoDB isn't reachable.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import request from 'supertest'
import { pino } from 'pino'
import { ROLES, SCREENS } from '@csm/shared'
import { createApp } from '../src/app.ts'
import { loadConfig } from '../src/config.ts'
import { hashPassword } from '../src/lib/password.ts'
import { createMockProviderApp } from '../src/mockProvider/app.ts'
import { RoleModel } from '../src/modules/admin/role.model.ts'
import { ScreenModel } from '../src/modules/admin/screen.model.ts'
import { StaffUserModel } from '../src/modules/auth/staffUser.model.ts'
import { CustomerModel } from '../src/modules/customers/customer.model.ts'
import { EkycSessionModel } from '../src/modules/kyc/ekycSession.model.ts'
import { makeClient, mongoReachable, validEnv } from './helpers.ts'

const MONGO_URI = process.env.MONGO_URI_KYC_TEST ?? 'mongodb://127.0.0.1:27017/csm_playground_test_kyc'
const PASSWORD = 'Correct-Horse-Battery-77'
const SAMPLES = resolve(import.meta.dirname, '../../testresources')
const UPLOADS = mkdtempSync(join(tmpdir(), 'csm-kyc-'))

const mongoUp = await mongoReachable()
const config = loadConfig({ ...validEnv, MONGO_URI, UPLOAD_DIR: UPLOADS })
const app = createApp(config, pino({ level: 'silent' }), { apiRateLimit: 10_000, authRateLimit: 10_000 })
const provider = createMockProviderApp(config)
const sample = (name: string) => readFileSync(resolve(SAMPLES, name))
// The smallest valid PNG (1×1): enough for photo and signature uploads.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

const personal = {
  type: 'individual',
  segment: 'retail',
  title: 'ms',
  firstName: 'Kavya',
  lastName: 'Hegde',
  fatherOrSpouseName: 'Suresh Hegde',
  dob: '1992-04-18',
  gender: 'female',
  nationality: 'IN',
  countryOfBirth: 'IN',
  maritalStatus: 'single',
  dependants: 0,
  occupation: 'salaried',
  monthlyIncome: 80000,
  preferredLanguage: 'en',
  productsOfInterest: [],
}
const contact = {
  mobile: '9845012345',
  email: 'kavya@example.test',
  commPrefs: ['sms'],
  permanent: {
    line1: '12 MG Road',
    locality: 'Ashok Nagar',
    city: 'Bengaluru',
    state: 'KA',
    pincode: '560001',
  },
  mailingSameAsPermanent: true,
}
const kyc = {
  idType: 'pan',
  idNumber: 'ABCPE1234F',
  issueDate: '2015-01-10',
  pep: false,
  fatcaUsPerson: false,
}

describe.skipIf(!mongoUp)('onboarding KYC (MongoDB)', () => {
  const csr = makeClient(app, PASSWORD)
  let draftNo = ''

  beforeAll(async () => {
    await mongoose.connect(MONGO_URI)
    await mongoose.connection.dropDatabase()
    await Promise.all(
      [ScreenModel, RoleModel, StaffUserModel, CustomerModel, EkycSessionModel].map((m) =>
        (m as mongoose.Model<unknown>).init(),
      ),
    )
    await ScreenModel.insertMany(SCREENS)
    await RoleModel.insertMany(ROLES.map((r) => ({ ...r, system: true })))
    await StaffUserModel.create({
      staffId: 'csr001',
      name: 'Kavya Hegde',
      roleKey: 'csr',
      branchCode: '0001',
      passwordHash: await hashPassword(PASSWORD),
      mustChangePassword: false,
    })
    await csr.login('csr001')
    const created = await csr.post('/customers', { personal })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    draftNo = created.body.ref
    const saved = await csr.patch(`/customers/${draftNo}/draft`, {
      version: created.body.version,
      contact,
      kyc,
    })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
  }, 30_000)

  afterAll(async () => {
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
    rmSync(UPLOADS, { recursive: true, force: true })
  })

  describe('ID card OCR', () => {
    it('reads the clean sample with every field confident', async () => {
      const res = await csr.upload('/kyc/ocr', sample('ocr/id-clean.png'), 'card.png')
      expect(res.status).toBe(200)
      expect(res.body.fields.map((f: { key: string }) => f.key)).toEqual([
        'fullName',
        'idNumber',
        'dateOfBirth',
        'city',
        'expiryDate',
      ])
      expect(res.body.fields.some((f: { flagged: boolean }) => f.flagged)).toBe(false)
    })

    it('flags low-confidence and missing fields', async () => {
      const blurry = await csr.upload('/kyc/ocr', sample('ocr/id-blurry.png'), 'b.png')
      const flagged = blurry.body.fields
        .filter((f: { flagged: boolean }) => f.flagged)
        .map((f: { key: string }) => f.key)
      expect(flagged).toEqual(['fullName', 'idNumber', 'dateOfBirth', 'expiryDate'])
      const partial = await csr.upload('/kyc/ocr', sample('ocr/id-partial.png'), 'p.png')
      const expiry = partial.body.fields.find((f: { key: string }) => f.key === 'expiryDate')
      expect(expiry).toMatchObject({ value: '', flagged: true })
    })

    it('reports an unknown image as unreadable and refuses other file types', async () => {
      const unknown = await csr.upload('/kyc/ocr', sample('media/testimage.jpg'), 'x.jpg')
      expect(unknown.status).toBe(422)
      expect(unknown.body.code).toBe('ocr_unreadable')
      const pdf = await csr.upload('/kyc/ocr', Buffer.from('%PDF-1.4 hello'), 'x.pdf')
      expect(pdf.status).toBe(400)
    })
  })

  describe('e-KYC', () => {
    /** Starts a session and completes it on the provider the way the iframe would. */
    async function runEkyc(outcome: string, extra: Record<string, string> = {}) {
      const start = await csr.post('/kyc/ekyc/sessions', { customerRef: draftNo })
      expect(start.status, JSON.stringify(start.body)).toBe(201)
      const url = new URL(start.body.providerUrl)
      expect(url.origin).toBe('https://localhost:4002')
      const pageRes = await request(provider).get(`${url.pathname}${url.search}`)
      expect(pageRes.status).toBe(200)
      expect(pageRes.text).toContain('Kavya Hegde')
      const done = await request(provider)
        .post('/ekyc/complete')
        .type('form')
        .send({
          session: start.body.sessionId,
          parent: 'https://localhost:3001',
          action: 'verify',
          outcome,
          consent: 'yes',
          ...extra,
        })
      return { sessionId: start.body.sessionId as string, done }
    }

    it('verifies, posts only to the app origin, and stores the result on the customer', async () => {
      const { sessionId, done } = await runEkyc('match')
      expect(done.status).toBe(200)
      expect(done.text).toContain('"https://localhost:3001"')
      const result = await csr.get(`/kyc/ekyc/sessions/${sessionId}`)
      expect(result.body).toMatchObject({
        status: 'verified',
        verifiedName: 'Kavya Hegde',
        verifiedDob: '1992-04-18',
      })
      expect(result.body.reference).toMatch(/^EKYC-[0-9A-F]{8}$/)
      const form = await csr.get(`/customers/${draftNo}/form`)
      expect(form.body.ekyc.reference).toBe(result.body.reference)

      const replay = await request(provider).post('/ekyc/complete').type('form').send({
        session: sessionId,
        parent: 'https://localhost:3001',
        action: 'verify',
        outcome: 'not_found',
        consent: 'yes',
      })
      expect(replay.status).toBe(410)
    })

    it('reports a name the registry holds differently, and a missing record', async () => {
      const { sessionId } = await runEkyc('name_mismatch')
      expect((await csr.get(`/kyc/ekyc/sessions/${sessionId}`)).body.verifiedName).toBe('Kavya R Hegde')
      const nf = await runEkyc('not_found')
      const res = await csr.get(`/kyc/ekyc/sessions/${nf.sessionId}`)
      expect(res.body).toMatchObject({ status: 'not_verified', reference: null })
    })

    it('needs consent to verify, and refuses a parent that is not the app', async () => {
      const start = await csr.post('/kyc/ekyc/sessions', { customerRef: draftNo })
      const base = { session: start.body.sessionId, action: 'verify', outcome: 'match' }
      const noConsent = await request(provider)
        .post('/ekyc/complete')
        .type('form')
        .send({ ...base, parent: 'https://localhost:3001' })
      expect(noConsent.status).toBe(400)
      const evil = await request(provider)
        .post('/ekyc/complete')
        .type('form')
        .send({ ...base, parent: 'https://evil.test', consent: 'yes' })
      expect(evil.status).toBe(400)
    })
  })

  describe('submit', () => {
    it('requires a signature and valid nominees', async () => {
      await csr.upload(`/customers/${draftNo}/documents`, sample('ocr/id-clean.png'), 'id.png', {
        kind: 'id_front',
      })
      const withNominee = await csr.patch(`/customers/${draftNo}/draft`, {
        version: (await csr.get(`/customers/${draftNo}/form`)).body.version,
        nominees: {
          addNominee: true,
          nominees: [
            { name: 'Anika Hegde', relationship: 'child', dob: '2015-06-01', share: 60 },
            { name: 'Suresh Hegde', relationship: 'parent', dob: '1960-02-02', share: 30 },
          ],
        },
      })
      expect(withNominee.status, JSON.stringify(withNominee.body)).toBe(200)
      const res = await csr.post(`/customers/${draftNo}/submit`, {
        version: withNominee.body.version,
        declarations: { idVerified: true, termsAccepted: true },
      })
      expect(res.status).toBe(400)
      const codes = Object.fromEntries(
        res.body.errors.map((e: { path: string; code: string }) => [e.path, e.code]),
      )
      expect(codes).toMatchObject({
        signature: 'signatureRequired',
        'nominees.nominees.0.guardianName': 'guardianRequired',
        'nominees.nominees': 'nomineeShareTotal',
      })
    })

    it('replaces a retaken photo, refuses a PDF signature, then submits', async () => {
      await csr.upload(`/customers/${draftNo}/documents`, PNG, 'photo-1.png', { kind: 'photo' })
      await csr.upload(`/customers/${draftNo}/documents`, PNG, 'photo-2.png', { kind: 'photo' })
      const pdf = await csr.upload(`/customers/${draftNo}/documents`, Buffer.from('%PDF-1.4 x'), 's.pdf', {
        kind: 'signature',
      })
      expect(pdf.status).toBe(400)
      await csr.upload(`/customers/${draftNo}/documents`, PNG, 'signature.png', { kind: 'signature' })
      const form = await csr.get(`/customers/${draftNo}/form`)
      const photos = form.body.documents.filter((d: { kind: string }) => d.kind === 'photo')
      expect(photos.map((d: { fileName: string }) => d.fileName)).toEqual(['photo-2.png'])

      const fixed = await csr.patch(`/customers/${draftNo}/draft`, {
        version: form.body.version,
        nominees: {
          addNominee: true,
          nominees: [
            {
              name: 'Anika Hegde',
              relationship: 'child',
              dob: '2015-06-01',
              share: 60,
              guardianName: 'Suresh Hegde',
            },
            { name: 'Suresh Hegde', relationship: 'parent', dob: '1960-02-02', share: 40 },
          ],
        },
      })
      const res = await csr.post(`/customers/${draftNo}/submit`, {
        version: fixed.body.version,
        declarations: { idVerified: true, termsAccepted: true },
      })
      expect(res.status, JSON.stringify(res.body)).toBe(200)
      const detail = await csr.get(`/customers/${res.body.cif}`)
      expect(detail.body.photoDocId).toBe(photos[0].id)
      expect(detail.body.kyc.ekyc.reference).toMatch(/^EKYC-/)
      expect(detail.body.nominees).toHaveLength(2)
    })
  })
})
