import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LEN = 64

/** 저장 형식: `${salt-hex}:${hash-hex}`. Node 전용(scrypt) — Edge 런타임(middleware)에서 import 금지. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, KEY_LEN)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  if (expected.length === 0) return false
  const actual = scryptSync(password, salt, expected.length)
  return timingSafeEqual(actual, expected)
}
