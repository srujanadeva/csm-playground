import { pino, type Logger } from 'pino'

// Structured logs (OWASP A09). Anything that could hold credentials or PII is redacted before
// it is written, so logs can be shared for debugging without leaking customer data.
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.passwordHash',
  '*.idNumber',
  '*.token',
]

export function createLogger(level: string, pretty: boolean): Logger {
  return pino({
    level,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    ...(pretty
      ? { transport: { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } } }
      : {}),
  })
}
