/**
 * API integration tests against a real MongoDB (database csm_playground_test, wiped per run).
 * They prove the security rules end to end: lockout, admin 404s, branch scoping, PII masking,
 * maker-checker, the request state machine, idempotency, screen switches and sessions.
 * Skipped automatically when MongoDB isn't reachable.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import { pino } from 'pino'
import { ROLES, SCREENS } from '@csm/shared'
import { createApp } from '../src/app.ts'
import { loadConfig } from '../src/config.ts'
import { encryptField, blindIndex } from '../src/lib/crypto.ts'
import { hashPassword } from '../src/lib/password.ts'
import { invalidateAccessCache } from '../src/modules/admin/access.ts'
import { RoleModel } from '../src/modules/admin/role.model.ts'
import { ScreenModel } from '../src/modules/admin/screen.model.ts'
import { StaffUserModel } from '../src/modules/auth/staffUser.model.ts'
import { CustomerModel } from '../src/modules/customers/customer.model.ts'
import { LookupModel } from '../src/modules/lookups/lookup.model.ts'
import { ServiceRequestModel } from '../src/modules/serviceRequests/serviceRequest.model.ts'
import { AuditLogModel } from '../src/modules/audit/auditLog.model.ts'
import { makeClient, mongoReachable, validEnv } from './helpers.ts'

const MONGO_URI = process.env.MONGO_URI_TEST ?? 'mongodb://127.0.0.1:27017/csm_playground_test'
const PASSWORD = 'Correct-Horse-Battery-77'

const mongoUp = await mongoReachable()

const config = loadConfig({ ...validEnv, MONGO_URI })
const app = createApp(config, pino({ level: 'silent' }), { apiRateLimit: 10_000, authRateLimit: 10_000 })

const client = () => makeClient(app, PASSWORD)

async function signedIn(staffId: string) {
  const c = client()
  const res = await c.login(staffId)
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return c
}

const customer = (cif: string, branchCode: string, extra: Record<string, unknown> = {}) => ({
  cif,
  status: 'active',
  branchCode,
  type: 'individual',
  segment: 'retail',
  personal: { firstName: 'Test', lastName: cif, gender: 'female', nationality: 'IN', monthlyIncome: 50000 },
  nameSearch: `test ${cif.toLowerCase()}`,
  contact: { mobile: '+919845012345', email: 'test@example.com', commPrefs: ['sms'] },
  kyc: {
    idType: 'passport',
    idNumberEnc: encryptField('W1234567', config.PII_ENC_KEY),
    idNumberIndex: blindIndex('W1234567', config.PII_ENC_KEY),
    idNumberLast4: '4567',
    status: 'verified',
    riskRating: 'low',
  },
  createdBy: 'csr001',
  ...extra,
})

describe.skipIf(!mongoUp)('API integration (MongoDB)', () => {
  beforeAll(async () => {
    await mongoose.connect(MONGO_URI)
    await mongoose.connection.dropDatabase()
    await Promise.all(
      [ScreenModel, RoleModel, StaffUserModel, CustomerModel, ServiceRequestModel, LookupModel].map((m) =>
        (m as mongoose.Model<unknown>).init(),
      ),
    )
    await ScreenModel.insertMany(SCREENS)
    await RoleModel.insertMany(ROLES.map((r) => ({ ...r, system: true })))
    await LookupModel.insertMany([
      { type: 'srCategories', code: 'cards', labels: { en: 'Cards', kn: 'ಕಾರ್ಡ್' } },
      {
        type: 'srSubCategories',
        code: 'card_blocked',
        parent: 'cards',
        labels: { en: 'Card blocked', kn: 'ಕಾರ್ಡ್' },
      },
      { type: 'blockReasons', code: 'suspected_fraud', labels: { en: 'Fraud', kn: 'ವಂಚನೆ' } },
    ])
    const passwordHash = await hashPassword(PASSWORD)
    await StaffUserModel.insertMany([
      {
        staffId: 'admin001',
        name: 'Raghavendra Rao',
        roleKey: 'admin',
        branchCode: '0001',
        passwordHash,
        mustChangePassword: false,
      },
      {
        staffId: 'sup001',
        name: 'Naveen Gowda',
        roleKey: 'supervisor',
        branchCode: '0001',
        passwordHash,
        mustChangePassword: false,
      },
      {
        staffId: 'sup002',
        name: 'Sowmya Murthy',
        roleKey: 'supervisor',
        branchCode: '0001',
        passwordHash,
        mustChangePassword: false,
      },
      {
        staffId: 'csr001',
        name: 'Kavya Hegde',
        roleKey: 'csr',
        branchCode: '0001',
        passwordHash,
        mustChangePassword: false,
      },
      {
        staffId: 'csr002',
        name: 'Arun Shetty',
        roleKey: 'csr',
        branchCode: '0004',
        passwordHash,
        mustChangePassword: false,
      },
      {
        staffId: 'csr009',
        name: 'Lock Test',
        roleKey: 'csr',
        branchCode: '0001',
        passwordHash,
        mustChangePassword: false,
      },
      {
        staffId: 'csr010',
        name: 'New Starter',
        roleKey: 'csr',
        branchCode: '0001',
        passwordHash,
        mustChangePassword: true,
      },
    ])
    await CustomerModel.insertMany([
      customer('CIF-000001', '0001'),
      customer('CIF-000002', '0001'),
      customer('CIF-000003', '0004'),
    ])
    invalidateAccessCache()
  }, 30_000)

  afterAll(async () => {
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
  })

  describe('sign-in', () => {
    it('answers unknown and known staff IDs the same way, then locks after 5 failures', async () => {
      const c = client()
      const unknown = await c.login('zzz001', 'wrong-password')
      const known = await c.login('csr009', 'wrong-password')
      expect(unknown.status).toBe(401)
      expect(known.status).toBe(401)
      expect(unknown.body.code).toBe(known.body.code)
      expect(unknown.body.attemptsLeft).toBe(known.body.attemptsLeft)
      for (let i = 0; i < 3; i++) await c.login('csr009', 'wrong-password')
      const locked = await c.login('csr009', 'wrong-password')
      expect(locked.body.code).toBe('account_locked')
      const evenCorrect = await c.login('csr009')
      expect(evenCorrect.status).toBe(401)
      expect(evenCorrect.body.code).toBe('account_locked')
      expect(await AuditLogModel.exists({ action: 'auth.account.locked', actor: 'csr009' })).toBeTruthy()
    })

    it('sets an httpOnly, Secure, SameSite=Strict session cookie and ends it on sign-out', async () => {
      const c = client()
      const res = await c.login('csr001')
      const setCookie = String(res.headers['set-cookie'])
      expect(setCookie).toMatch(/__Host-sid=.*HttpOnly/)
      expect(setCookie).toMatch(/Secure/)
      expect(setCookie).toMatch(/SameSite=Strict/)
      const stolen = c.cookie()
      expect((await c.post('/auth/logout')).status).toBe(204)
      const replay = await request(app).get('/api/v1/auth/me').set('Cookie', stolen)
      expect(replay.status).toBe(401)
    })

    it('blocks everything but the password change while a one-time password is in use', async () => {
      const c = await signedIn('csr010')
      expect((await c.get('/customers')).body.code).toBe('password_change_required')
      const common = await c.post('/auth/change-password', {
        currentPassword: PASSWORD,
        newPassword: 'password12345',
        confirmPassword: 'password12345',
      })
      expect(common.status).toBe(400)
      expect(common.body.errors[0].code).toBe('passwordBreached')
      const own = await c.post('/auth/change-password', {
        currentPassword: PASSWORD,
        newPassword: 'Starter-Kannada-2026',
        confirmPassword: 'Starter-Kannada-2026',
      })
      expect(own.body.errors[0].code).toBe('passwordContainsId')
      const ok = await c.post('/auth/change-password', {
        currentPassword: PASSWORD,
        newPassword: 'Lalbagh-Flower-Show-26',
        confirmPassword: 'Lalbagh-Flower-Show-26',
      })
      expect(ok.status).toBe(200)
      expect((await c.get('/customers')).status).toBe(200)
    })
  })

  describe('access control', () => {
    it('hides the admin API from non-admins with a 404', async () => {
      const csr = await signedIn('csr001')
      const sup = await signedIn('sup001')
      const admin = await signedIn('admin001')
      expect((await csr.get('/admin/users')).status).toBe(404)
      expect((await sup.get('/admin/screens')).status).toBe(404)
      expect((await admin.get('/admin/users')).status).toBe(200)
    })

    it('limits CSRs to their branch and masks PII without viewPII', async () => {
      const csr = await signedIn('csr001')
      const res = await csr.get('/customers')
      expect(res.body.items.map((i: { ref: string }) => i.ref).sort()).toEqual(['CIF-000001', 'CIF-000002'])
      expect(res.body.items[0].mobile).toBe('+91 98450 •••• 45')
      expect((await csr.get('/customers/CIF-000003')).status).toBe(404)
      expect((await csr.post('/customers/CIF-000001/reveal-id')).status).toBe(403)
    })

    it('lets a supervisor reveal an ID number, and audits it', async () => {
      const sup = await signedIn('sup001')
      const res = await sup.post('/customers/CIF-000001/reveal-id')
      expect(res.body.idNumber).toBe('W1234567')
      expect(
        await AuditLogModel.exists({
          action: 'customer.pii.viewed',
          actor: 'sup001',
          entityId: 'CIF-000001',
        }),
      ).toBeTruthy()
    })

    it('rejects operators and unknown query fields before they reach MongoDB', async () => {
      const csr = await signedIn('csr001')
      expect((await csr.get('/customers?status[$ne]=x')).status).toBe(400)
      expect((await csr.get('/customers?evil=1')).status).toBe(400)
      expect((await csr.get('/customers?sort=passwordHash')).status).toBe(400)
    })

    it('caps page size at the screen maximum the admin sets', async () => {
      const admin = await signedIn('admin001')
      const screen = (await admin.get('/admin/screens')).body.items.find(
        (s: { key: string }) => s.key === 'customers.search',
      )
      const res = await admin.patch('/admin/screens/customers.search', {
        version: screen.version,
        maxPageSize: 10,
        defaultPageSize: 10,
      })
      expect(res.status).toBe(200)
      const csr = await signedIn('csr001')
      expect((await csr.get('/customers?pageSize=50')).body.pageSize).toBe(10)
    })

    it('removes a switched-off screen from the menu and refuses its API', async () => {
      const admin = await signedIn('admin001')
      const screen = (await admin.get('/admin/screens')).body.items.find(
        (s: { key: string }) => s.key === 'serviceRequests.board',
      )
      await admin.patch('/admin/screens/serviceRequests.board', { version: screen.version, enabled: false })
      const csr = await signedIn('csr001')
      expect((await csr.get('/auth/me')).body.nav.map((n: { key: string }) => n.key)).not.toContain(
        'serviceRequests.board',
      )
      expect((await csr.get('/service-requests/board?status=open')).status).toBe(403)
      const after = (await admin.get('/admin/screens')).body.items.find(
        (s: { key: string }) => s.key === 'serviceRequests.board',
      )
      await admin.patch('/admin/screens/serviceRequests.board', { version: after.version, enabled: true })
    })

    it("won't let an admin switch off admin screens or demote themselves", async () => {
      const admin = await signedIn('admin001')
      const screen = (await admin.get('/admin/screens')).body.items.find(
        (s: { key: string }) => s.key === 'admin.users',
      )
      expect(
        (await admin.patch('/admin/screens/admin.users', { version: screen.version, enabled: false })).body
          .code,
      ).toBe('self_protection')
      expect((await admin.patch('/admin/users/admin001', { roleKey: 'csr' })).body.code).toBe(
        'self_protection',
      )
    })
  })

  describe('maker-checker', () => {
    it('applies a block only when another person approves it', async () => {
      const csr = await signedIn('csr001')
      const sup = await signedIn('sup001')
      const sup2 = await signedIn('sup002')
      const reqRes = await csr.post('/customers/CIF-000002/block-requests', {
        reason: 'suspected_fraud',
        remarks: 'Unrecognised card transactions reported.',
      })
      expect(reqRes.status).toBe(201)
      expect((await csr.post(`/approvals/${reqRes.body.approvalId}/approve`)).status).toBe(403)
      expect((await sup.post(`/approvals/${reqRes.body.approvalId}/approve`)).status).toBe(200)
      expect((await csr.get('/customers/CIF-000002')).body.status).toBe('blocked')

      const own = await sup.post('/customers/CIF-000002/unblock-requests', {
        reason: 'suspected_fraud',
        remarks: 'Customer verified at the branch counter.',
      })
      const self = await sup.post(`/approvals/${own.body.approvalId}/approve`)
      expect(self.status).toBe(403)
      expect(self.body.code).toBe('own_request')
      expect((await sup2.post(`/approvals/${own.body.approvalId}/approve`)).status).toBe(200)
    })
  })

  describe('service requests', () => {
    const body = () => ({
      customerCif: 'CIF-000001',
      channel: 'branch',
      category: 'cards',
      subCategory: 'card_blocked',
      priority: 'high',
      slaDueAt: new Date(Date.now() + 86_400_000).toISOString(),
      subject: 'Card blocked after lost wallet',
      description: 'Customer lost her wallet at the mall and blocked the card from the app.',
    })

    it('creates one request for a repeated Idempotency-Key', async () => {
      const csr = await signedIn('csr001')
      const key = 'retry-test-key-0001'
      const a = await csr.post('/service-requests', body(), { 'Idempotency-Key': key })
      const b = await csr.post('/service-requests', body(), { 'Idempotency-Key': key })
      expect(a.status).toBe(201)
      expect(b.headers['idempotent-replayed']).toBe('true')
      expect(b.body.srNo).toBe(a.body.srNo)
      expect(await ServiceRequestModel.countDocuments({ subject: body().subject })).toBe(1)
    })

    it('enforces the state machine and needs Approve to close', async () => {
      const csr = await signedIn('csr001')
      const sup = await signedIn('sup001')
      const sr = (await csr.post('/service-requests', body())).body
      const skip = await csr.patch(`/service-requests/${sr.srNo}/status`, {
        status: 'closed',
        version: sr.version,
      })
      expect(skip.status).toBe(409)
      expect(skip.body.code).toBe('invalid_transition')
      const noNotes = await csr.patch(`/service-requests/${sr.srNo}/status`, {
        status: 'resolved',
        version: sr.version,
      })
      expect(noNotes.status).toBe(400)
      const resolved = (
        await csr.patch(`/service-requests/${sr.srNo}/status`, {
          status: 'resolved',
          version: sr.version,
          resolutionNotes: 'Replacement card issued.',
        })
      ).body
      const stale = await csr.patch(`/service-requests/${sr.srNo}/status`, {
        status: 'in_progress',
        version: sr.version,
      })
      expect(stale.body.code).toBe('stale_version')
      expect(
        (
          await csr.patch(`/service-requests/${sr.srNo}/status`, {
            status: 'closed',
            version: resolved.version,
          })
        ).status,
      ).toBe(403)
      expect(
        (
          await sup.patch(`/service-requests/${sr.srNo}/status`, {
            status: 'closed',
            version: resolved.version,
          })
        ).status,
      ).toBe(200)
    })

    it('refuses customers from another branch', async () => {
      const csr2 = await signedIn('csr002')
      const res = await csr2.post('/service-requests', body())
      expect(res.status).toBe(400)
      expect(res.body.errors[0].path).toBe('customerCif')
    })
  })
})
