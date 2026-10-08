/**
 * Teller API integration tests against a real MongoDB (database csm_playground_test_teller,
 * wiped per run). They cover the counter rules end to end: drawer required, note breakdown,
 * PAN for large deposits, overdraw, maker-checker on large withdrawals, idempotency, atomic
 * balance updates under concurrent requests, and the drawer close / sign-off flow.
 * Skipped automatically when MongoDB isn't reachable.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { pino } from 'pino'
import { EMPTY_DENOMINATIONS, ROLES, SCREENS, rupees, type Denominations } from '@csm/shared'
import { createApp } from '../src/app.ts'
import { loadConfig } from '../src/config.ts'
import { hashPassword } from '../src/lib/password.ts'
import { invalidateAccessCache } from '../src/modules/admin/access.ts'
import { RoleModel } from '../src/modules/admin/role.model.ts'
import { ScreenModel } from '../src/modules/admin/screen.model.ts'
import { StaffUserModel } from '../src/modules/auth/staffUser.model.ts'
import { CustomerModel } from '../src/modules/customers/customer.model.ts'
import { AccountModel } from '../src/modules/teller/account.model.ts'
import { DrawerModel } from '../src/modules/teller/drawer.model.ts'
import { TransactionModel } from '../src/modules/teller/transaction.model.ts'
import { makeClient, mongoReachable, validEnv } from './helpers.ts'

const MONGO_URI = process.env.MONGO_URI_TELLER_TEST ?? 'mongodb://127.0.0.1:27017/csm_playground_test_teller'
const PASSWORD = 'Correct-Horse-Battery-77'

const mongoUp = await mongoReachable()
const config = loadConfig({ ...validEnv, MONGO_URI })
const app = createApp(config, pino({ level: 'silent' }), { apiRateLimit: 10_000, authRateLimit: 10_000 })

async function signedIn(staffId: string) {
  const c = makeClient(app, PASSWORD)
  const res = await c.login(staffId)
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return c
}

const notes = (d: Partial<Denominations>): Denominations => ({ ...EMPTY_DENOMINATIONS, ...d })
const balanceOf = async (accountNo: string) => (await AccountModel.findOne({ accountNo }).lean())!.balance

const customer = (cif: string, idType: string, status = 'active') => ({
  cif,
  status,
  branchCode: '0001',
  personal: { firstName: 'Test', lastName: cif },
  nameSearch: `test ${cif.toLowerCase()}`,
  contact: { mobile: '+919845012345' },
  kyc: { idType, status: 'verified' },
})

const account = (accountNo: string, cif: string, balance: number, status = 'active') => ({
  accountNo,
  cif,
  customerName: `Test ${cif}`,
  branchCode: accountNo.slice(0, 4),
  type: 'savings',
  status,
  balance,
  openedAt: new Date('2025-01-01'),
})

describe.skipIf(!mongoUp)('Teller API (MongoDB)', () => {
  beforeAll(async () => {
    await mongoose.connect(MONGO_URI)
    await mongoose.connection.dropDatabase()
    await Promise.all(
      [
        ScreenModel,
        RoleModel,
        StaffUserModel,
        CustomerModel,
        AccountModel,
        TransactionModel,
        DrawerModel,
      ].map((m) => (m as mongoose.Model<unknown>).init()),
    )
    await ScreenModel.insertMany(SCREENS)
    await RoleModel.insertMany(ROLES.map((r) => ({ ...r, system: true })))
    const passwordHash = await hashPassword(PASSWORD)
    const staff = (staffId: string, roleKey: string, branchCode = '0001') => ({
      staffId,
      name: staffId,
      roleKey,
      branchCode,
      passwordHash,
      mustChangePassword: false,
    })
    await StaffUserModel.insertMany([
      staff('admin001', 'admin'),
      staff('sup001', 'supervisor'),
      staff('sup002', 'supervisor', '0004'),
      staff('csr001', 'csr'),
      staff('tel001', 'teller'),
      staff('tel002', 'teller'),
    ])
    await CustomerModel.insertMany([
      customer('CIF-000001', 'passport'),
      customer('CIF-000002', 'pan'),
      { ...customer('CIF-000003', 'passport'), branchCode: '0004' },
    ])
    await AccountModel.insertMany([
      account('000110000001', 'CIF-000001', rupees(2_00_000)),
      account('000110000002', 'CIF-000002', rupees(10_000)),
      account('000110000003', 'CIF-000001', rupees(5_000), 'frozen'),
      account('000410000001', 'CIF-000003', rupees(50_000)),
    ])
    invalidateAccessCache()
  }, 30_000)

  afterAll(async () => {
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
  })

  const deposit = (accountNo: string, amountRupees: number, d: Partial<Denominations>, extra = {}) => ({
    accountNo,
    type: 'cash_deposit',
    amount: rupees(amountRupees),
    denominations: notes(d),
    ...extra,
  })
  const withdrawal = (accountNo: string, amountRupees: number, d: Partial<Denominations>) => ({
    ...deposit(accountNo, amountRupees, d),
    type: 'cash_withdrawal',
  })

  it('keeps CSRs out and scopes account lookup to the branch', async () => {
    const csr = await signedIn('csr001')
    expect((await csr.get('/teller/accounts?q=0001')).status).toBe(403)

    const tel = await signedIn('tel001')
    const found = await tel.get('/teller/accounts?q=0001')
    expect(found.status).toBe(200)
    expect(found.body.items.map((a: { accountNo: string }) => a.accountNo)).toEqual([
      '000110000001',
      '000110000002',
      '000110000003',
    ])
    expect((await tel.get('/teller/accounts/000410000001')).status).toBe(404)

    const detail = await tel.get('/teller/accounts/000110000002')
    expect(detail.body).toMatchObject({ balance: rupees(10_000), panOnFile: true, piiMasked: true })
    expect(detail.body.mobile).toContain('••••')
  })

  it('needs an open drawer, then posts deposits that move the balance and the drawer', async () => {
    const tel = await signedIn('tel001')
    const early = await tel.post('/teller/transactions', deposit('000110000001', 500, { n500: 1 }))
    expect(early.status).toBe(409)
    expect(early.body.code).toBe('drawer_not_open')

    const opened = await tel.post('/teller/drawer/open', { denominations: notes({ n500: 200 }) })
    expect(opened.status).toBe(201)
    expect(opened.body).toMatchObject({ status: 'open', openingAmount: rupees(1_00_000) })
    expect((await tel.post('/teller/drawer/open', { denominations: notes({}) })).body.code).toBe(
      'drawer_open',
    )

    const posted = await tel.post(
      '/teller/transactions',
      deposit('000110000001', 1_250, { n500: 2, n200: 1, n50: 1 }),
    )
    expect(posted.status, JSON.stringify(posted.body)).toBe(201)
    expect(posted.body).toMatchObject({ status: 'posted', balanceAfter: rupees(2_01_250) })
    expect((await tel.get('/teller/drawer')).body.drawer).toMatchObject({
      cashIn: rupees(1_250),
      expected: rupees(1_01_250),
      postedCount: 1,
    })
  })

  it('rejects notes that do not add up, and large deposits without a PAN', async () => {
    const tel = await signedIn('tel001')
    const mismatch = await tel.post('/teller/transactions', deposit('000110000001', 1_000, { n500: 1 }))
    expect(mismatch.status).toBe(400)
    expect(mismatch.body.errors[0].code).toBe('denominationMismatch')

    const noPan = await tel.post('/teller/transactions', deposit('000110000001', 60_000, { n500: 120 }))
    expect(noPan.status).toBe(400)
    expect(noPan.body.errors[0]).toMatchObject({ path: 'panNumber', code: 'panRequired' })

    const withPan = await tel.post(
      '/teller/transactions',
      deposit('000110000001', 60_000, { n500: 120 }, { panNumber: 'abcpe1234f' }),
    )
    expect(withPan.status).toBe(201)
    expect(withPan.body.panLast4).toBe('234F')

    // A PAN on file (CIF-000002's KYC ID) means none is asked for.
    const onFile = await tel.post('/teller/transactions', deposit('000110000002', 50_000, { n500: 100 }))
    expect(onFile.status).toBe(201)
    await tel.post('/teller/transactions', withdrawal('000110000002', 50_000, { n500: 100 }))
  })

  it('refuses frozen accounts and overdrawing', async () => {
    const tel = await signedIn('tel001')
    const frozen = await tel.post('/teller/transactions', deposit('000110000003', 500, { n500: 1 }))
    expect(frozen.body.code).toBe('account_not_active')
    const over = await tel.post('/teller/transactions', withdrawal('000110000002', 10_500, { n500: 21 }))
    expect(over.status).toBe(409)
    expect(over.body.code).toBe('insufficient_funds')
  })

  it('holds withdrawals over ₹50,000 until another person in the branch authorises them', async () => {
    const tel = await signedIn('tel001')
    const before = await balanceOf('000110000001')
    const held = await tel.post('/teller/transactions', withdrawal('000110000001', 75_000, { n500: 150 }))
    expect(held.status).toBe(201)
    expect(held.body.status).toBe('pending_authorisation')
    expect(await balanceOf('000110000001')).toBe(before)
    const txnNo = held.body.txnNo

    expect((await tel.post(`/teller/transactions/${txnNo}/decision`, { decision: 'approve' })).status).toBe(
      403,
    )
    const otherBranch = await signedIn('sup002')
    expect(
      (await otherBranch.post(`/teller/transactions/${txnNo}/decision`, { decision: 'approve' })).status,
    ).toBe(404)

    const sup = await signedIn('sup001')
    const pending = await sup.get('/teller/transactions?scope=branch&status=pending_authorisation')
    expect(pending.body.items.map((t: { txnNo: string }) => t.txnNo)).toContain(txnNo)
    const approved = await sup.post(`/teller/transactions/${txnNo}/decision`, { decision: 'approve' })
    expect(approved.status, JSON.stringify(approved.body)).toBe(200)
    expect(approved.body).toMatchObject({
      status: 'posted',
      decidedBy: 'sup001',
      balanceAfter: before - rupees(75_000),
    })
    expect((await sup.post(`/teller/transactions/${txnNo}/decision`, { decision: 'approve' })).status).toBe(
      409,
    )
    expect((await tel.get('/teller/transactions?scope=branch')).status).toBe(403)
  })

  it("won't let a supervisor authorise their own withdrawal", async () => {
    const sup = await signedIn('sup001')
    await sup.post('/teller/drawer/open', { denominations: notes({ n500: 200 }) })
    const own = await sup.post('/teller/transactions', withdrawal('000110000001', 60_000, { n500: 120 }))
    const self = await sup.post(`/teller/transactions/${own.body.txnNo}/decision`, { decision: 'approve' })
    expect(self.status).toBe(403)
    expect(self.body.code).toBe('own_request')

    const drawer = (await sup.get('/teller/drawer')).body.drawer
    const blocked = await sup.post('/teller/drawer/close', {
      denominations: notes({ n500: 200 }),
      version: drawer.version,
    })
    expect(blocked.body.code).toBe('pending_transactions')

    const admin = await signedIn('admin001')
    const shortNote = await admin.post(`/teller/transactions/${own.body.txnNo}/decision`, {
      decision: 'reject',
      note: 'no',
    })
    expect(shortNote.status).toBe(400)
    const rejected = await admin.post(`/teller/transactions/${own.body.txnNo}/decision`, {
      decision: 'reject',
      note: 'Customer could not be reached to confirm.',
    })
    expect(rejected.body.status).toBe('rejected')
  })

  it('replays a repeated Idempotency-Key instead of posting twice', async () => {
    const tel = await signedIn('tel001')
    const key = 'teller-idem-0001'
    const body = deposit('000110000001', 100, { n100: 1 })
    const first = await tel.post('/teller/transactions', body, { 'Idempotency-Key': key })
    const again = await tel.post('/teller/transactions', body, { 'Idempotency-Key': key })
    expect(again.headers['idempotent-replayed']).toBe('true')
    expect(again.body.txnNo).toBe(first.body.txnNo)
    expect(await TransactionModel.countDocuments({ txnNo: first.body.txnNo })).toBe(1)
  })

  it('lets only one of two concurrent withdrawals through when the balance covers one', async () => {
    const tel2 = await signedIn('tel002')
    await tel2.post('/teller/drawer/open', { denominations: notes({ n500: 100 }) })
    await AccountModel.updateOne({ accountNo: '000110000002' }, { $set: { balance: rupees(10_000) } })
    const results = await Promise.all([
      tel2.post('/teller/transactions', withdrawal('000110000002', 6_000, { n500: 12 })),
      tel2.post('/teller/transactions', withdrawal('000110000002', 6_000, { n500: 12 })),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([201, 409])
    expect(await balanceOf('000110000002')).toBe(rupees(4_000))
    expect((await tel2.get('/teller/drawer')).body.drawer.cashOut).toBe(rupees(6_000))
  })

  it('closes with a reason for any difference, then a supervisor signs it off', async () => {
    const tel = await signedIn('tel001')
    const drawer = (await tel.get('/teller/drawer')).body.drawer
    const short = drawer.expected - rupees(500)
    const counted = { n500: Math.floor(short / 100 / 500), coins: 0 }
    const rest = short / 100 - counted.n500 * 500
    const d = notes({ ...counted, n100: Math.floor(rest / 100), coins: rest % 100 })

    const stale = await tel.post('/teller/drawer/close', { denominations: d, version: drawer.version + 1 })
    expect(stale.body.code).toBe('stale_version')
    const noReason = await tel.post('/teller/drawer/close', { denominations: d, version: drawer.version })
    expect(noReason.body.errors[0].code).toBe('varianceReasonRequired')
    const closed = await tel.post('/teller/drawer/close', {
      denominations: d,
      version: drawer.version,
      varianceReason: 'One ₹500 note missing at the count.',
    })
    expect(closed.status, JSON.stringify(closed.body)).toBe(200)
    expect(closed.body).toMatchObject({ status: 'closed', variance: -rupees(500) })

    const after = await tel.post('/teller/transactions', deposit('000110000001', 500, { n500: 1 }))
    expect(after.body.code).toBe('drawer_not_open')
    expect((await tel.post('/teller/drawer/open', { denominations: notes({}) })).body.code).toBe(
      'drawer_exists',
    )

    expect((await tel.get('/teller/drawers?status=closed')).status).toBe(403)
    const sup = await signedIn('sup001')
    const list = await sup.get('/teller/drawers?status=closed')
    expect(list.body.items.map((x: { tellerId: string }) => x.tellerId)).toContain('tel001')
    const noNote = await sup.post(`/teller/drawers/${closed.body.id}/sign-off`, {
      version: closed.body.version,
    })
    expect(noNote.body.errors[0].code).toBe('signOffNoteRequired')
    const signed = await sup.post(`/teller/drawers/${closed.body.id}/sign-off`, {
      version: closed.body.version,
      note: 'Shortage recovered from the teller.',
    })
    expect(signed.body).toMatchObject({ status: 'signed_off', signedOffBy: 'sup001' })
  })
})
