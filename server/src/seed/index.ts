import { readdir, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import mongoose from 'mongoose'
import { BRANCHES, ROLES, SCREENS, type LookupType } from '@csm/shared'
import { connectDB, disconnectDB, redactUri } from '../db.ts'
import { SERVER_DIR, loadEnvConfig } from '../env.ts'
import { hashPassword, oneTimePassword } from '../lib/password.ts'
import { LookupModel } from '../modules/lookups/lookup.model.ts'
import { ScreenModel } from '../modules/admin/screen.model.ts'
import { RoleModel } from '../modules/admin/role.model.ts'
import { StaffUserModel } from '../modules/auth/staffUser.model.ts'
import { CustomerModel } from '../modules/customers/customer.model.ts'
import { ServiceRequestModel, SrCommentModel } from '../modules/serviceRequests/serviceRequest.model.ts'
import { ApprovalModel } from '../modules/approvals/approval.model.ts'
import { AuditLogModel } from '../modules/audit/auditLog.model.ts'
import { CounterModel, ensureSeqAtLeast } from '../modules/system/counter.model.ts'
import { DEMO_PASSWORD, LOOKUPS, STAFF } from './data.ts'
import { generateCustomers, generateServiceRequests, mulberry32 } from './generate.ts'

// Seeds what's missing and leaves everything that exists alone, like the setup scripts.
//
//   npm run seed                       create anything missing; new users get one-time passwords
//   npm run seed -- --demo             new users get the known practice password instead
//   npm run seed -- --reset-passwords  give every seeded user a new password (add --demo for the known one)
//   npm run seed -- --fresh            delete customers, requests, approvals and audit log, then regenerate

const CUSTOMER_COUNT = 1200
const SR_COUNT = 300
const RNG_SEED = 20261005

const args = new Set(process.argv.slice(2))
const demo = args.has('--demo')
const resetPasswords = args.has('--reset-passwords')
const fresh = args.has('--fresh')
const unknown = [...args].filter((a) => !['--demo', '--reset-passwords', '--fresh'].includes(a))
if (unknown.length) {
  console.error(`Unknown option(s): ${unknown.join(', ')}. Use --demo, --reset-passwords or --fresh.`)
  process.exit(1)
}

const config = loadEnvConfig()
const log = (msg: string) => console.log(`    ${msg}`)

async function seedReferenceData() {
  let added = 0
  for (const [type, items] of Object.entries(LOOKUPS) as [LookupType, (typeof LOOKUPS)[LookupType]][]) {
    for (const [order, item] of items.entries()) {
      const res = await LookupModel.updateOne(
        { type, code: item.code },
        {
          $setOnInsert: {
            type,
            code: item.code,
            labels: { en: item.en, kn: item.kn },
            parent: item.parent ?? null,
            order,
          },
        },
        { upsert: true },
      )
      added += res.upsertedCount
    }
  }
  log(`Lookups: ${added ? `${added} added` : 'all present'}`)

  added = 0
  for (const screen of SCREENS) {
    const res = await ScreenModel.updateOne({ key: screen.key }, { $setOnInsert: screen }, { upsert: true })
    added += res.upsertedCount
  }
  log(`Screens: ${added ? `${added} added` : 'all present (admin changes kept)'}`)

  added = 0
  for (const role of ROLES) {
    const res = await RoleModel.updateOne(
      { key: role.key },
      { $setOnInsert: { ...role, system: true } },
      { upsert: true },
    )
    added += res.upsertedCount
  }
  log(`Roles: ${added ? `${added} added` : 'all present (admin changes kept)'}`)
}

async function seedStaff(): Promise<[string, string, string][]> {
  const credentials: [string, string, string][] = []
  for (const s of STAFF) {
    const existing = await StaffUserModel.findOne({ staffId: s.staffId })
    if (existing && !resetPasswords) continue
    const password = demo ? DEMO_PASSWORD : oneTimePassword()
    const passwordHash = await hashPassword(password)
    if (existing) {
      existing.passwordHash = passwordHash
      existing.mustChangePassword = !demo
      existing.failedLogins = 0
      existing.lockedUntil = null
      existing.tokenVersion += 1
      await existing.save()
    } else {
      await StaffUserModel.create({
        ...s,
        passwordHash,
        email: `${s.staffId}@csm-playground.test`,
        status: s.status ?? 'active',
        mustChangePassword: !demo,
        overrides: s.overrides ?? [],
      })
    }
    credentials.push([
      s.staffId,
      s.name,
      s.status === 'deactivated' ? `${password}  (deactivated)` : password,
    ])
  }
  log(
    credentials.length
      ? `Staff users: ${credentials.length} ${resetPasswords ? 'passwords reset' : 'added'}`
      : 'Staff users: all present (passwords unchanged)',
  )
  return credentials
}

async function seedBusinessData() {
  if (fresh) {
    for (const m of [
      CustomerModel,
      ServiceRequestModel,
      SrCommentModel,
      ApprovalModel,
      AuditLogModel,
      CounterModel,
    ]) {
      await (m as mongoose.Model<unknown>).deleteMany({})
    }
    // Uploaded documents belonged to the removed records.
    const dir = resolve(SERVER_DIR, config.UPLOAD_DIR)
    const files = await readdir(dir).catch(() => [] as string[])
    await Promise.all(files.map((f) => unlink(resolve(dir, f)).catch(() => undefined)))
    log(
      `--fresh: removed customers, service requests, comments, approvals, audit log, counters and ${files.length} uploaded files`,
    )
  }
  if ((await CustomerModel.estimatedDocumentCount()) > 0) {
    log('Customers and service requests: already present, left as is (use --fresh to regenerate)')
    return
  }

  const rng = mulberry32(RNG_SEED)
  const now = new Date()
  const c = generateCustomers(rng, CUSTOMER_COUNT, config.PII_ENC_KEY, now)
  const s = generateServiceRequests(rng, SR_COUNT, c.customers, now)

  // The raw inserts below skip Mongoose, so validate every document against its schema first.
  const check = async (model: mongoose.Model<any>, docs: object[]) => {
    for (const doc of docs) {
      try {
        await new model(doc).validate()
      } catch (err) {
        throw new Error(`Generated ${model.modelName} failed validation: ${(err as Error).message}`, {
          cause: err,
        })
      }
    }
  }
  await check(CustomerModel, c.customers)
  await check(ApprovalModel, c.approvals)
  await check(ServiceRequestModel, s.requests)
  await check(SrCommentModel, s.comments)
  await check(AuditLogModel, [...c.audit, ...s.audit])

  // insertMany with raw docs keeps the historical createdAt values and time-ordered _ids.
  await CustomerModel.collection.insertMany(c.customers)
  await ApprovalModel.collection.insertMany(c.approvals)
  await ServiceRequestModel.collection.insertMany(s.requests)
  if (s.comments.length) await SrCommentModel.collection.insertMany(s.comments)
  await AuditLogModel.collection.insertMany([...c.audit, ...s.audit])
  for (const [key, value] of Object.entries({ ...c.counters, ...s.counters }))
    await ensureSeqAtLeast(key, value)

  log(`Customers: ${c.customers.length} added (${c.counters.cif} with a CIF, the rest drafts)`)
  log(`Service requests: ${s.requests.length} added, with ${s.comments.length} comments`)
  log(
    `Approvals: ${c.approvals.length} added (${c.approvals.filter((a) => a.status === 'pending').length} pending)`,
  )
  log(`Audit entries: ${c.audit.length + s.audit.length} added`)
}

async function main() {
  await connectDB(config.MONGO_URI)
  console.log(`==> Seeding ${redactUri(config.MONGO_URI)}`)
  // Build every index before inserting, so unique constraints apply to the seed itself.
  await Promise.all(
    [
      LookupModel,
      ScreenModel,
      RoleModel,
      StaffUserModel,
      CustomerModel,
      ServiceRequestModel,
      SrCommentModel,
      ApprovalModel,
      AuditLogModel,
    ].map((m) => (m as mongoose.Model<unknown>).init()),
  )

  await seedReferenceData()
  const credentials = await seedStaff()
  await seedBusinessData()

  if (credentials.length) {
    console.log('\n==> Sign-in details (shown once; they are stored only as bcrypt hashes)')
    for (const [id, name, pw] of credentials) console.log(`    ${id.padEnd(9)} ${name.padEnd(17)} ${pw}`)
    console.log(
      demo
        ? '\n    These use the shared practice password.'
        : '\n    Each user must choose a new password at first sign-in.\n    For a known practice password instead: npm run seed -- --reset-passwords --demo',
    )
  }
  console.log(`\n    Branches: ${BRANCHES.map((b) => `${b.code} ${b.name.en}`).join(' · ')}`)
}

main()
  .then(() => disconnectDB())
  .catch(async (err: unknown) => {
    console.error('Seeding failed:', err instanceof Error ? err.message : err)
    await disconnectDB()
    process.exit(1)
  })
