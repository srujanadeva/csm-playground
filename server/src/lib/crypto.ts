import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// Field-level encryption for sensitive identifiers (OWASP A04). AES-256-GCM gives
// confidentiality plus tamper detection; a keyed HMAC lets us search by exact value
// without ever decrypting.

const VERSION = 'v1'

export function encryptField(plain: string, hexKey: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(hexKey, 'hex'), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join('.')
}

export function decryptField(payload: string, hexKey: string): string {
  const [version, iv, tag, data] = payload.split('.')
  if (version !== VERSION || !iv || !tag || !data) throw new Error('Unrecognised encrypted value')
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(hexKey, 'hex'), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}

/** Deterministic keyed hash for exact-match lookups of encrypted values. */
export function blindIndex(value: string, hexKey: string): string {
  return createHmac('sha256', Buffer.from(hexKey, 'hex'))
    .update(`idx|${value.toUpperCase()}`)
    .digest('base64url')
}

export function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}
