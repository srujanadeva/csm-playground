import { createConnection } from 'node:net'
import type { Express } from 'express'
import request from 'supertest'
import { pino } from 'pino'
import { loadConfig } from '../src/config.ts'
import { createApp } from '../src/app.ts'

export const validEnv = {
  NODE_ENV: 'test',
  JWT_SECRET: 'a'.repeat(16) + 'b'.repeat(16) + 'c'.repeat(8),
  CSRF_SECRET: 'd'.repeat(20) + 'e'.repeat(20),
  PII_ENC_KEY: '0123456789abcdef'.repeat(4),
  CORS_ORIGINS: 'https://localhost:3001',
}

export const testConfig = () => loadConfig(validEnv)

export const testApp = (apiRateLimit?: number) =>
  createApp(testConfig(), pino({ level: 'silent' }), apiRateLimit ? { apiRateLimit } : {})

/** True when a local MongoDB accepts connections; integration tests skip otherwise. */
export const mongoReachable = () =>
  new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port: 27017 })
    socket.setTimeout(800)
    socket.on('connect', () => (socket.destroy(), resolve(true)))
    socket.on('error', () => resolve(false))
    socket.on('timeout', () => (socket.destroy(), resolve(false)))
  })

/** A signed-in client: keeps cookies (Secure cookies included) and sends the CSRF token. */
export function makeClient(app: Express, password: string) {
  const jar = new Map<string, string>()
  let csrf = ''
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  const keep = (res: request.Response) => {
    for (const c of ([] as string[]).concat(res.headers['set-cookie'] ?? [])) {
      const [pair] = c.split(';')
      const i = pair!.indexOf('=')
      const v = pair!.slice(i + 1)
      if (v) jar.set(pair!.slice(0, i), v)
      else jar.delete(pair!.slice(0, i))
    }
    if (res.body?.csrfToken) csrf = res.body.csrfToken
    return res
  }
  const send = async (
    method: 'get' | 'post' | 'patch' | 'put' | 'delete',
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) => {
    if (method !== 'get' && !csrf) keep(await request(app).get('/api/v1/auth/csrf').set('Cookie', cookie()))
    let req = request(app)[method](`/api/v1${path}`).set('Cookie', cookie())
    if (method !== 'get') req = req.set('X-CSRF-Token', csrf)
    for (const [k, v] of Object.entries(headers)) req = req.set(k, v)
    return keep(await (body === undefined ? req : req.send(body as object)))
  }
  return {
    get: (p: string) => send('get', p),
    post: (p: string, b?: unknown, h?: Record<string, string>) => send('post', p, b ?? {}, h),
    patch: (p: string, b: unknown) => send('patch', p, b),
    put: (p: string, b: unknown) => send('put', p, b),
    login: async (staffId: string, pw = password) => send('post', '/auth/login', { staffId, password: pw }),
    cookie,
  }
}
