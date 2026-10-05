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
