import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from '../src/config.ts'
import { validEnv } from './helpers.ts'

describe('loadConfig', () => {
  it('accepts a complete environment and applies defaults', () => {
    const config = loadConfig(validEnv)
    expect(config.PORT).toBe(4001)
    expect(config.MONGO_URI).toBe('mongodb://127.0.0.1:27017/csm_playground')
    expect(config.CORS_ORIGINS).toEqual(['https://localhost:3001'])
    expect(config.isProd).toBe(false)
  })

  it('refuses placeholder secrets', () => {
    expect(() => loadConfig({ ...validEnv, JWT_SECRET: 'change-me' })).toThrow(ConfigError)
  })

  it('refuses short secrets and a malformed encryption key', () => {
    try {
      loadConfig({ ...validEnv, CSRF_SECRET: 'short', PII_ENC_KEY: 'xyz' })
      expect.unreachable()
    } catch (err) {
      const problems = (err as ConfigError).problems
      expect(problems).toContain('CSRF_SECRET must be at least 32 characters')
      expect(problems).toContain('PII_ENC_KEY must be 64 hex characters (32 bytes)')
    }
  })

  it('never puts secret values in the error message', () => {
    const leaked = 'super-long-value-that-is-not-hex-'.repeat(2)
    try {
      loadConfig({ ...validEnv, PII_ENC_KEY: leaked })
      expect.unreachable()
    } catch (err) {
      expect((err as Error).message).not.toContain(leaked)
    }
  })

  it('splits and validates CORS origins', () => {
    expect(loadConfig({ ...validEnv, CORS_ORIGINS: 'https://a.test, https://b.test' }).CORS_ORIGINS).toEqual([
      'https://a.test',
      'https://b.test',
    ])
    expect(() => loadConfig({ ...validEnv, CORS_ORIGINS: 'not a url' })).toThrow(ConfigError)
  })
})
