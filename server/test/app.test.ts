import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { testApp } from './helpers.ts'

// These run without MongoDB: they cover the security baseline every route inherits.

async function csrf(app: ReturnType<typeof testApp>) {
  const res = await request(app).get('/api/v1/auth/csrf')
  const token = res.body.csrfToken as string
  return { token, cookie: `__Host-csrf=${token}` }
}

describe('security baseline', () => {
  const app = testApp()

  it('answers the health check with security headers and no framework banner', async () => {
    const res = await request(app).get('/api/v1/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
    expect(res.headers['x-powered-by']).toBeUndefined()
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(res.headers['content-security-policy']).toContain("script-src 'self'")
    expect(res.headers['referrer-policy']).toBe('no-referrer')
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.headers['strict-transport-security']).toBeUndefined()
  })

  it('reports not ready while the database is down', async () => {
    const res = await request(app).get('/api/v1/ready')
    expect(res.status).toBe(503)
    expect(res.body.checks.database).toBe('down')
  })

  it('returns unknown routes as problem+json with the request id', async () => {
    const res = await request(app).get('/api/v1/nope').set('X-Request-Id', 'test-req-0001')
    expect(res.status).toBe(404)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.headers['x-request-id']).toBe('test-req-0001')
    expect(res.body).toMatchObject({
      status: 404,
      title: 'Not found',
      requestId: 'test-req-0001',
      instance: '/api/v1/nope',
    })
  })

  it('replaces request ids that could inject into logs', async () => {
    const res = await request(app).get('/api/v1/health').set('X-Request-Id', 'bad id; <script>')
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('issues a CSRF token as a __Host- cookie that is SameSite=Strict and Secure', async () => {
    const res = await request(app).get('/api/v1/auth/csrf')
    const setCookie = String(res.headers['set-cookie'])
    expect(res.body.csrfToken).toMatch(/^[\w-]+\.[\w-]+$/)
    expect(setCookie).toContain('__Host-csrf=')
    expect(setCookie).toContain('Secure')
    expect(setCookie).toContain('SameSite=Strict')
  })
})

describe('CSRF protection', () => {
  const app = testApp()

  it('blocks a state-changing request without a token', async () => {
    const res = await request(app).post('/api/v1/anything').send({})
    expect(res.status).toBe(403)
    expect(res.body.detail).toContain('CSRF')
  })

  it('blocks a token that does not match the cookie', async () => {
    const { cookie } = await csrf(app)
    const other = await csrf(app)
    const res = await request(app)
      .post('/api/v1/anything')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', other.token)
      .send({})
    expect(res.status).toBe(403)
  })

  it('blocks a forged token even when cookie and header match', async () => {
    const forged = 'aaaaaaaa.bbbbbbbb'
    const res = await request(app)
      .post('/api/v1/anything')
      .set('Cookie', `__Host-csrf=${forged}`)
      .set('X-CSRF-Token', forged)
      .send({})
    expect(res.status).toBe(403)
  })

  it('blocks a request from an origin that is not allowed', async () => {
    const { token, cookie } = await csrf(app)
    const res = await request(app)
      .post('/api/v1/anything')
      .set('Origin', 'https://evil.example')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', token)
      .send({})
    expect(res.status).toBe(403)
  })

  it('lets a valid token through to routing', async () => {
    const { token, cookie } = await csrf(app)
    const res = await request(app)
      .post('/api/v1/anything')
      .set('Origin', 'https://localhost:3001')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', token)
      .send({})
    expect(res.status).toBe(404)
  })
})

describe('input handling', () => {
  const app = testApp()

  it('rejects Mongo operators in the query string', async () => {
    const res = await request(app).get('/api/v1/health?cif[$ne]=x')
    expect(res.status).toBe(400)
    expect(res.headers['content-type']).toContain('application/problem+json')
  })

  it('rejects Mongo operators and dotted keys in the body', async () => {
    const { token, cookie } = await csrf(app)
    for (const body of [{ cif: { $ne: null } }, { 'kyc.status': 'verified' }, { a: [{ $where: '1' }] }]) {
      const res = await request(app)
        .post('/api/v1/anything')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', token)
        .send(body)
      expect(res.status).toBe(400)
      expect(res.body.errors[0].message).toContain('$')
    }
  })

  it('rejects malformed JSON and oversized bodies with clear problems', async () => {
    const bad = await request(app)
      .post('/api/v1/anything')
      .set('Content-Type', 'application/json')
      .send('{"a":')
    expect(bad.status).toBe(400)
    expect(bad.body.detail).toBe('The request body is not valid JSON.')

    const big = await request(app)
      .post('/api/v1/anything')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ text: 'x'.repeat(200_000) }))
    expect(big.status).toBe(413)
  })

  it('rate-limits with standard headers', async () => {
    const limited = testApp(2)
    await request(limited).get('/api/v1/health')
    await request(limited).get('/api/v1/health')
    const res = await request(limited).get('/api/v1/health')
    expect(res.status).toBe(429)
    expect(res.headers['ratelimit-policy']).toBeDefined()
  })
})
