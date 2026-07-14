import { describe, it, expect } from 'vitest'
import { createToken, verifyToken, sha256Hex } from '@/lib/auth'

const SECRET = 'test-secret'

describe('auth token', () => {
  it('발급한 토큰은 검증 통과', async () => {
    const t = await createToken(SECRET, 60_000)
    expect(await verifyToken(t, SECRET)).toBe(true)
  })
  it('만료된 토큰은 실패', async () => {
    const t = await createToken(SECRET, -1)
    expect(await verifyToken(t, SECRET)).toBe(false)
  })
  it('변조된 토큰은 실패', async () => {
    const t = await createToken(SECRET, 60_000)
    expect(await verifyToken(t + 'x', SECRET)).toBe(false)
    expect(await verifyToken('9999999999999.' + t.split('.')[1], SECRET)).toBe(false)
  })
  it('다른 시크릿이면 실패', async () => {
    const t = await createToken(SECRET, 60_000)
    expect(await verifyToken(t, 'other')).toBe(false)
  })
  it('sha256Hex는 알려진 값과 일치', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
