import bcrypt from 'bcryptjs'
import { randomInt } from 'node:crypto'

// bcrypt with cost 12 (OWASP A04). bcryptjs is pure JS, so installs never need a compiler.
const COST = 12

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST)
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash)

// No look-alike characters (0/O, 1/l/I), so one-time passwords can be read out and typed.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

export function oneTimePassword(length = 16): string {
  return Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
}
