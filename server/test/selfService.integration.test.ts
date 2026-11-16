/**
 * Phase 1 flows against a real MongoDB (database csm_playground_test_selfservice): forgot password
 * with one-time codes and the dev inbox, access requests decided by an admin, and announcements.
 * Skipped automatically when MongoDB isn't reachable.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { pino } from 'pino'
import { ROLES, SCREENS } from '@csm/shared'
import { createApp } from '../src/app.ts'
import { loadConfig } from '../src/config.ts'
import { hashPassword } from '../src/lib/password.ts'
import { RoleModel } from '../src/modules/admin/role.model.ts'
import { ScreenModel } from '../src/modules/admin/screen.model.ts'
import { StaffUserModel } from '../src/modules/auth/staffUser.model.ts'
import { AnnouncementModel } from '../src/modules/announcements/announcement.model.ts'
import { ChallengeModel } from '../src/modules/otp/challenge.model.ts'
import { makeClient, mongoReachable, validEnv } from './helpers.ts'

const MONGO_URI =
  process.env.MONGO_URI_SELF_TEST ?? 'mongodb://127.0.0.1:27017/csm_playground_test_selfservice'
const PASSWORD = 'Correct-Horse-Battery-77'
const NEW_PASSWORD = 'Monsoon-Ledger-Quietly-42'

const mongoUp = await mongoReachable()
const config = loadConfig({ ...validEnv, MONGO_URI })
const app = createApp(config, pino({ level: 'silent' }), { apiRateLimit: 10_000, authRateLimit: 10_000 })
const client = () => makeClient(app, PASSWORD)

/** The newest code sent to a staff user, read from the dev inbox the way a tester would. */
async function latestCode(staffId: string): Promise<string> {
  const res = await client().get(`/dev/inbox?staffId=${staffId}&channel=sms`)
  const sms = (res.body.items as { body: string }[])[0]
  return /\b(\d{6})\b/.exec(sms?.body ?? '')?.[1] ?? ''
}

describe.skipIf(!mongoUp)('self-service flows (MongoDB)', () => {
  beforeAll(async () => {
    await mongoose.connect(MONGO_URI)
    await mongoose.connection.dropDatabase()
    await Promise.all(
      [ScreenModel, RoleModel, StaffUserModel, ChallengeModel].map((m) =>
        (m as mongoose.Model<unknown>).init(),
      ),
    )
    await ScreenModel.insertMany(SCREENS)
    await RoleModel.insertMany(ROLES.map((r) => ({ ...r, system: true })))
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
        status: 'locked',
      },
      {
        staffId: 'csr004',
        name: 'Deepa Bhat',
        roleKey: 'csr',
        branchCode: '0007',
        passwordHash,
        status: 'deactivated',
      },
    ])
  }, 30_000)

  afterAll(async () => {
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
  })

  describe('forgot password', () => {
    it('answers unknown, deactivated and real staff IDs the same way', async () => {
      const shapes = []
      for (const staffId of ['zzz999', 'csr004', 'csr001']) {
        const res = await client().post('/auth/password-reset', { staffId })
        expect(res.status).toBe(202)
        shapes.push(Object.keys(res.body).sort().join(','))
        expect(res.body.sentTo.sms).toMatch(/^\+91 9•••• ••\d{2}$/)
      }
      expect(new Set(shapes).size).toBe(1)
      // Only the real, active user actually gets messages.
      expect((await client().get('/dev/inbox?staffId=zzz999')).body.items).toHaveLength(0)
      expect((await client().get('/dev/inbox?staffId=csr004')).body.items).toHaveLength(0)
      expect((await client().get('/dev/inbox?staffId=csr001')).body.items).toHaveLength(2)
    })

    it('rejects any code for a decoy challenge', async () => {
      const start = await client().post('/auth/password-reset', { staffId: 'ghost123' })
      const res = await client().post('/auth/password-reset/verify', {
        challengeId: start.body.challengeId,
        code: '123456',
      })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('otpWrong')
    })

    it('counts wrong codes, makes resend wait, and resets the password once', async () => {
      const c = client()
      const start = await c.post('/auth/password-reset', { staffId: 'csr002' })
      const { challengeId } = start.body
      const code = await latestCode('csr002')
      expect(code).toMatch(/^\d{6}$/)

      const wrong = await c.post('/auth/password-reset/verify', {
        challengeId,
        code: code === '000000' ? '111111' : '000000',
      })
      expect(wrong.status).toBe(400)
      expect(wrong.body.attemptsLeft).toBe(4)
      expect(wrong.body.errors[0].path).toBe('code')

      const early = await c.post('/auth/password-reset/resend', { challengeId })
      expect(early.status).toBe(429)
      expect(early.body.code).toBe('resend_too_soon')

      const ok = await c.post('/auth/password-reset/verify', { challengeId, code })
      expect(ok.status).toBe(200)
      const { resetToken } = ok.body

      const weak = await c.post('/auth/password-reset/complete', {
        resetToken,
        newPassword: 'password12345',
        confirmPassword: 'password12345',
      })
      expect(weak.status).toBe(400)
      expect(weak.body.errors[0].code).toBe('passwordBreached')

      // The weak attempt used up the token: single use, whatever the outcome.
      const retry = await c.post('/auth/password-reset/complete', {
        resetToken,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      })
      expect(retry.status).toBe(400)
      expect(retry.body.code).toBe('token_invalid')
    })

    it('sets the new password and unlocks a locked account', async () => {
      const c = client()
      const { challengeId } = (await c.post('/auth/password-reset', { staffId: 'csr002' })).body
      const { resetToken } = (
        await c.post('/auth/password-reset/verify', { challengeId, code: await latestCode('csr002') })
      ).body
      const done = await c.post('/auth/password-reset/complete', {
        resetToken,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      })
      expect(done.status).toBe(204)
      expect((await client().login('csr002', NEW_PASSWORD)).status).toBe(200)
      const user = await StaffUserModel.findOne({ staffId: 'csr002' }).lean()
      expect(user?.status).toBe('active')
    })
  })

  describe('access requests', () => {
    const form = {
      fullName: 'Nikhil Acharya',
      email: 'nikhil@csmbank.test',
      mobile: '9845011223',
      employeeNo: 'E10231',
      branchCode: '0001',
      roleRequested: 'csr',
      reason: 'Joined the MG Road branch this week.',
      acceptTerms: true,
      acceptPrivacy: true,
    }

    it('requires both consent boxes and refuses a second pending request', async () => {
      const missing = await client().post('/access-requests', { ...form, acceptPrivacy: false })
      expect(missing.status).toBe(400)
      expect(missing.body.errors.map((e: { path: string }) => e.path)).toContain('acceptPrivacy')

      const ok = await client().post('/access-requests', form)
      expect(ok.status).toBe(201)
      expect(ok.body.requestNo).toMatch(/^AR-\d{4}-\d{6}$/)

      const again = await client().post('/access-requests', form)
      expect(again.status).toBe(409)
    })

    it('hides the admin list from non-admins and lets an admin approve', async () => {
      const csr = client()
      await csr.login('csr001')
      expect((await csr.get('/admin/access-requests')).status).toBe(404)

      const admin = client()
      await admin.login('admin001')
      const list = await admin.get('/admin/access-requests?status=pending')
      expect(list.status).toBe(200)
      const id = list.body.items[0].id
      const res = await admin.post(`/admin/access-requests/${id}/decision`, {
        decision: 'approve',
        staffId: 'csr010',
        roleKey: 'csr',
        branchCode: '0001',
      })
      expect(res.status, JSON.stringify(res.body)).toBe(200)
      expect(res.body.request.status).toBe('approved')
      expect(res.body.oneTimePassword).toHaveLength(16)

      const newcomer = await client().login('csr010', res.body.oneTimePassword)
      expect(newcomer.status).toBe(200)
      expect(newcomer.body.user.mustChangePassword).toBe(true)

      const twice = await admin.post(`/admin/access-requests/${id}/decision`, {
        decision: 'reject',
        note: 'Duplicate',
      })
      expect(twice.status).toBe(409)
    })
  })

  describe('announcements', () => {
    beforeAll(async () => {
      const day = 86_400_000
      await AnnouncementModel.insertMany([
        {
          title: 'Everyone',
          bodyHtml: '<p>x</p>',
          startsAt: new Date(Date.now() - day),
          createdBy: 'admin001',
        },
        {
          title: 'MG Road only',
          bodyHtml: '<p>x</p>',
          severity: 'critical',
          startsAt: new Date(Date.now() - day),
          branchCodes: ['0001'],
          createdBy: 'admin001',
        },
        {
          title: 'Ended',
          bodyHtml: '<p>x</p>',
          startsAt: new Date(Date.now() - 2 * day),
          endsAt: new Date(Date.now() - day),
          createdBy: 'admin001',
        },
        {
          title: 'Future',
          bodyHtml: '<p>x</p>',
          startsAt: new Date(Date.now() + day),
          createdBy: 'admin001',
        },
      ])
    })

    it('shows live announcements for the user branch, most severe first', async () => {
      const mg = client()
      await mg.login('csr001')
      const titles = (await mg.get('/announcements/active')).body.items.map((a: { title: string }) => a.title)
      expect(titles).toEqual(['MG Road only', 'Everyone'])

      const jayanagar = client()
      await jayanagar.login('csr002', NEW_PASSWORD)
      const other = (await jayanagar.get('/announcements/active')).body.items.map(
        (a: { title: string }) => a.title,
      )
      expect(other).toEqual(['Everyone'])

      expect((await client().get('/announcements/active')).status).toBe(401)
    })
  })
})
