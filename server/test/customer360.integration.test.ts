/**
 * Phase 3 Customer 360 extras against a real MongoDB (database csm_playground_test_c360): bureau
 * score and report, offers, accounts and hover cards. The bureau fixture itself is tested without a
 * database. Integration tests skip automatically when MongoDB isn't reachable.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { pino } from 'pino'
import { ROLES, SCREENS, bureauBand } from '@csm/shared'
import { createApp } from '../src/app.ts'
import { loadConfig } from '../src/config.ts'
import { bureauFor } from '../src/fixtures/bureau.ts'
import { hashPassword } from '../src/lib/password.ts'
import { RoleModel } from '../src/modules/admin/role.model.ts'
import { ScreenModel } from '../src/modules/admin/screen.model.ts'
import { StaffUserModel } from '../src/modules/auth/staffUser.model.ts'
import { CustomerModel } from '../src/modules/customers/customer.model.ts'
import { AccountModel } from '../src/modules/teller/account.model.ts'
import { makeClient, mongoReachable, validEnv } from './helpers.ts'

const MONGO_URI = process.env.MONGO_URI_C360_TEST ?? 'mongodb://127.0.0.1:27017/csm_playground_test_c360'
const PASSWORD = 'Correct-Horse-Battery-77'

describe('bureau fixture', () => {
  const today = new Date('2026-11-16T00:00:00Z')

  it('is the same for the same customer and stays in range', () => {
    expect(bureauFor('CIF-000124', today)).toEqual(bureauFor('CIF-000124', today))
    for (let n = 1; n <= 200; n++) {
      const r = bureauFor(`CIF-${String(n).padStart(6, '0')}`, today)
      if (r) expect(r.score).toBeGreaterThanOrEqual(300)
      if (r) expect(r.score).toBeLessThanOrEqual(900)
    }
  })

  it('has customers with no record', () => {
    const none = Array.from({ length: 200 }, (_, n) =>
      bureauFor(`CIF-${String(n).padStart(6, '0')}`, today),
    ).filter((r) => r === null)
    expect(none.length).toBeGreaterThan(5)
  })

  it('bands scores at 650, 700 and 750', () => {
    expect([649, 650, 699, 700, 749, 750].map(bureauBand)).toEqual([
      'Poor',
      'Fair',
      'Fair',
      'Good',
      'Good',
      'Excellent',
    ])
  })
})

const mongoUp = await mongoReachable()
const config = loadConfig({ ...validEnv, MONGO_URI })
const app = createApp(config, pino({ level: 'silent' }), { apiRateLimit: 10_000, authRateLimit: 10_000 })

/** First CIF from 1 up whose bureau record matches `want` ("record" or "none"). */
function cifWith(want: 'record' | 'none'): string {
  for (let n = 1; ; n++) {
    const cif = `CIF-${String(n).padStart(6, '0')}`
    if ((bureauFor(cif) === null) === (want === 'none')) return cif
  }
}

describe.skipIf(!mongoUp)('Customer 360 extras (MongoDB)', () => {
  const withRecord = cifWith('record')
  const noRecord = cifWith('none')
  const csr = makeClient(app, PASSWORD)
  const sup = makeClient(app, PASSWORD)

  beforeAll(async () => {
    await mongoose.connect(MONGO_URI)
    await mongoose.connection.dropDatabase()
    await Promise.all(
      [ScreenModel, RoleModel, StaffUserModel, CustomerModel, AccountModel].map((m) =>
        (m as mongoose.Model<unknown>).init(),
      ),
    )
    await ScreenModel.insertMany(SCREENS)
    await RoleModel.insertMany(ROLES.map((r) => ({ ...r, system: true })))
    const passwordHash = await hashPassword(PASSWORD)
    await StaffUserModel.insertMany([
      {
        staffId: 'csr001',
        name: 'Kavya Hegde',
        roleKey: 'csr',
        branchCode: '0001',
        passwordHash,
        mustChangePassword: false,
      },
      {
        staffId: 'sup001',
        name: 'Meera Kulkarni',
        roleKey: 'supervisor',
        branchCode: '0001',
        passwordHash,
        mustChangePassword: false,
      },
    ])
    const base = { status: 'active', branchCode: '0001', contact: { mobile: '+919845012345' } }
    await CustomerModel.insertMany([
      {
        ...base,
        cif: withRecord,
        segment: 'premier',
        personal: { firstName: 'Asha', lastName: 'Rao', monthlyIncome: 2_50_000 },
      },
      {
        ...base,
        cif: noRecord,
        segment: 'retail',
        personal: { firstName: 'Ravi', lastName: 'Gowda', monthlyIncome: 60_000 },
      },
      {
        ...base,
        cif: 'CIF-009999',
        status: 'blocked',
        personal: { firstName: 'Blocked', lastName: 'Person', monthlyIncome: 90_000 },
      },
    ])
    await AccountModel.create({
      accountNo: '000110123456',
      cif: withRecord,
      customerName: 'Asha Rao',
      branchCode: '0001',
      type: 'savings',
      openedAt: new Date('2021-04-01'),
    })
    await csr.login('csr001')
    await sup.login('sup001')
  }, 30_000)

  afterAll(async () => {
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
  })

  it('returns a fixed score with its band, "none" without a record, and 503 when simulated down', async () => {
    const res = await csr.get(`/customers/${withRecord}/bureau`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'ready', score: bureauFor(withRecord)!.score })
    expect(res.body.band).toBe(bureauBand(res.body.score))
    expect((await csr.get(`/customers/${noRecord}/bureau`)).body).toEqual({ status: 'none' })
    const down = await csr.get(`/customers/${withRecord}/bureau?simulate=unavailable`)
    expect(down.status).toBe(503)
    expect(down.body.code).toBe('bureau_unavailable')
  })

  it('serves the report only to View PII, as a page only this app may frame', async () => {
    expect((await csr.get(`/customers/${withRecord}/bureau/report`)).status).toBe(403)
    const res = await sup.get(`/customers/${withRecord}/bureau/report`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'self'")
    expect(res.headers['content-security-policy']).not.toContain('script-src')
    expect(res.text).toContain(withRecord)
  })

  it('offers a card to premier customers, a loan to others, nothing to blocked ones', async () => {
    expect((await csr.get(`/customers/${withRecord}/offers`)).body.offer).toEqual({
      key: 'creditCard',
      params: {},
    })
    expect((await csr.get(`/customers/${noRecord}/offers`)).body.offer).toEqual({
      key: 'personalLoan',
      params: { limit: 6_00_000 },
    })
    expect((await csr.get('/customers/CIF-009999/offers')).body.offer).toBeNull()
  })

  it('lists accounts and shows masked hover cards for customers and staff', async () => {
    const accts = await csr.get(`/customers/${withRecord}/accounts`)
    expect(accts.body.items).toEqual([
      { accountNo: '000110123456', type: 'savings', status: 'active', openedAt: '2021-04-01T00:00:00.000Z' },
    ])
    const cardRes = await sup.get(`/customers/${withRecord}/card`)
    expect(cardRes.body).toMatchObject({
      ref: withRecord,
      name: 'Asha Rao',
      status: 'active',
      branchCode: '0001',
    })
    expect(cardRes.body.mobile).toMatch(/•/)
    expect((await csr.get('/staff/sup001/card')).body).toEqual({
      staffId: 'sup001',
      name: 'Meera Kulkarni',
      roleKey: 'supervisor',
      branchCode: '0001',
    })
    expect((await csr.get('/staff/nobody/card')).status).toBe(404)
  })
})
