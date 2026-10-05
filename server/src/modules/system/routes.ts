import { Router } from 'express'
import mongoose from 'mongoose'
import { dbReady } from '../../db.ts'

export const systemRoutes = Router()

/** Liveness: the process is up and serving requests. */
systemRoutes.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

/** Readiness: the database answers a ping. 503 until it does. */
systemRoutes.get('/ready', async (_req, res) => {
  let db = false
  if (dbReady()) {
    try {
      await mongoose.connection.db?.admin().ping()
      db = true
    } catch {
      db = false
    }
  }
  res
    .status(db ? 200 : 503)
    .json({ status: db ? 'ready' : 'unavailable', checks: { database: db ? 'up' : 'down' } })
})
