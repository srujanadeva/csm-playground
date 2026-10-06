import { z } from 'zod'

// Every setting the server reads, validated once at startup (OWASP A02). The server refuses
// to boot with missing, weak or placeholder secrets instead of running insecurely.

const PLACEHOLDER = /change-?me|example|placeholder|secret$/i

const secret = (name: string) =>
  z
    .string({ error: `${name} is missing` })
    .min(32, `${name} must be at least 32 characters`)
    .refine((v) => !PLACEHOLDER.test(v), `${name} still has a placeholder value`)

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4001),
  MONGO_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, 'MONGO_URI must start with mongodb://')
    .default('mongodb://127.0.0.1:27017/csm_playground'),
  JWT_SECRET: secret('JWT_SECRET'),
  CSRF_SECRET: secret('CSRF_SECRET'),
  PII_ENC_KEY: z
    .string({ error: 'PII_ENC_KEY is missing' })
    .regex(/^[0-9a-fA-F]{64}$/, 'PII_ENC_KEY must be 64 hex characters (32 bytes)'),
  CORS_ORIGINS: z
    .string()
    .default('https://localhost:3001')
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url()).min(1)),
  TLS_CERT_FILE: z.string().default('../certs/cert.pem'),
  TLS_KEY_FILE: z.string().default('../certs/key.pem'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Express `trust proxy` setting; only loopback by default so X-Forwarded-For can't be spoofed. */
  TRUST_PROXY: z.string().default('loopback'),
  /** Sign-out after this many minutes without a request (OWASP A07). */
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
  /** Sign-out after this many hours, however active the session is. */
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(24).default(8),
  /** Consecutive failed sign-ins before an account locks until an admin unlocks it. */
  LOCKOUT_THRESHOLD: z.coerce.number().int().min(3).max(20).default(5),
  /** Where uploaded documents are stored, relative to server/. Outside any web root. */
  UPLOAD_DIR: z.string().default('uploads'),
})

export type Config = z.infer<typeof schema> & { isProd: boolean }

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid server configuration:\n  - ${problems.join('\n  - ')}`)
    this.name = 'ConfigError'
  }
}

/** Parses settings from an env object. Never includes secret values in its errors. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = schema.safeParse(env)
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((i) => i.message))
  }
  return { ...result.data, isProd: result.data.NODE_ENV === 'production' }
}
