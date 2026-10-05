import { describe, expect, it } from 'vitest'
import { blindIndex, decryptField, encryptField } from '../src/lib/crypto.ts'

const key = '0123456789abcdef'.repeat(4)
const otherKey = 'fedcba9876543210'.repeat(4)

describe('field encryption', () => {
  it('round-trips and uses a fresh IV each time', () => {
    const a = encryptField('W1234567', key)
    const b = encryptField('W1234567', key)
    expect(a).not.toBe(b)
    expect(decryptField(a, key)).toBe('W1234567')
  })

  it('detects tampering and the wrong key', () => {
    const payload = encryptField('ABCDE1234F', key)
    const parts = payload.split('.')
    parts[3] = Buffer.from('tampered').toString('base64url')
    expect(() => decryptField(parts.join('.'), key)).toThrow()
    expect(() => decryptField(payload, otherKey)).toThrow()
  })

  it('builds a stable, case-insensitive blind index', () => {
    expect(blindIndex('abcde1234f', key)).toBe(blindIndex('ABCDE1234F', key))
    expect(blindIndex('ABCDE1234F', key)).not.toBe(blindIndex('ABCDE1234F', otherKey))
  })
})
